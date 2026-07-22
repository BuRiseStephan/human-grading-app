import { Suspense } from "react";

import { getRubricPanelSections } from "@/lib/rubric";

import GradingClient from "./GradingClient";

export const dynamic = "force-dynamic";

export default function GradePage() {
  // Rubric text is read on the server and passed down, so the grading client
  // never fetches anything beyond its own assigned items.
  const sections = getRubricPanelSections();

  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <GradingClient rubricSections={sections} />
    </Suspense>
  );
}
