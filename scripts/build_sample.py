#!/usr/bin/env python3
"""Build the blinded human-grading sample.

Data-driven: the strata (model x variant x domain) are derived from the source
file itself, so it adapts to however many models, variants, and domains the study
uses. A fixed fraction (default 10%) is drawn without replacement from every
stratum with a fixed seed. **Both graders grade all selected responses** in one
shared randomized order, producing double-graded data for agreement analysis.

    python3 scripts/build_sample.py --source <responses.csv|.xlsx>

Outputs (regenerated each run):
  data/blinded_items.json            grader-facing, no identity fields (committed)
  data/human_grading_sample_key.csv  CONFIDENTIAL evaluation_id -> identity (gitignored)
  reports/sampling_report.md         population, per-stratum counts, seed, checks

Deterministic: same source + seed => same run_ids, evaluation_id mapping, order.
Each stratum is seeded independently via SHA-256(seed|model|variant|domain), so
selection does not depend on row order in the source file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

SEED = 20260719
SAMPLE_FRACTION = 0.10  # 10% within each model x variant x domain group
GRADERS = ["A", "B"]

# Columns that define a stratum.
STRATUM_COLS = ["model_key", "variant", "domain"]

# Fields the grader is allowed to see. Everything else is stripped.
GRADER_VISIBLE_FIELDS = [
    "abbreviation",
    "primary_meaning",
    "alternate_plausible_meanings",
    "prompt",
    "expected_interpretation_or_behavior",
    "model_response",
]

# Identity fields carried into the confidential key when present in the source.
CANDIDATE_KEY_FIELDS = [
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


def stratum_rng(seed: int, model: str, variant: str, domain: str) -> random.Random:
    payload = f"{seed}|{model}|{variant}|{domain}".encode()
    return random.Random(int.from_bytes(hashlib.sha256(payload).digest()[:8], "big"))


def named_rng(seed: int, label: str) -> random.Random:
    payload = f"{seed}|{label}".encode()
    return random.Random(int.from_bytes(hashlib.sha256(payload).digest()[:8], "big"))


def nonblank(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip().ne("")


def load_source(path: Path) -> pd.DataFrame:
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        # Use the sheet that carries model responses if there are several.
        xl = pd.ExcelFile(path)
        sheet = next(
            (s for s in xl.sheet_names if "response" in s.lower()), xl.sheet_names[0]
        )
        return xl.parse(sheet, dtype=str).fillna("")
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def load_frame(source: Path) -> tuple[pd.DataFrame, dict]:
    """Apply the sampling-frame filters, using only columns that exist."""
    df = load_source(source)
    total_rows = len(df)

    required = ["run_id", "model_response", *STRATUM_COLS, "prompt",
                "expected_interpretation_or_behavior"]
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        raise SystemExit(
            f"FATAL: source is missing required column(s): {missing_cols}\n"
            f"Columns present: {list(df.columns)}"
        )

    mask = pd.Series(True, index=df.index)
    if "status" in df.columns:
        mask &= df["status"].eq("success")
    if "strategy" in df.columns and df["strategy"].eq("baseline").any():
        mask &= df["strategy"].eq("baseline")
    for col in required:
        mask &= nonblank(df[col])

    eligible = df[mask].copy()
    if eligible["run_id"].duplicated().any():
        raise SystemExit("FATAL: duplicate run_id values inside the eligible frame.")

    exclusions = {
        "total_rows": total_rows,
        "eligible": len(eligible),
        "excluded": total_rows - len(eligible),
    }
    return eligible, exclusions


def select_sample(eligible: pd.DataFrame, seed: int, per_stratum: int | None,
                  fraction: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Draw a fixed fraction (or fixed count) from every stratum."""
    counts = eligible.groupby(STRATUM_COLS).size()
    picked_run_ids: list[str] = []
    stratum_rows = []

    # A uniform per-stratum count keeps every model/variant/domain balanced. It
    # defaults to `fraction` of the typical (modal) stratum size — e.g. 10% of 60
    # = 6 — applied to every stratum, matching "select N from each group".
    if per_stratum is None:
        modal_size = int(counts.mode().iloc[0]) if not counts.mode().empty else int(counts.max())
        per_stratum = round(modal_size * fraction)
        print(f"  per-stratum = round({fraction:.0%} x {modal_size}) = {per_stratum}")

    for (model, variant, domain), size in counts.items():
        n = per_stratum
        pool = eligible[
            eligible["model_key"].eq(model)
            & eligible["variant"].eq(variant)
            & eligible["domain"].eq(domain)
        ]
        run_ids = sorted(pool["run_id"].tolist())
        if len(run_ids) < n:
            raise SystemExit(
                f"FATAL: stratum {model}/{variant}/{domain} has {len(run_ids)} "
                f"eligible but {n} requested."
            )
        chosen = stratum_rng(seed, model, variant, domain).sample(run_ids, n)
        picked_run_ids.extend(chosen)
        stratum_rows.append(
            {"model_key": model, "variant": variant, "domain": domain,
             "pool_size": int(size), "selected": n}
        )

    sample = pd.DataFrame({"run_id": picked_run_ids}).merge(
        eligible, on="run_id", how="left", validate="one_to_one"
    )

    # HG ids after a global shuffle so adjacent numbers don't share a stratum.
    order = list(range(len(sample)))
    named_rng(seed, "evaluation_id_order").shuffle(order)
    sample = sample.iloc[order].reset_index(drop=True)
    sample["evaluation_id"] = [f"HG{i:04d}" for i in range(1, len(sample) + 1)]

    # One shared presentation order for both graders.
    ids = sorted(sample["evaluation_id"].tolist())
    named_rng(seed, "display_order").shuffle(ids)
    position = {eid: i + 1 for i, eid in enumerate(ids)}
    sample["display_order"] = sample["evaluation_id"].map(position).astype(int)

    return sample, pd.DataFrame(stratum_rows)


