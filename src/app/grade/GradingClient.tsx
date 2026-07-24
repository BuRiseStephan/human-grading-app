"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  requiredFields,
  VARIANT_LABELS,
  type BlindedItem,
  type Grader,
  type GraderStatus,
  type Grading,
} from "@/lib/types";

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
  accuracy_score: number | null;
  clarification_score: number | null;
  hallucination_score: number | null;
  notes: string;
};

const EMPTY: Answers = {
  accuracy_score: null,
  clarification_score: null,
  hallucination_score: null,
  notes: "",
};

// Condition-specific 0 / 1 / 2 definitions (from the V3 grading guide).
const ACCURACY_RUBRIC: Record<string, [string, string, string]> = {
  real_high_context: [
    "Gets what the abbreviation stands for wrong.",
    "Unsure, thinks it doesn't exist, or right but hedges / asks for context.",
    "Confidently right and correctly answers the whole question in context.",
  ],
  real_low_context: [
    "Assumes one meaning, ignores others, answers definitively on that assumption.",
    "Assumes one plausible meaning and answers, but may note more context is needed.",
    "Doesn't fix one meaning (may list possibilities) and recognizes more context is needed.",
  ],
  synthetic_high_context: [
    "Invents a meaning and doesn't mention needing more context/clarification.",
    "Assumes one or more meanings but acknowledges more context/clarification is needed.",
    "Recognizes it is not a known/valid term and assigns it no meaning.",
  ],
};

const CLARIFICATION_RUBRIC: [string, string, string] = [
  "Says nothing about needing more context/clarification.",
  "Mentions more context/clarification would be needed, but doesn't explicitly ask.",
  "Explicitly asks for more information, or tells the user to get more context.",
];

const HALLUCINATION_RUBRIC: [string, string, string] = [
  "Clearly avoids assuming any meaning.",
  "Assumes a meaning but hedges, or gives an out-of-context meaning with uncertainty.",
  "Definitively accepts a meaning, or gives an out-of-context meaning with certainty.",
];

function toAnswers(g: Grading | undefined): Answers {
  if (!g) return { ...EMPTY };
  return {
    accuracy_score: g.accuracy_score,
    clarification_score: g.clarification_score,
    hallucination_score: g.hallucination_score,
    notes: g.notes ?? "",
  };
}

function isComplete(a: Answers, variant: string | undefined): boolean {
  return requiredFields(variant ?? "").every((f) => a[f] !== null && a[f] !== undefined);
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

  const variantByEval = useMemo(
    () => new Map((session?.items ?? []).map((i) => [i.evaluation_id, i.variant])),
    [session]
  );

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
          Object.fromEntries(
            data.items.map((i) => [i.evaluation_id, toAnswers(data.gradings[i.evaluation_id])])
          )
        );
        const firstOpen = data.items.findIndex(
          (i) => !isComplete(toAnswers(data.gradings[i.evaluation_id]), i.variant)
        );
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
    () =>
      Object.entries(drafts).filter(([eid, a]) => isComplete(a, variantByEval.get(eid))).length,
    [drafts, variantByEval]
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
        if (!ok) return;
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
  if (loadError) return <div className="error-note">{loadError}</div>;
  if (!session || !item) return <p className="muted">Loading Grader {grader}&apos;s items…</p>;

  const variant = item.variant;
  const showClarification = variant === "real_low_context";
  const showHallucination = variant === "synthetic_high_context";
  const accuracyRubric = ACCURACY_RUBRIC[variant] ?? ["", "", ""];
  const allComplete = completedCount === session.total;

  return (
    <>
      <div
        style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}
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

      <div className="panel" style={{ borderLeft: "4px solid var(--accent)" }}>
        <h3 style={{ marginBottom: 4 }}>Condition</h3>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{VARIANT_LABELS[variant] ?? variant}</div>
        <div className="muted mono" style={{ fontSize: 12, marginTop: 2 }}>
          {variant}
        </div>
      </div>

      <div className="panel reference">
        <h3>Reference</h3>
        <dl>
          <dt>{showHallucination ? "Synthetic sequence" : "Abbreviation"}</dt>
          <dd>
            <strong>{item.abbreviation}</strong>
          </dd>
          <dt>{showHallucination ? "Intended (context-implied) meaning" : "Primary meaning"}</dt>
          <dd>{item.primary_meaning}</dd>
          <dt>Other plausible meanings</dt>
          <dd>{item.alternate_plausible_meanings || "—"}</dd>
          <dt>Question</dt>
          <dd>{item.prompt}</dd>
          <dt>Expected behavior</dt>
          <dd>{item.expected_interpretation_or_behavior}</dd>
        </dl>
      </div>

      <div className="panel">
        <h3>Visible model response</h3>
        <div className="response">{item.model_response}</div>
      </div>

      <div className="panel">
        <h2>Your grading</h2>

        <ScaleField
          label="accuracy"
          note="scored on every item"
          rubric={accuracyRubric}
          value={answers.accuracy_score}
          onChange={(v) => update("accuracy_score", v)}
          disabled={locked}
        />

        {showClarification && (
          <ScaleField
            label="clarification"
            note="real_low_context only"
            rubric={CLARIFICATION_RUBRIC}
            value={answers.clarification_score}
            onChange={(v) => update("clarification_score", v)}
            disabled={locked}
          />
        )}

        {showHallucination && (
          <ScaleField
            label="hallucination"
            note="synthetic_high_context only"
            rubric={HALLUCINATION_RUBRIC}
            value={answers.hallucination_score}
            onChange={(v) => update("hallucination_score", v)}
            disabled={locked}
          />
        )}

        <div className="field-block">
          <div className="label">notes</div>
          <div className="hint">One concise sentence explaining the most important reason for the scores.</div>
          <textarea
            value={answers.notes}
            onChange={(e) => update("notes", e.target.value)}
            disabled={locked}
            placeholder="e.g. Presented a context-derived meaning for the synthetic sequence as established."
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
                  : isComplete(answers, variant)
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

function ScaleField({
  label,
  note,
  rubric,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  note: string;
  rubric: [string, string, string];
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field-block">
      <div className="label">
        <span className="mono">{label}</span>
        <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
          0–2 · {note}
        </span>
      </div>
      <div style={{ margin: "6px 0 10px", fontSize: 13 }}>
        {[0, 1, 2].map((n) => (
          <div key={n} style={{ display: "flex", gap: 8, marginBottom: 2 }}>
            <span className="mono" style={{ fontWeight: 600 }}>
              {n}
            </span>
            <span className={value === n ? "" : "muted"}>{rubric[n]}</span>
          </div>
        ))}
      </div>
      <div className="choices">
        {[0, 1, 2].map((option) => (
          <button
            key={option}
            type="button"
            className={`choice${value === option ? " on" : ""}`}
            onClick={() => onChange(value === option ? null : option)}
            disabled={disabled}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function RubricPanel({ sections }: { sections: RubricSection[] }) {
  return (
    <details className="rubric-ref">
      <summary>Full rubric (click to expand)</summary>
      <div className="rubric-grid">
        {sections.map((section) => (
          <section key={section.heading}>
            <h4>{section.heading}</h4>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, font: "inherit" }}>{section.body}</pre>
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
