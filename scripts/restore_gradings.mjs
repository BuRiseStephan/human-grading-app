// Restore gradings from a JSON array into Turso, and set key_blob from the local
// key CSV. Used to recover grading after a sample change that only removed items.
//   GRADINGS_JSON=path TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/restore_gradings.mjs
import { createClient } from "@libsql/client";
import fs from "node:fs";

const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const gradings = JSON.parse(fs.readFileSync(process.env.GRADINGS_JSON, "utf-8"));
const num = (v) => (v === "" || v == null ? null : Number(v));

await c.execute("DELETE FROM gradings");
await c.execute("DELETE FROM grader_status");
for (const g of gradings) {
  await c.execute({
    sql: `INSERT INTO gradings (evaluation_id,grader,accuracy_score,clarification_score,hallucination_score,notes,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [
      g.evaluation_id, g.grader, num(g.accuracy_score), num(g.clarification_score),
      num(g.hallucination_score), g.notes || "",
      g.created_at || new Date().toISOString(), g.updated_at || new Date().toISOString(),
    ],
  });
}

const csv = fs.readFileSync("data/human_grading_sample_key.csv", "utf-8");
await c.execute("CREATE TABLE IF NOT EXISTS key_blob (csv TEXT NOT NULL)");
await c.execute("DELETE FROM key_blob");
await c.execute({ sql: "INSERT INTO key_blob (csv) VALUES (?)", args: [csv] });

const n = (await c.execute("SELECT grader, COUNT(*) n FROM gradings GROUP BY grader")).rows;
console.log("restored gradings:", n.map((r) => `${r.grader}:${Number(r.n)}`).join(" "));
console.log("key rows:", csv.trim().split("\n").length - 1);
