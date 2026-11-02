import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readPhotoInput } from "./photo-input.ts";

const photoCapture = readFileSync(
  new URL("../components/photo-capture.tsx", import.meta.url),
  "utf8",
);
const addRoute = readFileSync(new URL("../routes/add.tsx", import.meta.url), "utf8");
const checkRoute = readFileSync(new URL("../routes/check.tsx", import.meta.url), "utf8");

test("gallery and camera file inputs use the same photo handler, with capture only on camera", () => {
  const inputs = photoCapture
    .match(/<input[\s\S]*?\/>/g)
    ?.filter((input) => input.includes('type="file"'));
  assert.equal(inputs?.length, 2);
  assert.match(
    inputs?.[0] ?? "",
    /id="camera-photo-input"[\s\S]*accept="image\/\*"[\s\S]*capture="environment"/,
  );
  assert.match(inputs?.[1] ?? "", /id="gallery-photo-input"[\s\S]*accept="image\/\*"/);
  assert.doesNotMatch(inputs?.[1] ?? "", /capture=/);
  assert.match(photoCapture, /onClick=\{\(\) => openFilePicker\("gallery-photo-input"\)\}/);
  assert.match(photoCapture, /onClick=\{\(\) => openFilePicker\("camera-photo-input"\)\}/);
  assert.match(inputs?.[0] ?? "", /onChange=\{\(event\)\s+=>\s+void\s+onFileSelection\(event\)\}/);
  assert.match(inputs?.[1] ?? "", /onChange=\{\(event\)\s+=>\s+void\s+onFileSelection\(event\)\}/);
  const fileHandler =
    photoCapture.match(/async function onFileSelection[\s\S]*?\n\s{2}\}/)?.[0] ?? "";
  const cameraHandler = photoCapture.match(/async function snap[\s\S]*?\n\s{2}\}/)?.[0] ?? "";
  assert.match(fileHandler, /readPhotoInput/);
  assert.match(fileHandler, /onCapture\(data\)/);
  assert.match(cameraHandler, /onCapture\(data\)/);
  assert.match(addRoute, /onCapture=\{\(img\)\s+=>\s+void\s+onBottle\(img\)\}/);
  assert.match(checkRoute, /onCapture=\{\(img\)\s+=>\s+void\s+runCheck\(img\)\}/);
});

test("same gallery photo can be read twice and each read produces the same preview input", async () => {
  const file = new File(["photo bytes"], "pill.jpg", { type: "image/jpeg" });
  const input = { files: [file], value: "pill.jpg" };
  const previews: string[] = [];
  let reads = 0;
  const readFile = async (selected: File) => {
    reads += 1;
    assert.equal(selected, file);
    return `data:image/jpeg;base64,preview-${selected.name}`;
  };
  const onCapture = (preview: string) => previews.push(preview);

  for (let selection = 0; selection < 2; selection += 1) {
    input.value = "pill.jpg";
    await readPhotoInput(input, readFile, onCapture);
    assert.equal(input.value, "");
  }

  assert.equal(reads, 2);
  assert.deepEqual(previews, [
    "data:image/jpeg;base64,preview-pill.jpg",
    "data:image/jpeg;base64,preview-pill.jpg",
  ]);
});

test("unreadable photos show an error and non-images do not reach the check callback", async () => {
  const invalidFile = new File(["not an image"], "pill.txt", { type: "text/plain" });
  const input = { files: [invalidFile], value: "pill.txt" };
  let checked = false;
  let visibleError = "";
  try {
    await readPhotoInput(
      input,
      async () => {
        checked = true;
        return "preview";
      },
      () => {
        checked = true;
      },
    );
  } catch (error) {
    visibleError = error instanceof Error ? error.message : "Could not open that photo.";
  }
  assert.equal(input.value, "");
  assert.equal(checked, false);
  assert.equal(visibleError, "Choose an image file to continue.");
  assert.match(photoCapture, /setError\(err instanceof Error \? err\.message/);
  assert.doesNotMatch(photoCapture, /setName\(/);
});

test("unreadable image data is surfaced and never passed to the medicine check", async () => {
  const file = new File(["broken image"], "pill.jpg", { type: "image/jpeg" });
  const input = { files: [file], value: "pill.jpg" };
  let checked = false;
  await assert.rejects(
    readPhotoInput(
      input,
      async () => {
        throw new Error("Could not decode image");
      },
      () => {
        checked = true;
      },
    ),
    /Could not decode image/,
  );
  assert.equal(checked, false);
  assert.equal(input.value, "");
});
