import { getSql } from "./db";
import {
  SPECIFIC_DRUG_TTYS,
  canonicalProductNdc,
  dailyMedImageUrl,
  describeAppearance,
  namesMatch,
  normName,
  normStrength,
  parseApproximateTerm,
  parseClinicalDrugName,
  parseFdaNdcResponse,
  parseRxProperties,
  parseSplAppearance,
  productNdcCandidates,
  strengthMatches,
  type FdaProduct,
  type RxConcept,
} from "./drug-data";
import {
  MAX_IMAGE_BYTES,
  getOfficialImage,
  isJpeg,
  putOfficialImage,
  r2Available,
  sha256Hex,
  toJpegDataUrl,
} from "./image-store.server";
import type { VerifiedMedicine } from "./types";

/*
 * Official drug lookups + the shared cache in front of them.
 *
 * Sources (all free U.S. government services, no account needed):
 *   openFDA NDC directory   https://api.fda.gov/drug/ndc.json
 *   NLM DailyMed labels     https://dailymed.nlm.nih.gov/dailymed/services/v2/
 *   NLM RxNorm              https://rxnav.nlm.nih.gov/REST/
 *
 * openFDA allows 1,000 requests a day per IP without a key; set
 * OPENFDA_API_KEY (free, from open.fda.gov) before launch and before seeding.
 */

const OPENFDA = "https://api.fda.gov/drug/ndc.json";
const DAILYMED = "https://dailymed.nlm.nih.gov/dailymed/services/v2";
const RXNAV = "https://rxnav.nlm.nih.gov/REST";

const PRODUCT_TTL_DAYS = 90;
const NAME_TTL_DAYS = 30;
const TIMEOUT_MS = 8000;

/** A government service could not be reached (as opposed to "not found"). */
export class LookupUnavailable extends Error {}

async function fetchOrNull(url: string, accept: string): Promise<Response | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept, "user-agent": "SureDose medication reminder" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new LookupUnavailable(err instanceof Error ? err.message : "network error");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new LookupUnavailable(`${new URL(url).host} returned ${res.status}`);
  return res;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const res = await fetchOrNull(url, "application/json");
  return res ? res.json() : null;
}

function fdaUrl(search: string, limit: number): string {
  const key = process.env.OPENFDA_API_KEY;
  return `${OPENFDA}?search=${encodeURIComponent(search)}&limit=${limit}${key ? `&api_key=${encodeURIComponent(key)}` : ""}`;
}

function isFresh(fetchedAt: string | Date, days: number): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < days * 86_400_000;
}

/* ------------------------------------------------------------------ */
/* Products by NDC                                                     */
/* ------------------------------------------------------------------ */

export type ProductRow = {
  product_ndc: string;
  label_ndc: string;
  name: string;
  generic_name: string;
  brand_name: string;
  strength: string;
  form: string;
  labeler: string;
  rxcui: string;
  spl_set_id: string;
  colors: string;
  shape: string;
  size_mm: number | null;
  imprint: string;
  appearance: string;
  image_storage: "r2" | "inline" | "none";
  image_sha: string | null;
  inline_image: string | null;
  fetched_at: string;
};

async function fdaByProductNdc(productNdc: string): Promise<FdaProduct | null> {
  const json = await fetchJson(fdaUrl(`product_ndc:"${productNdc}"`, 1));
  return json ? (parseFdaNdcResponse(json)[0] ?? null) : null;
}

async function fdaBySetId(setId: string): Promise<FdaProduct[]> {
  const json = await fetchJson(fdaUrl(`openfda.spl_set_id:"${setId}"`, 100));
  return json ? parseFdaNdcResponse(json) : [];
}

/** Some openFDA records lack the label id; DailyMed can find it by NDC. */
async function dailyMedSetIdForNdc(productNdc: string): Promise<string> {
  const json = (await fetchJson(`${DAILYMED}/spls.json?ndc=${encodeURIComponent(productNdc)}&pagesize=1`)) as {
    data?: { setid?: string }[];
  } | null;
  return json?.data?.[0]?.setid ?? "";
}

async function fetchSplXml(setId: string): Promise<string | null> {
  const res = await fetchOrNull(`${DAILYMED}/spls/${encodeURIComponent(setId)}.xml`, "application/xml");
  return res ? res.text() : null;
}

async function fetchJpeg(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetchOrNull(url, "image/jpeg");
    if (!res) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return isJpeg(bytes) && bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
  } catch {
    return null; // a missing photo never blocks the check itself
  }
}

