import { NextResponse } from "next/server";

import { countItemsForGrader, getItemsForGrader } from "@/lib/items";
import { countCompleted, getGradings, getStatus, markStarted } from "@/lib/db";
import { isGrader } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Everything the grading page needs for ONE grader: all 480 blinded items in
 * that grader's own randomized order, plus any answers they have already saved.
 * The other grader's answers are never included in the response.
 */
export async function GET(request: Request) {
  const grader = new URL(request.url).searchParams.get("grader");

  if (!isGrader(grader)) {
    return NextResponse.json({ error: "grader must be 'A' or 'B'" }, { status: 400 });
  }

  const items = getItemsForGrader(grader);
  if (items.length === 0) {
    return NextResponse.json(
      { error: `No items found for Grader ${grader}. Run: python3 scripts/build_sample.py` },
      { status: 500 }
    );
  }

  markStarted(grader);

  const gradings = Object.fromEntries(
    getGradings(grader).map((g) => [g.evaluation_id, g])
  );

  return NextResponse.json({
    grader,
    total: countItemsForGrader(grader),
    completed: countCompleted(grader),
    status: getStatus(grader),
    items,
    gradings,
  });
}
