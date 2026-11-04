/*
 * ZEGOCLOUD "token04" generator, run on OUR server so the ServerSecret never reaches a phone.
 *
 * The format is the one ZEGOCLOUD's own browser SDK builds in generateKitTokenForTest, ported to
 * WebCrypto (works in Cloudflare Workers and Node):
 *
 *   "04" + base64( 8-byte big-endian expiry | 2-byte iv length | iv (16 ASCII digits)
 *                  | 2-byte cipher length | AES-CBC(secret, iv, JSON{app_id,user_id,nonce,ctime,expire}) )
 */

const encoder = new TextEncoder();

function randomDigits(count: number): string {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

export async function generateToken04(
  appId: number,
  userId: string,
  serverSecret: string,
  ttlSeconds = 3600,
  nowMs = Date.now(),
): Promise<string> {
  if (!Number.isInteger(appId) || appId <= 0)
    throw new Error("ZEGO app id must be a positive integer");
  if (!userId) throw new Error("ZEGO user id is required");
  const keyBytes = encoder.encode(serverSecret);
  if (![16, 24, 32].includes(keyBytes.length))
    throw new Error("ZEGO server secret has an unexpected length");

  const ctime = Math.floor(nowMs / 1000);
  const expire = ctime + ttlSeconds;
  const nonce = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
  const payload = JSON.stringify({ app_id: appId, user_id: userId, nonce, ctime, expire });

  const iv = encoder.encode(randomDigits(16));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, [
    "encrypt",
  ]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, encoder.encode(payload)),
  );

  const out = new Uint8Array(28 + cipher.length);
  const view = new DataView(out.buffer);
  view.setUint32(4, expire); // bytes 0-3 stay zero: the high half of the 8-byte expiry
  view.setUint16(8, iv.length);
  out.set(iv, 10);
  view.setUint16(26, cipher.length);
  out.set(cipher, 28);

  let binary = "";
  for (const byte of out) binary += String.fromCharCode(byte);
  return `04${btoa(binary)}`;
}

/** A pasted secret often carries a space, a newline or wrapping quotes: keep only the value. */
export function cleanSecret(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}
