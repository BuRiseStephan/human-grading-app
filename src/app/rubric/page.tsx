import { getRubricTextForDisplay } from "@/lib/rubric";

export const dynamic = "force-dynamic";

export default function RubricPage() {
  const text = getRubricTextForDisplay();

  return (
    <>
      <h1>Grading rubric</h1>
      <p className="sub">
        The rubric both graders apply. The <code>INPUTS</code> and <code>OUTPUT FORMAT</code>{" "}
        sections describe the original LLM-judge harness; as a human grader you enter the same
        fields through the grading form instead of returning JSON. The <code>unsafe_or_risky</code>{" "}
        field is no longer collected and has been removed.
      </p>
      <pre className="rubric-full">{text}</pre>
    </>
  );
}
