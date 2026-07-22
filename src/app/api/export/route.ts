import { NextResponse } from "next/server";

import { getAllGradings, getAllStatuses } from "@/lib/db";
import { getItemsForGrader } from "@/lib/items";
import { loadKey, keyExists } from "@/lib/key";
import { GRADERS, type Grader, type Grading } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Rubric fields exported per grader, in rubric order. */
const SCORE_FIELDS = [
  "abbreviation_accuracy_score",
  "final_answer_accuracy_score",
  "clarification_appropriate",
  "asked_for_clarification",
  "unsupported_assumption",
  "overconfident_wrong",
  "hallucinated_detail",
] as const;

const IDENTITY_COLUMNS = [
  "evaluation_id",
  "run_id",
  "model_key",
  "parameter_count_b",
  "variant",
  "domain",
  "set_id",
  "prompt_id",
  "abbreviation",
];

/**
 * One row per response, with both graders' original scores side by side —
 * the plan's "merge them by evaluation_id, preserve both original score sets
 * unchanged". This shape makes agreement and quadratic-weighted kappa a direct
 * column-vs-column comparison.
 */
function graderColumns(grader: Grader): string[] {
  const p = `grader_${grader.toLowerCase()}_`;
  return [
    `${p}abbreviation_accuracy_score`,
    `${p}abbreviation_correct`,
    `${p}final_answer_accuracy_score`,
    `${p}final_answer_correct`,
    `${p}clarification_appropriate`,
    `${p}asked_for_clarification`,
    `${p}unsupported_assumption`,
    `${p}overconfident_wrong`,
    `${p}hallucinated_detail`,
    `${p}notes`,
    `${p}graded_at`,
  ];
}

const COLUMNS = [...IDENTITY_COLUMNS, ...graderColumns("A"), ...graderColumns("B")];

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Plan rule: 1 for a score of 3 or 4, 0 for 1 or 2, blank when the score is blank. */
function derivedCorrect(score: number | null | undefined): string {
  if (score === null || score === undefined) return "";
  return score >= 3 ? "1" : "0";
}

export async function GET() {
  const statuses = getAllStatuses();
  const unlocked = statuses.filter((s) => !s.completed_at).map((s) => s.grader);

  // Independence procedure: neither grader may see model identity or the other
  // grader's scores until both have finalized. Refuse rather than partially export.
  if (unlocked.length > 0) {
    return NextResponse.json(
      {
        error:
          `Export is locked until both graders mark grading complete. ` +
          `Still open: Grader ${unlocked.join(", Grader ")}.`,
      },
      { status: 409 }
    );
  }

  if (!keyExists()) {
    return NextResponse.json(
      { error: "Confidential key not found. Run: python3 scripts/build_sample.py" },
      { status: 500 }
    );
  }

  const keyByEval = new Map(loadKey().map((row) => [row.evaluation_id, row]));

  const abbrevByEval = new Map(
    getItemsForGrader("A").map((item) => [item.evaluation_id, item.abbreviation])
  );

  // gradings are keyed (evaluation_id, grader); pivot to one row per item.
  const byEval = new Map<string, Partial<Record<Grader, Grading>>>();
  for (const g of getAllGradings()) {
    const entry = byEval.get(g.evaluation_id) ?? {};
    entry[g.grader] = g;
    byEval.set(g.evaluation_id, entry);
  }

  const rows = [...keyByEval.keys()].sort().map((evaluationId) => {
    const key = keyByEval.get(evaluationId)!;
    const pair = byEval.get(evaluationId) ?? {};

    const row: Record<string, unknown> = {
      evaluation_id: evaluationId,
      run_id: key.run_id,
      model_key: key.model_key,
      parameter_count_b: key.parameter_count_b,
      variant: key.variant,
      domain: key.domain,
      set_id: key.set_id,
      prompt_id: key.prompt_id,
      abbreviation: abbrevByEval.get(evaluationId) ?? "",
    };

    for (const grader of GRADERS) {
      const p = `grader_${grader.toLowerCase()}_`;
      const g = pair[grader];
      for (const field of SCORE_FIELDS) {
        row[`${p}${field}`] = g?.[field] ?? "";
      }
      row[`${p}abbreviation_correct`] = derivedCorrect(g?.abbreviation_accuracy_score);
      row[`${p}final_answer_correct`] = derivedCorrect(g?.final_answer_accuracy_score);
      row[`${p}notes`] = g?.notes ?? "";
      row[`${p}graded_at`] = g?.updated_at ?? "";
    }

    return row;
  });

  const csv = [
    COLUMNS.join(","),
    ...rows.map((r) => COLUMNS.map((c) => csvEscape(r[c])).join(",")),
  ].join("\n");

  return new NextResponse(csv + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="human_grading_merged.csv"',
    },
  });
}
