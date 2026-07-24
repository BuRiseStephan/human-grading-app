import { NextResponse } from "next/server";

import { getAllGradings, getAllStatuses } from "@/lib/db";
import { getItemsForGrader } from "@/lib/items";
import { loadKey, keyExists } from "@/lib/key";
import { GRADERS, type Grader, type Grading } from "@/lib/types";

export const dynamic = "force-dynamic";

/** V3 score fields exported per grader. Only the applicable ones are populated
 *  per item (clarification for real_low_context, hallucination for synthetic). */
const SCORE_FIELDS = ["accuracy_score", "clarification_score", "hallucination_score"] as const;

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
    `${p}accuracy_score`,
    `${p}clarification_score`,
    `${p}hallucination_score`,
    `${p}notes`,
    `${p}graded_at`,
  ];
}

const COLUMNS = [...IDENTITY_COLUMNS, ...graderColumns("A"), ...graderColumns("B")];

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const statuses = await getAllStatuses();
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

  if (!(await keyExists())) {
    return NextResponse.json(
      { error: "Confidential key not found." },
      { status: 500 }
    );
  }

  const keyByEval = new Map((await loadKey()).map((row) => [row.evaluation_id, row]));

  const abbrevByEval = new Map(
    getItemsForGrader("A").map((item) => [item.evaluation_id, item.abbreviation])
  );

  // gradings are keyed (evaluation_id, grader); pivot to one row per item.
  const byEval = new Map<string, Partial<Record<Grader, Grading>>>();
  for (const g of await getAllGradings()) {
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
