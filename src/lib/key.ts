import "server-only";

import fs from "node:fs";
import path from "node:path";

import { getClient } from "./db";

/**
 * CONFIDENTIAL. This module reads the sampling key, which maps evaluation_id
 * back to run_id, model, variant, and domain. It must only ever be imported by
 * the admin/results route. Nothing here may be reachable from a grading page.
 */

// The confidential key never goes into git. In the cloud it is stored as a
// single CSV blob in the Turso `key_blob` table (loaded by the migration). With
// no Turso configured it reads the local file (or SAMPLE_KEY_CSV env).
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const KEY_PATH = process.env.SAMPLE_KEY_PATH || path.join(DATA_DIR, "human_grading_sample_key.csv");
const USE_TURSO = Boolean(process.env.TURSO_DATABASE_URL);

/** The key's CSV text from whichever source is configured, or null if none. */
async function readKeyCsv(): Promise<string | null> {
  if (process.env.SAMPLE_KEY_CSV) return process.env.SAMPLE_KEY_CSV;
  if (USE_TURSO) {
    try {
      const c = await getClient();
      const r = await c.execute("SELECT csv FROM key_blob LIMIT 1");
      const csv = r.rows[0]?.csv;
      return csv === null || csv === undefined ? null : String(csv);
    } catch {
      return null; // table not present yet (key not migrated)
    }
  }
  if (fs.existsSync(KEY_PATH)) return fs.readFileSync(KEY_PATH, "utf-8");
  return null;
}

export interface KeyRow {
  evaluation_id: string;
  display_order: string;
  run_id: string;
  model_key: string;
  parameter_count_b: string;
  variant: string;
  domain: string;
  set_id: string;
  prompt_id: string;
  [column: string]: string;
}

/** Minimal RFC-4180 CSV parser (handles quoted fields and embedded commas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export async function keyExists(): Promise<boolean> {
  return Boolean(await readKeyCsv());
}

export async function loadKey(): Promise<KeyRow[]> {
  const csv = await readKeyCsv();
  if (!csv) {
    throw new Error(
      `Confidential key not found (checked SAMPLE_KEY_CSV, Turso key_blob, and ${KEY_PATH}).`
    );
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) return [];

  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((column, idx) => {
      record[column] = cells[idx] ?? "";
    });
    return record as KeyRow;
  });
}
