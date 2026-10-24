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

const clear = {
  quality: "clear",
  sides: [{ marking: "AB 12", readable: true }],
  shape: "round",
  color: "white",
};
const readings =
  (ref: unknown = clear, current: unknown = clear): typeof vertexVision =>
  async ({ images, prompt }) => {
    assert.doesNotMatch(prompt, /Example 10 mg/);
    assert.equal(images.includes(reference) && images.includes(candidate), false);
    return { ok: true, text: JSON.stringify(images[0] === reference ? ref : current) };
  };

test("independent readable markings match without model advice or confidence", async () => {
  const response = await comparePillPhotos(
    input,
    readings(clear, { ...clear, confidence: 1, reason: "Take it now" }),
  );
  assert.ok(response.ok);
  assert.equal(response.result.observation, "similar");
  assert.doesNotMatch(response.result.reason, /Take it now/);
  assert.equal("confidence" in response.result, false);
});

test("wrong strength markings and O/0 ambiguity are never normalized into a match", async () => {
  for (const marking of ["AB 20", "AB I2", "AB 120"]) {
    const response = await comparePillPhotos(
      input,
      readings(clear, { ...clear, sides: [{ marking, readable: true }] }),
    );
    assert.ok(response.ok);
    assert.equal(response.result.observation, "different");
  }
});

test("blur, dark, glare and non-pill images require a retake", async () => {
  for (const quality of ["blur", "dark", "glare", "not_pill"]) {
    const response = await comparePillPhotos(input, readings(clear, { ...clear, quality }));
    assert.ok(response.ok);
    assert.equal(response.result.observation, "uncertain");
    assert.equal(response.result.nextAction, "retake");
  }
});

test("unreadable reference needs setup; unreadable candidate needs retake", async () => {
  const unreadable = { ...clear, sides: [{ marking: "AB 12", readable: false }] };
  for (const [ref, current, action] of [
    [unreadable, clear, "reference"],
    [clear, unreadable, "retake"],
  ] as const) {
    const response = await comparePillPhotos(input, readings(ref, current));
    assert.ok(response.ok);
    assert.equal(response.result.observation, "uncertain");
    assert.equal(response.result.nextAction, action);
  }
});

test("missing second-side evidence prompts flip; both sides must match", async () => {
  const ref = { ...clear, sides: [...clear.sides, { marking: "10", readable: true }] };
  const first = await comparePillPhotos(input, readings(ref, clear));
  assert.ok(first.ok);
  assert.equal(first.result.nextAction, "other_side");
  const withBack = { ...input, candidateBack: `data:image/jpeg;base64,${btoa("back photo")}` };
  const good = await comparePillPhotos(withBack, readings(ref, ref));
  assert.ok(good.ok);
  assert.equal(good.result.observation, "similar");
  const incomplete = await comparePillPhotos(withBack, readings(ref, clear));
  assert.ok(incomplete.ok);
  assert.equal(incomplete.result.nextAction, "pharmacist");
  const wrong = await comparePillPhotos(
    withBack,
    readings(ref, { ...ref, sides: [...clear.sides, { marking: "20", readable: true }] }),
  );
  assert.ok(wrong.ok);
  assert.equal(wrong.result.observation, "different");
});

test("blank pills cannot match; blank candidate side requests another view", async () => {
  const blank = { ...clear, sides: [{ marking: "", readable: true }] };
  const response = await comparePillPhotos(input, readings(clear, blank));
  assert.ok(response.ok);
  assert.equal(response.result.nextAction, "other_side");
  const bothBlank = await comparePillPhotos(input, readings(blank, blank));
  assert.ok(bothBlank.ok);
  assert.equal(bothBlank.result.observation, "uncertain");
  assert.equal(bothBlank.result.nextAction, "pharmacist");
  assert.match(bothBlank.result.reason, /no letters or numbers/);
  // Even a perfect shape/color agreement never makes an unmarked pill green.
  const twoBlankSides = {
    ...clear,
    sides: [
      { marking: "", readable: true },
      { marking: "", readable: true },
    ],
  };
  const back = { ...input, candidateBack: `data:image/jpeg;base64,${btoa("back photo")}` };
  const flipped = await comparePillPhotos(back, readings(twoBlankSides, twoBlankSides));
  assert.ok(flipped.ok);
  assert.notEqual(flipped.result.observation, "similar");
});

test("same second photo and saved reference replay never call the provider", async () => {
  for (const candidateBack of [reference, candidate]) {
    const response = await comparePillPhotos({ ...input, candidateBack }, async () => {
      throw new Error("must not call");
    });
    assert.equal(response.ok, false);
  }
});

test("shape and color differences or missing attributes cannot match", async () => {
  for (const patch of [{ color: "blue" }, { shape: "oval" }, { color: "" }]) {
    const response = await comparePillPhotos(input, readings(clear, { ...clear, ...patch }));
    assert.ok(response.ok);
    assert.equal(response.result.observation, "uncertain");
  }
});

test("legacy, incomplete and malformed provider answers cannot match", async () => {
  for (const value of [
    { observation: "similar", imprintReadable: true },
    {},
    { ...clear, sides: [] },
  ]) {
    assert.equal((await comparePillPhotos(input, answer(value))).ok, false);
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

test("placeholder or ambiguous markings cannot match even when model says readable", async () => {
  for (const marking of ["?", "AB?12", "unknown", "unreadable"]) {
    const reading = { ...clear, sides: [{ marking, readable: true }] };
    const response = await comparePillPhotos(input, readings(reading, reading));
    assert.ok(response.ok);
    assert.equal(response.result.observation, "uncertain");
  }
});
