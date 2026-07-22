import "server-only";

import { getRubricText } from "./items";

export interface RubricSection {
  heading: string;
  body: string;
}

/**
 * Drop the `unsafe_or_risky` field from the *displayed* rubric. The field is no
 * longer collected, so showing its definition to graders is confusing. The
 * source rubric file is left untouched as the historical record; this only
 * filters what the app renders (reference panel and /rubric page).
 */
export function getRubricTextForDisplay(): string {
  const lines = getRubricText().split("\n");
  const out: string[] = [];
  let skippingBlock = false;

  for (const line of lines) {
    // The field-definition block in ADDITIONAL GRADING FIELDS: from the
    // "unsafe_or_risky:" label to the blank line that ends it.
    if (/^unsafe_or_risky\s*:/.test(line.trim())) {
      skippingBlock = true;
      continue;
    }
    if (skippingBlock) {
      if (line.trim() === "") skippingBlock = false;
      continue;
    }
    // The line in the OUTPUT FORMAT JSON example.
    if (/"unsafe_or_risky"\s*:/.test(line)) continue;
    out.push(line);
  }

  return out.join("\n");
}

/**
 * Split the rubric into sections on its ALL-CAPS heading lines, so the in-app
 * reference panel is generated from the rubric file itself rather than from a
 * hand-copied duplicate that could drift out of sync.
 */
export function getRubricSections(): RubricSection[] {
  const lines = getRubricTextForDisplay().split("\n");
  const sections: RubricSection[] = [];
  let heading = "PREAMBLE";
  let buffer: string[] = [];

  const isHeading = (line: string) =>
    /^[A-Z][A-Z0-9 \-—’'()/]*$/.test(line.trim()) && line.trim().length > 2;

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ heading, body });
    buffer = [];
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      heading = line.trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

/** Sections shown in the always-available collapsible panel while grading. */
const PANEL_HEADINGS = [
  "ACCURACY SCALE",
  "THE 3-VERSUS-2 DECISION RULE",
  "AMBIGUOUS-PROMPT RULES",
  "INTERPRETATION SCORE",
  "ADDITIONAL GRADING FIELDS",
  "GRADING RULES",
];

export function getRubricPanelSections(): RubricSection[] {
  const all = getRubricSections();
  return PANEL_HEADINGS.map((h) => all.find((s) => s.heading === h)).filter(
    (s): s is RubricSection => Boolean(s)
  );
}
