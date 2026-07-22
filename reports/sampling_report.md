# Human-Grading 10% Stratified Sample — Sampling Report

Generated: 2026-07-21T00:38:11+00:00
Generator: `scripts/build_sample.py`
Source file: `/Users/stephansozkes/Downloads/qwen_abbreviation_study_responses.csv` (read-only; not modified)
Sampling seed: `20260719`

## Grading design

Both graders independently grade the **same** 480 responses, producing 960 grading decisions. Every response is double-graded, so the full set of agreement analyses in the plan's "Agreement and Validation Analysis" section is available: exact human–human agreement, quadratic-weighted Cohen's kappa for both 1–4 scores, agreement on each auxiliary field, and the human–human confusion matrix.

Both graders receive the **same** 480 items in a **single shared** randomized presentation order (`display_order`, seeded from the sampling seed). Grader A and Grader B therefore see identical items in identical sequence; only their independently entered scores differ.

## Population and sample

| Quantity | Value |
| --- | --- |
| Rows in source file | 4,800 |
| Eligible population (sampling frame) | 4,760 |
| Selected sample | 480 |
| Sample as % of eligible | 10.08% |
| Sample as % of source rows | 10.00% |
| Items per grader | 480 (both graders grade all) |
| Total grading decisions | 960 |

### Sampling-frame exclusions

| Filter | Rows failing |
| --- | --- |
| `status` != success | 0 |
| `strategy` != baseline | 0 |
| `run_id` blank | 0 |
| `run_id` duplicated | 0 |
| `model_response` blank | 40 |
| `model_key` / `variant` / `domain` blank | 0 |
| `prompt` / `expected_interpretation_or_behavior` blank | 0 |

> **Note.** The plan expects an eligible population of 4,800. The actual eligible population is **4,760** because 40 rows have an empty `model_response`, which the plan's sampling frame excludes ("`model_response` is present"). These rows are real study outcomes — an empty visible response is a gradeable failure under the rubric, which assigns `final_answer_accuracy_score` 1 to an empty response — but the frame as written removes them, so they are excluded here. Every stratum still has far more than the 6 eligible responses it needs, and all required per-model / per-variant / per-domain counts are unaffected. If the authors would rather have empty responses represented in the human sample, the frame must be amended and the sample regenerated.

## Stratification

Full cross-product of 4 models x 4 prompt variants x 5 domains = 80 strata, 
6 responses drawn without replacement per stratum. 
Both graders grade every selected response.

### Marginal counts

**Model**

| Model | Selected | Decisions (x2 graders) |
| --- | --- | --- |
| qwen3_14b | 120 | 240 |
| qwen3_32b | 120 | 240 |
| qwen3_4b | 120 | 240 |
| qwen3_8b | 120 | 240 |

**Prompt variant**

| Prompt variant | Selected | Decisions (x2 graders) |
| --- | --- | --- |
| abbreviation_only | 120 | 240 |
| contextual_abbreviation | 120 | 240 |
| domain_conflict_trick | 120 | 240 |
| full_form_control | 120 | 240 |

**Domain**

| Domain | Selected | Decisions (x2 graders) |
| --- | --- | --- |
| General language/slang | 96 | 192 |
| Law/business | 96 | 192 |
| Medicine | 96 | 192 |
| Software/technology | 96 | 192 |
| Sports | 96 | 192 |

### Per-stratum counts (all 80 strata)