/**
 * Fetch one label's appearance data and the makers' pill photos, and save
 * the given products (all from that label) to the cache.
 */
export async function ingestProducts(setId: string, products: FdaProduct[]): Promise<ProductRow[]> {
  const xml = setId ? await fetchSplXml(setId).catch(() => null) : null;
  const looks = xml ? parseSplAppearance(xml) : [];
  const sql = await getSql();
  const rows: ProductRow[] = [];

  for (const p of products) {
    const canon = canonicalProductNdc(p.productNdc);
    const look = looks.find((l) => canonicalProductNdc(l.productNdc) === canon);

    let storage: ProductRow["image_storage"] = "none";
    let sha: string | null = null;
    let inline: string | null = null;
    if (look?.imageFile && setId) {
      const bytes = await fetchJpeg(dailyMedImageUrl(setId, look.imageFile));
      if (bytes) {
        if (r2Available()) {
          sha = await putOfficialImage(bytes);
          storage = "r2";
        } else {
          sha = sha256Hex(bytes);
          inline = toJpegDataUrl(bytes);
          storage = "inline";
        }
      }
    }

    const appearance = look
      ? describeAppearance({ colors: look.colors, shape: look.shape, imprint: look.imprint, form: p.form })
      : "";

    const [row] = await sql<ProductRow>`
      insert into drug_products (
        product_ndc, label_ndc, name, generic_name, brand_name, strength, form,
        labeler, rxcui, spl_set_id, colors, shape, size_mm, imprint, appearance,
        image_storage, image_sha, inline_image, fetched_at
      ) values (
        ${canon}, ${p.productNdc}, ${p.name}, ${p.genericName}, ${p.brandName}, ${p.strength}, ${p.form},
        ${p.labeler}, ${p.rxcui}, ${setId}, ${look?.colors.join(",") ?? ""}, ${look?.shape ?? ""},
        ${look?.sizeMm ?? null}, ${look?.imprint ?? ""}, ${appearance},
        ${storage}, ${sha}, ${inline}, now()
      )
      on conflict (product_ndc) do update set
        label_ndc = excluded.label_ndc, name = excluded.name,
        generic_name = excluded.generic_name, brand_name = excluded.brand_name,
        strength = excluded.strength, form = excluded.form, labeler = excluded.labeler,
        rxcui = excluded.rxcui, spl_set_id = excluded.spl_set_id,
        colors = excluded.colors, shape = excluded.shape, size_mm = excluded.size_mm,
        imprint = excluded.imprint, appearance = excluded.appearance,
        -- Keep a photo we already have if this refresh couldn't fetch one.
        image_storage = case when excluded.image_storage = 'none' then drug_products.image_storage else excluded.image_storage end,
        image_sha = case when excluded.image_storage = 'none' then drug_products.image_sha else excluded.image_sha end,
        inline_image = case when excluded.image_storage = 'none' then drug_products.inline_image else excluded.inline_image end,
        fetched_at = now()
      returning *
    `;
    rows.push(row);
  }
  return rows;
}

/**
 * The exact product for an NDC read off a bottle: cache first, then
 * openFDA + DailyMed. Returns null when no reading of the NDC is a real
 * product. Serves a stale cached row if the government services are down.
 */
export async function lookupByNdc(rawNdc: string): Promise<ProductRow | null> {
  const candidates = productNdcCandidates(rawNdc);
  if (candidates.length === 0) return null;
  const sql = await getSql();
  const cached = await sql<ProductRow>`
    select * from drug_products where product_ndc = any(${candidates.map(canonicalProductNdc)})
  `;
  const fresh = cached.find((r) => isFresh(r.fetched_at, PRODUCT_TTL_DAYS));
  if (fresh) return fresh;

  try {
    for (const c of candidates) {
      const product = await fdaByProductNdc(c);
      if (!product) continue;
      const setId = product.splSetId || (await dailyMedSetIdForNdc(product.productNdc).catch(() => ""));
      const [row] = await ingestProducts(setId, [product]);
      return row ?? null;
    }
    return null;
  } catch (err) {
    if (cached[0]) return cached[0];
    throw err;
  }
}

/** Warm the cache with every product on one DailyMed label (seeding). */
export async function warmLabel(setId: string): Promise<{ products: number; withPhoto: number }> {
  const products = await fdaBySetId(setId);
  if (products.length === 0) return { products: 0, withPhoto: 0 };
  const rows = await ingestProducts(setId, products);
  return { products: rows.length, withPhoto: rows.filter((r) => r.image_storage !== "none").length };
}

