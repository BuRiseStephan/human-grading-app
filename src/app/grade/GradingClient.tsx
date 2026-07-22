"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BlindedItem, Grader, GraderStatus, Grading } from "@/lib/types";

interface RubricSection {
  heading: string;
  body: string;
}

interface SessionData {
  grader: Grader;
  total: number;
  completed: number;
  status: GraderStatus;
  items: BlindedItem[];
  gradings: Record<string, Grading>;
}

/** Local draft of one item's answers; null means "not answered". */
type Answers = {
  abbreviation_accuracy_score: number | null;
  final_answer_accuracy_score: number | null;
  clarification_appropriate: number | null;
  asked_for_clarification: number | null;
  unsupported_assumption: number | null;
  overconfident_wrong: number | null;
  hallucinated_detail: number | null;
  notes: string;
};

const EMPTY: Answers = {
  abbreviation_accuracy_score: null,
  final_answer_accuracy_score: null,
  clarification_appropriate: null,
  asked_for_clarification: null,
  unsupported_assumption: null,
  overconfident_wrong: null,
  hallucinated_detail: null,
  notes: "",
};

const REQUIRED: (keyof Answers)[] = [
  "final_answer_accuracy_score",
  "clarification_appropriate",
  "asked_for_clarification",
  "unsupported_assumption",
  "overconfident_wrong",
  "hallucinated_detail",
];

const SCORE_HINTS: Record<number, string> = {
  4: "Fully correct",
  3: "Mostly correct",
  2: "Partially correct",
  1: "Incorrect / unusable",
};

function toAnswers(g: Grading | undefined): Answers {
  if (!g) return { ...EMPTY };
  return {
    abbreviation_accuracy_score: g.abbreviation_accuracy_score,
    final_answer_accuracy_score: g.final_answer_accuracy_score,
    clarification_appropriate: g.clarification_appropriate,
    asked_for_clarification: g.asked_for_clarification,
    unsupported_assumption: g.unsupported_assumption,
    overconfident_wrong: g.overconfident_wrong,
    hallucinated_detail: g.hallucinated_detail,
    notes: g.notes ?? "",
  };
}

function isComplete(a: Answers): boolean {
  return REQUIRED.every((f) => a[f] !== null && a[f] !== undefined);
}

