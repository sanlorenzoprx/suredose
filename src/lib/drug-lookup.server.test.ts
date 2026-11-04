import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Plugin } from "vite";

type CachedProduct = {
  product_ndc: string;
  label_ndc: string;
  name: string;
  generic_name: string;
  brand_name: string;
  strength: string;
  form: string;
  labeler: string;
  rxcui: string;
  spl_set_id: string;
  colors: string;
  shape: string;
  size_mm: number | null;
  imprint: string;
  appearance: string;
  image_storage: "r2" | "inline" | "none";
  image_sha: string | null;
  inline_image: string | null;
  fetched_at: string;
};

const products = new Map<string, CachedProduct>();
const urls: string[] = [];
const originalFetch = globalThis.fetch;
let server: Awaited<ReturnType<typeof createServer>>;

const sqlMock = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const query = strings.join(" ");
  if (query.includes("select * from drug_products where rxcui")) {
    return [...products.values()].filter((row) => row.rxcui === values[0]);
  }
  if (query.includes("select * from drug_products where product_ndc")) {
    const ndcs = values[0] as string[];
    return [...products.values()].filter((row) => ndcs.includes(row.product_ndc));
  }
  if (query.includes("insert into drug_products")) {
    const [
      product_ndc,
      label_ndc,
      name,
      generic_name,
      brand_name,
      strength,
      form,
      labeler,
      rxcui,
      spl_set_id,
      colors,
      shape,
      size_mm,
      imprint,
      appearance,
      image_storage,
      image_sha,
      inline_image,
    ] = values;
    const row: CachedProduct = {
      product_ndc: String(product_ndc),
      label_ndc: String(label_ndc),
      name: String(name),
      generic_name: String(generic_name),
      brand_name: String(brand_name),
      strength: String(strength),
      form: String(form),
      labeler: String(labeler),
      rxcui: String(rxcui),
      spl_set_id: String(spl_set_id),
      colors: String(colors),
      shape: String(shape),
      size_mm: size_mm === null ? null : Number(size_mm),
      imprint: String(imprint),
      appearance: String(appearance),
      image_storage: image_storage as CachedProduct["image_storage"],
      image_sha: image_sha === null ? null : String(image_sha),
      inline_image: inline_image === null ? null : String(inline_image),
      fetched_at: new Date().toISOString(),
    };
    products.set(row.product_ndc, row);
    return [row];
  }
  if (query.includes("drug_name_lookups")) return []; // name-lookup cache: always empty here
  throw new Error(`Unexpected SQL in test: ${query}`);
};

const plugin: Plugin = {
  name: "drug-lookup-server-test-mocks",
  enforce: "pre",
  resolveId(source, importer) {
    if (
      importer?.endsWith("/src/lib/drug-verify.server.ts") &&
      source === "./drug-lookup.server.ts"
    )
      return "\0drug-verify-lookup-bridge";
    if (!importer?.endsWith("/src/lib/drug-lookup.server.ts")) return;
    if (source === "./db") return "\0drug-lookup-test-db";
    if (source === "./image-store.server") return "\0drug-lookup-test-images";
    return;
  },
  load(id) {
    if (id === "\0drug-verify-lookup-bridge") {
      return `
        import { lookupImageByRxcui } from "/src/lib/drug-lookup.server.ts";
        export class LookupUnavailable extends Error {}
        export { lookupImageByRxcui };
        export const lookupByNdc = async () => null;
        export const lookupByName = async () => ({
          found: true, name: "Furosemide", strength: "20 mg",
          form: "tablet", rxcui: "310965",
        });
        export const productToVerified = async (row) => row;
      `;
    }
    if (id === "\0drug-lookup-test-db") {
      return `export const getSql = async () => globalThis.__drugLookupSqlMock;`;
    }
    if (id === "\0drug-lookup-test-images") {
      return `
        export const MAX_IMAGE_BYTES = 3000000;
        export const r2Available = () => false;
        export const isJpeg = (bytes) => bytes.length > 200 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        export const sha256Hex = (bytes) => Array.from(bytes.slice(0, 3)).join("");
        export const toJpegDataUrl = (bytes) => "data:image/jpeg;base64," + Buffer.from(bytes).toString("base64");
        export const getOfficialImage = async () => null;
        export const putOfficialImage = async () => { throw new Error("R2 is not used in this test"); };
      `;
    }
    return;
  },
};

const splXml = (ndc: string, image?: string) => `
  <document>
    <subject>
      <manufacturedProduct>
        <manufacturedProduct>
          <code code="${ndc}" codeSystem="2.16.840.1.113883.6.69"/>
        </manufacturedProduct>
        ${image ? `<subjectOf>
          <characteristic>
            <code code="SPLIMAGE"/>
            <value><reference value="${image}"/></value>
          </characteristic>
        </subjectOf>` : ""}
      </manufacturedProduct>
    </subject>
  </document>
`;

