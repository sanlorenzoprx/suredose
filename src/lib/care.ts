import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { batch, fromBool, parseJson, q, run, stmt, stringArraySchema, toIso } from "./db";
import { sendPushToHousehold } from "./push.server";
import { formatTimeLabel, isValidTimeZone } from "./schedule";
import type { CareActivityItem, CareMedicineSummary } from "./types";
import { uid } from "./utils";

// Excludes visually ambiguous characters (0/O, 1/I/L) so a code is easy to
// read aloud and type on a small keyboard.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(4)
  .max(12);

/**
 * The patient phone's IANA timezone. An unknown or malformed value is stored
 * as "not reported" (null) rather than rejected, so an odd browser never
 * blocks pairing; the missed-dose check simply waits for a valid one.
 */
function cleanTimeZone(value: unknown): string | null {
  return typeof value === "string" && value.length <= 64 && isValidTimeZone(value) ? value : null;
}

export const createHousehold = createServerFn({ method: "POST" })
  .validator(
    (input: {
      patientName: string;
      caregiverName: string;
      caregiverPhone: string;
      timezone?: string;
    }) => ({
      patientName: z.string().max(60).parse(input.patientName ?? ""),
      caregiverName: z.string().max(60).parse(input.caregiverName ?? ""),
      caregiverPhone: z.string().max(40).parse(input.caregiverPhone ?? ""),
      timezone: cleanTimeZone(input.timezone),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; code: string } | { ok: false; error: string }> => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = randomCode();
      try {
        await run(
          `insert into households (id, patient_name, caregiver_name, caregiver_phone, timezone, created_at)
           values (?, ?, ?, ?, ?, ?)`,
          [code, data.patientName, data.caregiverName, data.caregiverPhone, data.timezone, toIso()],
        );
        return { ok: true, code };
      } catch (err) {
        // Extremely unlikely code collision — try again with a fresh code.
        // Anything else (no database, a bad schema) is a real failure.
        if (!/UNIQUE constraint failed/i.test(err instanceof Error ? err.message : String(err))) throw err;
      }
    }
    return { ok: false, error: "Could not create a family code. Please try again." };
  });

export const getHousehold = createServerFn({ method: "POST" })
  .validator((input: { code: string }) => ({ code: codeSchema.parse(input.code) }))
  .handler(async ({ data }): Promise<{ ok: true; patientName: string } | { ok: false; error: string }> => {
    const rows = await q<{ patient_name: string }>(
      "select patient_name from households where id = ?",
      [data.code],
    );
    if (rows.length === 0) {
      return { ok: false, error: "We could not find that code. Check it and try again." };
    }
    return { ok: true, patientName: rows[0].patient_name || "your family member" };
  });

const medicineSyncSchema = z
  .array(
    z.object({
      id: z.string().max(80),
      name: z.string().max(120),
      strength: z.string().max(60).optional().default(""),
      times: z.array(z.string().max(8)).max(8),
    }),
  )
  .max(30);

export const syncMedicines = createServerFn({ method: "POST" })
  .validator(
    (input: { code: string; medicines: z.infer<typeof medicineSyncSchema>; timezone?: string }) => ({
      code: codeSchema.parse(input.code),
      medicines: medicineSyncSchema.parse(input.medicines ?? []),
      timezone: cleanTimeZone(input.timezone),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const household = await q("select 1 from households where id = ?", [data.code]);
    if (household.length === 0) return { ok: false };
    // Small list, rewritten wholesale on every change — the patient's phone
    // is the source of truth, this is only a mirror for the caregiver view
    // and the missed-dose check. One batch, so a failed insert never leaves
    // the caregiver with an emptied list.
    await batch([
      // The patient's phone is also the source of truth for its timezone; keep
      // what we have when this sync did not report one.
      stmt("update households set timezone = coalesce(?, timezone) where id = ?", [data.timezone, data.code]),
      stmt("delete from care_medicines where household_id = ?", [data.code]),
      ...data.medicines.map((medicine) =>
        stmt(
          `insert into care_medicines (id, household_id, name, strength, times)
           values (?, ?, ?, ?, ?)`,
          [medicine.id, data.code, medicine.name, medicine.strength, JSON.stringify(medicine.times)],
        ),
      ),
    ]);
    return { ok: true };
  });

const doseEventSchema = z.object({
  code: codeSchema,
  medicineId: z.string().max(80),
  medicineName: z.string().max(120),
  strength: z.string().max(60).optional().default(""),
  date: z.string().max(10),
  time: z.string().max(5),
  status: z.enum(["taken", "missed", "skipped"]),
  verified: z.boolean().optional().default(false),
  checkImage: z.string().max(3_500_000).optional(),
});

function doseEventId(code: string, medicineId: string, date: string, time: string): string {
  return `dose_${code}_${medicineId}_${date}_${time}`.replace(/[^a-zA-Z0-9_:-]/g, "_");
}

export const recordDoseEvent = createServerFn({ method: "POST" })
  .validator((input: z.infer<typeof doseEventSchema>) => doseEventSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const id = doseEventId(data.code, data.medicineId, data.date, data.time);
    const takenAt = data.status === "taken" ? toIso() : null;
    await run(
      `insert into dose_events
        (id, household_id, medicine_id, medicine_name, strength, date, time, status, taken_at, verified, check_image, notified, created_at)
       values
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       on conflict (household_id, medicine_id, date, time) do update set
        status = excluded.status,
        taken_at = excluded.taken_at,
        verified = excluded.verified,
        check_image = coalesce(excluded.check_image, dose_events.check_image)`,
      [
        id,
        data.code,
        data.medicineId,
        data.medicineName,
        data.strength,
        data.date,
        data.time,
        data.status,
        takenAt,
        data.verified,
        data.checkImage ?? null,
        toIso(),
      ],
    );

    if (data.status === "taken") {
      const med = [data.medicineName, data.strength].filter(Boolean).join(" ");
      void sendPushToHousehold(data.code, {
        title: "Medicine taken",
        body: `${med} taken at ${formatTimeLabel(data.time)}. Open the app to see the photo.`,
        tag: `dose-${id}`,
        url: "/",
      }).catch(() => {
        /* push is best-effort — never block the confirmation flow */
      });
    }
    return { ok: true };
  });

