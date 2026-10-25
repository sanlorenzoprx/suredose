import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { cleanVapidPublicKey } from "./vapid.ts";

function realPublicKey(): string {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
  return raw.toString("base64url");
}

test("a real VAPID public key passes, however it was wrapped when pasted", () => {
  const key = realPublicKey();
  assert.equal(key.length, 87);
  assert.equal(cleanVapidPublicKey(key), key);
  assert.equal(cleanVapidPublicKey(`  ${key}\n`), key);
  assert.equal(cleanVapidPublicKey(`"${key}"`), key);
  assert.equal(cleanVapidPublicKey(`<${key}>`), key);
  assert.equal(cleanVapidPublicKey(`${key}=`), key);
});

test("anything that is not a key is rejected instead of crashing later", () => {
  const key = realPublicKey();
  assert.equal(cleanVapidPublicKey("<the Public Key line>"), null);
  assert.equal(cleanVapidPublicKey(`Public Key: ${key}`), null);
  assert.equal(cleanVapidPublicKey(key.slice(0, 80)), null);
  assert.equal(cleanVapidPublicKey(`${key}${key}`), null);
  assert.equal(cleanVapidPublicKey(""), null);
  assert.equal(cleanVapidPublicKey(undefined), null);
  // 87 well-formed characters that do not decode to a P-256 point.
  assert.equal(cleanVapidPublicKey("A".repeat(87)), null);
});
