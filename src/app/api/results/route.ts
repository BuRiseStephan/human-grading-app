import { NextResponse } from "next/server";

import {
  countCompleted,
  countTouched,
  getAllStatuses,
  getLastActivity,
} from "@/lib/db";
import { countItemsForGrader } from "@/lib/items";
import { GRADERS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Progress dashboard only. Deliberately contains no model identity, no
 * condition labels, and no per-item scores, so it stays safe to open on a
 * shared network while grading is still in progress.
 */
export async function GET() {
  const statuses = await getAllStatuses();

  const progress = await Promise.all(
    GRADERS.map(async (grader) => {
      const [completed, touched, last] = await Promise.all([
        countCompleted(grader),
        countTouched(grader),
        getLastActivity(grader),
      ]);
      const status = statuses.find((s) => s.grader === grader)!;

      return {
        grader,
        total: countItemsForGrader(grader),
        completed,
        touched,
        started_at: status.started_at,
        completed_at: status.completed_at,
        locked: Boolean(status.completed_at),
        last_activity: last,
      };
    })
  );

  return NextResponse.json({
    progress,
    both_locked: progress.every((p) => p.locked),
  });
}
