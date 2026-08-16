#!/usr/bin/env python3
"""Build data/regrade_manifest.json: the items+dimensions the two raters disagreed on.

For each unique response_id where Grader A and Grader B differ on an applicable
dimension, record which dimension(s) to re-grade. Read-only on the originals.

    SP=<scratchpad-with-gradings.json> python3 scripts/build_regrade_manifest.py
"""
import os, json, csv, collections

SP = os.environ["SP"]
# Accuracy is intentionally excluded from the re-grade round: inter-rater
# agreement on accuracy is substantial (kappa ~ 0.74), so it is not re-graded.
# Only the two low-agreement dimensions go to adjudication.
DIM_FIELD = {"clarification": "clarification_score",
             "hallucination": "hallucination_score"}
APPLIC = {"clarification": {"real_low_context"}, "hallucination": {"synthetic_high_context"}}

key = {r["evaluation_id"]: r for r in csv.DictReader(open("data/human_grading_sample_key.csv"))}
items = {i["evaluation_id"]: i for i in json.load(open("data/blinded_items.json"))}
grad = json.load(open(f"{SP}/gradings.json"))
by_eval = collections.defaultdict(dict)
for g in grad:
    by_eval[g["evaluation_id"]][g["grader"]] = g

disagreed = {}
for eid, k in key.items():
    A = by_eval.get(eid, {}).get("A", {}); B = by_eval.get(eid, {}).get("B", {})
    dims = []
    for dim, conds in APPLIC.items():
        if k["variant"] not in conds:
            continue
        f = DIM_FIELD[dim]
        a, b = A.get(f), B.get(f)
        if a is not None and b is not None and int(a) != int(b):
            dims.append(f)
    if dims:
        disagreed[eid] = dims

# order by the original display order for a coherent subset, renumber 1..N
ordered = sorted(disagreed, key=lambda e: items[e]["display_order"])
manifest = [{"evaluation_id": e, "display_order": i + 1, "dimensions": disagreed[e]}
            for i, e in enumerate(ordered)]

json.dump(manifest, open("data/regrade_manifest.json", "w"), indent=2)
print(f"wrote data/regrade_manifest.json: {len(manifest)} items to re-grade")
print("  by #dimensions:", dict(collections.Counter(len(m["dimensions"]) for m in manifest)))
flat = collections.Counter(d for m in manifest for d in m["dimensions"])
print("  dimension re-grades:", dict(flat))
