import { getHallucinationV2Text } from "@/lib/items";
import { getRubricTextForDisplay } from "@/lib/rubric";

export const dynamic = "force-dynamic";

export default function RubricPage() {
  const text = getRubricTextForDisplay();
  const v2 = getHallucinationV2Text();

  return (
    <>
      <h1>Grading rubric</h1>
      <p className="sub">
        The current grading terms both graders apply. All scores are 0–2. Accuracy is scored on
        every item; clarification only on real_low_context; hallucination only on
        synthetic_high_context.
      </p>
      <pre className="rubric-full">{text}</pre>

      {v2 && (
        <>
          <div className="ok-note" style={{ marginTop: 28 }}>
            <strong>Proposed hallucination rubric (v2).</strong> Derived from how you two actually
            graded the synthetic items — it keeps the same 0/1/2 meanings but adds a decision order
            and tiebreakers for the two boundaries that caused disagreement. <strong>This is not in
            use yet</strong>; it does not change the grading form. Review it, and tell me to adopt it
            when you&apos;re ready.
          </div>
          <pre className="rubric-full">{v2}</pre>
        </>
      )}
    </>
  );
}
