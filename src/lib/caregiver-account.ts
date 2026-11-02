import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth/middleware";
import { getSql } from "./db";

const codeSchema = z.string().trim().toUpperCase().min(4).max(12);

export const getCaregiverHouseholdLink = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ code: string; patientName: string } | null> => {
    const sql = await getSql();
    const rows = await sql<{ code: string; patient_name: string }>`
      select h.id as code, h.patient_name
      from caregiver_households ch
      join households h on h.id = ch.household_id
      where ch.user_id = ${context.userId}
    `;
    if (rows.length === 0) return null;
    return {
      code: rows[0].code,
      patientName: rows[0].patient_name || "your family member",
    };
  });

export const linkCaregiverHousehold = createServerFn({ method: "POST" })
  .validator((input: { code: string }) => ({ code: codeSchema.parse(input.code) }))
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
      data,
    }): Promise<{ ok: true; patientName: string } | { ok: false; error: string }> => {
      const sql = await getSql();
      const households = await sql<{ id: string; patient_name: string }>`
        select id, patient_name from households where id = ${data.code}
      `;
      if (households.length === 0) {
        return { ok: false, error: "We could not find that code. Check it and try again." };
      }

      await sql`
        insert into caregiver_households (user_id, household_id)
        values (${context.userId}, ${data.code})
        on conflict (user_id) do nothing
      `;
      const links = await sql<{ household_id: string }>`
        select household_id from caregiver_households where user_id = ${context.userId}
      `;
      if (links[0]?.household_id !== data.code) {
        return {
          ok: false,
          error: "This account is already connected to a different family.",
        };
      }

      return {
        ok: true,
        patientName: households[0].patient_name || "your family member",
      };
    },
  );