const fdaProduct = ({
  ndc,
  name,
  strength = "20 mg",
  rxcui,
  setId,
  image,
}: {
  ndc: string;
  name: string;
  strength?: string;
  rxcui: string;
  setId: string;
  image?: string;
}) => ({
  product_ndc: ndc,
  generic_name: name.toUpperCase(),
  brand_name: "",
  dosage_form: "TABLET",
  labeler_name: `${name} maker`,
  active_ingredients: [{ name: name.toUpperCase(), strength: `${strength}/1` }],
  openfda: { rxcui: [rxcui], spl_set_id: [setId] },
  _testImage: image,
});

before(async () => {
  (globalThis as typeof globalThis & { __drugLookupSqlMock: typeof sqlMock }).__drugLookupSqlMock =
    sqlMock;
  const root = new URL("../../", import.meta.url).pathname;
  server = await createServer({
    configFile: false,
    root,
    appType: "custom",
    server: { middlewareMode: true },
    plugins: [plugin],
  });
});

after(async () => {
  await server?.close();
  globalThis.fetch = originalFetch;
  delete (globalThis as typeof globalThis & { __drugLookupSqlMock?: typeof sqlMock })
    .__drugLookupSqlMock;
});

function installNetworkFixture(records: ReturnType<typeof fdaProduct>[], imageStatus = 200) {
  urls.length = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("api.fda.gov/drug/ndc.json")) {
      if (url.includes("openfda.rxcui")) {
        const request = new URL(url);
        const skip = Number(request.searchParams.get("skip") ?? 0);
        const limit = Number(request.searchParams.get("limit") ?? 100);
        return Response.json({
          meta: { results: { total: records.length } },
          results: records.slice(skip, skip + limit),
        });
      }
      throw new Error(`Unexpected FDA request ${url}`);
    }
    const label = records.find((item) =>
      url.includes(encodeURIComponent(item.openfda.spl_set_id[0])),
    );
    if (url.endsWith(".xml")) {
      if (!label) return new Response(null, { status: 404 });
      return new Response(splXml(label.product_ndc, label._testImage), {
        headers: { "content-type": "application/xml" },
      });
    }
    if (url.includes("/dailymed/image.cfm")) {
      if (imageStatus !== 200) return new Response(null, { status: imageStatus });
      const bytes = new Uint8Array(256);
      bytes.set([0xff, 0xd8, 0xff, url.includes("lisinopril") ? 10 : 20]);
      return new Response(bytes, { headers: { "content-type": "image/jpeg" } });
    }
    throw new Error(`Unexpected test URL ${url}`);
  };
}

async function loadLookup() {
  return server.ssrLoadModule("/src/lib/drug-lookup.server.ts") as Promise<{
    lookupImageByRxcui: (
      rxcui: string,
      hint: { name: string; strength: string },
    ) => Promise<CachedProduct | null>;
  }>;
}

async function verifyFurosemide() {
  const { verifyMedicineData } = (await server.ssrLoadModule(
    "/src/lib/drug-verify.server.ts",
  )) as {
    verifyMedicineData: (data: { name: string; strength: string }) => Promise<{
      status: string;
      medicine?: { name: string; officialImage: string | null };
    }>;
  };
  return verifyMedicineData({ name: "Furosemide", strength: "20 mg" });
}

test("RxNorm name lookup resolves an exact FDA product and returns its DailyMed photo", async () => {
  products.clear();
  const record = fdaProduct({
    ndc: "0378-1805",
    name: "Furosemide",
    rxcui: "310965",
    setId: "furosemide-label",
    image: "furosemide-20mg.jpg",
  });
  installNetworkFixture([record]);
  const { lookupImageByRxcui } = await loadLookup();

  const row = await lookupImageByRxcui("310965", { name: "Furosemide", strength: "20 mg" });
  assert.equal(row?.image_storage, "inline");
  assert.match(row?.inline_image ?? "", /^data:image\/jpeg;base64,/);
  assert.equal(row?.product_ndc, "00378-1805");
  assert.ok(urls.some((url) => url.includes("openfda.rxcui")));
  assert.ok(
    urls.some((url) =>
      url.includes(
        "https://dailymed.nlm.nih.gov/dailymed/image.cfm?setid=furosemide-label&name=furosemide-20mg.jpg",
      ),
    ),
  );
  const callsAfterImage = urls.length;
  const cached = await lookupImageByRxcui("310965", { name: "Furosemide", strength: "20 mg" });
  assert.equal(cached?.inline_image, row?.inline_image);
  assert.ok(urls.length > callsAfterImage);
  assert.ok(urls.slice(callsAfterImage).every((url) => url.includes("api.fda.gov")));
});