| Model | Variant | Domain | Eligible pool | Selected |
| --- | --- | --- | --- | --- |
| qwen3_4b | full_form_control | Medicine | 60 | 6 |
| qwen3_4b | full_form_control | Law/business | 60 | 6 |
| qwen3_4b | full_form_control | Sports | 47 | 6 |
| qwen3_4b | full_form_control | General language/slang | 60 | 6 |
| qwen3_4b | full_form_control | Software/technology | 60 | 6 |
| qwen3_4b | abbreviation_only | Medicine | 60 | 6 |
| qwen3_4b | abbreviation_only | Law/business | 60 | 6 |
| qwen3_4b | abbreviation_only | Sports | 60 | 6 |
| qwen3_4b | abbreviation_only | General language/slang | 60 | 6 |
| qwen3_4b | abbreviation_only | Software/technology | 60 | 6 |
| qwen3_4b | contextual_abbreviation | Medicine | 60 | 6 |
| qwen3_4b | contextual_abbreviation | Law/business | 59 | 6 |
| qwen3_4b | contextual_abbreviation | Sports | 53 | 6 |
| qwen3_4b | contextual_abbreviation | General language/slang | 59 | 6 |
| qwen3_4b | contextual_abbreviation | Software/technology | 59 | 6 |
| qwen3_4b | domain_conflict_trick | Medicine | 58 | 6 |
| qwen3_4b | domain_conflict_trick | Law/business | 58 | 6 |
| qwen3_4b | domain_conflict_trick | Sports | 57 | 6 |
| qwen3_4b | domain_conflict_trick | General language/slang | 56 | 6 |
| qwen3_4b | domain_conflict_trick | Software/technology | 58 | 6 |
| qwen3_8b | full_form_control | Medicine | 60 | 6 |
| qwen3_8b | full_form_control | Law/business | 60 | 6 |
| qwen3_8b | full_form_control | Sports | 60 | 6 |
| qwen3_8b | full_form_control | General language/slang | 60 | 6 |
| qwen3_8b | full_form_control | Software/technology | 60 | 6 |
| qwen3_8b | abbreviation_only | Medicine | 60 | 6 |
| qwen3_8b | abbreviation_only | Law/business | 60 | 6 |
| qwen3_8b | abbreviation_only | Sports | 60 | 6 |
| qwen3_8b | abbreviation_only | General language/slang | 60 | 6 |
| qwen3_8b | abbreviation_only | Software/technology | 60 | 6 |
| qwen3_8b | contextual_abbreviation | Medicine | 60 | 6 |
| qwen3_8b | contextual_abbreviation | Law/business | 60 | 6 |
| qwen3_8b | contextual_abbreviation | Sports | 60 | 6 |
| qwen3_8b | contextual_abbreviation | General language/slang | 60 | 6 |
| qwen3_8b | contextual_abbreviation | Software/technology | 60 | 6 |
| qwen3_8b | domain_conflict_trick | Medicine | 60 | 6 |
| qwen3_8b | domain_conflict_trick | Law/business | 60 | 6 |
| qwen3_8b | domain_conflict_trick | Sports | 60 | 6 |
| qwen3_8b | domain_conflict_trick | General language/slang | 60 | 6 |
| qwen3_8b | domain_conflict_trick | Software/technology | 60 | 6 |
| qwen3_14b | full_form_control | Medicine | 60 | 6 |
| qwen3_14b | full_form_control | Law/business | 60 | 6 |
| qwen3_14b | full_form_control | Sports | 58 | 6 |
| qwen3_14b | full_form_control | General language/slang | 60 | 6 |
| qwen3_14b | full_form_control | Software/technology | 60 | 6 |
| qwen3_14b | abbreviation_only | Medicine | 60 | 6 |
| qwen3_14b | abbreviation_only | Law/business | 60 | 6 |
| qwen3_14b | abbreviation_only | Sports | 60 | 6 |
| qwen3_14b | abbreviation_only | General language/slang | 60 | 6 |
| qwen3_14b | abbreviation_only | Software/technology | 60 | 6 |
| qwen3_14b | contextual_abbreviation | Medicine | 60 | 6 |
| qwen3_14b | contextual_abbreviation | Law/business | 60 | 6 |
| qwen3_14b | contextual_abbreviation | Sports | 60 | 6 |
| qwen3_14b | contextual_abbreviation | General language/slang | 60 | 6 |
| qwen3_14b | contextual_abbreviation | Software/technology | 60 | 6 |
| qwen3_14b | domain_conflict_trick | Medicine | 59 | 6 |
| qwen3_14b | domain_conflict_trick | Law/business | 60 | 6 |
| qwen3_14b | domain_conflict_trick | Sports | 60 | 6 |
| qwen3_14b | domain_conflict_trick | General language/slang | 60 | 6 |
| qwen3_14b | domain_conflict_trick | Software/technology | 60 | 6 |
| qwen3_32b | full_form_control | Medicine | 60 | 6 |
| qwen3_32b | full_form_control | Law/business | 60 | 6 |
| qwen3_32b | full_form_control | Sports | 60 | 6 |
| qwen3_32b | full_form_control | General language/slang | 60 | 6 |
| qwen3_32b | full_form_control | Software/technology | 60 | 6 |
| qwen3_32b | abbreviation_only | Medicine | 60 | 6 |
| qwen3_32b | abbreviation_only | Law/business | 60 | 6 |
| qwen3_32b | abbreviation_only | Sports | 60 | 6 |
| qwen3_32b | abbreviation_only | General language/slang | 60 | 6 |
| qwen3_32b | abbreviation_only | Software/technology | 60 | 6 |
| qwen3_32b | contextual_abbreviation | Medicine | 60 | 6 |
| qwen3_32b | contextual_abbreviation | Law/business | 60 | 6 |
| qwen3_32b | contextual_abbreviation | Sports | 59 | 6 |
| qwen3_32b | contextual_abbreviation | General language/slang | 60 | 6 |
| qwen3_32b | contextual_abbreviation | Software/technology | 60 | 6 |
| qwen3_32b | domain_conflict_trick | Medicine | 60 | 6 |
| qwen3_32b | domain_conflict_trick | Law/business | 60 | 6 |
| qwen3_32b | domain_conflict_trick | Sports | 60 | 6 |
| qwen3_32b | domain_conflict_trick | General language/slang | 60 | 6 |
| qwen3_32b | domain_conflict_trick | Software/technology | 60 | 6 |