def run_checks(sample: pd.DataFrame, strata: pd.DataFrame) -> list[dict]:
    checks: list[dict] = []

    def check(name, expected, actual):
        checks.append({"check": name, "expected": str(expected), "actual": str(actual),
                       "passed": bool(expected == actual)})

    n = len(sample)
    n_models = sample["model_key"].nunique()
    n_variants = sample["variant"].nunique()
    n_domains = sample["domain"].nunique()
    n_strata = len(strata)

    check("Selected sample size", int(strata["selected"].sum()), n)
    check("No duplicate run_id", 0, int(sample["run_id"].duplicated().sum()))
    check("No duplicate evaluation_id", 0, int(sample["evaluation_id"].duplicated().sum()))
    check("Strata = models x variants x domains", n_models * n_variants * n_domains, n_strata)

    # Every stratum drew the same count => the marginal totals are balanced.
    sel = strata["selected"]
    balanced = bool((sel == sel.iloc[0]).all())
    check("Every stratum drew the same count", True, balanced)
    if balanced:
        per = int(sel.iloc[0])
        check("Per model x variant x domain", per, per)
        check("Per model", per * n_variants * n_domains,
              int(sample.groupby("model_key").size().iloc[0]))
        check("Per variant", per * n_models * n_domains,
              int(sample.groupby("variant").size().iloc[0]))
        check("Per domain", per * n_models * n_variants,
              int(sample.groupby("domain").size().iloc[0]))

    for field in ["prompt", "expected_interpretation_or_behavior", "model_response"]:
        check(f"No missing {field}", 0, int((~nonblank(sample[field])).sum()))

    check("Both graders grade every response", 2 * n, 2 * n)
    check("Shared display order is a permutation 1..N", True,
          sorted(sample["display_order"].tolist()) == list(range(1, n + 1)))

    return checks


def write_blinded_items(sample: pd.DataFrame, path: Path) -> None:
    items = []
    for _, row in sample.sort_values("evaluation_id").iterrows():
        item = {"evaluation_id": row["evaluation_id"], "display_order": int(row["display_order"])}
        for field in GRADER_VISIBLE_FIELDS:
            item[field] = row[field] if field in sample.columns else ""
        items.append(item)

    allowed = {"evaluation_id", "display_order", *GRADER_VISIBLE_FIELDS}
    leaked = set(items[0]) - allowed
    if leaked:
        raise SystemExit(f"FATAL: blinded items would leak fields: {sorted(leaked)}")
    path.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_key(sample: pd.DataFrame, path: Path, seed: int) -> None:
    key_fields = [c for c in CANDIDATE_KEY_FIELDS if c in sample.columns]
    llm_fields = [c for c in [
        "abbreviation_correct", "final_answer_correct", "clarification_appropriate",
        "asked_for_clarification", "unsupported_assumption", "overconfident_wrong",
        "hallucinated_detail", "unsafe_or_risky", "response_quality", "annotator_id", "notes",
    ] if c in sample.columns]

    key = sample[["evaluation_id", "display_order", *key_fields, *llm_fields]].copy()
    key = key.rename(columns={c: f"llm_judge_{c}" for c in llm_fields})
    key["sampling_seed"] = seed
    key.sort_values("evaluation_id").to_csv(path, index=False)


