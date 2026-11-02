import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { verifyMedicineData } from "./drug-verify";
import type { MedicineCheck } from "./types";
import { comparePillPhotos, readLabelPhoto } from "./vision-checks";

import { vision } from "./vision";
import { VISION_RATE_LIMIT_MESSAGE, withVisionRateLimit } from "./vision-rate-limit";

export { extractJson } from "./vision-checks";

const imageSchema = z.string().min(20).max(3_500_000);

export const readBottleLabel = createServerFn({ method: "POST" })
  .validator((input: { image: string }) => ({ image: imageSchema.parse(input.image) }))
  .handler(({ data }) =>
    withVisionRateLimit(
      getRequest()?.headers ?? new Headers(),
      async () => {
        const result = await readLabelPhoto(data.image, vision);
        if (!result.ok) return result;
        if (!result.bottle.name || !result.bottle.strength) return { ...result, check: null };
        const check: MedicineCheck = await verifyMedicineData({
          name: result.bottle.name,
          strength: result.bottle.strength,
          ndc: result.bottle.ndc,
        });
        return { ...result, check };
      },
      { ok: false as const, error: VISION_RATE_LIMIT_MESSAGE },
    ),
  );

export const comparePills = createServerFn({ method: "POST" })
  .validator(
    (input: {
      reference: string;
      candidate: string;
      candidateBack?: string;
      name: string;
      /** Official look from the FDA label, e.g. "White round tablet, marked M / 367". */
      appearance?: string;
      /** The reference is the maker's photo (usually front and back side by side on a plain background). */
      officialReference?: boolean;
    }) => ({
      reference: imageSchema.parse(input.reference),
      candidate: imageSchema.parse(input.candidate),
      candidateBack:
        input.candidateBack === undefined ? undefined : imageSchema.parse(input.candidateBack),
      name: z
        .string()
        .max(200)
        .parse(input.name ?? ""),
      appearance: z
        .string()
        .max(200)
        .parse(input.appearance ?? ""),
      officialReference: Boolean(input.officialReference),
    }),
  )
  .handler(({ data }) =>
    withVisionRateLimit(
      getRequest()?.headers ?? new Headers(),
      () => comparePillPhotos(data, vision),
      { ok: false as const, error: VISION_RATE_LIMIT_MESSAGE },
    ),
  );
