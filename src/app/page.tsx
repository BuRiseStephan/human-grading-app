import Link from "next/link";

import { countCompleted, getStatus } from "@/lib/db";
import { countItemsForGrader } from "@/lib/items";
import { GRADERS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const cards = GRADERS.map((grader) => ({
    grader,
    total: countItemsForGrader(grader),
    completed: countCompleted(grader),
    locked: Boolean(getStatus(grader).completed_at),
  }));

  return (
    <>
      <h1>Who is grading?</h1>
      <p className="sub">
        Pick your name to start. Both graders grade all 480 responses independently, in a
        different randomized order each — you will never see the other grader&apos;s scores.
      </p>

      <div className="grader-pick">
        {cards.map((card) => (
          <Link key={card.grader} className="grader-card" href={`/grade?grader=${card.grader}`}>
            <div className="big">Grader {card.grader}</div>
            <div className="meta">
              {card.completed} / {card.total} graded
              {card.locked ? " · locked" : ""}
            </div>
            <div className="progressbar">
              <div style={{ width: `${card.total ? (100 * card.completed) / card.total : 0}%` }} />
            </div>
          </Link>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <h3>Before you start</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Grade only the visible model response. Judge each field independently.</li>
          <li>
            You and the other grader are scoring the <strong>same</strong> 480 responses so that
            agreement can be measured. Do not discuss individual items or edge cases until you have
            both marked your grading complete — comparing notes early destroys that measurement.
          </li>
          <li>
            Model identity, prompt variant, and domain are hidden by design. Do not try to infer
            them.
          </li>
          <li>
            Answers autosave as you move between items. You can go back and edit any item until you
            mark your grading complete.
          </li>
          <li>
            The full rubric is on the <Link href="/rubric">rubric page</Link>, and a condensed
            version is collapsible on every grading screen.
          </li>
        </ul>
      </div>
    </>
  );
}
