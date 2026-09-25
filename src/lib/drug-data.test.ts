import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalProductNdc,
  cleanFdaStrength,
  describeAppearance,
  namesMatch,
  parseApproximateTerm,
  parseClinicalDrugName,
  parseFdaNdcResponse,
  parseSplAppearance,
  plainForm,
  productNdcCandidates,
  strengthMatches,
} from "./drug-data.ts";

test("NDC with dashes keeps the label's own split", () => {
  assert.deepEqual(productNdcCandidates("NDC 0378-1805-01"), ["0378-1805"]);
  assert.deepEqual(productNdcCandidates("68180-513-01"), ["68180-513"]);
  assert.deepEqual(productNdcCandidates("12345-6789-1"), ["12345-6789"]);
});

test("NDC without dashes tries every valid split", () => {
  assert.deepEqual(productNdcCandidates("0378180501"), ["0378-1805", "03781-805", "03781-8050"]);
});

test("11-digit billing NDC is de-padded", () => {
  assert.deepEqual(productNdcCandidates("00378-1805-01"), ["0378-1805", "00378-1805"]);
  assert.ok(productNdcCandidates("68180051301").includes("68180-513"));
});

test("junk NDC gives nothing", () => {
  assert.deepEqual(productNdcCandidates(""), []);
  assert.deepEqual(productNdcCandidates("12345"), []);
});

test("canonical product NDC pads to 5-4", () => {
  assert.equal(canonicalProductNdc("0378-1805"), "00378-1805");
  assert.equal(canonicalProductNdc("68180-513"), "68180-0513");
});

test("strength matching", () => {
  assert.equal(strengthMatches("10mg", "10 mg/1"), true);
  assert.equal(strengthMatches("10 MG", "20 mg/1"), false);
  assert.equal(strengthMatches("50 mcg", "0.05 MG"), true);
  assert.equal(strengthMatches("5/325", "325 MG / 5 MG"), true);
  assert.equal(strengthMatches("5 mg/325 mg", "325 mg / 5 mg"), true);
  assert.equal(strengthMatches("", "10 mg"), null);
  assert.equal(cleanFdaStrength("10 mg/1"), "10 mg");
});

test("name matching ignores salts and forms", () => {
  assert.equal(namesMatch("Metformin HCl ER", ["Metformin Hydrochloride"]), true);
  assert.equal(namesMatch("Lisinopril", ["Losartan Potassium"]), false);
  assert.equal(namesMatch("Tablet", ["Anything Tablet"]), false);
});

test("FDA dosage forms become plain words", () => {
  assert.equal(plainForm("TABLET, FILM COATED"), "tablet");
  assert.equal(plainForm("TABLET, FILM COATED, EXTENDED RELEASE"), "extended-release tablet");
  assert.equal(plainForm("CAPSULE, DELAYED RELEASE"), "delayed-release capsule");
});

test("openFDA NDC response", () => {
  const [p] = parseFdaNdcResponse({
    results: [
      {
        product_ndc: "0378-1805",
        generic_name: "LISINOPRIL",
        brand_name: "Lisinopril",
        dosage_form: "TABLET",
        labeler_name: "Mylan Pharmaceuticals Inc.",
        active_ingredients: [{ name: "LISINOPRIL", strength: "10 mg/1" }],
        openfda: { rxcui: ["314076"], spl_set_id: ["abc-123"] },
      },
    ],
  });
  assert.equal(p.name, "Lisinopril");
  assert.equal(p.strength, "10 mg");
  assert.equal(p.form, "tablet");
  assert.equal(p.splSetId, "abc-123");

  const [brand] = parseFdaNdcResponse({
    results: [{ product_ndc: "0071-0155", generic_name: "ATORVASTATIN CALCIUM", brand_name: "Lipitor" }],
  });
  assert.equal(brand.name, "Lipitor (Atorvastatin Calcium)");
});

