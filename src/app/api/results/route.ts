import { NextResponse } from "next/server";

import { countCompleted, getAllStatuses, getDb } from "@/lib/db";
import { countItemsForGrader } from "@/lib/items";
import { GRADERS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Progress dashboard only. Deliberately contains no model identity, no
 * condition labels, and no per-item scores, so it stays safe to open on a
 * shared network while grading is still in progress.
 */
export async function GET() {
  const db = getDb();
  const statuses = getAllStatuses();

  const progress = GRADERS.map((grader) => {
    const last = db
      .prepare("SELECT MAX(updated_at) AS t FROM gradings WHERE grader = ?")
      .get(grader) as { t: string | null };
    const touched = db
      .prepare("SELECT COUNT(*) AS n FROM gradings WHERE grader = ?")
      .get(grader) as { n: number };
    const status = statuses.find((s) => s.grader === grader)!;

    return {
      grader,
      total: countItemsForGrader(grader),
      completed: countCompleted(grader),
      touched: touched.n,
      started_at: status.started_at,
      completed_at: status.completed_at,
      locked: Boolean(status.completed_at),
      last_activity: last.t,
    };
  });

  return NextResponse.json({
    progress,
    both_locked: progress.every((p) => p.locked),
  });
}
