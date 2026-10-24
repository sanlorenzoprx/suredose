import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInviteMessage, inviteLink, parseJoinCode } from "./sms.ts";

test("the invite link carries the code and is easy to tap", () => {
  assert.equal(inviteLink("https://suredose-test.example.workers.dev", "3GF9DZ"), "https://suredose-test.example.workers.dev/?join=3GF9DZ");
  assert.equal(inviteLink("https://example.dev/", "ABC123"), "https://example.dev/?join=ABC123");
});

test("the invite text includes the link and still shows the code", () => {
  const text = buildInviteMessage({
    patientName: "Hector",
    caregiverName: "Dad",
    code: "3GF9DZ",
    origin: "https://example.dev",
  });
  assert.match(text, /^Hi Dad, it's Hector\./);
  assert.ok(text.includes("https://example.dev/?join=3GF9DZ"));
  assert.ok(text.includes("3GF9DZ"));
});

test("before the site address is known, the invite falls back to the plain code", () => {
  const text = buildInviteMessage({ patientName: "", caregiverName: "", code: "3GF9DZ" });
  assert.match(text, /^Hi there, it's me\./);
  assert.ok(text.endsWith("3GF9DZ"));
  assert.ok(!text.includes("http"));
});

test("only well-formed family codes are accepted from a link", () => {
  assert.equal(parseJoinCode("3gf9dz"), "3GF9DZ");
  assert.equal(parseJoinCode(" K3F7QM "), "K3F7QM");
  assert.equal(parseJoinCode("abc"), null);
  assert.equal(parseJoinCode("../etc"), null);
  assert.equal(parseJoinCode("<script>"), null);
  assert.equal(parseJoinCode(undefined), null);
  assert.equal(parseJoinCode(["3GF9DZ"]), null);
});
