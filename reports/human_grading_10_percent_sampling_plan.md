# Human-Grading 10% Stratified Sample Plan

## Objective

Create a reproducible, blinded human-grading sample containing exactly 10% of the 4,800 successful model responses: **480 unique responses**. Both human graders must independently grade the **same 480 responses**, producing 960 individual grading decisions.

This task creates the grading packets and confidential sampling key. It must not alter any source workbook.

## Source Files

- Primary source workbook: `/Users/sumanthkaja/Documents/RiseSymposiumProject/qwen_abbreviation_study_graded.xlsx`
- Grading rubric: `/Users/sumanthkaja/.codex/attachments/54dc19ad-5408-488f-90b8-704924f244fe/pasted-text.txt`

Use the `Responses` sheet as the source of prompts, expected behavior, and visible model responses. Use `Rubric Scores` only to create the confidential key and, after human grading is complete, compare human scores with the existing LLM-judge scores.

Join the sheets by `run_id`. Never use the provisional LLM scores when selecting the primary human-validation sample.

## Sampling Frame

Include only rows satisfying all of the following:

- `status` is `success`.
- `run_id` is present and unique.
- `model_response` is present.
- The row belongs to the implemented `baseline` strategy.
- `model_key`, `variant`, and `domain` are present.

Expected eligible population: 4,800 responses.

## Stratification Design

Stratify by the complete cross-product of:

- 4 models: `qwen3_4b`, `qwen3_8b`, `qwen3_14b`, `qwen3_32b`
- 4 prompt variants: `full_form_control`, `abbreviation_only`, `contextual_abbreviation`, `domain_conflict_trick`
- 5 domains: Medicine, Law/business, Sports, General language/slang, Software/technology

This produces:

```text
4 models × 4 variants × 5 domains = 80 strata
```

Randomly select **6 responses without replacement from every stratum**:

```text
80 strata × 6 responses = 480 responses
```

Use the fixed sampling seed:

```text
20260719
```

The sampling algorithm must be deterministic: rerunning it against the unchanged source workbook with the same seed must select the same `run_id` values.

Do not replace a selected response because it appears easy, difficult, correct, incorrect, unusual, or inconsistent with its provisional AI grade. If a stratum contains fewer than six eligible responses, stop and report the problem rather than silently changing the design.

## Required Sampling Checks

The selected sample must satisfy all of these checks:

- Exactly 480 unique `run_id` values
- Exactly 6 responses per model × variant × domain stratum
- Exactly 120 responses per model
- Exactly 120 responses per prompt variant
- Exactly 96 responses per domain
- Exactly 30 responses per model × prompt-variant combination
- No duplicate `run_id` values
- No missing prompt, expected behavior, or visible model response
- All selected rows have `status = success`

Save a machine-readable table of these checks and the seed used.

## Blinding Requirements

Create a new anonymous identifier for each selected response:

```text
HG0001 through HG0480
```

The grader-facing packets must not reveal:

- `run_id`
- `model_key`, model name, model ID, or parameter count
- API gateway or provider
- prompt variant label
- domain label
- token usage, latency, cost, or reasoning content
- provisional LLM-judge scores or notes
- the other human grader's scores

Do not include `reasoning_content`; graders evaluate only the visible final response.

The grader-facing row should contain only the information needed to apply the rubric:

- `evaluation_id`
- `abbreviation`
- `primary_meaning`
- `alternate_plausible_meanings`
- `prompt`
- `expected_interpretation_or_behavior`
- `model_response`
- blank human-grading fields

Although the variant and domain are used for stratification, keep their labels out of the grader-facing packets. The prompt itself may naturally reveal its subject matter.

## Human-Grading Fields

Provide blank entry columns for:

- `abbreviation_accuracy_score` — integer 1–4, or blank/null for a full-form control
- `final_answer_accuracy_score` — integer 1–4
- `clarification_appropriate` — 0 or 1
- `asked_for_clarification` — 0 or 1
- `unsupported_assumption` — 0, 1, or 2
- `overconfident_wrong` — 0 or 1
- `hallucinated_detail` — 0 or 1
- `unsafe_or_risky` — 0 or 1
- `notes` — one concise explanatory sentence

If formulas are included, derive binary correctness exactly as follows:

- `final_answer_correct = 1` for a final-answer score of 3 or 4; otherwise `0`.
- `abbreviation_correct = 1` for an abbreviation score of 3 or 4; `0` for 1 or 2; blank/null for a full-form control.

Use spreadsheet data validation for all constrained grading fields. Include the complete grading rubric in an `Instructions` or `Rubric` sheet in each packet.

## Packet Construction

Create two separate grader-facing workbooks containing the same 480 sampled responses:

- `human_grading_packet_A.xlsx`
- `human_grading_packet_B.xlsx`

Assign the user's packet and the coauthor's packet only after the files are created. The two graders must not see each other's scores until both have completed and locked their grading.

The row order may be separately randomized in the two packets as long as `evaluation_id` remains unchanged. If separate order randomization is used, record the two order seeds in the confidential manifest.

Each packet should contain:

1. `Instructions` — independent-grading and blinding instructions
2. `Rubric` — the complete 1–4 rubric and all field definitions
3. `Human Grading` — the 480 anonymous items and blank grading fields

Freeze the header row, enable filters, wrap long text, and make prompts, references, and responses readable. Visually verify that no text is clipped and no confidential fields appear.

## Confidential Key and Manifest

Create a separate file that is not given to either grader until independent grading is complete:

- `human_grading_sample_key.xlsx`

The key must map each `evaluation_id` to at least:

- `run_id`
- `model_key`
- `parameter_count_b`
- `variant`
- `domain`
- `set_id`
- `prompt_id`
- all existing provisional LLM-judge fields from `Rubric Scores`
- sampling seed and, if used, packet-order seeds

Include a `Stratum Checks` sheet demonstrating that every required sampling count passed.

## Independence Procedure

Both graders must:

1. Grade all 480 responses independently.
2. Use the same unchanged rubric.
3. Avoid discussing individual responses or edge cases during initial grading.
4. Avoid seeing model identity, experimental condition, AI scores, or the other grader's decisions.
5. Finalize and preserve their original scores before any adjudication.

After both packets are complete, merge them by `evaluation_id`. Preserve both original score sets unchanged.

## Agreement and Validation Analysis After Grading

Calculate at minimum:

- Exact human–human agreement for each 1–4 score
- Quadratic-weighted Cohen's kappa for `final_answer_accuracy_score`
- Quadratic-weighted Cohen's kappa for `abbreviation_accuracy_score`, excluding full-form controls
- Agreement for each binary or ordinal auxiliary field
- Each human grader versus the LLM judge
- Adjudicated human scores versus the LLM judge
- A 4 × 4 confusion matrix for human–human final-answer scores
- A 4 × 4 confusion matrix for adjudicated-human versus LLM-judge final-answer scores

Only after calculating the initial agreement should the two authors discuss disagreements. Produce a separate adjudicated score for each disagreement; never overwrite the original human scores.

## Required Deliverables

The next agent should deliver:

1. `human_grading_packet_A.xlsx`
2. `human_grading_packet_B.xlsx`
3. `human_grading_sample_key.xlsx`
4. A short sampling report stating:
   - eligible population size
   - selected sample size and percentage
   - stratification variables
   - number selected per stratum
   - random seed
   - all validation-check results
   - confirmation that the source workbook was not modified

Do not perform or simulate either human grader's judgments. The task is to construct the randomized, blinded grading materials only.
