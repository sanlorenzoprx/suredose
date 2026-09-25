/*
 * Pure helpers for checking a medicine against the official U.S. drug data:
 *
 *   - openFDA NDC directory (api.fda.gov/drug/ndc.json): product code → exact
 *     product (name, strength, form, maker, DailyMed label id)
 *   - DailyMed SPL labels (dailymed.nlm.nih.gov): what the pill looks like —
 *     color, shape, imprint, and the maker's own pill photo (SPLIMAGE)
 *   - RxNorm (rxnav.nlm.nih.gov): name + strength → real drug concept, used
 *     when the bottle's NDC can't be read
 *
 * No imports and no network here, so it can be unit tested with plain Node
 * (see drug-data.test.ts). The fetching lives in drug-lookup.server.ts.
 */

/* ------------------------------------------------------------------ */
/* NDC                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Possible FDA product NDCs ("labeler-product", as openFDA lists them) for
 * an NDC read off a pharmacy label.
 *
 * FDA NDCs are 10 digits in a 4-4-2, 5-3-2 or 5-4-1 layout. Pharmacy labels
 * print them with dashes, without dashes, or as the 11-digit 5-4-2 billing
 * form (a zero padded into the short segment). Without dashes the split is
 * ambiguous, so every valid reading is returned and the caller tries each.
 */
