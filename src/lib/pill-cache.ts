import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extractJson } from "./ai";
import { getSql } from "./db";
import { normName, normStrength } from "./drug-data";
import { decodeJpegDataUrl, deleteImage, putImage, r2Available } from "./image-store.server";
import type { PillFeatures } from "./types";
import { uid } from "./utils";
import { vision as askVision } from "./vision";

/*
 * Pill library: pill photos people chose to share, for future pill search.
 *
 * Safety rules, enforced here and in /add:
 *   - Opt-in only (settings.sharePillPhotos, off by default).
 *   - Only the person's own pill photo — never the bottle photo, never a
 *     practice photo, never a photo whose pill did NOT match the maker's
 *     official photo, and only for medicines with no maker's photo (where
 *     the library adds something the official data doesn't have).
 *   - FAILS CLOSED: if the vision check that confirms "this is a pill"
 *     can't run, nothing is saved. Otherwise a bottle or label photo —
 *     which carries personal details — could slip into a shared table.
 *   - Capped per phone, and deletable by the phone that added it.
 *
 * Library labels come from users, not a verified drug database. Nothing in
 * this file may be used to confirm a dose; dose checking stays in
 * comparePills(), against the person's own saved reference.
 *
 * Search is deliberately not exposed yet: it would be an unauthenticated
 * endpoint that spends AI credits per call. Add it with a rate limit.
 */

const COLORS = [
  "white",
  "off-white",
  "yellow",
  "orange",
  "peach",
  "pink",
  "red",
  "purple",
  "blue",
  "green",
  "brown",
  "gray",
  "black",
  "two-tone",
] as const;
const SHAPES = [
  "round",
  "oval",
  "oblong",
  "capsule",
  "triangle",
  "square",
  "rectangle",
  "diamond",
  "pentagon",
  "hexagon",
  "other",
] as const;
const FORMS = ["tablet", "capsule", "softgel", "other"] as const;

/** Most people take a handful of medicines; anything past this is abuse. */
const MAX_ROWS_PER_DEVICE = 40;

const imageSchema = z.string().min(20).max(3_500_000);
const deviceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

/** "M 367" / "m-367" / "M367" all become "M367". */
export function normImprint(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const featuresResult = z.object({
  isPill: z.boolean(),
  imprint: z.string().optional().default(""),
  color: z.string().optional().default(""),
  shape: z.string().optional().default(""),
  form: z.string().optional().default(""),
});

function pick<T extends readonly string[]>(value: string, allowed: T): T[number] | "" {
  const v = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T[number]) : "";
}

/**
 * Read a pill's visible features. Returns null when the AI can't answer
 * (not configured, busy, bad output) — callers must treat null as "do not
 * save", never as "probably fine".
 */
async function describePill(image: string): Promise<(PillFeatures & { isPill: boolean }) | null> {
  const vision = await askVision({
    maxTokens: 200,
    images: [image],
    prompt: `You describe one pill in a photo for a medication library.
Return ONLY JSON:
{
  "isPill": true,
  "imprint": "letters/numbers pressed or printed on the pill, exactly as shown; separate the two sides with ';'; empty string if none or unreadable",
  "color": one of ${JSON.stringify(COLORS)} or "",
  "shape": one of ${JSON.stringify(SHAPES)} or "",
  "form": one of ${JSON.stringify(FORMS)} or ""
}
Rules:
- isPill=true only if the photo shows exactly one pill, tablet or capsule as the subject.
- If it shows a bottle, a label, any printed text other than the pill's own imprint, a person's face, or no pill, isPill=false.
- Never guess an imprint you cannot actually read. Empty string is better than a wrong imprint.
- No markdown.`,
  });
  if (!vision.ok) return null;
  try {
    const parsed = featuresResult.parse(extractJson(vision.text));
    return {
      isPill: parsed.isPill,
      imprint: parsed.imprint.trim().slice(0, 40),
      color: pick(parsed.color, COLORS),
      shape: pick(parsed.shape, SHAPES),
      form: pick(parsed.form, FORMS),
    };
  } catch {
    return null;
  }
}

/** Delete the stored object for `sha` once no row references it any more. */
async function releaseObject(sha: string): Promise<void> {
  const sql = await getSql();
  const refs = await sql<{
    n: number;
  }>`select count(*)::int as n from pill_images where sha256 = ${sha}`;
  if ((refs[0]?.n ?? 0) === 0) await deleteImage("pills", sha);
}

