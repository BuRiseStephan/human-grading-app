#!/usr/bin/env python3
"""Every one of the 4,800 responses as a single dot.

16 facets (4 model sizes x 4 prompt variants), 300 responses each. Dots are
sorted correct-first so each cell reads like a fill level. Blue = judge marked
the final answer correct, orange = incorrect.
"""
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

SRC = Path.home() / "Downloads/human_grading_handoff_bundle/qwen_abbreviation_study_graded.xlsx"
OUT = Path(__file__).resolve().parent.parent / "reports/figures/all_4800_points.png"

CORRECT, WRONG = "#3563b8", "#e28743"
INK, MUTED, GRIDBG = "#1a1d23", "#5b6270", "#f4f6f9"
NCOL = 20  # dots per row within a facet (300 = 20 x 15)

rs = pd.read_excel(SRC, sheet_name="Rubric Scores")
rs["y"] = pd.to_numeric(rs["final_answer_correct"], errors="coerce")

models = ["qwen3_4b", "qwen3_8b", "qwen3_14b", "qwen3_32b"]
model_lab = ["Qwen3 4B", "Qwen3 8B", "Qwen3 14B", "Qwen3 32B"]
variants = ["full_form_control", "contextual_abbreviation", "domain_conflict_trick", "abbreviation_only"]
var_lab = ["Full-form\ncontrol", "Contextual\nabbreviation", "Domain-\nconflict", "Abbreviation-\nonly"]

plt.rcParams.update({"font.family": "DejaVu Sans", "text.color": INK})

fig, axes = plt.subplots(4, 4, figsize=(11.5, 12.6))
fig.subplots_adjust(left=0.115, right=0.985, top=0.82, bottom=0.04, wspace=0.14, hspace=0.28)

total = 0
for r, model in enumerate(models):
    for c, variant in enumerate(variants):
        ax = axes[r, c]
        cell = rs[(rs.model_key == model) & (rs.variant == variant)]
        vals = np.sort(cell["y"].dropna().values)[::-1]  # correct (1) first
        n = len(vals); total += n
        xs = np.arange(n) % NCOL
        ys = -(np.arange(n) // NCOL)
        colors = np.where(vals == 1, CORRECT, WRONG)
        ax.scatter(xs, ys, c=colors, s=22, edgecolors="white", linewidths=0.4, zorder=3)

        acc = 100 * vals.mean()
        ax.set_facecolor(GRIDBG)
        ax.set_xticks([]); ax.set_yticks([])
        for s in ax.spines.values():
            s.set_color("#e0e4ea")
        ax.set_xlim(-1, NCOL); ax.set_ylim(ys.min() - 1, 1)
        ax.text(0.5, 1.04, f"{acc:.1f}% correct", transform=ax.transAxes,
                ha="center", va="bottom", fontsize=11, fontweight="bold", color=INK)

# Column headers and row labels as figure text, positioned from the axes grid so
# they never collide with the title band above.
for c, lab in enumerate(var_lab):
    p = axes[0, c].get_position()
    fig.text((p.x0 + p.x1) / 2, 0.845, lab, ha="center", va="bottom",
             fontsize=12.5, fontweight="bold", color=INK)
for r, lab in enumerate(model_lab):
    p = axes[r, 0].get_position()
    fig.text(0.05, (p.y0 + p.y1) / 2, lab, ha="center", va="center", rotation=90,
             fontsize=12.5, fontweight="bold", color=INK)

fig.suptitle("All 4,800 responses, one dot each", fontsize=17, fontweight="bold",
             x=0.115, ha="left", y=0.975)
fig.text(0.115, 0.945,
         "Rows = model size · columns = prompt variant · 300 responses per cell, sorted correct-first.",
         fontsize=11, color=MUTED, ha="left")
fig.legend(handles=[Line2D([0], [0], marker="o", color="w", markerfacecolor=CORRECT, markersize=11, label="Final answer correct"),
                    Line2D([0], [0], marker="o", color="w", markerfacecolor=WRONG, markersize=11, label="Incorrect")],
           loc="upper right", bbox_to_anchor=(0.985, 0.92), frameon=False, fontsize=11,
           ncol=2, handletextpad=0.3, columnspacing=1.4)

OUT.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT, dpi=170, facecolor="white")
print("wrote", OUT, "| plotted", total, "points")
