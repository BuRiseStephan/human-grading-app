import "server-only";

import { createClient, type Client, type Row } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

import { FIELD_DOMAINS, requiredFields, type Grader, type GraderStatus, type Grading } from "./types";
import { variantByEvaluation } from "./items";
import { regradeDimensionsByEval } from "./regrade";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = process.env.GRADING_DB_PATH || path.join(DATA_DIR, "grading.db");

// In the cloud the database is Turso (set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
// With no Turso env set it falls back to a local SQLite file — the same file the
// app has always used — so local runs are unchanged.
const DB_URL = process.env.TURSO_DATABASE_URL || `file:${DB_PATH}`;
const DB_AUTH = process.env.TURSO_AUTH_TOKEN;

let clientPromise: Promise<Client> | null = null;

/** Shared libSQL client; creates the schema once on first use. */
export async function getClient(): Promise<Client> {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    if (DB_URL.startsWith("file:")) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }
    const client = createClient({ url: DB_URL, authToken: DB_AUTH });
    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS gradings (
           evaluation_id       TEXT NOT NULL,
           grader              TEXT NOT NULL CHECK (grader IN ('A','B')),
           accuracy_score      INTEGER CHECK (accuracy_score IN (0,1,2)),
           clarification_score INTEGER CHECK (clarification_score IN (0,1,2)),
           hallucination_score INTEGER CHECK (hallucination_score IN (0,1,2)),
           notes               TEXT NOT NULL DEFAULT '',
           created_at          TEXT NOT NULL,
           updated_at          TEXT NOT NULL,
           PRIMARY KEY (evaluation_id, grader)
         )`,
        `CREATE TABLE IF NOT EXISTS grader_status (
           grader       TEXT PRIMARY KEY CHECK (grader IN ('A','B')),
           started_at   TEXT,
           completed_at TEXT
         )`,
        // Adjudication round: re-grades of the disputed items, kept SEPARATE from
        // the original gradings so nothing is overwritten.
        `CREATE TABLE IF NOT EXISTS regradings (
           evaluation_id       TEXT NOT NULL,
           grader              TEXT NOT NULL CHECK (grader IN ('A','B')),
           accuracy_score      INTEGER CHECK (accuracy_score IN (0,1,2)),
           clarification_score INTEGER CHECK (clarification_score IN (0,1,2)),
           hallucination_score INTEGER CHECK (hallucination_score IN (0,1,2)),
           notes               TEXT NOT NULL DEFAULT '',
           created_at          TEXT NOT NULL,
           updated_at          TEXT NOT NULL,
           PRIMARY KEY (evaluation_id, grader)
         )`,
      ],
      "write"
    );
    return client;
  })();
  return clientPromise;
}

function toNum(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function toStrOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function rowToGrading(r: Row): Grading {
  return {
    evaluation_id: String(r.evaluation_id),
    grader: String(r.grader) as Grader,
    accuracy_score: toNum(r.accuracy_score),
    clarification_score: toNum(r.clarification_score),
    hallucination_score: toNum(r.hallucination_score),
    notes: r.notes === null || r.notes === undefined ? "" : String(r.notes),
    updated_at: String(r.updated_at),
  };
}

/** Is this grading complete for its item's condition? */
function isGradingComplete(g: Grading, variant: string | undefined): boolean {
  return requiredFields(variant ?? "").every((f) => g[f] !== null && g[f] !== undefined);
}

export async function isLocked(grader: Grader): Promise<boolean> {
  const c = await getClient();
  const r = await c.execute({
    sql: "SELECT completed_at FROM grader_status WHERE grader = ?",
    args: [grader],
  });
  return Boolean(r.rows[0]?.completed_at);
}

export async function getStatus(grader: Grader): Promise<GraderStatus> {
  const c = await getClient();
  const r = await c.execute({
    sql: "SELECT started_at, completed_at FROM grader_status WHERE grader = ?",
    args: [grader],
  });
  const row = r.rows[0];
  return {
    grader,
    started_at: row ? toStrOrNull(row.started_at) : null,
    completed_at: row ? toStrOrNull(row.completed_at) : null,
  };
}

export async function getAllStatuses(): Promise<GraderStatus[]> {
  return Promise.all((["A", "B"] as Grader[]).map(getStatus));
}

export async function markStarted(grader: Grader): Promise<void> {
  const c = await getClient();
  await c.execute({
    sql: `INSERT INTO grader_status (grader, started_at, completed_at)
          VALUES (?, ?, NULL)
          ON CONFLICT(grader) DO UPDATE SET started_at = COALESCE(grader_status.started_at, excluded.started_at)`,
    args: [grader, new Date().toISOString()],
  });
}

export async function getGradings(grader: Grader): Promise<Grading[]> {
  const c = await getClient();
  const r = await c.execute({
    sql: "SELECT * FROM gradings WHERE grader = ? ORDER BY evaluation_id",
    args: [grader],
  });
  return r.rows.map(rowToGrading);
}

export async function getAllGradings(): Promise<Grading[]> {
  const c = await getClient();
  const r = await c.execute("SELECT * FROM gradings ORDER BY grader, evaluation_id");
  return r.rows.map(rowToGrading);
}

export async function countCompleted(grader: Grader): Promise<number> {
  // Completeness depends on each item's condition, so evaluate in JS against the
  // variant map rather than a single SQL predicate.
  const variants = variantByEvaluation();
  const gradings = await getGradings(grader);
  return gradings.filter((g) => isGradingComplete(g, variants.get(g.evaluation_id))).length;
}

export async function countTouched(grader: Grader): Promise<number> {
  const c = await getClient();
  const r = await c.execute({
    sql: "SELECT COUNT(*) AS n FROM gradings WHERE grader = ?",
    args: [grader],
  });
  return Number(r.rows[0].n);
}

export async function getLastActivity(grader: Grader): Promise<string | null> {
  const c = await getClient();
  const r = await c.execute({
    sql: "SELECT MAX(updated_at) AS t FROM gradings WHERE grader = ?",
    args: [grader],
  });
  return toStrOrNull(r.rows[0]?.t);
}

export class ValidationError extends Error {}

/**
 * Coerce and range-check one submitted grading field.
 * Empty string / null means "not answered yet", which is allowed on save so a
 * grader can leave an item partially filled and come back to it.
 */
function coerceScore(field: string, raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError(`${field} must be an integer, got ${JSON.stringify(raw)}`);
  }

  const allowed = FIELD_DOMAINS[field];
  if (allowed && !allowed.includes(n)) {
    throw new ValidationError(`${field} must be one of ${allowed.join(", ")}, got ${n}`);
  }
  return n;
}

export async function saveGrading(
  grader: Grader,
  evaluationId: string,
  payload: Record<string, unknown>
): Promise<Grading> {
  if (await isLocked(grader)) {
    throw new ValidationError(`Grader ${grader} has marked grading complete; answers are locked.`);
  }

  const args = [
    evaluationId,
    grader,
    coerceScore("accuracy_score", payload.accuracy_score),
    coerceScore("clarification_score", payload.clarification_score),
    coerceScore("hallucination_score", payload.hallucination_score),
    typeof payload.notes === "string" ? payload.notes : "",
    new Date().toISOString(), // created_at
    new Date().toISOString(), // updated_at
  ];

  const c = await getClient();
  await c.execute({
    sql: `INSERT INTO gradings (
            evaluation_id, grader,
            accuracy_score, clarification_score, hallucination_score,
            notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(evaluation_id, grader) DO UPDATE SET
            accuracy_score      = excluded.accuracy_score,
            clarification_score = excluded.clarification_score,
            hallucination_score = excluded.hallucination_score,
            notes               = excluded.notes,
            updated_at          = excluded.updated_at`,
    args,
  });

  await markStarted(grader);

  const r = await c.execute({
    sql: "SELECT * FROM gradings WHERE evaluation_id = ? AND grader = ?",
    args: [evaluationId, grader],
  });
  return rowToGrading(r.rows[0]);
}

export async function markComplete(grader: Grader, expectedTotal: number): Promise<void> {
  if (await isLocked(grader)) {
    throw new ValidationError(`Grader ${grader} is already locked.`);
  }
  const done = await countCompleted(grader);
  if (done < expectedTotal) {
    throw new ValidationError(
      `Cannot lock: ${done} of ${expectedTotal} items are fully graded. ` +
        `Every item needs all required fields answered.`
    );
  }
  const now = new Date().toISOString();
  const c = await getClient();
  await c.execute({
    sql: `INSERT INTO grader_status (grader, started_at, completed_at)
          VALUES (?, ?, ?)
          ON CONFLICT(grader) DO UPDATE SET completed_at = excluded.completed_at`,
    args: [grader, now, now],
  });
}

// --- adjudication round (regradings) -------------------------------------

export async function getRegradings(grader: Grader): Promise<Grading[]> {
  const c = await getClient();
  const r = await c.execute({
    sql: "SELECT * FROM regradings WHERE grader = ? ORDER BY evaluation_id",
    args: [grader],
  });
  return r.rows.map(rowToGrading);
}

export async function countRegradeCompleted(grader: Grader): Promise<number> {
  // A re-grade is complete when every disputed dimension for that item is filled.
  const dims = regradeDimensionsByEval();
  const rows = await getRegradings(grader);
  return rows.filter((g) => {
    const need = dims.get(g.evaluation_id) ?? [];
    return need.length > 0 && need.every((f) => g[f] !== null && g[f] !== undefined);
  }).length;
}

export async function saveRegrading(
  grader: Grader,
  evaluationId: string,
  payload: Record<string, unknown>
): Promise<Grading> {
  const args = [
    evaluationId,
    grader,
    coerceScore("accuracy_score", payload.accuracy_score),
    coerceScore("clarification_score", payload.clarification_score),
    coerceScore("hallucination_score", payload.hallucination_score),
    typeof payload.notes === "string" ? payload.notes : "",
    new Date().toISOString(),
    new Date().toISOString(),
  ];
  const c = await getClient();
  await c.execute({
    sql: `INSERT INTO regradings (
            evaluation_id, grader, accuracy_score, clarification_score, hallucination_score,
            notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(evaluation_id, grader) DO UPDATE SET
            accuracy_score      = excluded.accuracy_score,
            clarification_score = excluded.clarification_score,
            hallucination_score = excluded.hallucination_score,
            notes               = excluded.notes,
            updated_at          = excluded.updated_at`,
    args,
  });
  const r = await c.execute({
    sql: "SELECT * FROM regradings WHERE evaluation_id = ? AND grader = ?",
    args: [evaluationId, grader],
  });
  return rowToGrading(r.rows[0]);
}
