# Human-Grading Sample — Report

Generated: 2026-07-24T17:14:55+00:00
Source: `/private/tmp/claude-501/-Users-stephansozkes-HumanGradingAppRISEPracticumDataScience/d87de3d7-73f5-476e-a95f-f24a4b26740b/scratchpad/v3_clean.csv` (read-only)
Seed: `20260719`  ·  Per-stratum: 10% of each stratum

## Design

Both graders independently grade the **same 360** responses in one shared randomized order, for **720** grading decisions. Every response is double-graded, so human–human agreement and Cohen's kappa are available.

## Population

| Quantity | Value |
| --- | --- |
| Rows in source | 3,545 |
| Eligible (sampling frame) | 3,545 |
| Selected | 360 |
| Selected as % of eligible | 10.16% |
| Models × variants × domains | 4 × 3 × 5 = 60 strata |

## Marginal counts

**Model**

| Model | Selected | Decisions (×2) |
| --- | --- | --- |
| qwen3_14b | 90 | 180 |
| qwen3_32b | 90 | 180 |
| qwen3_4b | 90 | 180 |
| qwen3_8b | 90 | 180 |

**Prompt variant**

| Prompt variant | Selected | Decisions (×2) |
| --- | --- | --- |
| real_high_context | 120 | 240 |
| real_low_context | 120 | 240 |
| synthetic_high_context | 120 | 240 |

**Domain**

| Domain | Selected | Decisions (×2) |
| --- | --- | --- |
| General language/slang | 72 | 144 |
| Law/business | 72 | 144 |
| Medicine | 72 | 144 |
| Software/technology | 72 | 144 |
| Sports | 72 | 144 |

## Per-stratum counts

| Model | Variant | Domain | Eligible pool | Selected |
| --- | --- | --- | --- | --- |
| qwen3_14b | real_high_context | General language/slang | 59 | 6 |
| qwen3_14b | real_high_context | Law/business | 60 | 6 |
| qwen3_14b | real_high_context | Medicine | 60 | 6 |
| qwen3_14b | real_high_context | Software/technology | 60 | 6 |
| qwen3_14b | real_high_context | Sports | 60 | 6 |
| qwen3_14b | real_low_context | General language/slang | 60 | 6 |
| qwen3_14b | real_low_context | Law/business | 59 | 6 |
| qwen3_14b | real_low_context | Medicine | 57 | 6 |
| qwen3_14b | real_low_context | Software/technology | 60 | 6 |
| qwen3_14b | real_low_context | Sports | 60 | 6 |
| qwen3_14b | synthetic_high_context | General language/slang | 60 | 6 |
| qwen3_14b | synthetic_high_context | Law/business | 60 | 6 |
| qwen3_14b | synthetic_high_context | Medicine | 60 | 6 |
| qwen3_14b | synthetic_high_context | Software/technology | 60 | 6 |
| qwen3_14b | synthetic_high_context | Sports | 60 | 6 |
| qwen3_32b | real_high_context | General language/slang | 60 | 6 |
| qwen3_32b | real_high_context | Law/business | 60 | 6 |
| qwen3_32b | real_high_context | Medicine | 60 | 6 |
| qwen3_32b | real_high_context | Software/technology | 60 | 6 |
| qwen3_32b | real_high_context | Sports | 60 | 6 |
| qwen3_32b | real_low_context | General language/slang | 59 | 6 |
| qwen3_32b | real_low_context | Law/business | 60 | 6 |
| qwen3_32b | real_low_context | Medicine | 58 | 6 |
| qwen3_32b | real_low_context | Software/technology | 60 | 6 |
| qwen3_32b | real_low_context | Sports | 59 | 6 |
| qwen3_32b | synthetic_high_context | General language/slang | 59 | 6 |
| qwen3_32b | synthetic_high_context | Law/business | 59 | 6 |
| qwen3_32b | synthetic_high_context | Medicine | 59 | 6 |
| qwen3_32b | synthetic_high_context | Software/technology | 60 | 6 |
| qwen3_32b | synthetic_high_context | Sports | 57 | 6 |
| qwen3_4b | real_high_context | General language/slang | 59 | 6 |
| qwen3_4b | real_high_context | Law/business | 58 | 6 |
| qwen3_4b | real_high_context | Medicine | 60 | 6 |
| qwen3_4b | real_high_context | Software/technology | 60 | 6 |
| qwen3_4b | real_high_context | Sports | 59 | 6 |
| qwen3_4b | real_low_context | General language/slang | 59 | 6 |
| qwen3_4b | real_low_context | Law/business | 60 | 6 |
| qwen3_4b | real_low_context | Medicine | 57 | 6 |
| qwen3_4b | real_low_context | Software/technology | 60 | 6 |
| qwen3_4b | real_low_context | Sports | 60 | 6 |
| qwen3_4b | synthetic_high_context | General language/slang | 57 | 6 |
| qwen3_4b | synthetic_high_context | Law/business | 58 | 6 |
| qwen3_4b | synthetic_high_context | Medicine | 48 | 6 |
| qwen3_4b | synthetic_high_context | Software/technology | 60 | 6 |
| qwen3_4b | synthetic_high_context | Sports | 45 | 6 |
| qwen3_8b | real_high_context | General language/slang | 60 | 6 |
| qwen3_8b | real_high_context | Law/business | 60 | 6 |
| qwen3_8b | real_high_context | Medicine | 60 | 6 |
| qwen3_8b | real_high_context | Software/technology | 60 | 6 |
| qwen3_8b | real_high_context | Sports | 60 | 6 |
| qwen3_8b | real_low_context | General language/slang | 60 | 6 |
| qwen3_8b | real_low_context | Law/business | 60 | 6 |
| qwen3_8b | real_low_context | Medicine | 60 | 6 |
| qwen3_8b | real_low_context | Software/technology | 60 | 6 |
| qwen3_8b | real_low_context | Sports | 60 | 6 |
| qwen3_8b | synthetic_high_context | General language/slang | 60 | 6 |
| qwen3_8b | synthetic_high_context | Law/business | 60 | 6 |
| qwen3_8b | synthetic_high_context | Medicine | 60 | 6 |
| qwen3_8b | synthetic_high_context | Software/technology | 60 | 6 |
| qwen3_8b | synthetic_high_context | Sports | 60 | 6 |

## Validation checks

**Overall: ALL PASSED**

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Selected sample size | 360 | 360 | PASS |
| No duplicate run_id | 0 | 0 | PASS |
| No duplicate evaluation_id | 0 | 0 | PASS |
| Strata = models x variants x domains | 60 | 60 | PASS |
| Every stratum drew the same count | True | True | PASS |
| Per model x variant x domain | 6 | 6 | PASS |
| Per model | 90 | 90 | PASS |
| Per variant | 120 | 120 | PASS |
| Per domain | 72 | 72 | PASS |
| No missing prompt | 0 | 0 | PASS |
| No missing expected_interpretation_or_behavior | 0 | 0 | PASS |
| No missing model_response | 0 | 0 | PASS |
| Both graders grade every response | 720 | 720 | PASS |
| Shared display order is a permutation 1..N | True | True | PASS |

## Blinding

`data/blinded_items.json` contains only:

- `evaluation_id`
- `display_order`
- `variant`
- `abbreviation`
- `primary_meaning`
- `alternate_plausible_meanings`
- `prompt`
- `expected_interpretation_or_behavior`
- `model_response`

Model identity, variant, domain, run_id and all metadata are in the confidential key only. Both graders share one randomized order derived from the seed. The source file is opened read-only and not modified.
