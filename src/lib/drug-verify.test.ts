import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { createServer, type Plugin } from "vite";
import { readLabelPhoto } from "./vision-checks.ts";
import type { MedicineCheck } from "./types.ts";

const addRoute = readFileSync(new URL("../routes/add.tsx", import.meta.url), "utf8");
let server: Awaited<ReturnType<typeof createServer>>;
const imageLookupMock: {
  result: Record<string, unknown> | null;
  error: boolean;
} = { result: null, error: false };

const plugin: Plugin = {
  name: "drug-verify-test-mocks",
  enforce: "pre",
  resolveId(source, importer) {
    if (importer?.endsWith("/src/lib/drug-verify.ts") && source === "@tanstack/react-start")
      return "\0drug-verify-server-fn";
    if (
      importer?.endsWith("/src/lib/drug-verify.server.ts") &&
      source === "./drug-lookup.server.ts"
    )
      return "\0drug-verify-lookup";
    if (importer?.endsWith("/src/lib/drug-verify.server.ts") && source === "./drug-lookup.server")
      return "\0drug-verify-lookup";
    return;
  },
  load(id) {
    if (id === "\0drug-verify-server-fn") {
      return [
        "export function createServerFn() {",
        "  let validate = (value) => value;",
        "  const builder = {",
        "    validator(fn) { validate = fn; return builder; },",
        "    handler(fn) { return ({ data }) => fn({ data: validate(data) }); },",
        "  };",
        "  return builder;",
        "}",
      ].join("\n");
    }
    if (id === "\0drug-verify-lookup") {
      return [
        'import { strengthMatches } from "/src/lib/drug-data.ts";',
        "export class LookupUnavailable extends Error {}",
        "export async function lookupByNdc() { return null; }",
        "export async function productToVerified(row) { return row; }",
        "export async function lookupImageByRxcui() {",
        "  if (globalThis.__drugVerifyImageLookupMock.error) throw new LookupUnavailable('upstream request included a test-secret');",
        "  return globalThis.__drugVerifyImageLookupMock.result;",
        "}",
        "export async function lookupByName(_name, strength) {",
        "  if (!strength) return { found: false, reason: 'need_strength', drugName: 'Furosemide' };",
        "  if (strengthMatches(strength, '20 MG')) {",
        "    return { found: true, name: 'Furosemide', strength: '20 MG', form: 'tablet', rxcui: 'mock-rxcui' };",
        "  }",
        "  return { found: false, reason: 'strength', drugName: 'Furosemide' };",
        "}",
      ].join("\n");
    }
    return;
  },
};

before(async () => {
  (
    globalThis as typeof globalThis & {
      __drugVerifyImageLookupMock: typeof imageLookupMock;
    }
  ).__drugVerifyImageLookupMock = imageLookupMock;
  const root = new URL("../../", import.meta.url).pathname;
  server = await createServer({
    configFile: false,
    root,
    appType: "custom",
    server: { middlewareMode: true },
    ssr: { noExternal: ["@tanstack/react-start"] },
    plugins: [plugin],
  });
});

after(async () => {
  await server?.close();
  delete (
    globalThis as typeof globalThis & {
      __drugVerifyImageLookupMock?: typeof imageLookupMock;
    }
  ).__drugVerifyImageLookupMock;
});

async function loadVerifyMedicine() {
  return server.ssrLoadModule("/src/lib/drug-verify.ts") as Promise<{
    verifyMedicine: (input: {
      data: { name: string; strength?: string; ndc?: string };
    }) => Promise<MedicineCheck>;
  }>;
}

test("matched NDC product photo reaches the verified medicine UI state", async () => {
  imageLookupMock.error = false;
  imageLookupMock.result = {
    image_storage: "inline",
    inline_image: "data:image/jpeg;base64,bWFrZXItcGhvdG8=",
    officialImage: "data:image/jpeg;base64,bWFrZXItcGhvdG8=",
    labeler: "Furosemide maker",
    appearance: "White round tablet",
  };
  const { verifyMedicineData } = (await server.ssrLoadModule("/src/lib/drug-verify.server.ts")) as {
    verifyMedicineData: (data: { name: string; strength: string }) => Promise<MedicineCheck>;
  };

  const result = await verifyMedicineData({ name: "Furosemide", strength: "20 mg" });
  assert.equal(result.status, "verified");
  if (result.status !== "verified") return;
  assert.equal(result.medicine.officialImage, "data:image/jpeg;base64,bWFrZXItcGhvdG8=");
});

test("image lookup errors log only a safe message and preserve the confirmed medicine", async () => {
  imageLookupMock.result = null;
  imageLookupMock.error = true;
  const logs: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const { verifyMedicineData } = (await server.ssrLoadModule(
      "/src/lib/drug-verify.server.ts",
    )) as {
      verifyMedicineData: (data: { name: string; strength: string }) => Promise<MedicineCheck>;
    };
    const result = await verifyMedicineData({ name: "Furosemide", strength: "20 mg" });
    assert.equal(result.status, "verified");
    if (result.status !== "verified") return;
    assert.equal(result.medicine.name, "Furosemide");
    assert.equal(result.medicine.officialImage, null);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /continuing without an image/);
    assert.doesNotMatch(logs.join(" "), /test-secret/);
  } finally {
    console.error = originalError;
    imageLookupMock.error = false;
  }
});

for (const strength of ["20MG", "20 mg", " 20  MG ", "20.0MG"]) {
  test(`strength ${JSON.stringify(strength)} verifies against listed 20 MG`, async () => {
    const { verifyMedicine } = await loadVerifyMedicine();
    const read = await readLabelPhoto("data:image/jpeg;base64,bGFiZWw=", async () => ({
      ok: true,
      text: JSON.stringify({
        name: "Furosemide",
        strength,
        timesPerDay: null,
        times: [],
        instructions: "",
        ndc: "",
        pillDescription: "",
      }),
    }));
    assert.equal(read.ok, true);
    if (!read.ok) return;
    const result = await verifyMedicine({
      data: { name: read.bottle.name, strength: read.bottle.strength },
    });

    assert.equal(result.status, "verified");
    if (result.status === "verified") {
      assert.equal(result.medicine.strength, "20 MG");
    }
  });
}

test("different strength and unit remain unverified", async () => {
  const { verifyMedicine } = await loadVerifyMedicine();

  for (const strength of ["40MG", "20MCG"]) {
    const result = await verifyMedicine({
      data: { name: "Furosemide", strength },
    });
    assert.equal(result.status, "not_found");
    if (result.status === "not_found") {
      assert.match(result.message, /please check the strength/i);
    }
  }
});

test("blank strength stays on manual check without inventing a value", async () => {
  const { verifyMedicine } = await loadVerifyMedicine();
  const read = await readLabelPhoto("data:image/jpeg;base64,bGFiZWw=", async () => ({
    ok: true,
    text: JSON.stringify({
      name: "Furosemide",
      strength: "",
      timesPerDay: null,
      times: [],
      instructions: "",
      ndc: "",
      pillDescription: "",
    }),
  }));

  assert.equal(read.ok, true);
  if (!read.ok) return;
  assert.equal(read.bottle.name, "Furosemide");
  assert.equal(read.bottle.strength, "");
  assert.match(addRoute, /if \(n && s && photoCheck\) \{/);

  const result = await verifyMedicine({
    data: { name: read.bottle.name, strength: read.bottle.strength },
  });
  assert.equal(result.status, "not_found");
  if (result.status === "not_found") {
    assert.match(result.message, /please type the strength/i);
    assert.doesNotMatch(result.message, /20\s*mg|40\s*mg/i);
  }
});
