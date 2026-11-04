/*
 * Pure logic for scripts/vision-eval.ts: how one provider's answer on one photo is
 * classified, and how it compares with what the label really says. Kept separate so
 * it is unit-tested; the script only does file and network work.
 */

export type Outcome = "read-correct" | "read-WRONG" | "read-unchecked" | "unclear" | "error" | "skipped";

export type Expected = { name?: string; strength?: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9./%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Strength compare ignores spacing and case: "500 mg" equals "500MG". */
const normStrength = (s: string) => norm(s).replace(/\s/g, "");

export function compareToExpected(
  read: { name: string; strength: string },
  expected: Expected | undefined,
): "match" | "wrong" | "unchecked" {
  if (!expected || (!expected.name && !expected.strength)) return "unchecked";
  if (expected.name) {
    const want = norm(expected.name);
    const got = norm(read.name);
    // The label may print extra words around the drug name; require the expected name inside.
    if (!got.includes(want)) return "wrong";
  }
  if (expected.strength && normStrength(read.strength) !== normStrength(expected.strength)) {
    return "wrong";
  }
  return "match";
}

export function classify(args: {
  providerOk: boolean;
  reason: string; // from unreadableReason(): "ok" when the app would accept it
  comparison: "match" | "wrong" | "unchecked";
}): Outcome {
  if (!args.providerOk) return "error";
  if (args.reason !== "ok") return "unclear";
  if (args.comparison === "wrong") return "read-WRONG";
  if (args.comparison === "match") return "read-correct";
  return "read-unchecked";
}

export type Row = {
  file: string;
  provider: "meta" | "google";
  outcome: Outcome;
  reason: string;
  name: string;
  strength: string;
  ms: number;
};

export function summarize(rows: Row[]): Record<string, Record<Outcome, number>> {
  const out: Record<string, Record<Outcome, number>> = {};
  for (const r of rows) {
    out[r.provider] ??= {
      "read-correct": 0,
      "read-WRONG": 0,
      "read-unchecked": 0,
      unclear: 0,
      error: 0,
      skipped: 0,
    };
    out[r.provider][r.outcome] += 1;
  }
  return out;
}

export function renderReport(rows: Row[], generatedAt: string): string {
  const summary = summarize(rows);
  const lines: string[] = [
    "# Vision evaluation",
    "",
    `Generated ${generatedAt}. Same prompt and acceptance rules as the app.`,
    "Contains label text from your photos: keep it private and out of git.",
    "",
    "## Summary (count of photos per outcome)",
    "",
    "| Provider | read-correct | read-WRONG | read-unchecked | unclear | error |",
    "|---|---|---|---|---|---|",
  ];
  for (const [p, c] of Object.entries(summary)) {
    lines.push(
      `| ${p} | ${c["read-correct"]} | ${c["read-WRONG"]} | ${c["read-unchecked"]} | ${c.unclear} | ${c.error} |`,
    );
  }
  lines.push(
    "",
    "- **read-WRONG** is the dangerous one: a confident read that disagrees with the label.",
    "- **unclear** is the safe outcome: the app asks for a manual check, never a green check.",
    "",
    "## Per photo",
    "",
    "| Photo | Provider | Outcome | Name read | Strength read | Reason | ms |",
    "|---|---|---|---|---|---|---|",
  );
  for (const r of rows) {
    lines.push(
      `| ${r.file} | ${r.provider} | ${r.outcome} | ${r.name || "-"} | ${r.strength || "-"} | ${r.reason === "ok" ? "" : r.reason} | ${r.ms} |`,
    );
  }
  return lines.join("\n") + "\n";
}