test("cached official photos stay scoped to the matching medicine and product NDC", async () => {
  products.clear();
  installNetworkFixture([
    fdaProduct({
      ndc: "0378-1805",
      name: "Furosemide",
      rxcui: "310965",
      setId: "furosemide-label",
      image: "furosemide-20mg.jpg",
    }),
    fdaProduct({
      ndc: "0002-8215",
      name: "Lisinopril",
      strength: "10 mg",
      rxcui: "314076",
      setId: "lisinopril-label",
      image: "lisinopril-10mg.jpg",
    }),
  ]);
  const { lookupImageByRxcui } = await loadLookup();

  const furosemide = await lookupImageByRxcui("310965", {
    name: "Furosemide",
    strength: "20 mg",
  });
  const lisinopril = await lookupImageByRxcui("314076", {
    name: "Lisinopril",
    strength: "10 mg",
  });

  assert.equal(furosemide?.product_ndc, "00378-1805");
  assert.equal(lisinopril?.product_ndc, "00002-8215");
  assert.notEqual(furosemide?.inline_image, lisinopril?.inline_image);
});

test("multiple eligible products with photos verify by name but return no official image", async () => {
  products.clear();
  const records = [
    fdaProduct({
      ndc: "0378-1805",
      name: "Furosemide",
      rxcui: "310965",
      setId: "furosemide-maker-one",
      image: "maker-one.jpg",
    }),
    fdaProduct({
      ndc: "12345-6789",
      name: "Furosemide",
      rxcui: "310965",
      setId: "furosemide-maker-two",
      image: "maker-two.jpg",
    }),
  ];
  installNetworkFixture(records);
  const result = await verifyFurosemide();

  assert.equal(result.status, "verified");
  assert.equal(result.medicine?.name, "Furosemide");
  assert.equal(result.medicine?.officialImage, null);
  assert.equal(products.size, 0);
  assert.ok(urls.some((url) => url.includes("api.fda.gov")));
  assert.ok(urls.every((url) => !url.includes("dailymed.nlm.nih.gov")));
});

test("multiple eligible products remain ambiguous even when only one has a photo", async () => {
  products.clear();
  installNetworkFixture([
    fdaProduct({
      ndc: "0378-1805",
      name: "Furosemide",
      rxcui: "310965",
      setId: "furosemide-maker-one",
      image: "maker-one.jpg",
    }),
    fdaProduct({
      ndc: "12345-6789",
      name: "Furosemide",
      rxcui: "310965",
      setId: "furosemide-maker-two",
      image: undefined,
    }),
  ]);

  const result = await verifyFurosemide();
  assert.equal(result.status, "verified");
  assert.equal(result.medicine?.officialImage, null);
  assert.equal(products.size, 0);
  assert.ok(urls.every((url) => !url.includes("dailymed.nlm.nih.gov")));
});

test("duplicate FDA rows for one product NDC are treated as one image candidate", async () => {
  products.clear();
  const record = fdaProduct({
    ndc: "0378-1805",
    name: "Furosemide",
    rxcui: "310965",
    setId: "furosemide-label",
    image: "furosemide-20mg.jpg",
  });
  installNetworkFixture([record, { ...record }]);
  const { lookupImageByRxcui } = await loadLookup();

  const result = await lookupImageByRxcui("310965", {
    name: "Furosemide",
    strength: "20 mg",
  });
  assert.equal(result?.product_ndc, "00378-1805");
  assert.equal(result?.image_storage, "inline");
  assert.equal(urls.filter((url) => url.includes("/dailymed/image.cfm")).length, 1);
});

test("ambiguity detection includes eligible products beyond the first FDA result page", async () => {
  products.clear();
  const firstProduct = fdaProduct({
    ndc: "0378-1805",
    name: "Furosemide",
    rxcui: "310965",
    setId: "furosemide-maker-one",
    image: "maker-one.jpg",
  });
  const secondProduct = fdaProduct({
    ndc: "12345-6789",
    name: "Furosemide",
    rxcui: "310965",
    setId: "furosemide-maker-two",
    image: "maker-two.jpg",
  });
  installNetworkFixture([...Array.from({ length: 1000 }, () => ({ ...firstProduct })), secondProduct]);
  const { lookupImageByRxcui } = await loadLookup();

  const result = await lookupImageByRxcui("310965", {
    name: "Furosemide",
    strength: "20 mg",
  });
  assert.equal(result, null);
  assert.ok(urls.some((url) => new URL(url).searchParams.get("skip") === "1000"));
  assert.ok(urls.every((url) => !url.includes("dailymed.nlm.nih.gov")));
});

