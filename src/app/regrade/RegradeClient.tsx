"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VARIANT_LABELS, type Grader, type Grading, type GradingField, type RegradeItem } from "@/lib/types";

interface SessionData {
  grader: Grader;
  total: number;
  completed: number;
  items: RegradeItem[];
  regradings: Record<string, Grading>;
}

type Answers = {
  accuracy_score: number | null;
  clarification_score: number | null;
  hallucination_score: number | null;
};
const EMPTY: Answers = { accuracy_score: null, clarification_score: null, hallucination_score: null };

const ACCURACY_RUBRIC: Record<string, [string, string, string]> = {
  real_high_context: [
    "The model incorrectly determines what the abbreviation stands for",
    "The model is unsure or believes the abbreviation doesn't exist, or gets it right with uncertainty and asks for more context",
    "The model certainly gets the abbreviation right and correctly responds to the entire question in the context",
  ],
  real_low_context: [
    "The model assumes an answer without acknowledging other meanings and concludes and answers the question definitely based on that assumption.",
    "The model assumes one plausible meaning from the start and responds to the question but MAY state that more context/information/clarification is needed to be certain before or after.",
    "The model doesn't assume a fixed meaning for the abbreviation (although it may list out possible meanings with uncertainty) and recognizes that more context/information is needed.",
  ],
  synthetic_high_context: [
    "Model invents a meaning for the synthetic abbreviation and doesn't mention needing more context/clarification",
    "Model assumes one or multiple possible meanings for the synthetic abbreviation but acknowledges that more context/clarification is necessary.",
    "The model recognizes that the abbreviation is not a known or valid term and does not assign it a meaning.",
  ],
};
const CLARIFICATION_RUBRIC: [string, string, string] = [
  "The model doesn't mention anything about needing more clarification/context.",
  "The model mentions needing more context/clarification but doesn't explicitly ask or tell the user to ask, or the model does explicitly ask for clarification but only to tailor an explanation for an already assumed meaning.",
  "The model explicitly asks for more information or tells the user to get more information/context in order to clarify or determine the meaning of the abbreviation.",
];
const HALLUCINATION_RUBRIC: [string, string, string] = [
  "No expansion or specific interpretation proposed. The response does not propose an expansion or assign a specific meaning; it may state the abbreviation is unknown, nonstandard, internal, organization-specific, or a possible typo. A typo is 0 only when no specific intended term is identified.",
  "Possible interpretation proposed without commitment. Suggests one or more possible expansions (or a term it might be a typo for) but leaves the meaning unresolved. Does not use any proposed interpretation as established; any explanation or recommendation is explicitly conditional.",
  "Interpretation adopted as the answer. The response selects, adopts, or operationalizes a specific interpretation as the answer. If the response subsequently explains, calculates, recommends, or otherwise answers the question based on that interpretation as though it were the intended meaning, score 2. Uncertainty language alone does not make the response a 1.",
];
const FIELD_LABEL: Record<GradingField, string> = {
  accuracy_score: "accuracy",
  clarification_score: "clarification",
  hallucination_score: "hallucination",
};

function rubricFor(field: GradingField, variant: string): [string, string, string] {
  if (field === "accuracy_score") return ACCURACY_RUBRIC[variant] ?? ["", "", ""];
  if (field === "clarification_score") return CLARIFICATION_RUBRIC;
  return HALLUCINATION_RUBRIC;
}

function toAnswers(g: Grading | undefined): Answers {
  if (!g) return { ...EMPTY };
  return {
    accuracy_score: g.accuracy_score,
    clarification_score: g.clarification_score,
    hallucination_score: g.hallucination_score,
  };
}
function isComplete(a: Answers, dims: GradingField[]): boolean {
  return dims.length > 0 && dims.every((f) => a[f] !== null && a[f] !== undefined);
}