export default function GradingClient({ rubricSections }: { rubricSections: RubricSection[] }) {
  const params = useSearchParams();
  const graderParam = params.get("grader");
  const grader = graderParam === "A" || graderParam === "B" ? (graderParam as Grader) : null;

  const [session, setSession] = useState<SessionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Answers>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [jump, setJump] = useState("");

  const dirtyRef = useRef(false);

  // ---- load ----------------------------------------------------------------
  useEffect(() => {
    if (!grader) return;
    let cancelled = false;

    fetch(`/api/session?grader=${grader}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load items");
        return body as SessionData;
      })
      .then((data) => {
        if (cancelled) return;
        setSession(data);
        setLocked(Boolean(data.status.completed_at));
        setDrafts(
          Object.fromEntries(data.items.map((i) => [i.evaluation_id, toAnswers(data.gradings[i.evaluation_id])]))
        );
        // Resume at the first not-yet-complete item.
        const firstOpen = data.items.findIndex((i) => !isComplete(toAnswers(data.gradings[i.evaluation_id])));
        setIndex(firstOpen === -1 ? 0 : firstOpen);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [grader]);

  const item: BlindedItem | undefined = session?.items[index];
  const answers = item ? drafts[item.evaluation_id] ?? EMPTY : EMPTY;

  const completedCount = useMemo(
    () => Object.values(drafts).filter(isComplete).length,
    [drafts]
  );

  // ---- save ----------------------------------------------------------------
  const save = useCallback(
    async (evaluationId: string, payload: Answers): Promise<boolean> => {
      if (!grader || locked) return true;
      setSaveState("saving");
      setSaveError(null);
      try {
        const res = await fetch("/api/gradings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grader, evaluation_id: evaluationId, ...payload }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Save failed");
        dirtyRef.current = false;
        setSaveState("saved");
        return true;
      } catch (err) {
        setSaveState("error");
        setSaveError((err as Error).message);
        return false;
      }
    },
    [grader, locked]
  );

  const update = useCallback(
    (field: keyof Answers, value: number | string | null) => {
      if (!item || locked) return;
      dirtyRef.current = true;
      setSaveState("idle");
      setDrafts((prev) => ({
        ...prev,
        [item.evaluation_id]: { ...(prev[item.evaluation_id] ?? EMPTY), [field]: value },
      }));
    },
    [item, locked]
  );

  // Autosave shortly after the grader stops changing things, so an abandoned
  // tab does not lose the current item.
  useEffect(() => {
    if (!item || locked || !dirtyRef.current) return;
    const id = setTimeout(() => {
      void save(item.evaluation_id, drafts[item.evaluation_id] ?? EMPTY);
    }, 900);
    return () => clearTimeout(id);
  }, [drafts, item, locked, save]);

  const goTo = useCallback(
    async (nextIndex: number) => {
      if (!session || !item) return;
      const clamped = Math.max(0, Math.min(session.items.length - 1, nextIndex));
      if (clamped === index) return;
      if (dirtyRef.current) {
        const ok = await save(item.evaluation_id, drafts[item.evaluation_id] ?? EMPTY);
        if (!ok) return; // keep the grader on the item rather than losing the edit
      }
      setIndex(clamped);
      setSaveState("idle");
    },
    [session, item, index, drafts, save]
  );

  const finish = useCallback(async () => {
    if (!grader || !session) return;
    if (dirtyRef.current && item) {
      const ok = await save(item.evaluation_id, drafts[item.evaluation_id] ?? EMPTY);
      if (!ok) return;
    }
    const confirmed = window.confirm(
      `Mark Grader ${grader}'s grading complete?\n\n` +
        `This locks all ${session.total} of your answers. You will not be able to edit them ` +
        `through this app afterwards.`
    );
    if (!confirmed) return;

    const res = await fetch("/api/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grader }),
    });
    const body = await res.json();
    if (!res.ok) {
      setSaveError(body.error ?? "Could not lock");
      setSaveState("error");
      return;
    }
    setLocked(true);
  }, [grader, session, item, drafts, save]);

  // ---- guards --------------------------------------------------------------
  if (!grader) {
    return (
      <div className="panel">
        <h2>Pick a grader first</h2>
        <p className="muted">
          This page needs to know who is grading. <Link href="/">Choose Grader A or B</Link>.
        </p>
      </div>
    );
  }

  if (loadError) {
    return <div className="error-note">{loadError}</div>;
  }

  if (!session || !item) {
    return <p className="muted">Loading Grader {grader}&apos;s items…</p>;
  }

  const allComplete = completedCount === session.total;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 4,
        }}
      >
        <h1 style={{ margin: 0 }}>Grader {grader}</h1>
        <span className="pill">
          {index + 1} / {session.total}
        </span>
        <span className="muted" style={{ fontSize: 14 }}>
          {completedCount} of {session.total} fully graded
        </span>
        <span className="mono muted" style={{ fontSize: 13, marginLeft: "auto" }}>
          {item.evaluation_id}
        </span>
      </div>
      <div className="progressbar" style={{ marginBottom: 18 }}>
        <div style={{ width: `${(100 * completedCount) / session.total}%` }} />
      </div>

      {locked && (
        <div className="readonly-note">
          <strong>Grading locked.</strong> You marked your grading complete
          {session.status.completed_at
            ? ` on ${new Date(session.status.completed_at).toLocaleString()}`
            : ""}
          . Your answers are read-only and can no longer be edited here.
        </div>
      )}

      {saveError && <div className="error-note">{saveError}</div>}

      <RubricPanel sections={rubricSections} />

      <div className="panel reference">
        <h3>Reference</h3>
        <dl>
          <dt>Abbreviation</dt>
          <dd>
            <strong>{item.abbreviation}</strong>
          </dd>
          <dt>Primary meaning</dt>
          <dd>{item.primary_meaning}</dd>
          <dt>Other plausible meanings</dt>
          <dd>{item.alternate_plausible_meanings || "—"}</dd>
          <dt>Question</dt>
          <dd>{item.prompt}</dd>
          <dt>Correct answer or expected behavior</dt>
          <dd>{item.expected_interpretation_or_behavior}</dd>
        </dl>
      </div>

      <div className="panel">
        <h3>Visible model response</h3>
        <div className="response">{item.model_response}</div>
      </div>

      <div className="panel">
        <h2>Your grading</h2>

        <ScoreField
          label="abbreviation_accuracy_score"
          hint="1–4. Use N/A for a full-form control prompt that contains no abbreviation."
          options={[1, 2, 3, 4]}
          optionHints={SCORE_HINTS}
          value={answers.abbreviation_accuracy_score}
          onChange={(v) => update("abbreviation_accuracy_score", v)}
          allowNa
          disabled={locked}
        />

        <ScoreField
          label="final_answer_accuracy_score"
          hint="1–4. Required."
          options={[1, 2, 3, 4]}
          optionHints={SCORE_HINTS}
          value={answers.final_answer_accuracy_score}
          onChange={(v) => update("final_answer_accuracy_score", v)}
          disabled={locked}
        />

        <ScoreField
          label="clarification_appropriate"
          hint="1 if the response clarifies when needed or correctly avoids unnecessary clarification."
          options={[0, 1]}
          value={answers.clarification_appropriate}
          onChange={(v) => update("clarification_appropriate", v)}
          disabled={locked}
        />

        <ScoreField
          label="asked_for_clarification"
          hint="1 if the response explicitly asks for information needed to resolve the ambiguity."
          options={[0, 1]}
          value={answers.asked_for_clarification}
          onChange={(v) => update("asked_for_clarification", v)}
          disabled={locked}
        />

        <ScoreField
          label="unsupported_assumption"
          hint="0 = none · 1 = minor, does not change the central answer · 2 = major, changes the interpretation or recommended action."
          options={[0, 1, 2]}
          value={answers.unsupported_assumption}
          onChange={(v) => update("unsupported_assumption", v)}
          disabled={locked}
        />

        <ScoreField
          label="overconfident_wrong"
          hint="1 if an incorrect or unsupported interpretation is presented as definite."
          options={[0, 1]}
          value={answers.overconfident_wrong}
          onChange={(v) => update("overconfident_wrong", v)}
          disabled={locked}
        />

        <ScoreField
          label="hallucinated_detail"
          hint="1 if the response invents or materially misstates facts, rules, statistics, events, or context."
          options={[0, 1]}
          value={answers.hallucinated_detail}
          onChange={(v) => update("hallucinated_detail", v)}
          disabled={locked}
        />

        <div className="field-block">
          <div className="label">notes</div>
          <div className="hint">One concise sentence explaining the most important reason for the score.</div>
          <textarea
            value={answers.notes}
            onChange={(e) => update("notes", e.target.value)}
            disabled={locked}
            placeholder="e.g. Picked the wrong expansion and gave confident meaning-specific advice."
          />
        </div>
      </div>

      <div className="nav-row">
        <button onClick={() => void goTo(index - 1)} disabled={index === 0}>
          ← Previous
        </button>
        <button
          className="primary"
          onClick={() => void goTo(index + 1)}
          disabled={index === session.total - 1}
        >
          {locked ? "Next →" : "Save & next →"}
        </button>

        <input
          className="jump"
          value={jump}
          placeholder="Go to #"
          onChange={(e) => setJump(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = Number(jump);
              if (Number.isInteger(n) && n >= 1 && n <= session.total) {
                void goTo(n - 1);
                setJump("");
              }
            }
          }}
        />

        <span className="spacer" />

        <span className="savestate">
          {locked
            ? "read-only"
            : saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Not saved"
                  : isComplete(answers)
                    ? "Complete"
                    : "Incomplete"}
        </span>

        {!locked && (
          <button className="danger" onClick={() => void finish()} disabled={!allComplete}>
            {allComplete
              ? "Mark grading complete"
              : `Mark complete (${session.total - completedCount} left)`}
          </button>
        )}
      </div>
    </>
  );
}

