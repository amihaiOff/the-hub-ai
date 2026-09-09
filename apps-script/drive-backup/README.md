# Nightly Drive backup

Saves a full backup of The Hub into a Google Drive folder every night, keeps a
sensible history, and emails you if it ever stops working.

## Why it lives here and not in the app

Two constraints shaped this:

- The app's hosting plan allows **two** scheduled jobs and both are taken (daily
  tasks, nightly net-worth snapshot).
- A server writing to a **personal** Drive can't use a robot identity — those
  have no storage of their own, so that route only works with a Workspace shared
  drive. It would have to act as you, via a stored permission grant, and in an
  unpublished Google project that grant **silently expires every 7 days**.

Running inside your own Google account sidesteps both: Google provides the
scheduler, and there is no Google credential to store or renew. The only secret
involved is a read token for the app.

The script is committed here (rather than only living in Google) so it's
reviewable and has history like the rest of the project.

## One-time setup

**1. Create the Drive folder** you want archives in. Open it and copy the id
from the URL — the part after `/folders/`.

**2. Set `BACKUP_TOKEN` in the app.** Generate a long random value and add it in
Vercel (Production) and to `.env.local` if you want to test locally:

```bash
openssl rand -base64 32
```

This token can fetch the entire database, so treat it like a password. It's
deliberately separate from the agent and pages tokens so you can rotate it
without touching those.

**3. Push the script to your account.**

```bash
npx clasp login                 # once, in your browser
cd apps-script/drive-backup
npx clasp create --title "The Hub — Drive backup" --rootDir .
npx clasp push
```

`clasp create` writes a `.clasp.json` with your script id. That file is
gitignored — it's per-account, not per-project.

**4. Configure it.** Open the script (`npx clasp open`), then
**Project Settings → Script Properties**, and add three:

| Property            | Value                                          |
| ------------------- | ---------------------------------------------- |
| `HUB_BASE_URL`      | `https://the-hub-ai-ten.vercel.app`            |
| `HUB_BACKUP_TOKEN`  | the same value you set as `BACKUP_TOKEN`       |
| `DRIVE_FOLDER_ID`   | the folder id from step 1                      |

**5. Run it once by hand.** In the editor, select `backupToDrive` and press Run.
Google will ask for permission to access Drive, send mail, and make outbound
requests — that's the consent that makes the whole thing work without a stored
credential. Check the folder for the archive.

**6. Install the schedule.** Select `installNightlyTrigger` and Run. It's safe to
re-run; it replaces its own trigger rather than stacking duplicates.

## What you'll see

- **In Drive:** `hub-backup-2026-09-09-0300.zip`, sorted chronologically by name.
- **In the app:** an activity entry per run. Successes are pre-read so they
  don't nag; failures are left unread so they show up as a badge.
- **By email:** only on failure, sent straight from the script — so it still
  reaches you when the app itself is the thing that's down.

## Retention

Every backup is kept for **14 days**. Beyond that, one per week is kept up to
**90 days**, then one per month. At today's size (~750KB) that settles at roughly
30 files instead of hundreds.

Pruning moves files to Drive's trash rather than deleting outright, so a mistake
is recoverable for 30 days. Adjust `KEEP_ALL_DAYS` / `KEEP_WEEKLY_DAYS` in
`Code.js` and `npx clasp push`.

## Two things worth knowing

**The archive is not encrypted.** It's readable data — every transaction,
balance and account. In Drive it's exactly as safe as your Google account, so
that account wants two-factor. If you'd rather it were encrypted at rest, that's
a change to make deliberately.

**Restoring replaces everything.** The restore path wipes the database before
loading an archive. With a folder of dated backups, picking the wrong one is a
real risk — the filenames are date-stamped for exactly that reason.

## Changing the script later

Edit `Code.js` here, then:

```bash
cd apps-script/drive-backup && npx clasp push
```

Editing in the browser instead will be overwritten by the next push. Treat this
folder as the source of truth.
