import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { toCrossJSON, fromJSON } from "seroval";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

// Deterministic browser regression with synthetic local state. No real medicine
// is taken, no caregiver is paired, and no AI/API credentials are required.
const base = checkedUrl(process.argv[2] ?? "http://127.0.0.1:8080/");
const screenshots = "/workspace/screenshots";
mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(base);
  await page.evaluate(async () => {
    const image = new Image();
    image.src = "/samples/white-tablet.jpg";
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const reference = canvas.toDataURL("image/jpeg", 0.9);
    localStorage.setItem(
      "suredose-v1",
      JSON.stringify({
        version: 0,
        state: {
          settings: {
            patientName: "Synthetic test",
            caregiverName: "",
            caregiverPhone: "",
            role: "patient",
            householdCode: "",
            onboardingDone: true,
            soundOn: false,
            vibrateOn: false,
            speakOn: false,
          },
          medicines: [
            {
              id: "ui-test",
              name: "Reference example",
              strength: "10 mg",
              instructions: "Test fixture only",
              bottleImage: "",
              pillImage: reference,
              times: ["09:30"],
              createdAt: Date.now(),
            },
          ],
          events: [],
          alarmMutedUntil: 0,
        },
      }),
    );
  });

  // A failed drug lookup allows manual entry, but cannot supply missing fields
  // or auto-select a dose time. Deliberately block POST for this scenario only.
  await page.route("**/*", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await page.goto(new URL("/add", base).href);
  // SSR buttons are visible before React has attached their event handlers.
  // Wait for that attachment so an early click cannot be silently ignored.
  await page.waitForFunction(() =>
    Object.keys(document.querySelector("button") ?? {}).some((key) =>
      key.startsWith("__reactProps$"),
    ),
  );
  await page.getByRole("button", { name: "Skip — I will type it" }).click();
  const check = page.getByRole("button", { name: "Check this medicine" });
  await page.locator("#name").fill("Synthetic example");
  assert.equal(await check.isDisabled(), true, "missing strength must not be filled by lookup");
  await page.locator("#strength").fill("10 mg");
  await check.click();
  await page.getByRole("button", { name: "Continue without checking" }).click();
  const next = page.getByRole("button", { name: "Next: the pill" });
  const acknowledgement = page.getByRole("checkbox");
  assert.equal(await next.isDisabled(), true, "no automatic default time");
  assert.equal(await acknowledgement.isDisabled(), true);
  await page.locator("#reminder-time").fill("09:30");
  await page.getByRole("button", { name: "Add this time", exact: true }).click();
  assert.equal(await next.isDisabled(), true, "a selected time still needs acknowledgement");
  await acknowledgement.check();
  assert.equal(await next.isEnabled(), true);
  await page.locator("#how").fill("Directions entered from test fixture");
  assert.equal(
    await acknowledgement.isChecked(),
    false,
    "editing directions invalidates acknowledgement",
  );
  assert.equal(await next.isDisabled(), true);
  await acknowledgement.check();
  await page.getByRole("button", { name: /Remove/ }).click();
  assert.equal(
    await acknowledgement.isChecked(),
    false,
    "editing times invalidates acknowledgement",
  );
  assert.equal(await next.isDisabled(), true);
  await page.screenshot({
    path: join(screenshots, "suredose-schedule-mobile.png"),
    fullPage: true,
  });
  await page.unroute("**/*");

  // Exercise the real server-function boundary with a replay, without calling
  // the vision provider. The same sample is recompressed by PhotoCapture.
  await page.goto(
    new URL("/check?medicineId=ui-test&date=2026-10-24&time=09%3A30&practice=false", base).href,
  );
  await page.getByRole("heading", { name: "Picture of the pill in your hand" }).waitFor();
  assert.equal(
    await page.getByText("Practice — this will not be saved or texted", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("button", { name: "Use the saved photo instead" }).count(), 0);
  await page.locator('input[type="file"]').setInputFiles("public/samples/white-tablet.jpg");
  await page.getByText("That is the saved reference photo.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: /record my confirmation/ }).count(), 0);
  const events = await page.evaluate(
    () => JSON.parse(localStorage.getItem("suredose-v1")).state.events,
  );
  assert.deepEqual(events, [], "replayed image cannot mark a dose taken");
  assert.deepEqual(errors, [], "no uncaught browser errors");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.screenshot({ path: join(screenshots, "suredose-replay-mobile.png"), fullPage: true });
  // UI fixtures below exercise rendering and state transitions, not model accuracy.
  // The real server replay rejection above remains unmocked.
  let reply = {
    ok: true,
    result: {
      observation: "uncertain",
      nextAction: "other_side",
      reason: "Turn the pill over. Take a photo of the other side.",
    },
  };
  const requests = [];
  await page.route("**/*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(fromJSON(route.request().postDataJSON()));
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-tss-serialized": "true" },
      body: JSON.stringify(toCrossJSON({ result: reply, context: {} })),
    });
  });
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  const takePhoto = page.getByRole("button", { name: "Take photo", exact: true });
  await takePhoto.waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.videoWidth > 0 && v.srcObject;
  });
  await takePhoto.click();
  await page.getByRole("heading", { name: "Show the other side." }).waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].data.candidateBack, undefined);
  const firstPhoto = requests[0].data.candidate;
  await page.getByRole("button", { name: "Take photo of other side", exact: true }).click();
  await page.getByRole("heading", { name: "Turn the pill over", exact: true }).waitFor();
  reply = {
    ok: true,
    result: {
      observation: "similar",
      nextAction: "none",
      reason: "The markings, shape, and color match your saved pill photo.",
    },
  };
  await page.locator('input[type="file"]').setInputFiles("public/samples/white-tablet.jpg");
  await page.getByRole("heading", { name: "Pill matched.", exact: true }).waitFor();
  assert.equal(requests[1].data.candidate, firstPhoto, "second view must retain first photo");
  assert.ok(requests[1].data.candidateBack);
  const took = page.getByRole("button", { name: "I took it", exact: true });
  assert.equal(await took.isDisabled(), true);
  await page.screenshot({ path: join(screenshots, "suredose-match-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Start a new check", exact: true }).click();
  reply = {
    ok: true,
    result: {
      observation: "different",
      nextAction: "none",
      reason:
        "The letters or numbers do not match. Do not take this pill. Check with your pharmacist.",
    },
  };
  await page.locator('input[type="file"]').setInputFiles("public/samples/white-tablet.jpg");
  await page.getByRole("heading", { name: "Pill does not match.", exact: true }).waitFor();
  assert.equal(await took.count(), 0);
  assert.equal(requests[2].data.candidateBack, undefined, "new check must discard old second view");
  await page.screenshot({
    path: join(screenshots, "suredose-mismatch-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Start a new check", exact: true }).click();
  reply = {
    ok: true,
    result: {
      observation: "uncertain",
      nextAction: "retake",
      reason: "The photo is blurry. Rest your phone on a steady surface and try again.",
    },
  };
  await page.locator('input[type="file"]').setInputFiles("public/samples/white-tablet.jpg");
  await page.getByText("The photo is blurry.", { exact: false }).waitFor();
  assert.equal(await took.count(), 0);
  await page.getByRole("button", { name: "Start a new check", exact: true }).click();
  reply = {
    ok: true,
    result: {
      observation: "similar",
      nextAction: "none",
      reason: "The markings, shape, and color match your saved pill photo.",
    },
  };
  await page.locator('input[type="file"]').setInputFiles("public/samples/white-tablet.jpg");
  await page.getByRole("checkbox", { name: "I checked the dose and time on my bottle." }).check();
  await took.click();
  await page.getByRole("heading", { name: "You marked this dose taken.", exact: true }).waitFor();
  const recorded = await page.evaluate(
    () => JSON.parse(localStorage.getItem("suredose-v1")).state.events,
  );
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].verified, false);
  await page.reload();
  await page.getByRole("heading", { name: /You already took/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /log it again/ }).count(), 0);
  assert.deepEqual(errors, [], "new flow has no uncaught browser errors");
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "no default dose time",
        "missing strength stays missing",
        "schedule acknowledgement required",
        "edits invalidate acknowledgement",
        "no saved-photo shortcut",
        "server rejects replay",
        "no dose event recorded for replay",
        "camera stream attaches after mount and capture works",
        "second photo retains first view",
        "simple match, mismatch and blurry results",
        "new check clears old second view",
        "label acknowledgement gates recording",
        "already-taken dose cannot be recorded again",
      ],
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({ url: page.url(), body: await page.locator("body").innerText(), errors }),
  );
  await page.screenshot({
    path: join(screenshots, "suredose-regression-failure.png"),
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
