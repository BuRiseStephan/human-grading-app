#!/usr/bin/env python3
"""Read-only human-validation audit: integrity, inter-rater agreement, disagreements.

Does NOT modify any grade. Merges the two raters' grades (Turso dump) with the
sampling key and blinded items, then reports the metrics the audit asks for.
"""
import json, csv, sys, collections
import numpy as np
import pandas as pd
from sklearn.metrics import cohen_kappa_score

SP = sys.argv[1]
KEY = "data/human_grading_sample_key.csv"
ITEMS = "data/blinded_items.json"

APPLIC = {  # which conditions each dimension applies to
    "accuracy": {"real_low_context", "real_high_context", "synthetic_high_context"},
    "clarification": {"real_low_context"},
    "hallucination": {"synthetic_high_context"},
}

# ---- assemble ----
grad = json.load(open(f"{SP}/gradings.json"))
key = {r["evaluation_id"]: r for r in csv.DictReader(open(KEY))}
items = {i["evaluation_id"]: i for i in json.load(open(ITEMS))}

by_eval = collections.defaultdict(dict)
for g in grad:
    by_eval[g["evaluation_id"]][g["grader"]] = g

rows = []
for eid, k in key.items():
    it = items.get(eid, {})
    A = by_eval.get(eid, {}).get("A", {})
    B = by_eval.get(eid, {}).get("B", {})
    rows.append({
        "response_id": eid, "set_id": k["set_id"], "prompt_id": k["prompt_id"],
        "condition": k["variant"], "domain": k["domain"], "model": k["model_key"],
        "target_expansion": it.get("primary_meaning", ""),
        "prompt": it.get("prompt", ""), "model_response": it.get("model_response", ""),
        "r1_accuracy": A.get("accuracy_score"), "r1_clarification": A.get("clarification_score"),
        "r1_hallucination": A.get("hallucination_score"),
        "r2_accuracy": B.get("accuracy_score"), "r2_clarification": B.get("clarification_score"),
        "r2_hallucination": B.get("hallucination_score"),
        "r1_present": "A" in by_eval.get(eid, {}), "r2_present": "B" in by_eval.get(eid, {}),
    })
df = pd.DataFrame(rows)
df.to_csv(f"{SP}/merged.csv", index=False)

def hr(t): print("\n" + "=" * 78 + f"\n{t}\n" + "=" * 78)

# ---- 1. integrity ----
hr("1. DATA-INTEGRITY AUDIT")
print(f"Sampled records: {len(df)}   (task states 360; actual sample is 346 after the")
print("  9 excluded abbreviation sets were removed)")
print(f"Duplicate response_id: {df.response_id.duplicated().sum()}")
print(f"Both raters present on every record: {(df.r1_present & df.r2_present).all()} "
      f"(A missing={int((~df.r1_present).sum())}, B missing={int((~df.r2_present).sum())})")
print("\nModel × condition strata (count of records):")
print(df.pivot_table(index="model", columns="condition", values="response_id",
                     aggfunc="count", margins=True).to_string())

def col(dim, r): return df[f"{r}_{dim}"]
print("\nInvalid values (outside 0-2, ignoring blanks):")
bad = 0
for dim in ["accuracy", "clarification", "hallucination"]:
    for r in ["r1", "r2"]:
        v = pd.to_numeric(col(dim, r), errors="coerce").dropna()
        out = v[(v < 0) | (v > 2)]
        if len(out): print(f"  {r}_{dim}: {list(out)}"); bad += len(out)
print("  none" if bad == 0 else f"  TOTAL invalid: {bad}")

print("\nMissing APPLICABLE grades (blank where the dimension applies):")
miss = 0
for dim, conds in APPLIC.items():
    sub = df[df.condition.isin(conds)]
    for r in ["r1", "r2"]:
        m = sub[col(dim, r)[sub.index].isna()]
        if len(m): print(f"  {r}_{dim}: {len(m)} blank on applicable items -> {list(m.response_id)[:8]}"); miss += len(m)
print("  none" if miss == 0 else f"  TOTAL missing applicable: {miss}")

print("\nGrades entered in NON-applicable fields (should be blank):")
non = 0
for dim, conds in APPLIC.items():
    sub = df[~df.condition.isin(conds)]
    for r in ["r1", "r2"]:
        f = sub[col(dim, r)[sub.index].notna()]
        if len(f): print(f"  {r}_{dim}: {len(f)} filled on non-applicable items -> {list(f.response_id)[:8]}"); non += len(f)
print("  none" if non == 0 else f"  TOTAL misfiled: {non}")

