# Deploying to an always-on host (Render)

This puts the grading app on a server that runs 24/7, so your coauthor gets a
**permanent link that works even when your laptop is closed**. Chosen host:
**Render** — web-UI only, no Docker, no command line.

The app is already cloud-ready: the database path, the confidential key, and the
data directory are all configurable by environment variables, and there's a
one-time migration that carries your existing grading over.

## What it costs

Render's free tier can't keep a database (its disk is wiped on every restart), so
you need the **Starter** instance (~$7/month) plus a small **persistent disk**.
Cancel it once grading is done.

## One-time migration note

Everything already graded on your laptop (currently in `data/grading.db`) is
migrated by committing a snapshot to the repo. Do the snapshot **right before**
the first cloud deploy, and stop grading on the laptop once you cut over — any
grading done on the laptop *after* the snapshot won't be in the cloud.

---

## Steps

### 1. Snapshot the current grading (at cutover time)

```bash
python3 scripts/make_seed.py
```

This writes `seed/grading.db` with all grading so far (safe to run while the
server is live).

### 2. Put the code on GitHub (private)

```bash
gh repo create human-grading-app --private --source=. --remote=origin
git add -A
git commit -m "Human grading app"
git push -u origin HEAD
```

> The confidential key (`data/human_grading_sample_key.csv`) is gitignored and
> will **not** be uploaded — that's intentional. You'll supply it to Render
> separately in step 4.

### 3. Create the Render service

1. Go to <https://render.com>, sign up (free), **New +  →  Web Service**.
2. Connect your GitHub and pick the `human-grading-app` repo.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Instance type:** **Starter** (needed for a persistent disk)

### 4. Add the persistent disk and the key

Still on the service settings:

- **Disks  →  Add Disk:** name `grading-data`, **mount path** `/var/data`, size 1 GB.
- **Environment  →  Add Environment Variable:**
  - `GRADING_DB_PATH` = `/var/data/grading.db`
- **Environment  →  Secret Files  →  Add Secret File:**
  - **Filename:** `human_grading_sample_key.csv`
  - **Contents:** paste the entire contents of your local
    `data/human_grading_sample_key.csv`
- **Environment  →  Add Environment Variable:**
  - `SAMPLE_KEY_PATH` = `/etc/secrets/human_grading_sample_key.csv`

### 5. Deploy

Click **Create Web Service**. First build takes a few minutes. On first boot the
app copies your `seed/grading.db` onto the disk, so all existing grading is
already there.

Your permanent URL looks like `https://human-grading-app.onrender.com`.

### 6. Verify and cut over

- Open `…/results` — the progress table should show your migrated counts.
- Share the Render URL with your coauthor (it never changes).
- **Stop the laptop server and tunnel** so no one keeps grading the old copy.

---

## Environment variables reference

| Variable | Purpose | Cloud value |
| --- | --- | --- |
| `GRADING_DB_PATH` | Where the writable database lives | `/var/data/grading.db` (the disk) |
| `SAMPLE_KEY_PATH` | Confidential key location | `/etc/secrets/human_grading_sample_key.csv` |
| `SAMPLE_KEY_CSV` | Alternative: key contents inline | (unused if `SAMPLE_KEY_PATH` is set) |
| `DATA_DIR` | Base dir for blinded items + rubric | leave unset (reads from the repo) |
| `SEED_DB_PATH` | Migration snapshot to import once | leave unset (defaults to `seed/grading.db`) |

Locally, none of these are needed — the app uses `./data` exactly as before.

## Backups

The grading data now lives on Render's disk. To pull a backup anytime, open the
Render **Shell** for the service and run
`cat /var/data/grading.db` is not useful (binary); instead use the app's
**merged CSV export** on `/results` once both graders lock, or ask me to add a
one-click DB download.