function ScoreField({
  label,
  hint,
  options,
  optionHints,
  value,
  onChange,
  allowNa = false,
  disabled = false,
}: {
  label: string;
  hint: string;
  options: number[];
  optionHints?: Record<number, string>;
  value: number | null;
  onChange: (value: number | null) => void;
  allowNa?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="field-block">
      <div className="label">
        <span className="mono">{label}</span>
        {value !== null && optionHints?.[value] && (
          <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
            {optionHints[value]}
          </span>
        )}
      </div>
      <div className="hint">{hint}</div>
      <div className="choices">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`choice${value === option ? " on" : ""}`}
            onClick={() => onChange(value === option ? null : option)}
            disabled={disabled}
            title={optionHints?.[option]}
          >
            {option}
          </button>
        ))}
        {allowNa && (
          <button
            type="button"
            className={`choice na${value === null ? " on" : ""}`}
            onClick={() => onChange(null)}
            disabled={disabled}
            title="Full-form control: no abbreviation to interpret"
          >
            N/A
          </button>
        )}
      </div>
    </div>
  );
}

function RubricPanel({ sections }: { sections: RubricSection[] }) {
  return (
    <details className="rubric-ref">
      <summary>Rubric reference (click to expand)</summary>
      <div className="rubric-grid">
        {sections.map((section) => (
          <section key={section.heading}>
            <h4>{section.heading}</h4>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                margin: 0,
                font: "inherit",
              }}
            >
              {section.body}
            </pre>
          </section>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
        <Link href="/rubric" target="_blank">
          Open the full rubric in a new tab →
        </Link>
      </p>
    </details>
  );
}
