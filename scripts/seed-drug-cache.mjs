#!/usr/bin/env node
/**
 * Pre-fill the official drug cache for common medicines, so the first
 * person to scan one gets an instant answer with the maker's pill photo.
 *
 *   DRUG_CACHE_ADMIN_TOKEN=... node scripts/seed-drug-cache.mjs \
 *     --url https://your-app.example.com \
 *     [--list scripts/common-oral-medicines.txt] [--max-labels 40] [--delay 400]
 *
 * For each medicine name it asks DailyMed for the matching human
 * prescription labels, then POSTs each label's set id to the app's
 * /api/drug-cache/warm endpoint, which fetches openFDA + DailyMed data and
 * pill photos and stores them (R2 + Postgres) exactly as a live scan would.
 *
 * Every label is one openFDA call plus a few DailyMed calls. Set
 * OPENFDA_API_KEY on the app first: without a key openFDA allows only
 * 1,000 requests a day. The script can be stopped and re-run safely.
 */
import { readFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") ? "true" : all[i + 1]]);
    return acc;
  }, []),
);

const baseUrl = (args.url ?? process.env.APP_URL ?? "").replace(/\/$/, "");
const token = process.env.DRUG_CACHE_ADMIN_TOKEN ?? "";
const listPath = args.list ?? "scripts/common-oral-medicines.txt";
const maxLabels = Number(args["max-labels"] ?? 40);
const delayMs = Number(args.delay ?? 400);

if (!baseUrl || !token) {
  console.error("Usage: DRUG_CACHE_ADMIN_TOKEN=... node scripts/seed-drug-cache.mjs --url https://your-app");
  process.exit(1);
}

const DAILYMED = "https://dailymed.nlm.nih.gov/dailymed/services/v2";
const HUMAN_RX_LABEL = "34391-3";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function labelSetIds(drugName) {
  const ids = [];
  for (let page = 1; ids.length < maxLabels; page += 1) {
    const url = `${DAILYMED}/spls.json?drug_name=${encodeURIComponent(drugName)}&doctype=${HUMAN_RX_LABEL}&pagesize=100&page=${page}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`DailyMed ${res.status} for ${drugName}`);
    const json = await res.json();
    for (const row of json.data ?? []) if (row.setid && ids.length < maxLabels) ids.push(row.setid);
    if (!json.metadata || String(json.metadata.next_page) === "null") break;
  }
  return ids;
}

async function warm(setId) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(`${baseUrl}/api/drug-cache/warm`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ setId }),
    });
    if (res.ok) return res.json();
    if (res.status === 401 || res.status === 404) {
      throw new Error(`warm endpoint returned ${res.status} — check the URL and DRUG_CACHE_ADMIN_TOKEN`);
    }
    await sleep(2000 * attempt); // 429/503 from openFDA or DailyMed: back off
  }
  return { products: 0, withPhoto: 0, failed: true };
}

const names = readFileSync(listPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

let totalProducts = 0;
let totalPhotos = 0;
for (const name of names) {
  let ids;
  try {
    ids = await labelSetIds(name);
  } catch (err) {
    console.warn(`! ${name}: ${err.message}`);
    continue;
  }
  let products = 0;
  let photos = 0;
  for (const id of ids) {
    const r = await warm(id);
    products += r.products ?? 0;
    photos += r.withPhoto ?? 0;
    await sleep(delayMs);
  }
  totalProducts += products;
  totalPhotos += photos;
  console.log(`${name}: ${ids.length} labels, ${products} products, ${photos} with a pill photo`);
}
console.log(`Done: ${totalProducts} products cached, ${totalPhotos} with a pill photo.`);