export const fetchActivity = createServerFn({ method: "POST" })
  .validator((input: { code: string; limit?: number }) => ({
    code: codeSchema.parse(input.code),
    limit: Math.min(50, Math.max(1, Math.round(input.limit ?? 20))),
  }))
  .handler(
    async ({
      data,
    }): Promise<
      | {
          ok: true;
          patientName: string;
          activity: CareActivityItem[];
          medicines: CareMedicineSummary[];
        }
      | { ok: false; error: string }
    > => {
      const household = await q<{ patient_name: string }>(
        "select patient_name from households where id = ?",
        [data.code],
      );
      if (household.length === 0) {
        return { ok: false, error: "This family code is no longer active." };
      }

      const events = await q<{
        id: string;
        medicine_name: string;
        strength: string;
        date: string;
        time: string;
        status: "taken" | "missed" | "skipped";
        taken_at: string | null;
        verified: number;
        check_image: string | null;
      }>(
        `select id, medicine_name, strength, date, time, status, taken_at, verified, check_image
         from dose_events
         where household_id = ?
         order by coalesce(taken_at, created_at) desc
         limit ?`,
        [data.code, data.limit],
      );

      const medicines = await q<{
        id: string;
        name: string;
        strength: string;
        times: string;
      }>(
        `select id, name, strength, times from care_medicines
         where household_id = ?
         order by name asc`,
        [data.code],
      );

      return {
        ok: true,
        patientName: household[0].patient_name || "your family member",
        activity: events.map((e) => ({
          id: e.id,
          medicineName: e.medicine_name,
          strength: e.strength,
          date: e.date,
          time: e.time,
          status: e.status,
          takenAt: e.taken_at ? new Date(e.taken_at).getTime() : null,
          verified: fromBool(e.verified),
          checkImage: e.check_image,
        })),
        medicines: medicines.map((m) => ({
          id: m.id,
          name: m.name,
          strength: m.strength,
          times: parseJson(m.times, stringArraySchema, []),
        })),
      };
    },
  );

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(600),
  keys: z.object({
    p256dh: z.string().max(400),
    auth: z.string().max(200),
  }),
});

export const subscribePush = createServerFn({ method: "POST" })
  .validator((input: { code: string; subscription: z.infer<typeof pushSubscriptionSchema> }) => ({
    code: codeSchema.parse(input.code),
    subscription: pushSubscriptionSchema.parse(input.subscription),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const household = await q("select 1 from households where id = ?", [data.code]);
    if (household.length === 0) {
      return { ok: false, error: "This family code is no longer active." };
    }
    await run(
      `insert into push_subscriptions (id, household_id, endpoint, p256dh, auth, created_at)
       values (?, ?, ?, ?, ?, ?)
       on conflict (endpoint) do update set
        household_id = excluded.household_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth`,
      [
        uid("push"),
        data.code,
        data.subscription.endpoint,
        data.subscription.keys.p256dh,
        data.subscription.keys.auth,
        toIso(),
      ],
    );
    return { ok: true };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .validator((input: { endpoint: string }) => ({ endpoint: z.string().max(600).parse(input.endpoint) }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    await run("delete from push_subscriptions where endpoint = ?", [data.endpoint]);
    return { ok: true };
  });

/**
 * Permanently deletes a family's shared data — the household row, its
 * medicine mirror, its dose activity (including confirmation photos), and
 * any push subscriptions, via the ON DELETE CASCADE foreign keys set up in
 * migrations/0001_init.sql. This is the in-app data-deletion path:
 * anyone holding the code can use it (same trust model as the code itself),
 * no account or login required. See src/routes/privacy.tsx.
 */
export const deleteHousehold = createServerFn({ method: "POST" })
  .validator((input: { code: string }) => ({ code: codeSchema.parse(input.code) }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    await run("delete from households where id = ?", [data.code]);
    return { ok: true };
  });
