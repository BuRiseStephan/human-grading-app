import "server-only";

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

import { FIELD_DOMAINS, REQUIRED_FIELDS, type Grader, type GraderStatus, type Grading } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
// The grading database is the only file that must persist on writable storage.
// In the cloud it lives on a mounted disk via GRADING_DB_PATH; locally it
// defaults to ./data/grading.db, unchanged.
const DB_PATH = process.env.GRADING_DB_PATH || path.join(DATA_DIR, "grading.db");
// Optional one-time migration seed. If the target database has no grading rows
// yet, the rows in this snapshot are imported once (used to move existing
// grading onto a fresh cloud disk). Importing "when empty" rather than "when the
// file is missing" means it still works if an empty app was deployed first.
const SEED_DB_PATH = process.env.SEED_DB_PATH || path.join(process.cwd(), "seed", "grading.db");

let db: Database.Database | null = null;

/** Copy grading rows from the seed snapshot, but only into an empty database. */
function seedIfEmpty(target: Database.Database): void {
  if (!fs.existsSync(SEED_DB_PATH)) return;
  const already = (target.prepare("SELECT COUNT(*) AS n FROM gradings").get() as { n: number }).n;
  if (already > 0) return;

  const seed = new Database(SEED_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const copyTable = (table: string) => {
      const rows = seed.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      if (rows.length === 0) return;
      const cols = Object.keys(rows[0]);
      const stmt = target.prepare(
        `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`
      );
      target.transaction((rs: Record<string, unknown>[]) => rs.forEach((r) => stmt.run(r)))(rows);
    };
    copyTable("gradings");
    copyTable("grader_status");
  } finally {
    seed.close();
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS gradings (
      evaluation_id               TEXT NOT NULL,
      grader                      TEXT NOT NULL CHECK (grader IN ('A','B')),
      abbreviation_accuracy_score INTEGER CHECK (abbreviation_accuracy_score BETWEEN 1 AND 4),
      final_answer_accuracy_score INTEGER CHECK (final_answer_accuracy_score BETWEEN 1 AND 4),
      clarification_appropriate   INTEGER CHECK (clarification_appropriate IN (0,1)),
      asked_for_clarification     INTEGER CHECK (asked_for_clarification IN (0,1)),
      unsupported_assumption      INTEGER CHECK (unsupported_assumption IN (0,1,2)),
      overconfident_wrong         INTEGER CHECK (overconfident_wrong IN (0,1)),
      hallucinated_detail         INTEGER CHECK (hallucinated_detail IN (0,1)),
      -- retained so existing databases keep their shape; no longer collected in the UI
      unsafe_or_risky             INTEGER CHECK (unsafe_or_risky IN (0,1)),
      notes                       TEXT NOT NULL DEFAULT '',
      created_at                  TEXT NOT NULL,
      updated_at                  TEXT NOT NULL,
      PRIMARY KEY (evaluation_id, grader)
    );

    CREATE TABLE IF NOT EXISTS grader_status (
      grader       TEXT PRIMARY KEY CHECK (grader IN ('A','B')),
      started_at   TEXT,
      completed_at TEXT
    );
  `);

  seedIfEmpty(db);

  return db;
}

export function isLocked(grader: Grader): boolean {
  const row = getDb()
    .prepare("SELECT completed_at FROM grader_status WHERE grader = ?")
    .get(grader) as { completed_at: string | null } | undefined;
  return Boolean(row?.completed_at);
}

export function getStatus(grader: Grader): GraderStatus {
  const row = getDb()
    .prepare("SELECT grader, started_at, completed_at FROM grader_status WHERE grader = ?")
    .get(grader) as GraderStatus | undefined;
  return row ?? { grader, started_at: null, completed_at: null };
}

export function getAllStatuses(): GraderStatus[] {
  return (["A", "B"] as Grader[]).map(getStatus);
}

export function markStarted(grader: Grader): void {
  getDb()
    .prepare(
      `INSERT INTO grader_status (grader, started_at, completed_at)
       VALUES (?, ?, NULL)
       ON CONFLICT(grader) DO UPDATE SET started_at = COALESCE(grader_status.started_at, excluded.started_at)`
    )
    .run(grader, new Date().toISOString());
}

export function getGradings(grader: Grader): Grading[] {
  return getDb()
    .prepare("SELECT * FROM gradings WHERE grader = ? ORDER BY evaluation_id")
    .all(grader) as Grading[];
}

export function getAllGradings(): Grading[] {
  return getDb()
    .prepare("SELECT * FROM gradings ORDER BY grader, evaluation_id")
    .all() as Grading[];
}

export function countCompleted(grader: Grader): number {
  const required = REQUIRED_FIELDS.map((f) => `${f} IS NOT NULL`).join(" AND ");
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM gradings WHERE grader = ? AND ${required}`)
    .get(grader) as { n: number };
  return row.n;
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

export function saveGrading(
  grader: Grader,
  evaluationId: string,
  payload: Record<string, unknown>
): Grading {
  if (isLocked(grader)) {
    throw new ValidationError(`Grader ${grader} has marked grading complete; answers are locked.`);
  }

  const values = {
    abbreviation_accuracy_score: coerceScore("abbreviation_accuracy_score", payload.abbreviation_accuracy_score),
    final_answer_accuracy_score: coerceScore("final_answer_accuracy_score", payload.final_answer_accuracy_score),
    clarification_appropriate: coerceScore("clarification_appropriate", payload.clarification_appropriate),
    asked_for_clarification: coerceScore("asked_for_clarification", payload.asked_for_clarification),
    unsupported_assumption: coerceScore("unsupported_assumption", payload.unsupported_assumption),
    overconfident_wrong: coerceScore("overconfident_wrong", payload.overconfident_wrong),
    hallucinated_detail: coerceScore("hallucinated_detail", payload.hallucinated_detail),
    notes: typeof payload.notes === "string" ? payload.notes : "",
  };

  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO gradings (
         evaluation_id, grader,
         abbreviation_accuracy_score, final_answer_accuracy_score,
         clarification_appropriate, asked_for_clarification,
         unsupported_assumption, overconfident_wrong,
         hallucinated_detail, notes,
         created_at, updated_at
       ) VALUES (
         @evaluation_id, @grader,
         @abbreviation_accuracy_score, @final_answer_accuracy_score,
         @clarification_appropriate, @asked_for_clarification,
         @unsupported_assumption, @overconfident_wrong,
         @hallucinated_detail, @notes,
         @now, @now
       )
       ON CONFLICT(evaluation_id, grader) DO UPDATE SET
         abbreviation_accuracy_score = excluded.abbreviation_accuracy_score,
         final_answer_accuracy_score = excluded.final_answer_accuracy_score,
         clarification_appropriate   = excluded.clarification_appropriate,
         asked_for_clarification     = excluded.asked_for_clarification,
         unsupported_assumption      = excluded.unsupported_assumption,
         overconfident_wrong         = excluded.overconfident_wrong,
         hallucinated_detail         = excluded.hallucinated_detail,
         notes                       = excluded.notes,
         updated_at                  = excluded.updated_at`
    )
    .run({ evaluation_id: evaluationId, grader, now, ...values });

  markStarted(grader);

  return getDb()
    .prepare("SELECT * FROM gradings WHERE evaluation_id = ? AND grader = ?")
    .get(evaluationId, grader) as Grading;
}

export function markComplete(grader: Grader, expectedTotal: number): void {
  if (isLocked(grader)) {
    throw new ValidationError(`Grader ${grader} is already locked.`);
  }
  const done = countCompleted(grader);
  if (done < expectedTotal) {
    throw new ValidationError(
      `Cannot lock: ${done} of ${expectedTotal} items are fully graded. ` +
        `Every item needs all required fields answered.`
    );
  }
  getDb()
    .prepare(
      `INSERT INTO grader_status (grader, started_at, completed_at)
       VALUES (?, ?, ?)
       ON CONFLICT(grader) DO UPDATE SET completed_at = excluded.completed_at`
    )
    .run(grader, new Date().toISOString(), new Date().toISOString());
}
