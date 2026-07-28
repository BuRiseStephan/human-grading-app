#!/usr/bin/env python3
"""Convert the v3 results.jsonl into clean rows for build_sample.py.

Handles the v3 quirks:
  - deduplicates to one canonical success per run_id (latest by completed_at)
  - drops records with an empty completion (nothing to grade)
  - relabels the stray "Finance/business" domain to "Software/technology"
  - maps the nested dataset_metadata into flat grading columns

    python3 scripts/prepare_v3.py --results ~/Desktop/results.jsonl --out <clean.csv>
"""
from __future__ import annotations
import argparse, csv, json, os
from collections import defaultdict
from pathlib import Path

DOMAIN_FIX = {"Finance/business": "Software/technology"}

# Abbreviation sets excluded from the grading system (removed by the authors).
# Overridable via EXCLUDE_SETS env (comma-separated; empty string = exclude none).
_DEFAULT_EXCLUDE = {
    "SET_62", "SET_64", "SET_65", "SET_66", "SET_92",
    "SET_119", "SET_159", "SET_179", "SET_210",
}
EXCLUDE_SET_IDS = (
    {s.strip() for s in os.environ["EXCLUDE_SETS"].split(",") if s.strip()}
    if "EXCLUDE_SETS" in os.environ
    else _DEFAULT_EXCLUDE
)

COLUMNS = [
    "run_id", "model_key", "variant", "domain", "abbreviation",
    "primary_meaning", "alternate_plausible_meanings", "prompt",
    "expected_interpretation_or_behavior", "model_response",
    "set_id", "prompt_id", "status", "strategy",
]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--results", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()

    recs = [json.loads(l) for l in open(args.results) if l.strip()]
    succ = [r for r in recs if r.get("success")]

    # one canonical success per run_id (latest completion)
    by_run: dict[str, list] = defaultdict(list)
    for r in succ:
        by_run[r["run_id"]].append(r)
    canon = [sorted(v, key=lambda r: r.get("completed_at_utc") or "")[-1] for v in by_run.values()]

    rows, dropped_empty, relabeled, dropped_excluded = [], 0, 0, 0
    for r in canon:
        if r.get("set_id") in EXCLUDE_SET_IDS:
            dropped_excluded += 1
            continue
        m = r.get("dataset_metadata") or {}
        response = (r.get("completion") or "").strip()
        if not response:
            dropped_empty += 1
            continue
        domain = m.get("domain") or ""
        if domain in DOMAIN_FIX:
            domain = DOMAIN_FIX[domain]
            relabeled += 1
        alts = m.get("alternate_meanings") or []
        rows.append({
            "run_id": r["run_id"],
            "model_key": r.get("model_key", ""),
            "variant": m.get("condition", ""),
            "domain": domain,
            "abbreviation": m.get("abbreviation", ""),
            "primary_meaning": m.get("target_expansion", ""),
            "alternate_plausible_meanings": "; ".join(alts) if isinstance(alts, list) else str(alts),
            "prompt": r.get("dataset_prompt") or r.get("prompt") or "",
            "expected_interpretation_or_behavior": m.get("expected_interpretation_or_behavior", ""),
            "model_response": response,
            "set_id": r.get("set_id", ""),
            "prompt_id": r.get("prompt_id", ""),
            "status": "success",
            "strategy": r.get("strategy_id", "baseline"),
        })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)

    print(f"canonical runs: {len(canon)}  ->  eligible rows: {len(rows)}")
    print(f"  dropped excluded sets ({len(EXCLUDE_SET_IDS)}): {dropped_excluded}")
    print(f"  dropped empty completions: {dropped_empty}")
    print(f"  relabeled Finance/business -> Software/technology: {relabeled}")
    print(f"  wrote {args.out}")


if __name__ == "__main__":
    main()
