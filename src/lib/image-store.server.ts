import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

/**
 * Where cached official pill photos are kept.
 *
 * Deployed on Cloudflare: the R2 bucket bound as `PILL_IMAGES` (see
 * wrangler.jsonc). Nitro's cloudflare_module preset puts the Worker's `env`
 * on `globalThis.__env__` for every request and cron run, which is how this
 * module reaches the binding without threading `env` through TanStack
 * server functions.
 *
 * Local `npm run dev` (plain Node, no Worker env): there is no R2, so
 * callers keep the image inline in Postgres instead — same idea as
 * src/lib/db.ts falling back to PGLite.
 */

/** The small slice of the R2 bucket API this app uses. */
interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  head(key: string): Promise<unknown | null>;
}

function bucket(): R2BucketLike | null {
  const env = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const b = env?.PILL_IMAGES as R2BucketLike | undefined;
  return b && typeof b.put === "function" ? b : null;
}

export function r2Available(): boolean {
  return bucket() !== null;
}

/** DailyMed pill photos are small; anything past this is not a pill photo. */
export const MAX_IMAGE_BYTES = 3_000_000;

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 200 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function toJpegDataUrl(bytes: Uint8Array | ArrayBuffer): string {
  const buf = bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(new Uint8Array(bytes));
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function objectKey(sha: string): string {
  return `official/${sha}.jpg`;
}

/** Store in R2, content-addressed so an identical photo is kept once. */
export async function putOfficialImage(bytes: Uint8Array): Promise<string> {
  const b = bucket();
  if (!b) throw new Error("R2 bucket PILL_IMAGES is not bound");
  const sha = sha256Hex(bytes);
  const key = objectKey(sha);
  if (!(await b.head(key))) {
    await b.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  }
  return sha;
}

export async function getOfficialImage(sha: string): Promise<string | null> {
  const b = bucket();
  if (!b) return null;
  const obj = await b.get(objectKey(sha));
  return obj ? toJpegDataUrl(await obj.arrayBuffer()) : null;
}
