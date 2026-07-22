#!/usr/bin/env python3
"""Two-panel figure: accuracy by model size vs. by prompt variant.

Both panels share a 0-100% accuracy axis so the core finding is visual: the
size effect is a thin band, the variant effect spans almost the whole range.
Numbers are computed live from the graded workbook, not hardcoded.
"""
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch

SRC = Path.home() / "Downloads/human_grading_handoff_bundle/qwen_abbreviation_study_graded.xlsx"
OUT = Path(__file__).resolve().parent.parent / "reports/figures/accuracy_size_vs_variant.png"

INK, MUTED, GRID = "#1a1d23", "#5b6270", "#dfe3ea"
BAR = "#3563b8"
BAND = "#3563b8"

rs = pd.read_excel(SRC, sheet_name="Rubric Scores")
rs["y"] = pd.to_numeric(rs["final_answer_correct"], errors="coerce")

size_order = ["qwen3_4b", "qwen3_8b", "qwen3_14b", "qwen3_32b"]
size_lab = ["4B", "8B", "14B", "32B"]
size_acc = (rs.groupby("model_key")["y"].mean() * 100).reindex(size_order)

var_order = ["full_form_control", "contextual_abbreviation", "domain_conflict_trick", "abbreviation_only"]
var_lab = ["Full-form\ncontrol", "Contextual\nabbreviation", "Domain-\nconflict", "Abbreviation-\nonly"]
var_acc = (rs.groupby("variant")["y"].mean() * 100).reindex(var_order)

overall = rs["y"].mean() * 100
size_spread = size_acc.max() - size_acc.min()
var_spread = var_acc.max() - var_acc.min()

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 11,
    "axes.edgecolor": MUTED, "text.color": INK,
    "axes.labelcolor": INK, "xtick.color": MUTED, "ytick.color": MUTED,
})

fig, (axL, axR) = plt.subplots(1, 2, figsize=(10.5, 4.8), sharey=True)
fig.subplots_adjust(left=0.075, right=0.975, top=0.80, bottom=0.16, wspace=0.08)

for ax in (axL, axR):
    ax.set_ylim(0, 100)
    ax.spines[["top", "right"]].set_visible(False)
    ax.yaxis.grid(True, color=GRID, lw=1, zorder=0)
    ax.set_axisbelow(True)
    ax.axhline(overall, color=MUTED, ls="--", lw=1, zorder=1)

def spread_arrow(ax, x, lo, hi, text):
    ax.add_patch(FancyArrowPatch((x, lo), (x, hi), arrowstyle="<->",
                 mutation_scale=10, color=INK, lw=1.3, zorder=6))
    ax.text(x + 0.06, (lo + hi) / 2, text, rotation=90, va="center", ha="left",
            fontsize=10.5, color=INK, fontweight="bold")

# ---- Panel A: model size ----
x = np.arange(4)
axL.fill_between([-0.4, 3.4], size_acc.min(), size_acc.max(), color=BAND, alpha=0.12, zorder=1)
axL.plot(x, size_acc.values, "-o", color=BAR, lw=2.2, ms=9, zorder=5)
for xi, v in zip(x, size_acc.values):
    axL.text(xi, v + 3, f"{v:.1f}", ha="center", fontsize=10.5, fontweight="bold", color=INK)
spread_arrow(axL, 3.28, size_acc.min(), size_acc.max(), f"{size_spread:.0f} pt range")
axL.text(-0.33, 68.5, f"overall {overall:.1f}%  (dashed)", fontsize=9, color=MUTED,
         ha="left", va="top")
axL.set_xlim(-0.4, 3.7)
axL.set_xticks(x); axL.set_xticklabels(size_lab)
axL.set_xlabel("Model size (parameters)", labelpad=6, color=INK)
axL.set_ylabel("Final-answer accuracy (%)", color=INK)
axL.set_title("Bigger model  →  small gain", fontsize=12.5, fontweight="bold", loc="left", pad=8)

# ---- Panel B: variant ----
xb = np.arange(4)
axR.fill_between([-0.5, 3.5], var_acc.min(), var_acc.max(), color=BAND, alpha=0.12, zorder=1)
axR.bar(xb, var_acc.values, width=0.62, color=BAR, zorder=5)
for xi, v in zip(xb, var_acc.values):
    axR.text(xi, v - 4.5, f"{v:.1f}", ha="center", va="top", fontsize=10.5,
             fontweight="bold", color="white")
spread_arrow(axR, 3.46, var_acc.min(), var_acc.max(), f"{var_spread:.0f} pt range")
axR.set_xlim(-0.6, 3.9)
axR.set_xticks(xb); axR.set_xticklabels(var_lab, fontsize=9.5)
axR.set_xlabel("Prompt variant", labelpad=6, color=INK)
axR.set_title("Different phrasing  →  huge swing", fontsize=12.5, fontweight="bold", loc="left", pad=8)

fig.suptitle("Prompt phrasing drove accuracy far more than model size",
             fontsize=15, fontweight="bold", x=0.075, ha="left", y=0.955)
fig.text(0.075, 0.885,
         f"Same 0–100% axis on both panels. 4 Qwen3 models × 4 variants, "
         f"4,800 responses, LLM-judge scored.",
         fontsize=10, color=MUTED, ha="left")

OUT.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT, dpi=200, facecolor="white")
print("wrote", OUT)
print(f"size spread {size_spread:.1f} pt | variant spread {var_spread:.1f} pt | overall {overall:.1f}%")
