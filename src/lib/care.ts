import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "./db";
import { sendPushToHousehold } from "./push.server";
import { formatTimeLabel } from "./schedule";
import { videoRoomName } from "./video";
import { generateToken04 } from "./zego-token";
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

const codeSchema = z.string().trim().toUpperCase().min(4).max(12);

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(600),
  keys: z.object({
    p256dh: z.string().max(400),
    auth: z.string().max(200),
  }),
});

type CaregiverMemberRow = {
  id: string;
  household_id: string;
  device_id: string;
  role: "caregiver";
  name: string;
  contact: string;
  is_primary: boolean;
  joined_at: string | Date;
  last_seen_at: string | Date;
};

type CaregiverMember = {
  role: "caregiver";
  name: string;
  contact: string;
  isPrimary: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

function timestampIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function caregiverMember(row: CaregiverMemberRow): CaregiverMember {
  return {
    role: row.role,
    name: row.name,
    contact: row.contact,
    isPrimary: row.is_primary,
    joinedAt: timestampIso(row.joined_at),
    lastSeenAt: timestampIso(row.last_seen_at),
  };
}

async function savePushSubscription(
  sql: Sql,
  code: string,
  subscription: z.infer<typeof pushSubscriptionSchema>,
): Promise<void> {
  await sql`
    insert into push_subscriptions (id, household_id, endpoint, p256dh, auth)
    values (${uid("push")}, ${code}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth})
    on conflict (endpoint) do update set
      household_id = excluded.household_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth
  `;
}

export const createHousehold = createServerFn({ method: "POST" })
  .validator((input: { patientName: string; caregiverName: string; caregiverPhone: string }) => ({
    patientName: z
      .string()
      .max(60)
      .parse(input.patientName ?? ""),
    caregiverName: z
      .string()
      .max(60)
      .parse(input.caregiverName ?? ""),
    caregiverPhone: z
      .string()
      .max(40)
      .parse(input.caregiverPhone ?? ""),
  }))
  .handler(async ({ data }): Promise<{ ok: true; code: string } | { ok: false; error: string }> => {
    const sql = await getSql();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = randomCode();
      try {
        await sql`
          insert into households (id, patient_name, caregiver_name, caregiver_phone)
          values (${code}, ${data.patientName}, ${data.caregiverName}, ${data.caregiverPhone})
        `;
        return { ok: true, code };
      } catch {
        // Extremely unlikely code collision — try again with a fresh code.
      }
    }
    return { ok: false, error: "Could not create a family code. Please try again." };
  });

export const getHousehold = createServerFn({ method: "POST" })
  .validator((input: { code: string }) => ({ code: codeSchema.parse(input.code) }))
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: true; patientName: string; caregivers: CaregiverMember[] }
      | { ok: false; error: string }
    > => {
      const sql = await getSql();
      const rows = await sql<{ patient_name: string }>`
      select patient_name from households where id = ${data.code}
    `;
      if (rows.length === 0) {
        return { ok: false, error: "We could not find that code. Check it and try again." };
      }
      const members = await sql<CaregiverMemberRow>`
      select id, household_id, device_id, role, name, contact, is_primary, joined_at, last_seen_at
      from household_members
      where household_id = ${data.code} and role = 'caregiver'
      order by is_primary desc, joined_at asc, id asc
    `;
      return {
        ok: true,
        patientName: rows[0].patient_name || "your family member",
        caregivers: members.map(caregiverMember),
      };
    },
  );

const caregiverJoinSchema = z.object({
  familyCode: codeSchema,
  caregiverName: z.string().trim().max(60).default(""),
  caregiverContact: z.string().trim().max(254).optional().default(""),
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  pushSubscription: pushSubscriptionSchema.optional(),
});

