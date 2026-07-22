# Human Grading — Qwen Abbreviation Study

Blinded human grading of a 10% stratified sample (480 of 4,760 eligible responses) from the
Qwen abbreviation study, graded independently by two people on a home network.

## Design in one paragraph

The 4,800-row results CSV is filtered to an eligible frame, stratified by the full cross-product
of 4 models × 4 prompt variants × 5 domains (80 strata), and 6 responses are drawn per stratum
with seed `20260719`. **Both graders independently grade all 480 responses**, producing 960
grading decisions, so every response is double-graded and the full agreement analysis is
available. Each grader gets an independently randomized presentation order over the same items.
Graders see only the prompt, reference answer, and visible model response — never the model,
variant, domain, or the other grader's work.

## Setup

```bash
npm install
npm approve-scripts better-sqlite3   # only if npm blocked the native install script
python3 scripts/build_sample.py      # regenerate the sample (already committed)
```

Requires Python with `pandas`, and Node 20+.

## Running it for both graders

```bash
npm run lan     # next dev -H 0.0.0.0
```

Share `http://<your-LAN-IP>:3000` with your coauthor. The dev server prints the Network URL on
startup. Both laptops must be on the same wifi.

Each grader opens the landing page and picks **Grader A** or **Grader B**. There is no auth — the
selection is just a name, passed as `?grader=A`.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Pick Grader A or B; shows each grader's progress |
| `/grade?grader=A` | One item at a time from all 480, in that grader's own randomized order |
| `/rubric` | The complete rubric text |
| `/results` | Progress dashboard, and the merged CSV export once both graders lock |

## Grading flow

- Items appear one at a time in a per-grader randomized order (`display_order_A` /
  `display_order_B`, fixed by seed). Both graders see the same 480 items in different orders.
- Answers **autosave to SQLite** ~1s after you stop changing a field, and again on every
  navigation. Closing the tab loses nothing.
- **Previous / Save & next** move between items; the "Go to #" box jumps to any position. You can
  revisit and edit any item freely until you lock.
- Reopening the page resumes at your first not-yet-complete item.
- An item counts as complete when all seven required fields are answered.
  `abbreviation_accuracy_score` is optional — use **N/A** for a full-form control prompt that
  contains no abbreviation, which stores `NULL`.
- **Mark grading complete** unlocks only after all 480 are complete. It is confirmed by a dialog,
  and afterwards that grader's answers are read-only in the UI and rejected by the API.

## Export

`/results` → **Download human_grading_merged.csv**, enabled only once *both* graders lock. This
gate enforces the plan's independence procedure: model identity and the other grader's scores
stay hidden until both have finalized.

**480 rows, one per response**, carrying all 960 decisions merged on `evaluation_id` with both
score sets preserved side by side. Identity columns (`run_id`, `model_key`, `parameter_count_b`,
`variant`, `domain`, `set_id`, `prompt_id`, `abbreviation`) come from the confidential key, then
every rubric field twice under `grader_a_` / `grader_b_` prefixes, each with the derived binaries
(`final_answer_correct` = 1 when the score is 3 or 4; `abbreviation_correct` likewise, blank when
the abbreviation score is blank), notes, and `graded_at`.

Because the columns sit side by side, the plan's agreement analyses are direct comparisons:

```python
df = pd.read_csv("human_grading_merged.csv")
exact = (df.grader_a_final_answer_accuracy_score == df.grader_b_final_answer_accuracy_score).mean()
confusion = pd.crosstab(df.grader_a_final_answer_accuracy_score,
                        df.grader_b_final_answer_accuracy_score)
# quadratic-weighted kappa: sklearn.metrics.cohen_kappa_score(a, b, weights="quadratic")
# for abbreviation kappa, drop rows where either score is blank (full-form controls)
```

Join `data/human_grading_sample_key.csv` on `evaluation_id` to add the `llm_judge_*` fields for
human-vs-judge comparisons. Never overwrite either original score set — write adjudicated scores
to a separate column or file.

## Files

```
data/
  blinded_items.json            # committed — grader-facing, 480 items, no identity fields
  human_grading_rubric.txt      # committed — rubric source for /rubric and the in-page panel
  human_grading_sample_key.csv  # GITIGNORED, CONFIDENTIAL — evaluation_id → run_id/model/variant/domain
  grading.db                    # GITIGNORED — SQLite, created on first run
reports/
  sampling_report.md            # population, per-stratum counts, seed, validation checks
  sampling_checks.json          # machine-readable checks
scripts/
  build_sample.py               # Phase 1: sampling, blinding, key, report
```

### Confidentiality

`src/lib/key.ts` is the only module that reads the confidential key, and it is imported only by
`/api/export`. Grader-facing pages never touch it. `src/lib/items.ts` additionally re-checks
`blinded_items.json` at load time and refuses to serve if a forbidden field (`run_id`,
`model_key`, `variant`, `domain`, `reasoning_content`, …) ever reappears. `data/` is not inside
`public/`, so nothing in it is web-accessible.

Verified: no `run_id`, model name, or variant/domain label appears in any byte the browser
receives on the grading page.

## Reproducibility

`python3 scripts/build_sample.py` is deterministic. Each stratum is seeded independently by
SHA-256(seed | model | variant | domain), so the selection does not depend on row order in the
source CSV. Rerunning against the unchanged CSV reproduces the same 480 `run_id` values, the same
`evaluation_id` mapping, and the same two packet orders byte-for-byte.

The source CSV is opened read-only and is never modified.

> **Do not rerun `build_sample.py` once grading has started.** `evaluation_id` is assigned by a
> shuffle over the selected rows; changing the script's sampling logic can remap HG numbers to
> different `run_id`s, which would silently mis-attribute any scores already in `grading.db`.
> Regenerating is safe only while the database is empty.

## One thing to know

**Eligible population is 4,760, not the 4,800 the plan assumed.** 40 rows have an empty
`model_response`, which the plan's sampling frame excludes. Every stratum still has far more than
the 6 it needs and all required counts hold, but those 40 empty responses — arguably a real
failure mode worth grading, and one the rubric explicitly scores 1 — are not represented. Amend
the frame in `load_frame()` and rerun if you want them in.
