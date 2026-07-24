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

const ALL_SCOPE = "__all__";

/** Turn a raw variant key like "domain_conflict_trick" into "Domain conflict trick". */
function prettify(variant: string): string {
  const s = variant.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Scopes = Overall, then one column per prompt variant present in the sample.
 * Derived from the key so it adapts to however many variants the study uses.
 */
function buildScopes(variants: string[]): { key: string; label: string }[] {
  return [
    { key: ALL_SCOPE, label: "Overall" },
    ...variants.map((v) => ({ key: v, label: prettify(v) })),
  ];
}

type NumField = "accuracy_score" | "clarification_score" | "hallucination_score";

function nums(rows: Grading[], field: NumField): number[] {
  return rows
    .map((r) => r[field])
    .filter((x): x is number => x !== null && x !== undefined);
}

/** Mean of a 0–2 field over items where it was scored ("—" if none). */
function mean(rows: Grading[], field: NumField): string {
  const v = nums(rows, field);
  if (!v.length) return "—";
  return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2);
}

/** % of scored items at exactly a value (with the n it's over). */
function pctEqual(rows: Grading[], field: NumField, value: number): string {
  const v = nums(rows, field);
  if (!v.length) return "—";
  return `${((100 * v.filter((x) => x === value).length) / v.length).toFixed(0)}% (n=${v.length})`;
}

const METRICS: { label: string; note: string; calc: (rows: Grading[]) => string }[] = [
  { label: "Accuracy — mean", note: "0–2, all items", calc: (r) => mean(r, "accuracy_score") },
  { label: "Accuracy = 2 (best)", note: "% of scored", calc: (r) => pctEqual(r, "accuracy_score", 2) },
  { label: "Accuracy = 0 (worst)", note: "% of scored", calc: (r) => pctEqual(r, "accuracy_score", 0) },
  {
    label: "Clarification — mean",
    note: "0–2, real_low_context only",
    calc: (r) => mean(r, "clarification_score"),
  },
  {
    label: "Clarification = 2 (explicit ask)",
    note: "% of scored",
    calc: (r) => pctEqual(r, "clarification_score", 2),
  },
  {
    label: "Hallucination — mean",
    note: "0–2, synthetic_high_context only",
    calc: (r) => mean(r, "hallucination_score"),
  },
  {
    label: "Hallucination = 2 (false established)",
    note: "% of scored",
    calc: (r) => pctEqual(r, "hallucination_score", 2),
  },
];

export interface GraderStats {
  grader: Grader;
  scopeLabels: string[];
  /** Items graded in each scope (for the header count row). */
  scopeN: number[];
  metrics: { label: string; note: string; values: string[] }[];
}

export async function computeStats(): Promise<GraderStats[]> {
  const key = await loadKey();
  const variantByEval = new Map(key.map((r) => [r.evaluation_id, r.variant]));
  const all = await getAllGradings();

  // Variants actually present in the sample, in first-seen order from the key.
  const variants: string[] = [];
  for (const r of key) {
    if (r.variant && !variants.includes(r.variant)) variants.push(r.variant);
  }
  const scopes = buildScopes(variants);

  return GRADERS.map((grader) => {
    const mine = all.filter((g) => g.grader === grader);
    const scopeRows = scopes.map((s) =>
      s.key === ALL_SCOPE ? mine : mine.filter((g) => variantByEval.get(g.evaluation_id) === s.key)
    );

    return {
      grader,
      scopeLabels: scopes.map((s) => s.label),
      scopeN: scopeRows.map((r) => r.length),
      metrics: METRICS.map((m) => ({
        label: m.label,
        note: m.note,
        values: scopeRows.map(m.calc),
      })),
    };
  });
}
