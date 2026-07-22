import { NextResponse } from "next/server";

import { countCompleted, saveGrading, ValidationError } from "@/lib/db";
import { itemExists } from "@/lib/items";
import { isGrader } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const grader = body.grader;
  const evaluationId = body.evaluation_id;

  if (!isGrader(grader)) {
    return NextResponse.json({ error: "grader must be 'A' or 'B'" }, { status: 400 });
  }
  if (typeof evaluationId !== "string") {
    return NextResponse.json({ error: "evaluation_id is required" }, { status: 400 });
  }

  // Both graders grade all 480, so the only constraint is that the item is in
  // the sample at all. Scores are still keyed per grader and never shared.
  if (!itemExists(evaluationId)) {
    return NextResponse.json(
      { error: `${evaluationId} is not part of the sample` },
      { status: 404 }
    );
  }

  try {
    const saved = saveGrading(grader, evaluationId, body);
    return NextResponse.json({ saved, completed: countCompleted(grader) });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
