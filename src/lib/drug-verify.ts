import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { namesMatch, strengthMatches } from "./drug-data";
import { LookupUnavailable, lookupByName, lookupByNdc, productToVerified } from "./drug-lookup.server";
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
    name: z.string().trim().max(120).parse(input.name ?? ""),
    strength: z.string().trim().max(60).parse(input.strength ?? ""),
    ndc: z.string().trim().max(24).parse(input.ndc ?? ""),
  }))
  .handler(async ({ data }): Promise<MedicineCheck> => {
    let note: string | undefined;
    try {
      if (data.ndc) {
        const row = await lookupByNdc(data.ndc);
        if (row) {
          const nameOk = !data.name || namesMatch(data.name, [row.name, row.generic_name, row.brand_name]);
          const strengthOk = strengthMatches(data.strength, row.strength) !== false;
          if (nameOk && strengthOk) {
            return { status: "verified", medicine: await productToVerified(row) };
          }
          note = nameOk
            ? "The product code on the bottle is for a different strength, so we checked by name and strength instead."
            : "The product code on the bottle did not match the medicine name, so we checked by name instead.";
        }
      }

      if (!data.name) {
        return { status: "not_found", message: "We could not read the medicine name. Please type it from the bottle." };
      }

      const found = await lookupByName(data.name, data.strength);
      if (found.found) {
        return {
          status: "verified",
          note,
          medicine: {
            by: "name",
            name: found.name,
            strength: found.strength,
            form: found.form,
            labeler: "",
            ndc: "",
            rxcui: found.rxcui,
            appearance: "",
            officialImage: null,
          },
        };
      }
      if (found.reason === "need_strength") {
        return {
          status: "not_found",
          drugName: found.drugName,
          message: `We found ${found.drugName}. Please type the strength from the bottle, for example "10 mg".`,
        };
      }
      if (found.reason === "strength") {
        return {
          status: "not_found",
          drugName: found.drugName,
          message: `We found ${found.drugName}, but not in ${data.strength}. Please check the strength on the bottle.`,
        };
      }
      return {
        status: "not_found",
        message: `We could not find "${data.name}" in the U.S. drug list. Please check the spelling on the bottle.`,
      };
    } catch (err) {
      if (!(err instanceof LookupUnavailable)) console.error("verifyMedicine", err);
      return {
        status: "unavailable",
        message: "We can't reach the U.S. drug list right now. Please try again in a minute.",
      };
    }
  });
