import { NextResponse } from "next/server";

import { getStatus, markComplete, ValidationError } from "@/lib/db";
import { countItemsForGrader } from "@/lib/items";
import { isGrader } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Irreversible through the UI: locks a grader's answers to read-only. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const grader = body.grader;
  if (!isGrader(grader)) {
    return NextResponse.json({ error: "grader must be 'A' or 'B'" }, { status: 400 });
  }

  try {
    markComplete(grader, countItemsForGrader(grader));
    return NextResponse.json({ status: getStatus(grader) });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
