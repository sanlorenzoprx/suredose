import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { comparePillPhotos, readLabelPhoto } from "./vision-checks";

import { vertexVision } from "./vertex";

export { extractJson } from "./vision-checks";

const imageSchema = z.string().min(20).max(3_500_000);

export const readBottleLabel = createServerFn({ method: "POST" })
  .validator((input: { image: string }) => ({ image: imageSchema.parse(input.image) }))
  .handler(({ data }) => readLabelPhoto(data.image, vertexVision));

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
  .handler(({ data }) => comparePillPhotos(data, vertexVision));
