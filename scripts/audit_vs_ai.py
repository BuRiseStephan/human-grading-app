#!/usr/bin/env python3
"""Compare each human rater (A, B) against the LLM-judge grades. Read-only."""
import os, json, csv, collections
import pandas as pd
from sklearn.metrics import cohen_kappa_score

SP = os.environ["SP"]
XL = "/Users/stephansozkes/Downloads/question_set_abbreviations_v3.xlsx"

# human grades merged earlier (has response_id/condition/model); add run_id from key
key = {r["evaluation_id"]: r for r in csv.DictReader(open("data/human_grading_sample_key.csv"))}
grad = json.load(open(f"{SP}/gradings.json"))
by_eval = collections.defaultdict(dict)
for g in grad:
    by_eval[g["evaluation_id"]][g["grader"]] = g

# AI grades keyed by run_id
ai = pd.read_excel(XL, sheet_name="LLM_graded_responses")
ai_by_run = {str(r.run_id): r for _, r in ai.iterrows()}

rows = []
for eid, k in key.items():
    A = by_eval.get(eid, {}).get("A", {}); B = by_eval.get(eid, {}).get("B", {})
    a = ai_by_run.get(str(k["run_id"]))
    rows.append({
        "response_id": eid, "run_id": k["run_id"], "condition": k["variant"],
        "model": k["model_key"], "domain": k["domain"],
        "A_acc": A.get("accuracy_score"), "A_clar": A.get("clarification_score"), "A_hall": A.get("hallucination_score"),
        "B_acc": B.get("accuracy_score"), "B_clar": B.get("clarification_score"), "B_hall": B.get("hallucination_score"),
        "AI_acc": (a["accuracy_score_0_2"] if a is not None else None),
        "AI_clar": (a["clarification_score_0_2"] if a is not None else None),
        "AI_hall": (a["hallucination_score_0_2"] if a is not None else None),
        "ai_matched": a is not None,
    })
df = pd.DataFrame(rows)
df.to_csv(f"{SP}/merged_with_ai.csv", index=False)

print(f"human records: {len(df)} | matched to an AI-graded row by run_id: {int(df.ai_matched.sum())} "
      f"| unmatched: {int((~df.ai_matched).sum())}")

APPLIC = {"acc": {"real_low_context","real_high_context","synthetic_high_context"},
          "clar": {"real_low_context"}, "hall": {"synthetic_high_context"}}
NAME = {"acc":"ACCURACY","clar":"CLARIFICATION","hall":"HALLUCINATION"}

def metrics(a, b):
    a = pd.to_numeric(a, errors="coerce"); b = pd.to_numeric(b, errors="coerce")
    m = a.notna() & b.notna(); a, b = a[m].astype(int), b[m].astype(int)
    n = len(a)
    if n == 0: return None
    exact = int((a==b).sum()); adj = int((abs(a-b)<=1).sum()); mad = float(abs(a-b).mean())
    try: k = cohen_kappa_score(a,b,labels=[0,1,2])
    except Exception: k = float("nan")
    try: kw = cohen_kappa_score(a,b,labels=[0,1,2],weights="linear")
    except Exception: kw = float("nan")
    cm = pd.crosstab(a,b).reindex(index=[0,1,2],columns=[0,1,2],fill_value=0)
    return dict(n=n,exact=exact,ep=100*exact/n,adj=adj,ap=100*adj/n,k=k,kw=kw,mad=mad,cm=cm)

def line(t,mm):
    if mm is None: print(f"  {t}: n=0"); return
    print(f"  {t:22} n={mm['n']:>3}  exact={mm['ep']:5.1f}%  adj±1={mm['ap']:5.1f}%  "
          f"kappa={mm['k']:.3f}  kappa_lin={mm['kw']:.3f}  MAD={mm['mad']:.2f}")

for dim in ["acc","clar","hall"]:
    conds = APPLIC[dim]; sub = df[df.condition.isin(conds)]
    print("\n" + "="*74 + f"\n{NAME[dim]}  (n applicable={len(sub)})\n" + "="*74)
    mA = metrics(sub[f"A_{dim}"], sub[f"AI_{dim}"])
    mB = metrics(sub[f"B_{dim}"], sub[f"AI_{dim}"])
    mAB = metrics(sub[f"A_{dim}"], sub[f"B_{dim}"])
    line("Grader A  vs  AI", mA)
    line("Grader B  vs  AI", mB)
    line("A vs B (reference)", mAB)
    if mA: print("  A-vs-AI confusion (rows=A, cols=AI):\n" + mA["cm"].to_string().replace("\n","\n    "))
    if mB: print("  B-vs-AI confusion (rows=B, cols=AI):\n" + mB["cm"].to_string().replace("\n","\n    "))
    # by model
    print("  by model (A-vs-AI | B-vs-AI kappa):")
    for mdl in sorted(sub.model.unique()):
        s=sub[sub.model==mdl]; a=metrics(s[f"A_{dim}"],s[f"AI_{dim}"]); b=metrics(s[f"B_{dim}"],s[f"AI_{dim}"])
        print(f"    {mdl:11} A:k={a['k']:.3f} exact={a['ep']:.0f}%   B:k={b['k']:.3f} exact={b['ep']:.0f}%")

# where do humans agree with each OTHER but the AI differs?
print("\n" + "="*74 + "\nWHERE BOTH HUMANS AGREE BUT THE AI DISAGREES\n" + "="*74)
for dim in ["acc","clar","hall"]:
    conds=APPLIC[dim]; sub=df[df.condition.isin(conds)].copy()
    a=pd.to_numeric(sub[f"A_{dim}"],errors="coerce"); b=pd.to_numeric(sub[f"B_{dim}"],errors="coerce"); j=pd.to_numeric(sub[f"AI_{dim}"],errors="coerce")
    m=a.notna()&b.notna()&j.notna()
    both=(a==b)&m; aidiff=both&(j!=a)
    print(f"  {NAME[dim]}: both humans agree on {int(both.sum())}; AI differs on {int(aidiff.sum())} of those "
          f"({100*aidiff.sum()/max(both.sum(),1):.0f}%)")
