# Free always-on deploy (Vercel + Turso)

Runs the app 24/7 on a **permanent link**, works with your laptop closed, and
costs **$0 with no credit card**. Two free services:

- **Turso** — free cloud database (holds all grading).
- **Vercel** — free host for the app.

Both sign in with GitHub. Use your **BuRiseStephan** GitHub account (it owns the
repo).

---

## Step 1 — Create the Turso database

1. Go to <https://turso.tech> → **Sign up** with GitHub (BuRiseStephan).
2. Create a database (any name, e.g. `human-grading`). Pick the default free plan.
3. From the database page, copy two things:
   - the **Database URL** (looks like `libsql://human-grading-xx.turso.io`)
   - a **auth token** (create one — "Generate token" / "Create token")

Send me those two values and I'll load your existing grading + the key into it
(one command). Or run it yourself from the project folder:

```bash
TURSO_DATABASE_URL="libsql://…turso.io" \
TURSO_AUTH_TOKEN="…" \
node scripts/migrate_to_turso.mjs
```

You should see `Turso gradings now: A:9 B:43` (or higher).

## Step 2 — Deploy the app on Vercel

1. Go to <https://vercel.com> → **Sign up** with GitHub (BuRiseStephan).
2. **Add New → Project** → import **`human-grading-app`**.
3. Before deploying, open **Environment Variables** and add:
   - `TURSO_DATABASE_URL` = your `libsql://…` URL
   - `TURSO_AUTH_TOKEN` = your token
4. Click **Deploy**.

Vercel gives you a permanent URL like `https://human-grading-app.vercel.app`.

## Step 3 — Check and switch over

- Open the Vercel URL → `/results` should show your migrated counts.
- Share that URL with your coauthor — it never changes and works with your
  laptop closed.
- Tell me it's live and I'll shut down the laptop server + tunnel.

---

## How the data is stored

| Thing | Where | Notes |
| --- | --- | --- |
| Grading answers | Turso (`gradings`, `grader_status`) | always-on, free |
| Confidential key | Turso (`key_blob`, a single CSV) | read only by `/results` + export, never by grading pages |
| Blinded items + rubric | in the repo | non-confidential |

The key is **not** in git (still gitignored) — it goes straight into Turso via
the migration. Locally, with no `TURSO_*` variables set, the app still uses the
local SQLite file exactly as before.

## Environment variables

| Variable | Set on Vercel? | Value |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | yes | `libsql://…turso.io` |
| `TURSO_AUTH_TOKEN` | yes | your Turso token |

Nothing else is required.
