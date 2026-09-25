import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BottleRead, PillMatch } from "./types";
import { defaultTimesForCount } from "./schedule";
import { vertexVision } from "./vertex";

const imageSchema = z.string().min(20).max(3_500_000);

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI did not return usable data.");
  return JSON.parse(raw.slice(start, end + 1));
}

const bottleResult = z.object({
  name: z.string(),
  strength: z.string().optional().default(""),
  timesPerDay: z.number().optional(),
  times: z.array(z.string()).optional(),
  instructions: z.string().optional().default(""),
  ndc: z.string().optional().default(""),
  pillDescription: z.string().optional().default(""),
});

export const readBottleLabel = createServerFn({ method: "POST" })
  .validator((input: { image: string }) => ({ image: imageSchema.parse(input.image) }))
  .handler(async ({ data }): Promise<{ ok: true; bottle: BottleRead } | { ok: false; error: string }> => {
    const vision = await vertexVision({
      maxTokens: 500,
      images: [data.image],
      prompt: `You read pharmacy prescription bottle labels for older adults.
Return ONLY JSON with this shape:
{
  "name": "medicine name without strength",
  "strength": "e.g. 10 mg",
  "timesPerDay": 1,
  "times": ["08:00"],
  "instructions": "short plain-language directions",
  "ndc": "the NDC number printed on the label, digits and dashes exactly as printed, or empty string",
  "pillDescription": "the label's line describing what the pill looks like (e.g. white round tablet imprinted M 367), or empty string"
}
Rules:
- times use 24-hour HH:mm
- If the label says once daily, timesPerDay=1 and times=["08:00"] unless a time is printed
- twice daily → ["08:00","20:00"]
- three times daily → ["08:00","14:00","20:00"]
- every morning → ["08:00"]; every night → ["21:00"]
- If you cannot read a field, use an empty string or best guess
- Never guess an NDC digit. If any digit is unclear, return "" for ndc.
- No markdown`,
    });
    if (!vision.ok) return vision;
    try {
      const parsed = bottleResult.parse(extractJson(vision.text));
      const count = Math.min(4, Math.max(1, Math.round(parsed.timesPerDay ?? parsed.times?.length ?? 1)));
      const times =
        parsed.times && parsed.times.length > 0
          ? parsed.times
          : defaultTimesForCount(count);
      return {
        ok: true,
        bottle: {
          name: parsed.name.trim(),
          strength: parsed.strength.trim(),
          timesPerDay: count,
          times,
          instructions: parsed.instructions.trim(),
          ndc: /\d{4}/.test(parsed.ndc) ? parsed.ndc.trim().slice(0, 20) : "",
          pillDescription: parsed.pillDescription.trim().slice(0, 160),
        },
      };
    } catch {
      return { ok: false, error: "Could not read the bottle. You can type the name instead." };
    }
  });

const matchResult = z.object({
  match: z.boolean(),
  confidence: z.number(),
  reason: z.string(),
});

export const comparePills = createServerFn({ method: "POST" })
  .validator(
    (input: {
      reference: string;
      candidate: string;
      name: string;
      /** Official look from the FDA label, e.g. "White round tablet, marked M / 367". */
      appearance?: string;
      /** The reference is the maker's photo (usually front and back side by side on a plain background). */
      officialReference?: boolean;
    }) => ({
      reference: imageSchema.parse(input.reference),
      candidate: imageSchema.parse(input.candidate),
      name: z.string().max(80).parse(input.name ?? ""),
      appearance: z.string().max(200).parse(input.appearance ?? ""),
      officialReference: Boolean(input.officialReference),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; result: PillMatch } | { ok: false; error: string }> => {
    const vision = await vertexVision({
      maxTokens: 350,
      images: [data.reference, data.candidate],
      prompt: `You compare two photos of pills for a medication safety app used by older adults.
Image 1 is the SAVED reference photo of ${data.name || "the prescribed pill"}.${
        data.officialReference
          ? "\nImage 1 is the manufacturer's official photo: it usually shows the front and back of ONE pill side by side on a plain background. Match either side."
          : ""
      }${data.appearance ? `\nOfficial description of the correct pill: ${data.appearance}. An imprint that clearly differs means match=false.` : ""}
Image 2 is the pill the person is about to take now.

Decide if they are the same medicine (same shape, color, size, coating, and imprint if visible).
Ignore background, lighting, camera angle, and hands.
If Image 2 is not a pill, match=false.

Return ONLY JSON:
{
  "match": true,
  "confidence": 0.0,
  "reason": "one short sentence in plain English, no jargon"
}
confidence is 0 to 1. Be conservative if unsure.`,
    });
    if (!vision.ok) return vision;
    try {
      const parsed = matchResult.parse(extractJson(vision.text));
      return {
        ok: true,
        result: {
          match: parsed.match,
          confidence: Math.min(1, Math.max(0, parsed.confidence)),
          reason: parsed.reason.trim() || (parsed.match ? "These look like the same pill." : "These do not look like the same pill."),
        },
      };
    } catch {
      return { ok: false, error: "Could not check this pill. Look at both photos and decide carefully." };
    }
  });
