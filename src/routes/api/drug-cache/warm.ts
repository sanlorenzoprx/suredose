import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { LookupUnavailable, lookupByNdc, warmLabel } from "@/lib/drug-lookup.server";

/**
 * POST /api/drug-cache/warm — fill the official drug cache ahead of time.
 * Used by scripts/seed-drug-cache.mjs; not called by the app.
 *
 *   Authorization: Bearer $DRUG_CACHE_ADMIN_TOKEN
 *   { "setId": "<DailyMed label set id>" }   every product on that label
 *   { "ndc": "0378-1805" }                   one product
 *
 * Disabled (404) unless DRUG_CACHE_ADMIN_TOKEN is set.
 */
function authorized(request: Request): boolean {
  const expected = process.env.DRUG_CACHE_ADMIN_TOKEN ?? "";
  if (expected.length < 16) return false;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/drug-cache/warm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.DRUG_CACHE_ADMIN_TOKEN) return new Response("Not found", { status: 404 });
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

        let body: { setId?: unknown; ndc?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Body must be JSON" }, { status: 400 });
        }
        const setId = typeof body.setId === "string" ? body.setId.trim() : "";
        const ndc = typeof body.ndc === "string" ? body.ndc.trim() : "";

        try {
          if (/^[0-9a-f-]{36}$/i.test(setId)) {
            return Response.json({ ok: true, ...(await warmLabel(setId)) });
          }
          if (/^[\d-]{9,14}$/.test(ndc)) {
            const row = await lookupByNdc(ndc);
            return Response.json({ ok: true, products: row ? 1 : 0, withPhoto: row && row.image_storage !== "none" ? 1 : 0 });
          }
          return Response.json({ error: "Send { setId } or { ndc }" }, { status: 400 });
        } catch (err) {
          const status = err instanceof LookupUnavailable ? 503 : 500;
          return Response.json({ error: err instanceof Error ? err.message : "failed" }, { status });
        }
      },
    },
  },
});
