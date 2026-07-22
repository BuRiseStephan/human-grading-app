#!/usr/bin/env python3
"""Build the blinded 10% human-grading sample.

Implements `reports/human_grading_10_percent_sampling_plan.md`: 6 responses are
drawn from each of the 80 strata for a total of 480, and **both graders
independently grade all 480**, producing 960 grading decisions. Both graders see
the same 480 items in one shared randomized presentation order.

Run once; commit `data/blinded_items.json` and `reports/sampling_report.md`.
`data/human_grading_sample_key.csv` is confidential and stays out of git.

    python3 scripts/build_sample.py

Deterministic: the same source CSV and seed always select the same run_ids and
produce the same evaluation_id mapping and per-grader orders.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# Design constants (from the sampling plan)
# ---------------------------------------------------------------------------

SEED = 20260719

MODELS = ["qwen3_4b", "qwen3_8b", "qwen3_14b", "qwen3_32b"]
VARIANTS = [
    "full_form_control",
    "abbreviation_only",
    "contextual_abbreviation",
    "domain_conflict_trick",
]
DOMAINS = [
    "Medicine",
    "Law/business",
    "Sports",
    "General language/slang",
    "Software/technology",
]

PER_STRATUM = 6
GRADERS = ["A", "B"]

# Fields the grader is allowed to see. Everything else is stripped.
GRADER_VISIBLE_FIELDS = [
    "abbreviation",
    "primary_meaning",
    "alternate_plausible_meanings",
    "prompt",
    "expected_interpretation_or_behavior",
    "model_response",
]

# Fields carried into the confidential key.
KEY_FIELDS = [
    "run_id",
    "model_key",
    "parameter_count_b",
    "variant",
    "domain",
    "set_id",
    "prompt_id",
]

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = Path.home() / "Downloads" / "qwen_abbreviation_study_responses.csv"


def stratum_rng(model: str, variant: str, domain: str) -> random.Random:
    """Deterministic per-stratum RNG.

    Seeding each stratum independently (rather than drawing from one stream)
    means the selection for a stratum does not depend on how many strata were
    processed before it, so the result is stable under reordering.
    """
    payload = f"{SEED}|{model}|{variant}|{domain}".encode()
    return random.Random(int.from_bytes(hashlib.sha256(payload).digest()[:8], "big"))


def named_rng(label: str) -> random.Random:
    payload = f"{SEED}|{label}".encode()
    return random.Random(int.from_bytes(hashlib.sha256(payload).digest()[:8], "big"))


def nonblank(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip().ne("")


def load_frame(source: Path) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Load the CSV and apply the sampling-frame filters."""
    df = pd.read_csv(source, dtype=str, keep_default_na=False)
    total_rows = len(df)

    eligible = df[
        df["status"].eq("success")
        & df["strategy"].eq("baseline")
        & nonblank(df["run_id"])
        & nonblank(df["model_response"])
        & nonblank(df["model_key"])
        & nonblank(df["variant"])
        & nonblank(df["domain"])
        & nonblank(df["prompt"])
        & nonblank(df["expected_interpretation_or_behavior"])
    ].copy()

    exclusions = {
        "total_rows": total_rows,
        "status_not_success": int((~df["status"].eq("success")).sum()),
        "strategy_not_baseline": int((~df["strategy"].eq("baseline")).sum()),
        "blank_run_id": int((~nonblank(df["run_id"])).sum()),
        "blank_model_response": int((~nonblank(df["model_response"])).sum()),
        "blank_stratification_field": int(
            (
                ~(
                    nonblank(df["model_key"])
                    & nonblank(df["variant"])
                    & nonblank(df["domain"])
                )
            ).sum()
        ),
        "blank_prompt_or_expected": int(
            (~(nonblank(df["prompt"]) & nonblank(df["expected_interpretation_or_behavior"]))).sum()
        ),
        "duplicate_run_id": int(df["run_id"].duplicated().sum()),
        "eligible": len(eligible),
    }

    if eligible["run_id"].duplicated().any():
        raise SystemExit("FATAL: duplicate run_id values inside the eligible frame.")

    return df, eligible, exclusions


