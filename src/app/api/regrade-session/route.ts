import { NextResponse } from "next/server";

import { countRegradeCompleted, getRegradings } from "@/lib/db";
import { countRegradeItems, getRegradeItems } from "@/lib/regrade";
import { isGrader } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The disputed items for one grader to re-grade, plus any re-grades saved so far. */
export async function GET(request: Request) {
  const grader = new URL(request.url).searchParams.get("grader");
  if (!isGrader(grader)) {
    return NextResponse.json({ error: "grader must be 'A' or 'B'" }, { status: 400 });
  }

  const items = getRegradeItems(grader);
  const [regradingList, completed] = await Promise.all([
    getRegradings(grader),
    countRegradeCompleted(grader),
  ]);
  const regradings = Object.fromEntries(regradingList.map((g) => [g.evaluation_id, g]));

  return NextResponse.json({ grader, total: countRegradeItems(), completed, items, regradings });
}