export const joinHousehold = createServerFn({ method: "POST" })
  .validator((input: z.input<typeof caregiverJoinSchema>) => caregiverJoinSchema.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; member: CaregiverMember } | { ok: false; error: string }> => {
      const sql = await getSql();
      const firstCaregiver = await sql<CaregiverMemberRow>`
      insert into household_members (
        id, household_id, device_id, role, name, contact, is_primary
      )
      select ${uid("member")}, h.id, ${data.deviceId}, 'caregiver',
        ${data.caregiverName}, ${data.caregiverContact}, true
      from households h
      where h.id = ${data.familyCode}
        and not exists (
          select 1 from household_members where household_id = h.id
        )
      on conflict do nothing
      returning id, household_id, device_id, role, name, contact, is_primary, joined_at, last_seen_at
    `;
      const rows =
        firstCaregiver.length > 0
          ? firstCaregiver
          : await sql<CaregiverMemberRow>`
          insert into household_members (
            id, household_id, device_id, role, name, contact, is_primary
          )
          select ${uid("member")}, h.id, ${data.deviceId}, 'caregiver',
            ${data.caregiverName}, ${data.caregiverContact}, false
          from households h
          where h.id = ${data.familyCode}
          on conflict (household_id, device_id) do update set
            name = excluded.name,
            contact = excluded.contact,
            last_seen_at = now()
          returning id, household_id, device_id, role, name, contact, is_primary, joined_at, last_seen_at
        `;

      if (rows.length === 0) {
        return { ok: false, error: "We could not find that code. Check it and try again." };
      }

      if (data.pushSubscription) {
        await savePushSubscription(sql, data.familyCode, data.pushSubscription);
      }

      return { ok: true, member: caregiverMember(rows[0]) };
    },
  );

const medicineSyncSchema = z
  .array(
    z.object({
      id: z.string().max(80),
      name: z.string().max(120),
      strength: z.string().max(60).optional().default(""),
      times: z.array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)).max(8),
    }),
  )
  .max(30);

export const syncMedicines = createServerFn({ method: "POST" })
  .validator(
    (input: { code: string; medicines: z.infer<typeof medicineSyncSchema>; timezone: string }) => ({
      code: codeSchema.parse(input.code),
      medicines: medicineSyncSchema.parse(input.medicines ?? []),
      timezone: z
        .string()
        .max(100)
        .refine((zone) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: zone });
            return true;
          } catch {
            return false;
          }
        })
        .parse(input.timezone),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const sql = await getSql();
    const household = await sql`select 1 from households where id = ${data.code}`;
    if (household.length === 0) return { ok: false };
    // Preserve schedule start for unchanged slots — the patient's phone
    // is the source of truth, this is only a mirror for the caregiver view
    // and the missed-dose check.
    await sql`delete from care_medicines where household_id = ${data.code}
      and not (id = any(${data.medicines.map((m) => m.id)}::text[]))`;
    for (const medicine of data.medicines) {
      await sql`
        insert into care_medicines (id, household_id, name, strength, times, timezone)
        values (${medicine.id}, ${data.code}, ${medicine.name}, ${medicine.strength}, ${JSON.stringify(medicine.times)}::jsonb, ${data.timezone})
        on conflict (household_id, id) do update set
          name = excluded.name, strength = excluded.strength, times = excluded.times, timezone = excluded.timezone,
          schedule_started_at = case when care_medicines.times = excluded.times and care_medicines.timezone = excluded.timezone
            then care_medicines.schedule_started_at else now() end
      `;
    }
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
    const sql = await getSql();
    const id = doseEventId(data.code, data.medicineId, data.date, data.time);
    const takenAt = data.status === "taken" ? new Date() : null;
    await sql`
      insert into dose_events
        (id, household_id, medicine_id, medicine_name, strength, date, time, status, taken_at, verified, check_image, notified)
      values
        (${id}, ${data.code}, ${data.medicineId}, ${data.medicineName}, ${data.strength}, ${data.date}, ${data.time}, ${data.status}, ${takenAt}, ${data.verified}, ${data.checkImage ?? null}, false)
      on conflict (household_id, medicine_id, date, time) do update set
        notification_claim = null,
        notification_claim_until = null,
        status = excluded.status,
        taken_at = excluded.taken_at,
        verified = excluded.verified,
        check_image = coalesce(excluded.check_image, dose_events.check_image)
    `;

    if (data.status === "taken") {
      const med = [data.medicineName, data.strength].filter(Boolean).join(" ");
      void sendPushToHousehold(data.code, {
        title: "Medicine taken",
        body: `${med} taken at ${formatTimeLabel(data.time)}. Open the app to see the photo.`,
        tag: `dose-${id}`,
      }).catch(() => {
        /* push is best-effort — never block the confirmation flow */
      });
    }
    return { ok: true };
  });

/**
 * Join details for the in-app family video call (ZEGOCLOUD). The token is built here, with the
 * ServerSecret kept as a Worker secret, so it never reaches a phone. When ZEGOCLOUD is not set up
 * the page falls back to the public Jitsi room.
 */
