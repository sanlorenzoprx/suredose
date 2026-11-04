import assert from "node:assert/strict";
import { test } from "node:test";
import { videoCallUrl, videoRoomName } from "./video.ts";

test("same family code gives the same private room, any case or spacing", async () => {
  const a = await videoRoomName("abc234");
  assert.equal(a, await videoRoomName(" ABC234 "));
  assert.match(a, /^SureDose-[0-9a-f]{24}$/);
  assert.notEqual(a, await videoRoomName("ABC235"));
  assert.ok(!a.includes("ABC234"));
});

test("a blank code is refused", async () => {
  await assert.rejects(() => videoRoomName("  "));
});

test("call url points at the room and carries the display name", async () => {
  const url = await videoCallUrl("ABC234", "Mary");
  assert.match(url, /^https:\/\/meet\.jit\.si\/SureDose-[0-9a-f]{24}#/);
  assert.ok(url.includes('userInfo.displayName="Mary"'));
});