const SPL = `<?xml version="1.0" encoding="UTF-8"?>
<document xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<component><structuredBody><component><section>
<subject>
  <manufacturedProduct>
    <manufacturedProduct>
      <code code="0378-1805" codeSystem="2.16.840.1.113883.6.69"/>
      <name>Lisinopril</name>
      <asContent><containerPackagedProduct>
        <code code="0378-1805-01" codeSystem="2.16.840.1.113883.6.69"/>
      </containerPackagedProduct></asContent>
    </manufacturedProduct>
    <subjectOf><approval><id extension="ANDA076180"/></approval></subjectOf>
    <subjectOf><characteristic classCode="OBS">
      <code code="SPLCOLOR" codeSystem="2.16.840.1.113883.1.11.19255"/>
      <value xsi:type="CE" code="C48325" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="WHITE"/>
    </characteristic></subjectOf>
    <subjectOf><characteristic classCode="OBS">
      <code code="SPLSHAPE" codeSystem="2.16.840.1.113883.1.11.19255"/>
      <value xsi:type="CE" code="C48348" displayName="ROUND"/>
    </characteristic></subjectOf>
    <subjectOf><characteristic classCode="OBS">
      <code code="SPLSIZE" codeSystem="2.16.840.1.113883.1.11.19255"/>
      <value xsi:type="PQ" value="6" unit="mm"/>
    </characteristic></subjectOf>
    <subjectOf><characteristic classCode="OBS">
      <code code="SPLIMPRINT" codeSystem="2.16.840.1.113883.1.11.19255"/>
      <value xsi:type="ST">M;L &amp; 10</value>
    </characteristic></subjectOf>
    <subjectOf><characteristic classCode="OBS">
      <code code="SPLIMAGE" codeSystem="2.16.840.1.113883.1.11.19255"/>
      <value xsi:type="ED" mediaType="image/jpeg"><reference value="lisinopril-10mg.jpg"/></value>
    </characteristic></subjectOf>
  </manufacturedProduct>
</subject>
<subject>
  <manufacturedProduct>
    <manufacturedProduct>
      <code code="0378-2020" codeSystem="2.16.840.1.113883.6.69"/>
    </manufacturedProduct>
    <subjectOf><characteristic><code code="SPLCOLOR"/><value xsi:type="CE" displayName="BLUE"/></characteristic></subjectOf>
    <subjectOf><characteristic><code code="SPLCOLOR"/><value xsi:type="CE" displayName="WHITE"/></characteristic></subjectOf>
    <subjectOf><characteristic><code code="SPLSHAPE"/><value xsi:type="CE" displayName="CAPSULE"/></characteristic></subjectOf>
  </manufacturedProduct>
</subject>
</section></component></structuredBody></component>
</document>`;

test("SPL appearance per product", () => {
  const [a, b] = parseSplAppearance(SPL);
  assert.equal(a.productNdc, "0378-1805");
  assert.deepEqual(a.colors, ["white"]);
  assert.equal(a.shape, "round");
  assert.equal(a.sizeMm, 6);
  assert.equal(a.imprint, "M;L & 10");
  assert.equal(a.imageFile, "lisinopril-10mg.jpg");
  assert.equal(b.productNdc, "0378-2020");
  assert.deepEqual(b.colors, ["blue", "white"]);
  assert.equal(b.imageFile, null);

  assert.equal(
    describeAppearance({ ...a, form: "tablet" }),
    "White round tablet, marked M / L & 10",
  );
  assert.equal(describeAppearance({ ...b, form: "capsule" }), "Blue and white capsule");
});

test("RxNorm approximate term + clinical drug names", () => {
  assert.deepEqual(
    parseApproximateTerm({
      approximateGroup: {
        candidate: [
          { rxcui: "314076", source: "RXNORM" },
          { rxcui: "314076", source: "RXNORM" },
          { rxcui: "999", source: "MMSL" },
          { rxcui: "29046" },
        ],
      },
    }),
    ["314076", "29046"],
  );
  assert.deepEqual(parseClinicalDrugName("lisinopril 10 MG Oral Tablet"), {
    ingredients: "Lisinopril",
    strength: "10 mg",
    form: "tablet",
    brand: "",
  });
  assert.deepEqual(parseClinicalDrugName("atorvastatin 20 MG Oral Tablet [Lipitor]")?.brand, "Lipitor");
  assert.deepEqual(parseClinicalDrugName("24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet"), {
    ingredients: "Metformin Hydrochloride",
    strength: "500 mg",
    form: "24-hour extended-release tablet",
    brand: "",
  });
  assert.deepEqual(
    parseClinicalDrugName("acetaminophen 325 MG / hydrocodone bitartrate 5 MG Oral Tablet")?.strength,
    "325 mg / 5 mg",
  );
});
