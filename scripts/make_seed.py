#!/usr/bin/env python3
"""Snapshot the live grading database into seed/grading.db for cloud migration.

Uses SQLite's online backup API, which produces a complete, consistent copy
INCLUDING any data still sitting in the WAL file — so unlike a plain `cp`, this
never loses recent grading. Safe to run while the server is live.

On the cloud host's first boot, src/lib/db.ts copies seed/grading.db onto the
persistent disk if no database exists there yet, migrating all grading in one go.

    python3 scripts/make_seed.py
"""
import sqlite3
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "data" / "grading.db"
DST = REPO / "seed" / "grading.db"

if not SRC.exists():
    raise SystemExit(f"No live database at {SRC}")

DST.parent.mkdir(parents=True, exist_ok=True)
# Remove any stale seed + its WAL sidecars so the snapshot is clean.
for p in [DST, DST.with_suffix(".db-wal"), DST.with_suffix(".db-shm")]:
    if p.exists():
        p.unlink()

src = sqlite3.connect(f"file:{SRC}?mode=ro", uri=True)
dst = sqlite3.connect(DST)
with dst:
    src.backup(dst)  # full consistent copy, WAL included
counts = dict(dst.execute("SELECT grader, COUNT(*) FROM gradings GROUP BY grader").fetchall())
locked = dst.execute("SELECT COUNT(*) FROM grader_status WHERE completed_at IS NOT NULL").fetchone()[0]
dst.close()
src.close()

print(f"Wrote {DST}")
print(f"  gradings per grader: {counts}")
print(f"  locked graders: {locked}")
print("Commit seed/grading.db, then deploy (the cloud copies it on first boot).")
