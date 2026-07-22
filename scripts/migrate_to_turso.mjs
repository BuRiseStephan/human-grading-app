// One-time migration: push existing grading + the confidential key into Turso.
//
// Run locally after creating your Turso database:
//   TURSO_DATABASE_URL="libsql://<db>.turso.io" \
//   TURSO_AUTH_TOKEN="<token>" \
//   node scripts/migrate_to_turso.mjs
//
// Reads:
//   - grading rows from data/grading.db (the live local database)
//   - the confidential key from data/human_grading_sample_key.csv
// Writes them into Turso (gradings, grader_status, key_blob). Idempotent:
// re-running updates rather than duplicating.

import { createClient } from "@libsql/client";
import fs from "node:fs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables.");
  process.exit(1);
}

const SOURCE_DB = process.env.SOURCE_DB || "file:./data/grading.db";
const KEY_CSV = process.env.KEY_CSV || "data/human_grading_sample_key.csv";

const turso = createClient({ url, authToken });
const local = createClient({ url: SOURCE_DB });

await turso.batch(
  [
    `CREATE TABLE IF NOT EXISTS gradings (
       evaluation_id TEXT NOT NULL, grader TEXT NOT NULL CHECK (grader IN ('A','B')),
       abbreviation_accuracy_score INTEGER CHECK (abbreviation_accuracy_score BETWEEN 1 AND 4),
       final_answer_accuracy_score INTEGER CHECK (final_answer_accuracy_score BETWEEN 1 AND 4),
       clarification_appropriate INTEGER CHECK (clarification_appropriate IN (0,1)),
       asked_for_clarification INTEGER CHECK (asked_for_clarification IN (0,1)),
       unsupported_assumption INTEGER CHECK (unsupported_assumption IN (0,1,2)),
       overconfident_wrong INTEGER CHECK (overconfident_wrong IN (0,1)),
       hallucinated_detail INTEGER CHECK (hallucinated_detail IN (0,1)),
       unsafe_or_risky INTEGER CHECK (unsafe_or_risky IN (0,1)),
       notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
       PRIMARY KEY (evaluation_id, grader))`,
    `CREATE TABLE IF NOT EXISTS grader_status (
       grader TEXT PRIMARY KEY CHECK (grader IN ('A','B')), started_at TEXT, completed_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS key_blob (csv TEXT NOT NULL)`,
  ],
  "write"
);

// --- gradings ---
const gcols = [
  "evaluation_id", "grader", "abbreviation_accuracy_score", "final_answer_accuracy_score",
  "clarification_appropriate", "asked_for_clarification", "unsupported_assumption",
  "overconfident_wrong", "hallucinated_detail", "unsafe_or_risky", "notes", "created_at", "updated_at",
];
const grows = (await local.execute("SELECT * FROM gradings")).rows;
for (const r of grows) {
  await turso.execute({
    sql: `INSERT INTO gradings (${gcols.join(",")}) VALUES (${gcols.map(() => "?").join(",")})
          ON CONFLICT(evaluation_id,grader) DO UPDATE SET
            abbreviation_accuracy_score=excluded.abbreviation_accuracy_score,
            final_answer_accuracy_score=excluded.final_answer_accuracy_score,
            clarification_appropriate=excluded.clarification_appropriate,
            asked_for_clarification=excluded.asked_for_clarification,
            unsupported_assumption=excluded.unsupported_assumption,
            overconfident_wrong=excluded.overconfident_wrong,
            hallucinated_detail=excluded.hallucinated_detail,
            unsafe_or_risky=excluded.unsafe_or_risky,
            notes=excluded.notes, updated_at=excluded.updated_at`,
    args: gcols.map((c) => r[c] ?? null),
  });
}

// --- grader_status ---
const srows = (await local.execute("SELECT * FROM grader_status")).rows;
for (const r of srows) {
  await turso.execute({
    sql: `INSERT INTO grader_status (grader,started_at,completed_at) VALUES (?,?,?)
          ON CONFLICT(grader) DO UPDATE SET started_at=excluded.started_at, completed_at=excluded.completed_at`,
    args: [r.grader, r.started_at ?? null, r.completed_at ?? null],
  });
}

// --- confidential key (single CSV blob) ---
if (fs.existsSync(KEY_CSV)) {
  const csv = fs.readFileSync(KEY_CSV, "utf-8");
  await turso.execute("DELETE FROM key_blob");
  await turso.execute({ sql: "INSERT INTO key_blob (csv) VALUES (?)", args: [csv] });
  console.log(`key_blob: loaded ${KEY_CSV} (${csv.length} bytes)`);
} else {
  console.log(`key_blob: SKIPPED (no ${KEY_CSV} found)`);
}

const n = (await turso.execute("SELECT grader, COUNT(*) n FROM gradings GROUP BY grader")).rows;
console.log("Turso gradings now:", n.map((r) => `${r.grader}:${r.n}`).join(" "));
console.log("Migration complete.");