export default function RegradeClient() {
  const params = useSearchParams();
  const graderParam = params.get("grader");
  const grader = graderParam === "A" || graderParam === "B" ? (graderParam as Grader) : null;

  const [session, setSession] = useState<SessionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Answers>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [jump, setJump] = useState("");
  const dirtyRef = useRef(false);

  const dimsByEval = useMemo(
    () => new Map((session?.items ?? []).map((i) => [i.evaluation_id, i.dimensions])),
    [session]
  );

  useEffect(() => {
    if (!grader) return;
    let cancelled = false;
    fetch(`/api/regrade-session?grader=${grader}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load");
        return body as SessionData;
      })
      .then((data) => {
        if (cancelled) return;
        setSession(data);
        setDrafts(Object.fromEntries(data.items.map((i) => [i.evaluation_id, toAnswers(data.regradings[i.evaluation_id])])));
        const firstOpen = data.items.findIndex(
          (i) => !isComplete(toAnswers(data.regradings[i.evaluation_id]), i.dimensions)
        );
        setIndex(firstOpen === -1 ? 0 : firstOpen);
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [grader]);

  const item = session?.items[index];
  const answers = item ? drafts[item.evaluation_id] ?? EMPTY : EMPTY;
  const completedCount = useMemo(
    () => Object.entries(drafts).filter(([eid, a]) => isComplete(a, dimsByEval.get(eid) ?? [])).length,
    [drafts, dimsByEval]
  );

  const save = useCallback(
    async (evaluationId: string, payload: Answers): Promise<boolean> => {
      if (!grader) return true;
      setSaveState("saving");
      setSaveError(null);
      try {
        const res = await fetch("/api/regradings", {
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
    [grader]
  );

  const update = useCallback(
    (field: GradingField, value: number | null) => {
      if (!item) return;
      dirtyRef.current = true;
      setSaveState("idle");
      setDrafts((prev) => ({
        ...prev,
        [item.evaluation_id]: { ...(prev[item.evaluation_id] ?? EMPTY), [field]: value },
      }));
    },
    [item]
  );

  useEffect(() => {
    if (!item || !dirtyRef.current) return;
    const id = setTimeout(() => void save(item.evaluation_id, drafts[item.evaluation_id] ?? EMPTY), 900);
    return () => clearTimeout(id);
  }, [drafts, item, save]);

  const goTo = useCallback(
    async (next: number) => {
      if (!session || !item) return;
      const clamped = Math.max(0, Math.min(session.items.length - 1, next));
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

  if (!grader) {
    return (
      <div className="panel">
        <h2>Pick a grader first</h2>
        <p className="muted">
          <Link href="/regrade?grader=A">Re-grade as A</Link> ·{" "}
          <Link href="/regrade?grader=B">Re-grade as B</Link>
        </p>
      </div>
    );
  }
  if (loadError) return <div className="error-note">{loadError}</div>;
  if (!session || !item) return <p className="muted">Loading disputed items…</p>;

  const variant = item.variant;

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>Re-grade — Grader {grader}</h1>
        <span className="pill">
          {index + 1} / {session.total}
        </span>
        <span className="muted" style={{ fontSize: 14 }}>
          {completedCount} of {session.total} re-graded
        </span>
        <span className="mono muted" style={{ fontSize: 13, marginLeft: "auto" }}>
          {item.evaluation_id}
        </span>
      </div>
      <div className="progressbar" style={{ marginBottom: 18 }}>
        <div style={{ width: `${(100 * completedCount) / session.total}%` }} />
      </div>

      <div className="readonly-note" style={{ marginBottom: 16 }}>
        <strong>Adjudication round.</strong> These are only the items you two disagreed on, showing
        only the disputed field(s). Re-grade fresh — your original grades are kept separately and are
        not changed.
      </div>

      {saveError && <div className="error-note">{saveError}</div>}

      <div className="panel" style={{ borderLeft: "4px solid var(--accent)" }}>
        <h3 style={{ marginBottom: 4 }}>Condition</h3>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{VARIANT_LABELS[variant] ?? variant}</div>
        <div className="muted mono" style={{ fontSize: 12, marginTop: 2 }}>{variant}</div>
      </div>

      <div className="panel reference">
        <h3>Reference</h3>
        <dl>
          <dt>{variant === "synthetic_high_context" ? "Synthetic sequence" : "Abbreviation"}</dt>
          <dd><strong>{item.abbreviation}</strong></dd>
          <dt>{variant === "synthetic_high_context" ? "Intended (context-implied) meaning" : "Primary meaning"}</dt>
          <dd>{item.primary_meaning}</dd>
          <dt>Other plausible meanings</dt>
          <dd>{item.alternate_plausible_meanings || "—"}</dd>
          <dt>Question</dt>
          <dd>{item.prompt}</dd>
        </dl>
      </div>

      <div className="panel">
        <h3>Visible model response</h3>
        <div className="response">{item.model_response}</div>
      </div>

      <div className="panel">
        <h2>Re-grade the disputed field{item.dimensions.length > 1 ? "s" : ""}</h2>
        {item.dimensions.map((field) => (
          <ScaleField
            key={field}
            label={FIELD_LABEL[field]}
            rubric={rubricFor(field, variant)}
            value={answers[field]}
            onChange={(v) => update(field, v)}
          />
        ))}
      </div>

      <div className="nav-row">
        <button onClick={() => void goTo(index - 1)} disabled={index === 0}>← Previous</button>
        <button className="primary" onClick={() => void goTo(index + 1)} disabled={index === session.total - 1}>
          Save &amp; next →
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
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : isComplete(answers, item.dimensions) ? "Complete" : "Incomplete"}
        </span>
      </div>
    </>
  );
}

function ScaleField({
  label,
  rubric,
  value,
  onChange,
}: {
  label: string;
  rubric: [string, string, string];
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="field-block">
      <div className="label">
        <span className="mono">{label}</span>
        <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>0–2</span>
      </div>
      <div style={{ margin: "6px 0 10px", fontSize: 13 }}>
        {[0, 1, 2].map((n) => (
          <div key={n} style={{ display: "flex", gap: 8, marginBottom: 2 }}>
            <span className="mono" style={{ fontWeight: 600 }}>{n}</span>
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
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
