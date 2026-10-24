import assert from "node:assert/strict";
import { test } from "node:test";
import { comparePillPhotos, readLabelPhoto, samePhoto } from "./vision-checks.ts";
import type { vertexVision } from "./vertex.ts";

const reference = `data:image/jpeg;base64,${btoa("reference image bytes")}`;
const candidate = `data:image/jpeg;base64,${btoa("new candidate image bytes")}`;
const input = { reference, candidate, name: "Example 10 mg" };
const answer =
  (value: unknown): typeof vertexVision =>
  async () => ({ ok: true, text: JSON.stringify(value) });

test("unreadable fields stay empty; no frequency or reminder time is invented", async () => {
  const response = await readLabelPhoto(reference, answer({ name: "" }));
  assert.deepEqual(response, {
    ok: true,
    bottle: {
      name: "",
      strength: "",
      instructions: "",
      ndc: "",
      pillDescription: "",
      timesPerDay: null,
      times: [],
    },
  });
});

test("a printed daily frequency does not generate clock times", async () => {
  const response = await readLabelPhoto(
    reference,
    answer({ name: "Example", timesPerDay: 2, instructions: "Twice daily" }),
  );
  assert.ok(response.ok);
  assert.equal(response.bottle.timesPerDay, 2);
  assert.deepEqual(response.bottle.times, []);
});

test("explicit clock times survive; duplicates are removed", async () => {
  const response = await readLabelPhoto(
    reference,
    answer({ name: "Example", times: ["09:30", "21:15", "09:30"] }),
  );
  assert.ok(response.ok);
  assert.deepEqual(response.bottle.times, ["09:30", "21:15"]);
});

test("invalid clock times and malformed output fail without defaulting", async () => {
  for (const times of [["25:00"], ["08:99"], ["morning"]]) {
    assert.equal((await readLabelPhoto(reference, answer({ name: "Example", times }))).ok, false);
  }
  assert.equal(
    (await readLabelPhoto(reference, async () => ({ ok: true, text: "not JSON" }))).ok,
    false,
  );
});

test("a partially unreadable NDC is not repaired", async () => {
  const response = await readLabelPhoto(reference, answer({ name: "Example", ndc: "12?4-123-01" }));
  assert.ok(response.ok);
  assert.equal(response.bottle.ndc, "");
});

test("same saved-image bytes are rejected before any AI call, even with MIME/whitespace changes", async () => {
  let calls = 0;
  const vision: typeof vertexVision = async () => {
    calls += 1;
    return { ok: true, text: "{}" };
  };
  const replay = reference.replace("image/jpeg", "image/png").replace("base64,", "base64,\n");
  assert.equal(samePhoto(reference, replay), true);
  for (const photo of [reference, replay]) {
    const response = await comparePillPhotos({ ...input, candidate: photo }, vision);
    assert.equal(response.ok, false);
    if (!response.ok) assert.match(response.error, /Take a new photo/);
  }
  assert.equal(calls, 0);
});

test("a visually similar result carries neither identity verification nor model advice", async () => {
  const response = await comparePillPhotos(
    input,
    answer({
      observation: "similar",
      imprintReadable: true,
      confidence: 1,
      reason: "This is safe. Take it now.",
    }),
  );
  assert.ok(response.ok);
  assert.equal(response.result.observation, "similar");
  assert.match(response.result.reason, /cannot confirm/);
  assert.doesNotMatch(response.result.reason, /safe|Take it now/);
  assert.equal("confidence" in response.result, false);
  assert.equal("verified" in response.result, false);
});

test("a claimed match with unreadable imprints becomes uncertain", async () => {
  const response = await comparePillPhotos(
    input,
    answer({ observation: "similar", imprintReadable: false }),
  );
  assert.ok(response.ok);
  assert.equal(response.result.observation, "uncertain");
});

test("a clear difference stays different; uncertainty stays uncertain", async () => {
  for (const observation of ["different", "uncertain"] as const) {
    const response = await comparePillPhotos(
      input,
      answer({ observation, imprintReadable: false }),
    );
    assert.ok(response.ok);
    assert.equal(response.result.observation, observation);
  }
});

test("old confidence-based and invalid comparison output cannot approve a pill", async () => {
  for (const result of [
    { match: true, confidence: 1, reason: "right pill" },
    { observation: "similar" },
    { observation: "safe", imprintReadable: true },
  ]) {
    assert.equal((await comparePillPhotos(input, answer(result))).ok, false);
  }
});

test("provider errors and thrown failures never turn into a match or guessed label", async () => {
  const unavailable: typeof vertexVision = async () => ({ ok: false, error: "Unavailable" });
  const thrown: typeof vertexVision = async () => {
    throw new Error("timeout");
  };
  for (const vision of [unavailable, thrown]) {
    assert.equal((await readLabelPhoto(reference, vision)).ok, false);
    assert.equal((await comparePillPhotos(input, vision)).ok, false);
  }
});