export function productNdcCandidates(raw: string): string[] {
  const cleaned = raw.replace(/[^\d-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!cleaned) return [];
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  const parts = cleaned.split("-");
  const digits = parts.join("");

  if (parts.length >= 2) {
    const [a, b] = parts;
    const lens = `${a.length}-${b.length}`;
    if (lens === "4-4" || lens === "5-3" || lens === "5-4") {
      if (parts.length === 3 && `${lens}-${parts[2].length}` === "5-4-2") {
        // 11-digit billing format with dashes: fall through to the
        // de-padding below rather than trusting it as-is.
      } else {
        add(`${a}-${b}`);
        return out;
      }
    }
  }

  if (digits.length === 11) {
    const l = digits.slice(0, 5);
    const p = digits.slice(5, 9);
    const k = digits.slice(9);
    if (l.startsWith("0")) add(`${l.slice(1)}-${p}`); // was 4-4-2
    if (p.startsWith("0")) add(`${l}-${p.slice(1)}`); // was 5-3-2
    if (k.startsWith("0")) add(`${l}-${p}`); // was 5-4-1
  } else if (digits.length === 10) {
    add(`${digits.slice(0, 4)}-${digits.slice(4, 8)}`); // 4-4-2
    add(`${digits.slice(0, 5)}-${digits.slice(5, 8)}`); // 5-3-2
    add(`${digits.slice(0, 5)}-${digits.slice(5, 9)}`); // 5-4-1
  }
  return out;
}

/** "0378-1805" / "68180-513" → "00378-1805" / "68180-0513": one cache key per product. */
export function canonicalProductNdc(productNdc: string): string {
  const [a = "", b = ""] = productNdc.split("-");
  return `${a.padStart(5, "0")}-${b.padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

const SMALL_WORDS = new Set(["and", "or", "of", "with", "in"]);

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|\/|-)/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

export function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normStrength(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

// Words that appear in many drug names and prove nothing on their own.
const GENERIC_WORDS = new Set([
  "tablet", "tablets", "capsule", "capsules", "oral", "extended", "release",
  "delayed", "film", "coated", "sodium", "calcium", "potassium", "magnesium",
  "hydrochloride", "hcl", "and", "generic", "for", "tabs", "caps",
]);

function nameTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 4 && !GENERIC_WORDS.has(t)),
  );
}

/** True when the name read off the bottle shares a real drug word with any official name. */
export function namesMatch(readName: string, officialNames: string[]): boolean {
  const read = nameTokens(readName);
  if (read.size === 0) return false;
  for (const official of officialNames) {
    for (const t of nameTokens(official)) if (read.has(t)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Strength                                                            */
/* ------------------------------------------------------------------ */

const MASS_TO_MCG: Record<string, number> = { mcg: 1, ug: 1, "µg": 1, mg: 1000, g: 1_000_000 };

type StrengthValue = { value: number; unit: string };

function parseStrengthValues(s: string): StrengthValue[] {
  // Drop "per 1 unit" denominators the FDA data uses ("10 mg/1").
  const text = s.toLowerCase().replace(/\/\s*1(?![\d.])/g, " ");
  const out: StrengthValue[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g|meq|units?|unt|iu|ml|%)?/g;
  for (const m of text.matchAll(re)) {
    const unit = (m[2] ?? "").replace(/^units?$|^unt$/, "unit");
    out.push({ value: Number(m[1]), unit });
  }
  return out;
}

function toComparable(v: StrengthValue): string {
  const f = MASS_TO_MCG[v.unit];
  if (f) return `mass:${Math.round(v.value * f * 1000) / 1000}`;
  return `${v.unit}:${v.value}`;
}

/**
 * Does the strength on the bottle match the official strength? Handles
 * "10mg" vs "10 mg/1", "50 mcg" vs "0.05 MG", and combination products
 * ("5/325" vs "325 MG / 5 MG"). Returns null when the bottle gave none.
 */
export function strengthMatches(bottle: string, official: string): boolean | null {
  const a = parseStrengthValues(bottle);
  if (a.length === 0) return null;
  const b = parseStrengthValues(official);
  if (b.length === 0) return false;
  const unitless = a.every((v) => v.unit === "");
  const key = (vs: StrengthValue[]) =>
    vs
      .map((v) => (unitless ? String(v.value) : toComparable(v)))
      .sort()
      .join("|");
  if (unitless) {
    return key(a) === key(b.map((v) => ({ value: v.value, unit: "" })));
  }
  return key(a) === key(b);
}

/** openFDA "10 mg/1" → "10 mg". */
export function cleanFdaStrength(s: string): string {
  return s
    .replace(/\/\s*1(?![\d.])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Dosage form                                                         */
/* ------------------------------------------------------------------ */

/** openFDA "TABLET, FILM COATED, EXTENDED RELEASE" → "extended-release tablet". */
export function plainForm(fdaForm: string): string {
  const [base = "", ...mods] = fdaForm.toLowerCase().split(/\s*,\s*/);
  const prefix: string[] = [];
  for (const m of mods) {
    if (m.includes("extended release")) prefix.push("extended-release");
    else if (m.includes("delayed release")) prefix.push("delayed-release");
    else if (m.includes("chewable")) prefix.push("chewable");
    else if (m.includes("orally disintegrating")) prefix.push("dissolving");
  }
  return [...prefix, base].join(" ").trim();
}

/** RxNorm "Extended Release Oral Tablet" → "extended-release tablet". */
export function plainRxnormForm(form: string): string {
  return form
    .toLowerCase()
    .replace(/\boral\s+/g, "")
    .replace(/extended release/g, "extended-release")
    .replace(/delayed release/g, "delayed-release")
    .replace(/disintegrating/g, "dissolving")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* openFDA NDC directory                                               */
/* ------------------------------------------------------------------ */

export type FdaProduct = {
  productNdc: string;
  genericName: string;
  brandName: string;
  /** Display name, e.g. "Lisinopril" or "Lipitor (Atorvastatin Calcium)". */
  name: string;
  strength: string;
  /** Plain words, e.g. "tablet", "extended-release capsule". */
  form: string;
  labeler: string;
  rxcui: string;
  splSetId: string;
};

type FdaNdcResult = {
  product_ndc?: string;
  generic_name?: string;
  brand_name?: string;
  dosage_form?: string;
  labeler_name?: string;
  active_ingredients?: { name?: string; strength?: string }[];
  openfda?: { rxcui?: string[]; spl_set_id?: string[] };
  spl_set_id?: string;
};

export function parseFdaProduct(r: FdaNdcResult): FdaProduct | null {
  if (!r.product_ndc) return null;
  const generic = titleCase(r.generic_name ?? "");
  const brand = titleCase(r.brand_name ?? "");
  const name =
    brand && generic && normName(brand) !== normName(generic) && !namesMatch(brand, [generic])
      ? `${brand} (${generic})`
      : generic || brand;
  return {
    productNdc: r.product_ndc,
    genericName: generic,
    brandName: brand,
    name,
    strength: (r.active_ingredients ?? [])
      .map((i) => cleanFdaStrength(i.strength ?? ""))
      .filter(Boolean)
      .join(" / "),
    form: plainForm(r.dosage_form ?? ""),
    labeler: r.labeler_name ?? "",
    rxcui: r.openfda?.rxcui?.[0] ?? "",
    splSetId: r.openfda?.spl_set_id?.[0] ?? r.spl_set_id ?? "",
  };
}

export function parseFdaNdcResponse(json: unknown): FdaProduct[] {
  const results = (json as { results?: FdaNdcResult[] })?.results ?? [];
  return results.map(parseFdaProduct).filter((p): p is FdaProduct => p !== null);
}

/* ------------------------------------------------------------------ */
/* DailyMed SPL: what the pill looks like                              */
/* ------------------------------------------------------------------ */

export type SplAppearance = {
  productNdc: string;
  colors: string[];
  shape: string;
  sizeMm: number | null;
  imprint: string;
  /** File name of the maker's pill photo in this label, if any. */
  imageFile: string | null;
};

const NDC_CODE_SYSTEM = "2.16.840.1.113883.6.69";

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
}

function cleanDisplay(s: string): string {
  // "HEXAGON (6 SIDED)" → "hexagon"
  return s.replace(/\s*\(.*?\)\s*/g, " ").trim().toLowerCase();
}

/**
 * Pull each product's look out of an SPL label. Every product is its own
 * <subject><manufacturedProduct> block: the product NDC is the
 * two-segment code in NDC_CODE_SYSTEM, and its <characteristic> entries
 * hold SPLCOLOR, SPLSHAPE, SPLSIZE, SPLIMPRINT and SPLIMAGE.
 */
export function parseSplAppearance(xml: string): SplAppearance[] {
  const out: SplAppearance[] = [];
  const blocks = xml.split(/<subject(?=[\s>])[^>]*>/).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/subject>/)[0];
    let productNdc = "";
    for (const m of block.matchAll(/<code\b[^>]*>/g)) {
      const code = attr(m[0], "code");
      if (attr(m[0], "codeSystem") === NDC_CODE_SYSTEM && code && /^\d+-\d+$/.test(code)) {
        productNdc = code;
        break;
      }
    }
    if (!productNdc) continue;

    const item: SplAppearance = { productNdc, colors: [], shape: "", sizeMm: null, imprint: "", imageFile: null };
    for (const c of block.matchAll(/<characteristic\b[\s\S]*?<\/characteristic>/g)) {
      const text = c[0];
      const codeTag = /<code\b[^>]*>/.exec(text)?.[0] ?? "";
      const kind = attr(codeTag, "code");
      const valueTag = /<value\b[^>]*\/?>/.exec(text)?.[0] ?? "";
      switch (kind) {
        case "SPLCOLOR": {
          const d = attr(valueTag, "displayName");
          if (d) item.colors.push(cleanDisplay(d));
          break;
        }
        case "SPLSHAPE": {
          const d = attr(valueTag, "displayName");
          if (d) item.shape = cleanDisplay(d);
          break;
        }
        case "SPLSIZE": {
          const v = Number(attr(valueTag, "value"));
          if (Number.isFinite(v) && v > 0) item.sizeMm = Math.round(v);
          break;
        }
        case "SPLIMPRINT": {
          const m = /<value\b[^>]*>([^<]*)<\/value>/.exec(text);
          if (m) item.imprint = decodeXml(m[1]).trim();
          break;
        }
        case "SPLIMAGE": {
          const ref = /<reference\b[^>]*>/.exec(text)?.[0];
          const file = ref ? attr(ref, "value") : null;
          if (file && /^[\w.-]+\.(jpe?g)$/i.test(file)) item.imageFile = file;
          break;
        }
      }
    }
    out.push(item);
  }
  return out;
}

/** DailyMed serves label images at this address. */
export function dailyMedImageUrl(setId: string, file: string): string {
  return `https://dailymed.nlm.nih.gov/dailymed/image.cfm?setid=${encodeURIComponent(setId)}&name=${encodeURIComponent(file)}`;
}

/**
 * Plain-language look of a pill for older adults:
 * "White round tablet, marked M 367".
 */
export function describeAppearance(a: { colors: string[]; shape: string; imprint: string; form: string }): string {
  const form = a.form.split(" ").pop() || "pill";
  const words: string[] = [];
  if (a.colors.length) words.push(a.colors.join(" and "));
  if (a.shape && a.shape !== form && !(a.shape === "capsule" && form === "capsule")) words.push(a.shape);
  words.push(form);
  let text = words.join(" ");
  const imprint = a.imprint
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" / ");
  if (imprint) text += `, marked ${imprint}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ------------------------------------------------------------------ */
/* RxNorm                                                              */
/* ------------------------------------------------------------------ */

/** Unique candidate RxCUIs from /REST/approximateTerm.json, best first. */
export function parseApproximateTerm(json: unknown): string[] {
  const cands =
    (json as { approximateGroup?: { candidate?: { rxcui?: string; source?: string }[] } })?.approximateGroup
      ?.candidate ?? [];
  const out: string[] = [];
  for (const c of cands) {
    if (!c.rxcui) continue;
    if (c.source && c.source !== "RXNORM") continue;
    if (!out.includes(c.rxcui)) out.push(c.rxcui);
  }
  return out;
}

export type RxConcept = { rxcui: string; name: string; tty: string };

export function parseRxProperties(json: unknown): RxConcept | null {
  const p = (json as { properties?: { rxcui?: string; name?: string; tty?: string } })?.properties;
  if (!p?.rxcui || !p.name || !p.tty) return null;
  return { rxcui: p.rxcui, name: p.name, tty: p.tty };
}

export type ParsedClinicalDrug = {
  /** "Lisinopril", "Acetaminophen / Hydrocodone Bitartrate" */
  ingredients: string;
  /** "10 mg", "325 mg / 5 mg" */
  strength: string;
  /** "tablet", "extended-release tablet" */
  form: string;
  brand: string;
};

/**
 * Split an RxNorm clinical/branded drug name:
 *   "lisinopril 10 MG Oral Tablet"
 *   "atorvastatin 20 MG Oral Tablet [Lipitor]"
 *   "24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet"
 *   "acetaminophen 325 MG / hydrocodone bitartrate 5 MG Oral Tablet"
 */
export function parseClinicalDrugName(name: string): ParsedClinicalDrug | null {
  let rest = name.trim();
  let brand = "";
  const b = /\s*\[([^\]]+)\]\s*$/.exec(rest);
  if (b) {
    brand = b[1];
    rest = rest.slice(0, b.index);
  }
  let prefix = "";
  const hr = /^(\d+)\s+HR\s+/.exec(rest);
  if (hr) {
    prefix = `${hr[1]}-hour `;
    rest = rest.slice(hr[0].length);
  }
  const unitRe = /([\d.]+)\s+(MG|MCG|G|UNT|MEQ|ML|%)(?:\/(?:ML|HR|ACTUAT))?\b/g;
  let lastEnd = -1;
  for (const m of rest.matchAll(unitRe)) lastEnd = (m.index ?? 0) + m[0].length;
  if (lastEnd < 0) return null;
  const form = plainRxnormForm(rest.slice(lastEnd));
  const parts = rest
    .slice(0, lastEnd)
    .split(/\s+\/\s+/)
    .map((p) => {
      const m = /^(.*?)\s+([\d.]+\s+\S+)$/.exec(p.trim());
      return m ? { ing: titleCase(m[1]), str: m[2].toLowerCase() } : null;
    });
  if (parts.some((p) => !p)) return null;
  const ok = parts as { ing: string; str: string }[];
  return {
    ingredients: ok.map((p) => p.ing).join(" / "),
    strength: ok.map((p) => p.str).join(" / "),
    form: `${prefix}${form}`.trim(),
    brand,
  };
}

/** Term types that name a specific drug with its strength and form. */
export const SPECIFIC_DRUG_TTYS = new Set(["SCD", "SBD", "GPCK", "BPCK"]);
