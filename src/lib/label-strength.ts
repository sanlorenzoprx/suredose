/*
 * Models sometimes write the strength inside the drug name ("Metformin 500 mg")
 * and leave the strength field blank. When — and only when — a clear dose
 * (number + unit) is printed in the name the model read, split it out. Nothing
 * is invented: no unit, no number, no split.
 */
const STRENGTH_IN_NAME =
  /(\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ug|g|ml|iu|units?|%)(?:\s?\/\s?\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|units?))?)/i;

export function splitStrengthFromName(
  name: string,
  strength: string,
): { name: string; strength: string } {
  const n = name.trim();
  const s = strength.trim();
  if (!n || s) return { name: n, strength: s };
  const match = n.match(STRENGTH_IN_NAME);
  if (!match || match.index === undefined) return { name: n, strength: s };
  const stripped = (n.slice(0, match.index) + " " + n.slice(match.index + match[0].length))
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;\-–]+$/, "")
    .trim();
  // Keep the whole name if stripping would leave nothing to call a drug.
  if (stripped.length < 2) return { name: n, strength: s };
  return { name: stripped, strength: match[1].replace(/\s+/g, " ").trim() };
}
