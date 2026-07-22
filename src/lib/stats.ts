import "server-only";

import { getAllGradings } from "./db";
import { loadKey } from "./key";
import { GRADERS, type Grader, type Grading } from "./types";

/**
 * Human-graded summary statistics, computed per grader and broken down overall
 * and by prompt variant. Variant is confidential (it lives only in the sampling
 * key), so this module must stay server-side and is only surfaced on /results
 * once both graders have locked.
 */

// Overall first, then variants in the difficulty order used elsewhere.
const SCOPES = [
  { key: "__all__", label: "Overall" },
  { key: "full_form_control", label: "Full-form control" },
  { key: "contextual_abbreviation", label: "Contextual" },
  { key: "domain_conflict_trick", label: "Domain-conflict" },
  { key: "abbreviation_only", label: "Abbreviation-only" },
] as const;

type NumField =
  | "abbreviation_accuracy_score"
  | "final_answer_accuracy_score"
  | "clarification_appropriate"
  | "asked_for_clarification"
  | "unsupported_assumption"
  | "overconfident_wrong"
  | "hallucinated_detail";

function nums(rows: Grading[], field: NumField): number[] {
  return rows
    .map((r) => r[field])
    .filter((x): x is number => x !== null && x !== undefined);
}

/** % of non-null values that are >= threshold (used for the 1–4 "correct" cut). */
function pctAtLeast(rows: Grading[], field: NumField, threshold: number): string {
  const v = nums(rows, field);
  if (!v.length) return "—";
  return `${((100 * v.filter((x) => x >= threshold).length) / v.length).toFixed(1)}%`;
}

/** % of non-null values equal to a specific value (used for the 0/1 flags). */
function pctEqual(rows: Grading[], field: NumField, value: number): string {
  const v = nums(rows, field);
  if (!v.length) return "—";
  return `${((100 * v.filter((x) => x === value).length) / v.length).toFixed(1)}%`;
}

function mean(rows: Grading[], field: NumField): string {
  const v = nums(rows, field);
  if (!v.length) return "—";
  return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2);
}

/** How many items in this scope have a non-null abbreviation score (excludes controls). */
function nWithAbbrev(rows: Grading[]): number {
  return nums(rows, "abbreviation_accuracy_score").length;
}

const METRICS: { label: string; note: string; calc: (rows: Grading[]) => string }[] = [
  {
    label: "Final-answer accuracy",
    note: "% scored 3 or 4 (rubric “correct”)",
    calc: (r) => pctAtLeast(r, "final_answer_accuracy_score", 3),
  },
  {
    label: "Final-answer mean score",
    note: "average on the 1–4 scale",
    calc: (r) => mean(r, "final_answer_accuracy_score"),
  },
  {
    label: "Abbreviation accuracy",
    note: "% scored 3 or 4; excludes full-form controls",
    calc: (r) => pctAtLeast(r, "abbreviation_accuracy_score", 3),
  },
  {
    label: "Clarification appropriate",
    note: "% marked 1",
    calc: (r) => pctEqual(r, "clarification_appropriate", 1),
  },
  {
    label: "Asked for clarification",
    note: "% marked 1",
    calc: (r) => pctEqual(r, "asked_for_clarification", 1),
  },
  {
    label: "Unsupported assumption (mean)",
    note: "average on the 0–2 scale",
    calc: (r) => mean(r, "unsupported_assumption"),
  },
  {
    label: "Unsupported assumption present",
    note: "% with any (score ≥ 1)",
    calc: (r) => pctAtLeast(r, "unsupported_assumption", 1),
  },
  {
    label: "Overconfident-wrong",
    note: "% marked 1",
    calc: (r) => pctEqual(r, "overconfident_wrong", 1),
  },
  {
    label: "Hallucinated detail",
    note: "% marked 1",
    calc: (r) => pctEqual(r, "hallucinated_detail", 1),
  },
];

export interface GraderStats {
  grader: Grader;
  scopeLabels: string[];
  /** Items graded in each scope (for the header count row). */
  scopeN: number[];
  /** Non-null abbreviation counts per scope (controls have none). */
  scopeAbbrevN: number[];
  metrics: { label: string; note: string; values: string[] }[];
}

export function computeStats(): GraderStats[] {
  const variantByEval = new Map(loadKey().map((r) => [r.evaluation_id, r.variant]));
  const all = getAllGradings();

  return GRADERS.map((grader) => {
    const mine = all.filter((g) => g.grader === grader);
    const scopeRows = SCOPES.map((s) =>
      s.key === "__all__" ? mine : mine.filter((g) => variantByEval.get(g.evaluation_id) === s.key)
    );

    return {
      grader,
      scopeLabels: SCOPES.map((s) => s.label),
      scopeN: scopeRows.map((r) => r.length),
      scopeAbbrevN: scopeRows.map(nWithAbbrev),
      metrics: METRICS.map((m) => ({
        label: m.label,
        note: m.note,
        values: scopeRows.map(m.calc),
      })),
    };
  });
}
