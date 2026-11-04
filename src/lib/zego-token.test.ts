import assert from "node:assert/strict";
import { test } from "node:test";
import { generateToken04 } from "./zego-token.ts";

const SECRET = "0123456789abcdef0123456789abcdef"; // 32 chars, like a real ServerSecret

async function open(token: string, secret: string) {
  assert.ok(token.startsWith("04"));
  const bytes = Uint8Array.from(atob(token.slice(2)), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0), 0, "high half of the expiry is zero");
  const expire = view.getUint32(4);
  const ivLength = view.getUint16(8);
  assert.equal(ivLength, 16);
  const iv = bytes.slice(10, 10 + ivLength);
  const cipherLength = view.getUint16(26);
  const cipher = bytes.slice(28, 28 + cipherLength);
  assert.equal(28 + cipherLength, bytes.length, "no trailing bytes");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher);
  return {
    expire,
    iv: new TextDecoder().decode(iv),
    payload: JSON.parse(new TextDecoder().decode(plain)),
  };
}

test("a token decrypts, with the secret only, to the expected claims and layout", async () => {
  const now = Date.UTC(2026, 10, 4, 12, 0, 0);
  const token = await generateToken04(123456789, "dev_abcdef0123456789", SECRET, 3600, now);
  const { expire, iv, payload } = await open(token, SECRET);
  assert.match(iv, /^\d{16}$/, "iv is 16 ASCII digits, as ZEGOCLOUD's own SDK writes it");
  assert.equal(payload.app_id, 123456789);
  assert.equal(payload.user_id, "dev_abcdef0123456789");
  assert.equal(payload.ctime, Math.floor(now / 1000));
  assert.equal(payload.expire, payload.ctime + 3600);
  assert.equal(expire, payload.expire);
  assert.ok(Number.isInteger(payload.nonce) && payload.nonce >= 0 && payload.nonce <= 0x7fffffff);
});

test("a different secret cannot read it, and two tokens never repeat", async () => {
  const a = await generateToken04(1, "user-one-id", SECRET);
  const b = await generateToken04(1, "user-one-id", SECRET);
  assert.notEqual(a, b);
  await assert.rejects(() => open(a, "ffffffffffffffffffffffffffffffff"));
});

test("bad input is refused before anything is signed", async () => {
  await assert.rejects(() => generateToken04(0, "u", SECRET));
  await assert.rejects(() => generateToken04(1.5, "u", SECRET));
  await assert.rejects(() => generateToken04(1, "", SECRET));
  await assert.rejects(() => generateToken04(1, "u", "too-short"));
});