export const cachePillReference = createServerFn({ method: "POST" })
  .validator(
    (input: {
      deviceId: string;
      medicineId: string;
      name: string;
      strength?: string;
      ndc?: string;
      verifiedBy?: "ndc" | "name" | "none";
      image: string;
    }) => ({
      deviceId: deviceIdSchema.parse(input.deviceId),
      medicineId: z.string().min(1).max(80).parse(input.medicineId),
      name: z.string().trim().min(1).max(120).parse(input.name),
      strength: z
        .string()
        .trim()
        .max(60)
        .parse(input.strength ?? ""),
      ndc: z
        .string()
        .trim()
        .max(24)
        .parse(input.ndc ?? ""),
      verifiedBy: z.enum(["ndc", "name", "none"]).parse(input.verifiedBy ?? "none"),
      image: imageSchema.parse(input.image),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; features: PillFeatures } | { ok: false; error: string }> => {
      const img = decodeJpegDataUrl(data.image);
      if (!img) return { ok: false, error: "This photo could not be saved." };

      const sql = await getSql();
      const [{ n: rowsForDevice } = { n: 0 }] = await sql<{ n: number }>`
      select count(*)::int as n from pill_images where device_id = ${data.deviceId}
    `;
      const [existing] = await sql<{ sha256: string }>`
      select sha256 from pill_images
      where device_id = ${data.deviceId} and medicine_id = ${data.medicineId}
    `;
      if (!existing && rowsForDevice >= MAX_ROWS_PER_DEVICE) {
        return { ok: false, error: "This phone has added the most pill photos we allow." };
      }

      // Fail closed: no confirmed "this is a pill" → nothing is saved.
      const described = await describePill(data.image);
      if (!described)
        return {
          ok: false,
          error: "We could not check this photo right now, so it was not added.",
        };
      if (!described.isPill)
        return { ok: false, error: "This does not look like a photo of one pill." };
      const features: PillFeatures = {
        imprint: described.imprint,
        color: described.color,
        shape: described.shape,
        form: described.form,
      };

      const useR2 = r2Available();
      const id = uid("pill");
      // Row first, object second: a concurrent release of the same photo then
      // either sees this row (and keeps the object) or deletes before our put.
      await sql`
      insert into pill_images (
        id, device_id, medicine_id, sha256,
        name, name_norm, strength, strength_norm, ndc, verified_by,
        imprint, imprint_norm, color, shape, form,
        storage, inline_image, bytes
      ) values (
        ${id}, ${data.deviceId}, ${data.medicineId}, ${img.sha256},
        ${data.name}, ${normName(data.name)}, ${data.strength}, ${normStrength(data.strength)},
        ${data.ndc}, ${data.verifiedBy},
        ${features.imprint}, ${normImprint(features.imprint)},
        ${features.color}, ${features.shape}, ${features.form},
        ${useR2 ? "r2" : "inline"}, ${useR2 ? null : data.image}, ${img.bytes.length}
      )
      on conflict (device_id, medicine_id) do update set
        sha256 = excluded.sha256,
        name = excluded.name, name_norm = excluded.name_norm,
        strength = excluded.strength, strength_norm = excluded.strength_norm,
        ndc = excluded.ndc, verified_by = excluded.verified_by,
        imprint = excluded.imprint, imprint_norm = excluded.imprint_norm,
        color = excluded.color, shape = excluded.shape, form = excluded.form,
        storage = excluded.storage, inline_image = excluded.inline_image,
        bytes = excluded.bytes, created_at = now()
    `;
      if (useR2) {
        try {
          await putImage("pills", img.bytes);
        } catch (err) {
          console.error("pill library put failed:", err instanceof Error ? err.message : err);
          await sql`delete from pill_images where device_id = ${data.deviceId} and medicine_id = ${data.medicineId}`;
          return { ok: false, error: "This photo could not be saved." };
        }
      }

      if (existing && existing.sha256 !== img.sha256) await releaseObject(existing.sha256);
      return { ok: true, features };
    },
  );

/**
 * Delete this phone's library photos: one medicine's, or all of them when
 * `medicineId` is omitted. The random device id is the only key, the same
 * trust model as the family code.
 */
export const forgetPillReferences = createServerFn({ method: "POST" })
  .validator((input: { deviceId: string; medicineId?: string }) => ({
    deviceId: deviceIdSchema.parse(input.deviceId),
    medicineId: input.medicineId ? z.string().max(80).parse(input.medicineId) : undefined,
  }))
  .handler(async ({ data }): Promise<{ ok: true; deleted: number }> => {
    const sql = await getSql();
    const removed = data.medicineId
      ? await sql<{ sha256: string }>`
          delete from pill_images where device_id = ${data.deviceId} and medicine_id = ${data.medicineId}
          returning sha256
        `
      : await sql<{ sha256: string }>`
          delete from pill_images where device_id = ${data.deviceId} returning sha256
        `;
    for (const sha of new Set(removed.map((r) => r.sha256))) await releaseObject(sha);
    return { ok: true, deleted: removed.length };
  });
