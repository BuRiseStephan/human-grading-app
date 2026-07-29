import "server-only";

import fs from "node:fs";
import path from "node:path";

import { getItemsForGrader } from "./items";
import type { Grader, GradingField, RegradeItem } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const MANIFEST_PATH = path.join(DATA_DIR, "regrade_manifest.json");

interface ManifestEntry {
  evaluation_id: string;
  display_order: number;
  dimensions: GradingField[];
}

let cache: ManifestEntry[] | null = null;

function manifest(): ManifestEntry[] {
  if (cache) return cache;
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Regrade manifest missing at ${MANIFEST_PATH}`);
  }
  cache = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as ManifestEntry[];
  return cache;
}

/** The disputed items, in the shared re-grade order, each carrying only the
 *  dimensions the two raters disagreed on. Model identity stays hidden. */
export function getRegradeItems(_grader: Grader): RegradeItem[] {
  const items = new Map(getItemsForGrader("A").map((i) => [i.evaluation_id, i]));
  return manifest()
    .map((m) => {
      const it = items.get(m.evaluation_id);
      return it ? ({ ...it, display_order: m.display_order, dimensions: m.dimensions } as RegradeItem) : null;
    })
    .filter((x): x is RegradeItem => x !== null)
    .sort((a, b) => a.display_order - b.display_order);
}

export function countRegradeItems(): number {
  return manifest().length;
}

export function regradeDimensionsByEval(): Map<string, GradingField[]> {
  return new Map(manifest().map((m) => [m.evaluation_id, m.dimensions]));
}