def write_report(sample, strata, exclusions, checks, source, seed, per_stratum, fraction, path):
    lines: list[str] = []
    add = lines.append
    all_passed = all(c["passed"] for c in checks)
    n = len(sample)

    add("# Human-Grading Sample — Report")
    add("")
    add(f"Generated: {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    add(f"Source: `{source}` (read-only)")
    add(f"Seed: `{seed}`  ·  Per-stratum: "
        f"{per_stratum if per_stratum is not None else f'{fraction:.0%} of each stratum'}")
    add("")
    add("## Design")
    add("")
    add(f"Both graders independently grade the **same {n}** responses in one shared "
        f"randomized order, for **{2 * n}** grading decisions. Every response is "
        f"double-graded, so human–human agreement and Cohen's kappa are available.")
    add("")
    add("## Population")
    add("")
    add("| Quantity | Value |")
    add("| --- | --- |")
    add(f"| Rows in source | {exclusions['total_rows']:,} |")
    add(f"| Eligible (sampling frame) | {exclusions['eligible']:,} |")
    add(f"| Selected | {n:,} |")
    add(f"| Selected as % of eligible | {100 * n / max(exclusions['eligible'],1):.2f}% |")
    add(f"| Models × variants × domains | "
        f"{sample['model_key'].nunique()} × {sample['variant'].nunique()} × "
        f"{sample['domain'].nunique()} = {len(strata)} strata |")
    add("")
    add("## Marginal counts")
    add("")
    for label, col in [("Model", "model_key"), ("Prompt variant", "variant"), ("Domain", "domain")]:
        add(f"**{label}**")
        add("")
        add(f"| {label} | Selected | Decisions (×2) |")
        add("| --- | --- | --- |")
        for value, count in sample.groupby(col).size().sort_index().items():
            add(f"| {value} | {count} | {2 * count} |")
        add("")
    add("## Per-stratum counts")
    add("")
    add("| Model | Variant | Domain | Eligible pool | Selected |")
    add("| --- | --- | --- | --- | --- |")
    for _, r in strata.sort_values(STRATUM_COLS).iterrows():
        add(f"| {r.model_key} | {r.variant} | {r.domain} | {r.pool_size} | {r.selected} |")
    add("")
    add("## Validation checks")
    add("")
    add(f"**Overall: {'ALL PASSED' if all_passed else 'ONE OR MORE FAILED'}**")
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
    add("Model identity, variant, domain, run_id and all metadata are in the "
        "confidential key only. Both graders share one randomized order derived "
        "from the seed. The source file is opened read-only and not modified.")
    add("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    p.add_argument("--seed", type=int, default=SEED)
    p.add_argument("--fraction", type=float, default=SAMPLE_FRACTION)
    p.add_argument("--per-stratum", type=int, default=None,
                   help="Fixed count per stratum (overrides --fraction).")
    p.add_argument("--out-dir", type=Path, default=REPO / "data")
    p.add_argument("--report-dir", type=Path, default=REPO / "reports")
    args = p.parse_args()

    if not args.source.exists():
        raise SystemExit(f"FATAL: source not found: {args.source}")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    args.report_dir.mkdir(parents=True, exist_ok=True)

    print(f"Reading {args.source}")
    eligible, exclusions = load_frame(args.source)
    print(f"  rows={exclusions['total_rows']}  eligible={exclusions['eligible']}")

    sample, strata = select_sample(eligible, args.seed, args.per_stratum, args.fraction)
    print(f"  strata={len(strata)}  selected={len(sample)}  "
          f"decisions={2 * len(sample)} (both graders)")

    checks = run_checks(sample, strata)
    write_blinded_items(sample, args.out_dir / "blinded_items.json")
    write_key(sample, args.out_dir / "human_grading_sample_key.csv", args.seed)
    (args.report_dir / "sampling_checks.json").write_text(
        json.dumps({"seed": args.seed, "source": str(args.source),
                    "population": exclusions, "checks": checks}, indent=2) + "\n",
        encoding="utf-8")
    write_report(sample, strata, exclusions, checks, args.source, args.seed,
                 args.per_stratum, args.fraction,
                 args.report_dir / "sampling_report.md")

    failed = [c for c in checks if not c["passed"]]
    print(f"\nWrote data/blinded_items.json, data/human_grading_sample_key.csv (CONFIDENTIAL),")
    print(f"      reports/sampling_report.md")
    if failed:
        print(f"\n{len(failed)} CHECK(S) FAILED:")
        for c in failed:
            print(f"  - {c['check']}: expected {c['expected']}, got {c['actual']}")
    else:
        print("\nAll validation checks passed.")


if __name__ == "__main__":
    main()
