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
            <strong>Hallucination rubric used in the re-grade round.</strong> This refined 0/1/2
            definition is what the <a href="/regrade">/regrade</a> page now shows for hallucination.
            The original grading terms above are unchanged.
          </div>
          <pre className="rubric-full">{v2}</pre>
        </>
      )}
    </>
  );
}
