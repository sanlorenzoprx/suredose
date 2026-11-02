import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MedicineCheck } from "./types";

/**
 * Check a medicine read off a bottle against official U.S. drug data.
 *
 * 1. Bottle NDC → the exact product (name, strength, maker) from openFDA,
 *    plus the pill's official look and the maker's photo from DailyMed.
 *    Used only if it agrees with the name and strength on the label — an
 *    NDC misread by one digit can land on a real but different product.
 * 2. Otherwise name + strength → RxNorm, which confirms the drug exists in
 *    that strength. The maker is unknown, so there is no official photo.
 *
 * Only public drug facts are sent anywhere — never the person's name or photos.
 */
export const verifyMedicine = createServerFn({ method: "POST" })
  .validator((input: { name: string; strength?: string; ndc?: string }) => ({
    name: z
      .string()
      .trim()
      .max(120)
      .parse(input.name ?? ""),
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
  }))
  .handler(async ({ data }): Promise<MedicineCheck> => {
    const { verifyMedicineData } = await import("./drug-verify.server");
    return verifyMedicineData(data);
  });
