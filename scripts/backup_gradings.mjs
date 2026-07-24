import { createClient } from "@libsql/client";
import fs from "node:fs";
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const g = (await c.execute("SELECT * FROM gradings ORDER BY grader, evaluation_id")).rows;
if (!g.length) { console.log("no gradings to back up"); process.exit(0); }
const cols = Object.keys(g[0]);
const q = String.fromCharCode(34);
const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? q + s.split(q).join(q + q) + q : s; };
const csv = [cols.join(","), ...g.map((r) => cols.map((x) => esc(r[x])).join(","))].join("\n");
fs.mkdirSync("exports", { recursive: true });
const out = "exports/old_grading_backup_" + process.env.STAMP + ".csv";
fs.writeFileSync(out, csv + "\n");
const per = {}; g.forEach((r) => (per[r.grader] = (per[r.grader] || 0) + 1));
console.log("backed up", g.length, "gradings", JSON.stringify(per), "->", out);
