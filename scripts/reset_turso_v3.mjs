// Full replacement: wipe all old grading from Turso and load the new v3 key.
// Run AFTER build_sample.py has written the new data/human_grading_sample_key.csv.
//
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/reset_turso_v3.mjs
//
// The new blinded_items.json is deployed separately (committed + pushed to Vercel).

import { createClient } from "@libsql/client";
import fs from "node:fs";

const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// Drop the old-schema grading tables so the app recreates them with the current
// (V3) columns. Safe because this is a full reset with no grading to preserve.
await c.batch(
  [
    "DROP TABLE IF EXISTS gradings",
    "DROP TABLE IF EXISTS grader_status",
    `CREATE TABLE gradings (
       evaluation_id TEXT NOT NULL, grader TEXT NOT NULL CHECK (grader IN ('A','B')),
       accuracy_score INTEGER CHECK (accuracy_score IN (0,1,2)),
       clarification_score INTEGER CHECK (clarification_score IN (0,1,2)),
       hallucination_score INTEGER CHECK (hallucination_score IN (0,1,2)),
       notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
       PRIMARY KEY (evaluation_id, grader))`,
    `CREATE TABLE grader_status (
       grader TEXT PRIMARY KEY CHECK (grader IN ('A','B')), started_at TEXT, completed_at TEXT)`,
    "CREATE TABLE IF NOT EXISTS key_blob (csv TEXT NOT NULL)",
    "DELETE FROM key_blob",
  ],
  "write"
);

const csv = fs.readFileSync("data/human_grading_sample_key.csv", "utf-8");
await c.execute({ sql: "INSERT INTO key_blob (csv) VALUES (?)", args: [csv] });

const g = Number((await c.execute("SELECT COUNT(*) n FROM gradings")).rows[0].n);
const s = Number((await c.execute("SELECT COUNT(*) n FROM grader_status")).rows[0].n);
const kb = (await c.execute("SELECT csv FROM key_blob")).rows[0].csv;
console.log("after reset -> gradings:", g, "grader_status:", s, "key rows:", kb.trim().split("\n").length - 1);
console.log("Turso reset for v3 complete.");