def select_sample(eligible: pd.DataFrame) -> pd.DataFrame:
    """Draw 6 per stratum. Both graders grade every selected response."""
    picked_run_ids = []

    for model in MODELS:
        for variant in VARIANTS:
            for domain in DOMAINS:
                pool = eligible[
                    eligible["model_key"].eq(model)
                    & eligible["variant"].eq(variant)
                    & eligible["domain"].eq(domain)
                ]
                # Sort so the pool order is a property of the data, not of
                # however pandas happened to read the file.
                run_ids = sorted(pool["run_id"].tolist())

                if len(run_ids) < PER_STRATUM:
                    raise SystemExit(
                        f"FATAL: stratum {model} / {variant} / {domain} has only "
                        f"{len(run_ids)} eligible responses; {PER_STRATUM} required. "
                        "Stopping rather than changing the design."
                    )

                rng = stratum_rng(model, variant, domain)
                picked_run_ids.extend(rng.sample(run_ids, PER_STRATUM))

    picks = pd.DataFrame({"run_id": picked_run_ids})
    sample = picks.merge(eligible, on="run_id", how="left", validate="one_to_one")

    # Assign HG ids in a globally shuffled order so that consecutive
    # evaluation_ids do not betray a shared stratum.
    order = list(range(len(sample)))
    named_rng("evaluation_id_order").shuffle(order)
    sample = sample.iloc[order].reset_index(drop=True)
    sample["evaluation_id"] = [f"HG{i:04d}" for i in range(1, len(sample) + 1)]

    # One shared presentation order for both graders: both see the same 480
    # items in the same randomized sequence. (The plan allows independent packet
    # orders, but the authors asked for a single shared order.)
    ids = sorted(sample["evaluation_id"].tolist())
    named_rng("display_order").shuffle(ids)
    position = {eid: i + 1 for i, eid in enumerate(ids)}
    sample["display_order"] = sample["evaluation_id"].map(position).astype(int)

    return sample


def run_checks(sample: pd.DataFrame, exclusions: dict) -> list[dict]:
    """Every check required by the plan, plus the packet-order checks."""
    checks: list[dict] = []

    def check(name: str, expected, actual) -> None:
        checks.append(
            {
                "check": name,
                "expected": str(expected),
                "actual": str(actual),
                "passed": bool(expected == actual),
            }
        )

    check("Exactly 480 rows selected", 480, len(sample))
    check("Exactly 480 unique run_id values", 480, sample["run_id"].nunique())
    check("No duplicate run_id values", 0, int(sample["run_id"].duplicated().sum()))
    check("Exactly 480 unique evaluation_id values", 480, sample["evaluation_id"].nunique())

    strata = sample.groupby(["model_key", "variant", "domain"]).size()
    check("Number of strata populated", 80, len(strata))
    check("Every stratum has exactly 6 responses", True, bool((strata == PER_STRATUM).all()))

    per_model = sample.groupby("model_key").size()
    check("Exactly 120 responses per model", True, bool((per_model == 120).all()))
    check("All 4 models present", 4, per_model.size)

    per_variant = sample.groupby("variant").size()
    check("Exactly 120 responses per prompt variant", True, bool((per_variant == 120).all()))
    check("All 4 variants present", 4, per_variant.size)

    per_domain = sample.groupby("domain").size()
    check("Exactly 96 responses per domain", True, bool((per_domain == 96).all()))
    check("All 5 domains present", 5, per_domain.size)

    per_mv = sample.groupby(["model_key", "variant"]).size()
    check("Exactly 30 per model x variant", True, bool((per_mv == 30).all()))

    for field in ["prompt", "expected_interpretation_or_behavior", "model_response"]:
        check(f"No missing {field}", 0, int((~nonblank(sample[field])).sum()))

    check("All selected rows have status = success", True, bool(sample["status"].eq("success").all()))
    check("All selected rows are baseline strategy", True, bool(sample["strategy"].eq("baseline").all()))

    # Both graders grade the same 480 items (960 decisions total).
    check("Both graders grade all 480 responses", 480, len(sample))
    check("Total grading decisions", 960, 2 * len(sample))

    check(
        "Shared display order is a permutation of 1..480",
        True,
        sorted(sample["display_order"].tolist()) == list(range(1, 481)),
    )
    check(
        "Every evaluation_id maps to exactly one display position",
        480,
        sample["display_order"].nunique(),
    )

    check(
        "Eligible population equals the plan's expected 4,800",
        4800,
        exclusions["eligible"],
    )

    return checks


def write_blinded_items(sample: pd.DataFrame, path: Path) -> None:
    """Grader-facing file. Contains nothing that identifies the condition.

    One entry per response; both graders receive all 480 in one shared
    presentation order.
    """
    items = []
    for _, row in sample.sort_values("evaluation_id").iterrows():
        item = {
            "evaluation_id": row["evaluation_id"],
            "display_order": int(row["display_order"]),
        }
        for field in GRADER_VISIBLE_FIELDS:
            item[field] = row[field]
        items.append(item)

    allowed = {"evaluation_id", "display_order", *GRADER_VISIBLE_FIELDS}
    leaked = set(items[0]) - allowed
    if leaked:
        raise SystemExit(f"FATAL: blinded items would leak fields: {sorted(leaked)}")

    path.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_key(sample: pd.DataFrame, path: Path) -> None:
    """Confidential key. Never read by grader-facing code."""
    llm_judge_fields = [
        c
        for c in [
            "abbreviation_correct",
            "final_answer_correct",
            "clarification_appropriate",
            "asked_for_clarification",
            "unsupported_assumption",
            "overconfident_wrong",
            "hallucinated_detail",
            "unsafe_or_risky",
            "response_quality",
            "annotator_id",
            "notes",
        ]
        if c in sample.columns
    ]

    key = sample[
        [
            "evaluation_id",
            "display_order",
            *KEY_FIELDS,
            *llm_judge_fields,
        ]
    ].copy()
    key = key.rename(columns={c: f"llm_judge_{c}" for c in llm_judge_fields})
    key["sampling_seed"] = SEED
    key["display_order_seed"] = f"sha256({SEED}|display_order)"
    key = key.sort_values("evaluation_id")
    key.to_csv(path, index=False)