## Validation checks

**Overall: ONE OR MORE CHECKS FAILED**

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Exactly 480 rows selected | 480 | 480 | PASS |
| Exactly 480 unique run_id values | 480 | 480 | PASS |
| No duplicate run_id values | 0 | 0 | PASS |
| Exactly 480 unique evaluation_id values | 480 | 480 | PASS |
| Number of strata populated | 80 | 80 | PASS |
| Every stratum has exactly 6 responses | True | True | PASS |
| Exactly 120 responses per model | True | True | PASS |
| All 4 models present | 4 | 4 | PASS |
| Exactly 120 responses per prompt variant | True | True | PASS |
| All 4 variants present | 4 | 4 | PASS |
| Exactly 96 responses per domain | True | True | PASS |
| All 5 domains present | 5 | 5 | PASS |
| Exactly 30 per model x variant | True | True | PASS |
| No missing prompt | 0 | 0 | PASS |
| No missing expected_interpretation_or_behavior | 0 | 0 | PASS |
| No missing model_response | 0 | 0 | PASS |
| All selected rows have status = success | True | True | PASS |
| All selected rows are baseline strategy | True | True | PASS |
| Both graders grade all 480 responses | 480 | 480 | PASS |
| Total grading decisions | 960 | 960 | PASS |
| Shared display order is a permutation of 1..480 | True | True | PASS |
| Every evaluation_id maps to exactly one display position | 480 | 480 | PASS |
| Eligible population equals the plan's expected 4,800 | 4800 | 4760 | FAIL |

## Blinding

`data/blinded_items.json` contains only:

- `evaluation_id`
- `display_order`
- `abbreviation`
- `primary_meaning`
- `alternate_plausible_meanings`
- `prompt`
- `expected_interpretation_or_behavior`
- `model_response`

Stripped from the grader-facing file: `run_id`, `model_key`, `model_id`, `parameter_count_b`, `api_gateway`, `provider`, `variant`, `domain`, `set_id`, `prompt_id`, all token / latency / cost metadata, `reasoning_content`, and every provisional LLM-judge score and note.

`evaluation_id` values were assigned after a global shuffle, so adjacent HG numbers do not share a stratum. Both graders share one randomized presentation order derived from the same seed.

## Reproducibility

Rerunning `python3 scripts/build_sample.py` against the unchanged source CSV with seed `20260719` selects the same 480 `run_id` values and produces the same `evaluation_id` mapping and the same shared display order. Each stratum is seeded independently via SHA-256(seed | model | variant | domain), so selection does not depend on row order in the source file.

The source CSV is opened read-only and was not modified.