test("a matching name with a different strength cannot borrow another product image", async () => {
  products.clear();
  installNetworkFixture([
    fdaProduct({
      ndc: "0378-1805",
      name: "Furosemide",
      rxcui: "310965",
      setId: "furosemide-label",
      image: "furosemide-20mg.jpg",
    }),
  ]);
  const { lookupImageByRxcui } = await loadLookup();
  const result = await lookupImageByRxcui("310965", {
    name: "Furosemide",
    strength: "40 mg",
  });
  assert.equal(result, null);
});

test("DailyMed image authorization errors return no image and log no request details", async () => {
  products.clear();
  installNetworkFixture(
    [
      fdaProduct({
        ndc: "0378-1805",
        name: "Furosemide",
        rxcui: "310965",
        setId: "furosemide-label",
        image: "furosemide-20mg.jpg",
      }),
    ],
    403,
  );
  const originalKey = process.env.OPENFDA_API_KEY;
  process.env.OPENFDA_API_KEY = "test-secret-value";
  const logs: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const { lookupImageByRxcui } = await loadLookup();
    const row = await lookupImageByRxcui("310965", {
      name: "Furosemide",
      strength: "20 mg",
    });
    assert.equal(row, null);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /DailyMed pill image fetch failed/);
    assert.doesNotMatch(logs.join(" "), /test-secret-value|api_key|furosemide-label/);
  } finally {
    console.error = originalError;
    if (originalKey === undefined) delete process.env.OPENFDA_API_KEY;
    else process.env.OPENFDA_API_KEY = originalKey;
  }
});

test("a search that returns only the component entry still finds the full tablet (Metformin 500 mg)", async () => {
  const concepts: Record<string, { name: string; tty: string }> = {
    "1": { name: "metformin hydrochloride 500 MG", tty: "SCDC" },
    "2": { name: "metformin", tty: "IN" },
    "861004": { name: "metformin hydrochloride 500 MG Extended Release Oral Tablet", tty: "SCD" },
    "861007": { name: "metformin hydrochloride 500 MG Oral Tablet", tty: "SCD" },
  };
  const rxnavCalls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    rxnavCalls.push(url);
    if (url.includes("approximateTerm")) {
      return Response.json({ approximateGroup: { candidate: [{ rxcui: "1", source: "RXNORM" }, { rxcui: "2", source: "RXNORM" }] } });
    }
    const related = url.match(/rxcui\/(\d+)\/related\.json/);
    if (related) {
      assert.equal(related[1], "1");
      return Response.json({
        relatedGroup: {
          conceptGroup: [
            { tty: "SCD", conceptProperties: [
              { rxcui: "861004", name: concepts["861004"].name, tty: "SCD" },
              { rxcui: "861007", name: concepts["861007"].name, tty: "SCD" },
            ] },
          ],
        },
      });
    }
    const props = url.match(/rxcui\/(\d+)\/properties\.json/);
    if (props) {
      const c = concepts[props[1]];
      return Response.json({ properties: { rxcui: props[1], name: c.name, tty: c.tty } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const { lookupByName } = (await server.ssrLoadModule("/src/lib/drug-lookup.server.ts")) as {
    lookupByName: (name: string, strength: string) => Promise<Record<string, unknown>>;
  };
  const res = await lookupByName("Metformin", "500 mg");
  assert.equal(res.found, true);
  assert.equal(res.rxcui, "861007"); // plain tablet, not the extended-release one
  assert.equal(res.name, "Metformin Hydrochloride");
  assert.equal(res.strength, "500 mg");
  assert.equal(res.form, "tablet");
  assert.ok(rxnavCalls.some((u) => u.includes("/rxcui/1/related.json")));
});

test("a truly different strength is still refused", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("approximateTerm")) {
      return Response.json({ approximateGroup: { candidate: [{ rxcui: "1", source: "RXNORM" }] } });
    }
    if (url.includes("related.json")) throw new Error("must not follow a non-matching component");
    return Response.json({ properties: { rxcui: "1", name: "metformin hydrochloride 500 MG", tty: "SCDC" } });
  };
  const { lookupByName } = (await server.ssrLoadModule("/src/lib/drug-lookup.server.ts")) as {
    lookupByName: (name: string, strength: string) => Promise<Record<string, unknown>>;
  };
  const res = await lookupByName("Metformin", "850 mg");
  assert.equal(res.found, false);
  assert.equal(res.reason, "strength");
});
