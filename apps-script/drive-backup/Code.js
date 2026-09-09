/**
 * Nightly backup of The Hub into Google Drive.
 *
 * This runs inside the owner's own Google account, on Google's scheduler —
 * NOT on Vercel. Two reasons that matters:
 *
 *  1. The app's plan allows only two scheduled jobs and both are already used
 *     (daily tasks, nightly net-worth snapshot).
 *  2. A server writing to a personal Drive would need a stored Google
 *     credential, and in an unpublished project that credential silently
 *     expires every 7 days — the classic way this kind of backup dies without
 *     anyone noticing. Running as the account owner means there is no
 *     credential to store or renew at all.
 *
 * The only secret here is a read token for the app, kept in Script Properties
 * (never in this file, which is committed to the repo).
 *
 * SETUP: see README.md in this folder.
 */

/** Script Property names. Set these once in the Apps Script editor. */
var PROP_BASE_URL = 'HUB_BASE_URL'; // e.g. https://the-hub-ai-ten.vercel.app
var PROP_TOKEN = 'HUB_BACKUP_TOKEN'; // matches BACKUP_TOKEN in the app's env
var PROP_FOLDER_ID = 'DRIVE_FOLDER_ID'; // Drive folder to write archives into

/**
 * Retention, in days. Keep every backup for two weeks, then thin to one a week
 * for three months, then one a month. Without this a daily backup becomes
 * hundreds of files in one folder within a year.
 */
var KEEP_ALL_DAYS = 14;
var KEEP_WEEKLY_DAYS = 90;

/** Entry point. Point the time-driven trigger at this. */
function backupToDrive() {
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty(PROP_BASE_URL);
  var token = props.getProperty(PROP_TOKEN);
  var folderId = props.getProperty(PROP_FOLDER_ID);

  if (!baseUrl || !token || !folderId) {
    // Misconfiguration is worth an email too — otherwise the very first run
    // fails silently and you assume backups are running.
    notifyFailure(
      'Backup not configured: set ' +
        PROP_BASE_URL +
        ', ' +
        PROP_TOKEN +
        ' and ' +
        PROP_FOLDER_ID +
        ' in Script Properties.'
    );
    return;
  }

  var fileName = 'hub-backup-' + timestamp() + '.zip';

  try {
    var response = UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + '/api/backup', {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();
    if (code !== 200) {
      throw new Error('The app returned ' + code + ' when asked for a backup.');
    }

    var blob = response.getBlob().setName(fileName);
    var sizeBytes = blob.getBytes().length;

    // A near-empty archive means something went wrong upstream even though the
    // request "succeeded" — better to shout than to quietly save a useless file
    // and overwrite good history with it.
    if (sizeBytes < 1024) {
      throw new Error('Backup looked empty (' + sizeBytes + ' bytes) — not saving it.');
    }

    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);

    var pruned = pruneOldBackups(folder);

    report(baseUrl, token, {
      status: 'success',
      sizeBytes: sizeBytes,
      fileName: file.getName(),
    });

    console.log('Saved ' + file.getName() + ' (' + sizeBytes + ' bytes); pruned ' + pruned);
  } catch (err) {
    var message = err && err.message ? err.message : String(err);
    // Email first: if the app is what's broken, reporting to it won't work.
    notifyFailure(message);
    report(baseUrl, token, { status: 'failure', error: message });
    throw err; // surface in the Apps Script execution log too
  }
}

/**
 * Thin out old archives.
 *
 * Everything inside the "keep all" window stays. Beyond it, one per ISO week is
 * kept up to the weekly window, then one per month. Deletion is by moving to
 * trash, so a mistake here is recoverable for 30 days.
 */
function pruneOldBackups(folder) {
  var now = new Date();
  var files = [];
  var it = folder.getFilesByType(MimeType.ZIP);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('hub-backup-') === 0) {
      files.push({ file: f, created: f.getDateCreated() });
    }
  }
  // Newest first, so the keeper for each bucket is the most recent in it.
  files.sort(function (a, b) {
    return b.created.getTime() - a.created.getTime();
  });

  var seenBuckets = {};
  var trashed = 0;

  for (var i = 0; i < files.length; i++) {
    var ageDays = (now.getTime() - files[i].created.getTime()) / 86400000;
    if (ageDays <= KEEP_ALL_DAYS) continue;

    var bucket =
      ageDays <= KEEP_WEEKLY_DAYS
        ? 'w' + isoWeekKey(files[i].created)
        : 'm' + files[i].created.getFullYear() + '-' + (files[i].created.getMonth() + 1);

    if (seenBuckets[bucket]) {
      files[i].file.setTrashed(true);
      trashed++;
    } else {
      seenBuckets[bucket] = true;
    }
  }
  return trashed;
}

/** Year + ISO week number, so week buckets don't collide across years. */
function isoWeekKey(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-' + week;
}

/** Sortable, human-readable stamp: 2026-09-09-0300. */
function timestamp() {
  var tz = Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd-HHmm');
}

/** Tell the app what happened, so it shows up in the activity log. */
function report(baseUrl, token, payload) {
  try {
    UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + '/api/backup/report', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (e) {
    // Never let reporting failure mask the backup result — the email already
    // went out, and an unreachable app is itself the thing being reported.
    console.warn('Could not report to the app: ' + e);
  }
}

/** Email the account owner. Works even when the app is down, which is the point. */
function notifyFailure(message) {
  try {
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: 'The Hub — backup FAILED',
      body:
        'The nightly Google Drive backup did not complete.\n\n' +
        message +
        '\n\nNothing was saved for this run. Previous backups are untouched.\n' +
        'Check the execution log at https://script.google.com.',
    });
  } catch (e) {
    console.error('Could not send failure email: ' + e);
  }
}

/**
 * Run once, by hand, to install the nightly schedule. Safe to re-run: it clears
 * any trigger it previously created rather than stacking duplicates.
 */
function installNightlyTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'backupToDrive') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('backupToDrive').timeBased().atHour(3).everyDays(1).create();
  console.log('Nightly backup trigger installed for ~03:00 script time.');
}