def write_report(
    sample: pd.DataFrame,
    exclusions: dict,
    checks: list[dict],
    source: Path,
    path: Path,
) -> None:
    lines: list[str] = []
    add = lines.append

    all_passed = all(c["passed"] for c in checks)

    add("# Human-Grading 10% Stratified Sample — Sampling Report")
    add("")
    add(f"Generated: {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    add(f"Generator: `scripts/build_sample.py`")
    add(f"Source file: `{source}` (read-only; not modified)")
    add(f"Sampling seed: `{SEED}`")
    add("")

    add("## Grading design")
    add("")
    add(
        "Both graders independently grade the **same** 480 responses, producing "
        "960 grading decisions. Every response is double-graded, so the full set "
        "of agreement analyses in the plan's \"Agreement and Validation Analysis\" "
        "section is available: exact human–human agreement, quadratic-weighted "
        "Cohen's kappa for both 1–4 scores, agreement on each auxiliary field, and "
        "the human–human confusion matrix."
    )
    add("")
    add(
        "Both graders receive the **same** 480 items in a **single shared** "
        "randomized presentation order (`display_order`, seeded from the sampling "
        "seed). Grader A and Grader B therefore see identical items in identical "
        "sequence; only their independently entered scores differ."
    )
    add("")

    add("## Population and sample")
    add("")
    add("| Quantity | Value |")
    add("| --- | --- |")
    add(f"| Rows in source file | {exclusions['total_rows']:,} |")
    add(f"| Eligible population (sampling frame) | {exclusions['eligible']:,} |")
    add(f"| Selected sample | {len(sample):,} |")
    add(f"| Sample as % of eligible | {100 * len(sample) / exclusions['eligible']:.2f}% |")
    add(f"| Sample as % of source rows | {100 * len(sample) / exclusions['total_rows']:.2f}% |")
    add(f"| Items per grader | {len(sample):,} (both graders grade all) |")
    add(f"| Total grading decisions | {2 * len(sample):,} |")
    add("")

    add("### Sampling-frame exclusions")
    add("")
    add("| Filter | Rows failing |")
    add("| --- | --- |")
    add(f"| `status` != success | {exclusions['status_not_success']} |")
    add(f"| `strategy` != baseline | {exclusions['strategy_not_baseline']} |")
    add(f"| `run_id` blank | {exclusions['blank_run_id']} |")
    add(f"| `run_id` duplicated | {exclusions['duplicate_run_id']} |")
    add(f"| `model_response` blank | {exclusions['blank_model_response']} |")
    add(f"| `model_key` / `variant` / `domain` blank | {exclusions['blank_stratification_field']} |")
    add(f"| `prompt` / `expected_interpretation_or_behavior` blank | {exclusions['blank_prompt_or_expected']} |")
    add("")

    if exclusions["eligible"] != 4800:
        add(
            f"> **Note.** The plan expects an eligible population of 4,800. The actual "
            f"eligible population is **{exclusions['eligible']:,}** because "
            f"{exclusions['blank_model_response']} rows have an empty `model_response`, "
            f"which the plan's sampling frame excludes (\"`model_response` is present\"). "
            f"These rows are real study outcomes — an empty visible response is a "
            f"gradeable failure under the rubric, which assigns "
            f"`final_answer_accuracy_score` 1 to an empty response — but the frame as "
            f"written removes them, so they are excluded here. Every stratum still has "
            f"far more than the 6 eligible responses it needs, and all required "
            f"per-model / per-variant / per-domain counts are unaffected. If the "
            f"authors would rather have empty responses represented in the human "
            f"sample, the frame must be amended and the sample regenerated."
        )
        add("")

    add("## Stratification")
    add("")
    add("Full cross-product of 4 models x 4 prompt variants x 5 domains = 80 strata, ")
    add(f"{PER_STRATUM} responses drawn without replacement per stratum. ")
    add("Both graders grade every selected response.")
    add("")

    add("### Marginal counts")
    add("")
    for label, col in [("Model", "model_key"), ("Prompt variant", "variant"), ("Domain", "domain")]:
        add(f"**{label}**")
        add("")
        add(f"| {label} | Selected | Decisions (x2 graders) |")
        add("| --- | --- | --- |")
        for value, count in sample.groupby(col).size().sort_index().items():
            add(f"| {value} | {count} | {2 * count} |")
        add("")

    add("### Per-stratum counts (all 80 strata)")
    add("")
    add("| Model | Variant | Domain | Eligible pool | Selected |")
    add("| --- | --- | --- | --- | --- |")
    for model in MODELS:
        for variant in VARIANTS:
            for domain in DOMAINS:
                sub = sample[
                    sample.model_key.eq(model)
                    & sample.variant.eq(variant)
                    & sample.domain.eq(domain)
                ]
                pool = int(sub["_pool_size"].iloc[0]) if "_pool_size" in sub else ""
                add(f"| {model} | {variant} | {domain} | {pool} | {len(sub)} |")
    add("")

    add("## Validation checks")
    add("")
    add(f"**Overall: {'ALL CHECKS PASSED' if all_passed else 'ONE OR MORE CHECKS FAILED'}**")
    add("")
    add("| Check | Expected | Actual | Result |")
    add("| --- | --- | --- | --- |")
    for c in checks:
        add(f"| {c['check']} | {c['expected']} | {c['actual']} | {'PASS' if c['passed'] else 'FAIL'} |")
    add("")

    add("## Blinding")
    add("")
    add("`data/blinded_items.json` contains only:")
    add("")
    for field in ["evaluation_id", "display_order", *GRADER_VISIBLE_FIELDS]:
        add(f"- `{field}`")
    add("")
    add(
        "Stripped from the grader-facing file: `run_id`, `model_key`, `model_id`, "
        "`parameter_count_b`, `api_gateway`, `provider`, `variant`, `domain`, "
        "`set_id`, `prompt_id`, all token / latency / cost metadata, "
        "`reasoning_content`, and every provisional LLM-judge score and note."
    )
    add("")
    add(
        "`evaluation_id` values were assigned after a global shuffle, so adjacent "
        "HG numbers do not share a stratum. Both graders share one randomized "
        "presentation order derived from the same seed."
    )
    add("")

    add("## Reproducibility")
    add("")
    add(
        f"Rerunning `python3 scripts/build_sample.py` against the unchanged source "
        f"CSV with seed `{SEED}` selects the same 480 `run_id` values and produces "
        f"the same `evaluation_id` mapping and the same shared display order. Each "
        f"stratum is seeded independently via "
        f"SHA-256(seed | model | variant | domain), so selection does not depend on "
        f"row order in the source file."
    )
    add("")
    add("The source CSV is opened read-only and was not modified.")
    add("")

    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out-dir", type=Path, default=REPO / "data")
    parser.add_argument("--report-dir", type=Path, default=REPO / "reports")
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(f"FATAL: source CSV not found: {args.source}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    args.report_dir.mkdir(parents=True, exist_ok=True)

    print(f"Reading {args.source}")
    _, eligible, exclusions = load_frame(args.source)
    print(f"  rows={exclusions['total_rows']}  eligible={exclusions['eligible']}")

    # Record pool sizes for the report before sampling narrows things down.
    pool = eligible.groupby(["model_key", "variant", "domain"]).size()

    sample = select_sample(eligible)
    sample["_pool_size"] = [
        pool.get((m, v, d), 0)
        for m, v, d in zip(sample["model_key"], sample["variant"], sample["domain"])
    ]
    print(f"  selected={len(sample)}  graded by both graders = {2 * len(sample)} decisions")

    checks = run_checks(sample, exclusions)

    blinded_path = args.out_dir / "blinded_items.json"
    key_path = args.out_dir / "human_grading_sample_key.csv"
    checks_path = args.report_dir / "sampling_checks.json"
    report_path = args.report_dir / "sampling_report.md"

    write_blinded_items(sample, blinded_path)
    write_key(sample, key_path)
    checks_path.write_text(
        json.dumps(
            {
                "seed": SEED,
                "source": str(args.source),
                "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "population": exclusions,
                "checks": checks,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    write_report(sample, exclusions, checks, args.source, report_path)

    failed = [c for c in checks if not c["passed"]]
    print(f"\nWrote {blinded_path}")
    print(f"Wrote {key_path}  (CONFIDENTIAL - gitignored)")
    print(f"Wrote {checks_path}")
    print(f"Wrote {report_path}")

    if failed:
        print(f"\n{len(failed)} CHECK(S) FAILED:")
        for c in failed:
            print(f"  - {c['check']}: expected {c['expected']}, got {c['actual']}")
    else:
        print("\nAll validation checks passed.")


if __name__ == "__main__":
    main()
