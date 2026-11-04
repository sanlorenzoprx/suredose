import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, compareToExpected, renderReport, summarize, type Row } from "./vision-eval.ts";

test("compare ignores case and spacing but catches a wrong drug or strength", () => {
  assert.equal(
    compareToExpected({ name: "Metformin HCl Tablets", strength: "500MG" }, { name: "metformin", strength: "500 mg" }),
    "match",
  );
  assert.equal(
    compareToExpected({ name: "Metoprolol", strength: "500 mg" }, { name: "Metformin", strength: "500 mg" }),
    "wrong",
  );
  assert.equal(
    compareToExpected({ name: "Metformin", strength: "850 mg" }, { name: "Metformin", strength: "500 mg" }),
    "wrong",
  );
  assert.equal(compareToExpected({ name: "Metformin", strength: "500 mg" }, undefined), "unchecked");
});

test("classification never turns an unclear or failed read into a correct one", () => {
  assert.equal(classify({ providerOk: false, reason: "provider-error", comparison: "match" }), "error");
  assert.equal(classify({ providerOk: true, reason: "name-empty", comparison: "match" }), "unclear");
  assert.equal(classify({ providerOk: true, reason: "ok", comparison: "wrong" }), "read-WRONG");
  assert.equal(classify({ providerOk: true, reason: "ok", comparison: "match" }), "read-correct");
  assert.equal(classify({ providerOk: true, reason: "ok", comparison: "unchecked" }), "read-unchecked");
});

test("report counts each outcome per provider", () => {
  const rows: Row[] = [
    { file: "a.jpg", provider: "meta", outcome: "unclear", reason: "name-empty", name: "", strength: "", ms: 1 },
    { file: "a.jpg", provider: "google", outcome: "read-correct", reason: "ok", name: "X", strength: "5 mg", ms: 1 },
  ];
  const s = summarize(rows);
  assert.equal(s.meta.unclear, 1);
  assert.equal(s.google["read-correct"], 1);
  assert.match(renderReport(rows, "now"), /read-WRONG/);
});
