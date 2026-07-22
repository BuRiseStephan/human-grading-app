import { countCompleted, getAllStatuses, getDb } from "@/lib/db";
import { countItemsForGrader } from "@/lib/items";
import { keyExists } from "@/lib/key";
import { computeStats, type GraderStats } from "@/lib/stats";
import { GRADERS } from "@/lib/types";

export const dynamic = "force-dynamic";

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function StatsTable({ stats }: { stats: GraderStats }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            {stats.scopeLabels.map((label) => (
              <th key={label} style={{ textAlign: "right" }}>
                {label}
              </th>
            ))}
          </tr>
          <tr>
            <td className="muted" style={{ fontSize: 13 }}>
              items graded
            </td>
            {stats.scopeN.map((n, i) => (
              <td key={i} className="muted mono" style={{ textAlign: "right", fontSize: 13 }}>
                {n}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.metrics.map((m) => (
            <tr key={m.label}>
              <td>
                {m.label}
                <div className="muted" style={{ fontSize: 12 }}>
                  {m.note}
                </div>
              </td>
              {m.values.map((v, i) => (
                <td key={i} className="mono" style={{ textAlign: "right" }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResultsPage() {
  const db = getDb();
  const statuses = getAllStatuses();

  const rows = GRADERS.map((grader) => {
    const status = statuses.find((s) => s.grader === grader)!;
    const last = db
      .prepare("SELECT MAX(updated_at) AS t FROM gradings WHERE grader = ?")
      .get(grader) as { t: string | null };
    return {
      grader,
      total: countItemsForGrader(grader),
      completed: countCompleted(grader),
      started_at: status.started_at,
      completed_at: status.completed_at,
      locked: Boolean(status.completed_at),
      last_activity: last.t,
    };
  });

  const bothLocked = rows.every((r) => r.locked);
  const openGraders = rows.filter((r) => !r.locked).map((r) => r.grader);

  // Variant breakdown needs the confidential key, so only compute it once both
  // graders are locked (grading done) and the key is present.
  const stats = bothLocked && keyExists() ? computeStats() : null;

  return (
    <>
      <h1>Progress &amp; export</h1>
      <p className="sub">
        Admin view. Grading progress is always visible; the merged export unlocks only after both
        graders have marked their grading complete.
      </p>

      <div className="panel">
        <h3>Progress</h3>
        <table>
          <thead>
            <tr>
              <th>Grader</th>
              <th>Graded</th>
              <th>Started</th>
              <th>Last activity</th>
              <th>Locked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.grader}>
                <td>
                  <strong>Grader {r.grader}</strong>
                </td>
                <td>
                  {r.completed} / {r.total}
                  <div className="progressbar" style={{ width: 140 }}>
                    <div style={{ width: `${r.total ? (100 * r.completed) / r.total : 0}%` }} />
                  </div>
                </td>
                <td className="muted">{fmt(r.started_at)}</td>
                <td className="muted">{fmt(r.last_activity)}</td>
                <td>
                  {r.locked ? (
                    <span className="pill locked">locked {fmt(r.completed_at)}</span>
                  ) : (
                    <span className="pill open">open</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Human-graded statistics</h3>
        {stats ? (
          <>
            <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
              Each grader&apos;s rates across all 480 items, and separately within each prompt
              variant. Percentages are over items with a value for that field (e.g. abbreviation
              accuracy excludes full-form controls, which have no abbreviation). Grader A and B are
              shown separately — do not average them; use the merged export for agreement analysis.
            </p>
            {stats.map((s) => (
              <div key={s.grader} style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: 15, marginBottom: 8 }}>Grader {s.grader}</h2>
                <StatsTable stats={s} />
              </div>
            ))}
          </>
        ) : (
          <div className="readonly-note" style={{ marginBottom: 0 }}>
            <strong>Statistics unlock once both graders finish.</strong> The per-variant breakdown
            needs the confidential key, which stays sealed until grading is complete. Still grading:
            Grader {openGraders.join(", Grader ")}.
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Merged export</h3>
        {!keyExists() && (
          <div className="error-note">
            Confidential key not found at <code>data/human_grading_sample_key.csv</code>. Run{" "}
            <code>python3 scripts/build_sample.py</code>.
          </div>
        )}

        {bothLocked ? (
          <>
            <div className="ok-note">
              Both graders are locked. The export merges both score sets by{" "}
              <code>evaluation_id</code> and joins them back to <code>run_id</code>,{" "}
              <code>model_key</code>, <code>variant</code>, and <code>domain</code> using the
              confidential key.
            </div>
            <p>
              <a href="/api/export" download>
                <button className="primary">Download human_grading_merged.csv</button>
              </a>
            </p>
          </>
        ) : (
          <div className="readonly-note">
            <strong>Export locked.</strong> Still grading: Grader {openGraders.join(", Grader ")}.
            Model identity and the other grader&apos;s scores stay hidden until both finalize, so
            neither grader&apos;s judgments can be influenced by the experimental condition or by
            the other grader.
          </div>
        )}

        <h3 style={{ marginTop: 20 }}>What the export contains</h3>
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          One row per response — 480 rows carrying all 960 grading decisions, merged on{" "}
          <code>evaluation_id</code> with both graders&apos; original scores side by side.
          Identity columns: <code>run_id</code>, <code>model_key</code>,{" "}
          <code>parameter_count_b</code>, <code>variant</code>, <code>domain</code>,{" "}
          <code>set_id</code>, <code>prompt_id</code>, <code>abbreviation</code>. Then every rubric
          field twice, prefixed <code>grader_a_</code> and <code>grader_b_</code>, plus each
          grader&apos;s derived <code>final_answer_correct</code> and{" "}
          <code>abbreviation_correct</code>, notes, and <code>graded_at</code>.
        </p>

        <div className="ok-note" style={{ marginBottom: 0 }}>
          <strong>Every response is double-graded</strong>, so the side-by-side columns support the
          full agreement analysis: exact human–human agreement, quadratic-weighted Cohen&apos;s
          kappa for both 1–4 scores, per-field agreement, and the 4×4 confusion matrix. Neither
          original score set is modified — record adjudicated scores separately. The LLM-judge
          fields for the same items are in <code>data/human_grading_sample_key.csv</code>.
        </div>
      </div>
    </>
  );
}
