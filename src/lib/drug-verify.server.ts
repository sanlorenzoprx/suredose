import { namesMatch, strengthMatches } from "./drug-data.ts";
import {
  LookupUnavailable,
  lookupImageByRxcui,
  lookupByName,
  lookupByNdc,
  productToVerified,
} from "./drug-lookup.server.ts";
import type { MedicineCheck } from "./types.ts";

export async function verifyMedicineData(input: {
  name: string;
  strength?: string;
  ndc?: string;
}): Promise<MedicineCheck> {
  const data = {
    name: input.name.trim().slice(0, 120),
    strength: (input.strength ?? "").trim().slice(0, 60),
    ndc: (input.ndc ?? "").trim().slice(0, 24),
  };
  let note: string | undefined;
  try {
    if (data.ndc) {
      let row: Awaited<ReturnType<typeof lookupByNdc>> = null;
      try {
        row = await lookupByNdc(data.ndc, { name: data.name, strength: data.strength });
      } catch (err) {
        if (!(err instanceof LookupUnavailable)) throw err;
        note =
          "We couldn't reach the FDA product list just now, so we checked by name and strength instead.";
      }
      if (row) {
        const nameOk =
          !data.name || namesMatch(data.name, [row.name, row.generic_name, row.brand_name]);
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
      return {
        status: "not_found",
        message: "We could not read the medicine name. Please type it from the bottle.",
      };
    }

    const found = await lookupByName(data.name, data.strength);
    if (found.found) {
      let productImage: Awaited<ReturnType<typeof lookupImageByRxcui>> = null;
      try {
        productImage = await lookupImageByRxcui(found.rxcui, {
          name: data.name,
          strength: data.strength,
        });
      } catch {
        console.error("Official pill image lookup failed; continuing without an image");
      }

      return {
        status: "verified",
        note,
        medicine: {
          by: "name",
          name: found.name,
          strength: found.strength,
          form: found.form,
          labeler: productImage?.labeler ?? "",
          ndc: "",
          rxcui: found.rxcui,
          appearance: productImage?.appearance ?? "",
          officialImage: productImage
            ? await productToVerified(productImage).then((m) => m.officialImage)
            : null,
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
}
