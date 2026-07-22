import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { BlindedItem, Grader } from "./types";

// Blinded items and the rubric are non-confidential and ship in the repo, so
// these default to ./data; DATA_DIR lets the cloud override the location.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const ITEMS_PATH = path.join(DATA_DIR, "blinded_items.json");
const RUBRIC_PATH = path.join(DATA_DIR, "human_grading_rubric.txt");

/**
 * Fields that must never appear in a grader-facing payload. Checked at load
 * time so a regenerated blinded_items.json cannot silently unblind the study.
 */
const FORBIDDEN_FIELDS = [
  "run_id",
  "model_key",
  "model_id",
  "actual_model_id",
  "parameter_count_b",
  "api_gateway",
  "provider",
  "variant",
  "domain",
  "set_id",
  "prompt_id",
  "reasoning_content",
  "cost_usd",
  "total_tokens",
];

let cache: BlindedItem[] | null = null;

function loadAll(): BlindedItem[] {
  if (cache) return cache;

  if (!fs.existsSync(ITEMS_PATH)) {
    throw new Error(
      `Blinded items file missing at ${ITEMS_PATH}. Run: python3 scripts/build_sample.py`
    );
  }

  const parsed = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf-8")) as BlindedItem[];

  for (const item of parsed) {
    for (const field of FORBIDDEN_FIELDS) {
      if (field in item) {
        throw new Error(
          `Blinding violation: ${ITEMS_PATH} contains "${field}" on ${item.evaluation_id}. Refusing to serve.`
        );
      }
    }
  }

  cache = parsed;
  return cache;
}

/**
 * All 480 items in the single shared presentation order. Both graders grade the
 * same items in the same sequence; the `grader` argument is kept so callers read
 * clearly and so a per-grader order could be reintroduced without touching them.
 */
export function getItemsForGrader(_grader: Grader): BlindedItem[] {
  return [...loadAll()].sort((a, b) => a.display_order - b.display_order);
}

export function itemExists(evaluationId: string): boolean {
  return loadAll().some((item) => item.evaluation_id === evaluationId);
}

export function countItemsForGrader(grader: Grader): number {
  return getItemsForGrader(grader).length;
}

export function getRubricText(): string {
  if (!fs.existsSync(RUBRIC_PATH)) {
    throw new Error(`Rubric file missing at ${RUBRIC_PATH}`);
  }
  return fs.readFileSync(RUBRIC_PATH, "utf-8");
}