export const getVideoToken = createServerFn({ method: "POST" })
  .validator((input: { code: string; userId: string; userName?: string }) => ({
    code: codeSchema.parse(input.code),
    userId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .parse(input.userId),
  }))
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: true; appId: number; token: string; roomId: string; userId: string }
      | { ok: false; reason: "not-configured" | "unknown-family" | "failed" }
    > => {
      const appId = Number(process.env.ZEGO_APP_ID);
      const secret = process.env.ZEGO_SERVER_SECRET;
      if (!Number.isInteger(appId) || appId <= 0 || !secret) {
        return { ok: false, reason: "not-configured" };
      }
      const sql = await getSql();
      const rows = await sql<{ id: string }>`select id from households where id = ${data.code}`;
      if (rows.length === 0) return { ok: false, reason: "unknown-family" };
      try {
        const token = await generateToken04(appId, data.userId, secret, 3600);
        return {
          ok: true,
          appId,
          token,
          roomId: await videoRoomName(data.code),
          userId: data.userId,
        };
      } catch (err) {
        // Error kind only: the message could echo the secret's length or shape.
        console.error("video token failed:", err instanceof Error ? err.name : "unknown");
        return { ok: false, reason: "failed" };
      }
    },
  );

export const ringFamilyVideo = createServerFn({ method: "POST" })
  .validator((input: { code: string; callerName?: string }) => ({
    code: codeSchema.parse(input.code),
    callerName: z.string().trim().max(60).optional().default("").parse(input.callerName),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`select id from households where id = ${data.code}`;
    if (rows.length === 0) return { ok: false };
    const who = data.callerName || "Your family";
    void sendPushToHousehold(data.code, {
      title: "Video call",
      body: `${who} is calling. Open SureDose and tap Video call to join.`,
      tag: `video-${data.code}`,
    }).catch(() => {
      /* push is best-effort */
    });
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
      const sql = await getSql();
      const household = await sql<{ patient_name: string }>`
        select patient_name from households where id = ${data.code}
      `;
      if (household.length === 0) {
        return { ok: false, error: "This family code is no longer active." };
      }

      const events = await sql<{
        id: string;
        medicine_name: string;
        strength: string;
        date: string;
        time: string;
        status: "taken" | "missed" | "skipped";
        taken_at: string | null;
        verified: boolean;
        check_image: string | null;
      }>`
        select id, medicine_name, strength, date, time, status, taken_at, verified, check_image
        from dose_events
        where household_id = ${data.code}
        order by coalesce(taken_at, created_at) desc
        limit ${data.limit}
      `;

      const medicines = await sql<{
        id: string;
        name: string;
        strength: string;
        times: string[];
      }>`
        select id, name, strength, times from care_medicines
        where household_id = ${data.code}
        order by name asc
      `;

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
          verified: e.verified,
          checkImage: e.check_image,
        })),
        medicines: medicines.map((m) => ({
          id: m.id,
          name: m.name,
          strength: m.strength,
          times: Array.isArray(m.times) ? m.times : [],
        })),
      };
    },
  );

export const subscribePush = createServerFn({ method: "POST" })
  .validator((input: { code: string; subscription: z.infer<typeof pushSubscriptionSchema> }) => ({
    code: codeSchema.parse(input.code),
    subscription: pushSubscriptionSchema.parse(input.subscription),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const sql = await getSql();
    const household = await sql`select 1 from households where id = ${data.code}`;
    if (household.length === 0) {
      return { ok: false, error: "This family code is no longer active." };
    }
    await savePushSubscription(sql, data.code, data.subscription);
    return { ok: true };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .validator((input: { endpoint: string }) => ({
    endpoint: z.string().max(600).parse(input.endpoint),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const sql = await getSql();
    await sql`delete from push_subscriptions where endpoint = ${data.endpoint}`;
    return { ok: true };
  });

/**
 * Permanently deletes a family's shared data — the household row, its
 * medicine mirror, its dose activity (including confirmation photos), and
 * any push subscriptions, via the ON DELETE CASCADE foreign keys set up in
 * migrations/0002_care_circle.sql. This is the in-app data-deletion path:
 * anyone holding the code can use it (same trust model as the code itself),
 * no account or login required. See src/routes/privacy.tsx.
 */
export const deleteHousehold = createServerFn({ method: "POST" })
  .validator((input: { code: string }) => ({ code: codeSchema.parse(input.code) }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const sql = await getSql();
    await sql`delete from households where id = ${data.code}`;
    return { ok: true };
  });
