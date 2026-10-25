/**
 * The VAPID public key is 65 bytes (an uncompressed P-256 point, first byte
 * 0x04) written as 87 base64url characters. It reaches the app through a
 * build variable, where a copy-paste slip is easy to make: a label such as
 * "Public Key:", surrounding quotes or angle brackets, a trailing space. Strip
 * the harmless wrapping and reject anything that is not a real key, so the
 * phone shows a clear message instead of a cryptic base64 error.
 */
export function cleanVapidPublicKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw
    .trim()
    .replace(/^["'<`]+|["'>`]+$/g, "")
    .trim()
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  if (!/^[A-Za-z0-9_-]{87}$/.test(key)) return null;
  const bytes = decodeBase64Url(key);
  return bytes.length === 65 && bytes[0] === 0x04 ? key : null;
}

export function decodeBase64Url(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