export async function productToVerified(row: ProductRow): Promise<VerifiedMedicine> {
  const officialImage =
    row.image_storage === "inline"
      ? row.inline_image
      : row.image_storage === "r2" && row.image_sha
        ? await getOfficialImage(row.image_sha).catch(() => null)
        : null;
  return {
    by: "ndc",
    name: row.name,
    strength: row.strength,
    form: row.form,
    labeler: row.labeler,
    ndc: row.label_ndc,
    rxcui: row.rxcui,
    appearance: row.appearance,
    officialImage,
  };
}

/* ------------------------------------------------------------------ */
/* Name + strength via RxNorm                                          */
/* ------------------------------------------------------------------ */

export type NameLookup =
  | { found: true; rxcui: string; name: string; strength: string; form: string }
  | { found: false; reason: "no_drug" | "strength" | "need_strength"; drugName?: string };

async function rxProperties(rxcui: string): Promise<RxConcept | null> {
  const json = await fetchJson(`${RXNAV}/rxcui/${encodeURIComponent(rxcui)}/properties.json`);
  return json ? parseRxProperties(json) : null;
}

function displayStrength(bottle: string, official: string): string {
  // RxNorm writes micrograms as "0.05 mg"; bottles say "50 mcg". Keep the
  // bottle's wording when it is in mcg so the screen matches the bottle.
  if (/mcg|µg/i.test(bottle)) return bottle.replace(/(\d)\s*(mcg|µg)/i, "$1 mcg").trim();
  return official;
}

async function lookupByNameUncached(name: string, strength: string): Promise<NameLookup> {
  const term = `${name} ${strength}`.trim();
  const approx = await fetchJson(`${RXNAV}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=10&option=1`);
  const rxcuis = approx ? parseApproximateTerm(approx).slice(0, 6) : [];
  const concepts = (await Promise.all(rxcuis.map(rxProperties))).filter((c): c is RxConcept => c !== null);

  const sameDrug = concepts.filter((c) => namesMatch(name, [c.name]));
  if (sameDrug.length === 0) return { found: false, reason: "no_drug" };

  const specific = sameDrug
    .filter((c) => SPECIFIC_DRUG_TTYS.has(c.tty))
    .map((c) => ({ c, parsed: parseClinicalDrugName(c.name) }))
    .filter((x): x is { c: RxConcept; parsed: NonNullable<typeof x.parsed> } => x.parsed !== null);

  const drugName = specific[0]?.parsed.ingredients ?? sameDrug[0].name;
  if (!strength) return { found: false, reason: "need_strength", drugName };

  const withStrength = specific.filter((x) => strengthMatches(strength, x.parsed.strength) === true);
  if (withStrength.length === 0) return { found: false, reason: "strength", drugName };

  // Bottle says a brand ("Lipitor") → the branded concept; otherwise generic.
  const pick =
    withStrength.find((x) => x.parsed.brand && namesMatch(name, [x.parsed.brand])) ??
    withStrength.find((x) => x.c.tty === "SCD") ??
    withStrength[0];

  return {
    found: true,
    rxcui: pick.c.rxcui,
    name: pick.parsed.brand ? `${pick.parsed.brand} (${pick.parsed.ingredients})` : pick.parsed.ingredients,
    strength: displayStrength(strength, pick.parsed.strength),
    form: pick.parsed.form,
  };
}

export async function lookupByName(name: string, strength: string): Promise<NameLookup> {
  const key = `${normName(name)}|${normStrength(strength)}`;
  const sql = await getSql();
  const cached = await sql<{ result: NameLookup; fetched_at: string }>`
    select result, fetched_at from drug_name_lookups where query_key = ${key}
  `;
  if (cached[0] && isFresh(cached[0].fetched_at, NAME_TTL_DAYS)) return cached[0].result;

  let result: NameLookup;
  try {
    result = await lookupByNameUncached(name, strength);
  } catch (err) {
    if (cached[0]) return cached[0].result;
    throw err;
  }
  await sql`
    insert into drug_name_lookups (query_key, result, fetched_at)
    values (${key}, ${JSON.stringify(result)}::jsonb, now())
    on conflict (query_key) do update set result = excluded.result, fetched_at = now()
  `;
  return result;
}
