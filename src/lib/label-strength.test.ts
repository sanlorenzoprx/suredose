import assert from "node:assert/strict";
import { test } from "node:test";
import { splitStrengthFromName } from "./label-strength.ts";

test("splits a dose printed inside the name", () => {
  assert.deepEqual(splitStrengthFromName("Metformin HCl 500 mg", ""), {
    name: "Metformin HCl",
    strength: "500 mg",
  });
  assert.deepEqual(splitStrengthFromName("Lisinopril 10mg tablets", ""), {
    name: "Lisinopril tablets",
    strength: "10mg",
  });
  assert.deepEqual(splitStrengthFromName("Amoxicillin 250 mg/5 mL", ""), {
    name: "Amoxicillin",
    strength: "250 mg/5 mL",
  });
});

test("never invents a strength or overrides one the model gave", () => {
  assert.deepEqual(splitStrengthFromName("Metformin", ""), { name: "Metformin", strength: "" });
  assert.deepEqual(splitStrengthFromName("Metformin 500", ""), {
    name: "Metformin 500",
    strength: "",
  });
  assert.deepEqual(splitStrengthFromName("Metformin 500 mg", "850 mg"), {
    name: "Metformin 500 mg",
    strength: "850 mg",
  });
  assert.deepEqual(splitStrengthFromName("", ""), { name: "", strength: "" });
  assert.deepEqual(splitStrengthFromName("500 mg", ""), { name: "500 mg", strength: "" });
});