print("\nOriginal LLM-judge grades: ABSENT (key has no llm_judge_* columns).")
print("  -> Task 3 (human vs LLM judge) cannot be computed for this sample.")

# ---- agreement helpers ----
def metrics(a, b):
    a = pd.to_numeric(a, errors="coerce"); b = pd.to_numeric(b, errors="coerce")
    m = a.notna() & b.notna(); a, b = a[m].astype(int), b[m].astype(int)
    n = len(a)
    if n == 0: return None
    exact = int((a == b).sum())
    adj = int((abs(a - b) <= 1).sum())
    mad = float(abs(a - b).mean())
    try: k = cohen_kappa_score(a, b, labels=[0,1,2])
    except Exception: k = float("nan")
    try: kw = cohen_kappa_score(a, b, labels=[0,1,2], weights="linear")
    except Exception: kw = float("nan")
    cm = pd.crosstab(a, b, dropna=False).reindex(index=[0,1,2], columns=[0,1,2], fill_value=0)
    return dict(n=n, exact=exact, exact_pct=100*exact/n, adj=adj, adj_pct=100*adj/n,
               kappa=k, kappa_w=kw, mad=mad, cm=cm)

def show(title, mm):
    if mm is None: print(f"  {title}: n=0 (no applicable co-graded items)"); return
    print(f"  {title}: n={mm['n']}  exact={mm['exact']} ({mm['exact_pct']:.1f}%)  "
          f"adj±1={mm['adj_pct']:.1f}%  kappa={mm['kappa']:.3f}  kappa_lin={mm['kappa_w']:.3f}  MAD={mm['mad']:.3f}")

# ---- 2. human-human agreement ----
hr("2. HUMAN–HUMAN AGREEMENT")
for dim, conds in APPLIC.items():
    sub = df[df.condition.isin(conds)]
    print(f"\n### {dim.upper()}  (applies to: {', '.join(sorted(conds))})")
    show("OVERALL", metrics(sub[f"r1_{dim}"], sub[f"r2_{dim}"]))
    mm = metrics(sub[f"r1_{dim}"], sub[f"r2_{dim}"])
    if mm: print("   confusion matrix (rows=R1, cols=R2):\n" + mm["cm"].to_string().replace("\n", "\n     "))
    if dim == "accuracy":
        for cond in sorted(conds):
            s = sub[sub.condition == cond]; show(f"by condition = {cond}", metrics(s[f"r1_{dim}"], s[f"r2_{dim}"]))
    print("  by model:")
    for mdl in sorted(sub.model.unique()):
        s = sub[sub.model == mdl]; show(f"    {mdl}", metrics(s[f"r1_{dim}"], s[f"r2_{dim}"]))
    print("  by domain (n>=20 shown):")
    for dom in sorted(sub.domain.unique()):
        s = sub[sub.domain == dom]
        mm2 = metrics(s[f"r1_{dim}"], s[f"r2_{dim}"])
        if mm2 and mm2["n"] >= 20: show(f"    {dom}", mm2)
        elif mm2: print(f"    {dom}: n={mm2['n']} (below 20, omitted)")

# ---- 4/5 disagreements ----
hr("DISAGREEMENTS (for tasks 4 & 5)")
dis = []
for _, row in df.iterrows():
    for dim, conds in APPLIC.items():
        if row.condition not in conds: continue
        r1, r2 = row[f"r1_{dim}"], row[f"r2_{dim}"]
        if pd.isna(r1) or pd.isna(r2): continue
        if int(r1) != int(r2):
            dis.append({"response_id": row.response_id, "dimension": dim, "condition": row.condition,
                        "model": row.model, "domain": row.domain, "set_id": row.set_id,
                        "r1": int(r1), "r2": int(r2), "boundary": f"{min(int(r1),int(r2))}v{max(int(r1),int(r2))}",
                        "gap": abs(int(r1)-int(r2)), "target_expansion": row.target_expansion,
                        "prompt": row.prompt, "model_response": row.model_response})
dd = pd.DataFrame(dis)
dd.to_csv(f"{SP}/disagreements.csv", index=False)
print(f"Total human–human disagreements: {len(dd)}")
print("by dimension:", dict(dd.dimension.value_counts()))
print("by boundary:", dict(dd.boundary.value_counts()))
print("gap of 2 (0 vs 2, severe):", int((dd.gap == 2).sum()))
print("by condition:", dict(dd.condition.value_counts()))
print("by model:", dict(dd.model.value_counts()))
print("by domain:", dict(dd.domain.value_counts()))
print(f"\nSaved: merged.csv, disagreements.csv ({len(dd)} rows) in scratchpad")
