/**
 * KARJAT PROTECTION SETTINGS PORTAL — BACKEND
 * 400/220 kV Karjat Substation (J966) · MSETCL Western Region
 *
 * Deploy: Execute as ME · Who has access: ANYONE
 * ⚠ After EVERY edit: Deploy → Manage deployments → ✏️ → Version: NEW VERSION → Deploy.
 *   Just saving keeps serving old code. `?action=health` reports CODE_VERSION so the
 *   portal can tell you plainly when your deployment is stale.
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

/** Bump on every meaningful edit. The portal compares this to what it expects. */
const CODE_VERSION   = '1.0.1';
const SCHEMA_VERSION = '1.0';

/**
 * ⚡ PASTE YOUR SPREADSHEET ID HERE after the first sync.
 * Leave '' and every request re-searches Drive by filename — that is slow and it is
 * why the old portal crawled. The UI shows this ID on the Admin page after sync.
 */
const SS_ID = '';

const FOLDER_NAME   = 'Karjat Protection Portal Data';
const SS_NAME       = 'Karjat Portal — Master';
const RESET_TOKEN   = 'KARJAT';
const SUB_FOLDERS   = ['Images', 'Attachments', 'SourceFiles', 'Overviews'];

const SHEETS = {
  META:        { name: '_Meta',            cols: ['key','value'] },
  BAYS:        { name: '_Bays',            cols: ['bayId','code','name','voltage','scheme','diameter','position','bus','type','isPseudo','order','notes'] },
  PROFILES:    { name: '_Profiles',        cols: ['profileId','family','model','kind','schemaHash','relayCount','settingsPerRelay'] },
  RELAYS:      { name: '_Relays',          cols: ['relayId','bayId','linkedBayId','file','name','folder','family','model','kind','profileId','settingsCount','rowStart','rowEnd','sourceFileId','order'] },
  SETTINGS:    { name: '_Settings',        cols: ['settingId','relayId','profileId','groupName','idx','title','value','unit','step','rangeText','address','meaningKey'] },
  VERSIONS:    { name: '_Versions',        cols: ['versionId','relayId','tag','kind','state','label','effectiveDate','reference','author','checker','reason','batchId','sourceFileId','createdAt','createdBy','appliedAt'] },
  DELTAS:      { name: '_SettingDeltas',   cols: ['deltaId','versionId','settingId','oldValue','newValue','outOfRange'] },
  CORRECTIONS: { name: '_Corrections',     cols: ['correctionId','settingId','versionId','oldValue','newValue','date','reason','user','attachmentId','versionTag','createdAt','supersededBy'] },
  AUDIT:       { name: '_Audit',           cols: ['auditId','ts','user','action','entityType','entityId','before','after','note'] },
  MEANINGS:    { name: '_Meanings',        cols: ['meaningKey','family','modelOrKind','groupName','title','settingMeaning','source','confidence','updatedAt','updatedBy'] },
  VALMEANINGS: { name: '_ValueMeanings',   cols: ['meaningKey','value','valueMeaning','source','confidence','updatedAt','updatedBy'] },
  PANELS:      { name: '_Panels',          cols: ['panelId','bayId','slot','name','label','widthMM','heightMM','gridMM','order','notes'] },
  PANELITEMS:  { name: '_PanelItems',      cols: ['itemId','panelId','type','refId','label','x','y','w','h','shape','colour','rotation','order','notes'] },
  SECTIONS:    { name: '_CardSections',    cols: ['sectionId','scope','scopeId','name','order'] },
  CARDS:       { name: '_Cards',           cols: ['cardId','sectionId','settingId','label','widthFrac','order','pinnedToBay','source'] },
  USERS:       { name: '_Users',           cols: ['userId','name','email','role','state','pwHash','createdAt','approvedBy'] },
  ATTACHMENTS: { name: '_Attachments',     cols: ['attachmentId','driveFileId','name','mime','size','scope','scopeId','uploadedBy','uploadedAt'] },
  INTERRUPT:   { name: '_Interruptions',   cols: ['intId','bayId','ts','type','description','relaysOperated','analysis','attachmentIds','createdBy'] },
  OVERVIEWS:   { name: '_OverviewRegistry',cols: ['entityType','entityId','spreadsheetId','url','createdAt','dbTabSyncedAt'] },
  MANUALS:     { name: '_Manuals',         cols: ['manualId','relayKind','family','title','url','source','attachmentId'] },
  CUSTOMCOLS:  { name: '_CustomColumns',   cols: ['colId','scope','scopeId','name','order'] }
};

// ═══════════════════════════════════════════════════════════════════
// ROUTING
// ═══════════════════════════════════════════════════════════════════

function doGet(e)  { return route_(e, (e && e.parameter) || {}); }

function doPost(e) {
  var p = (e && e.parameter) || {};
  // POST body is sent as text/plain by the frontend ON PURPOSE: application/json would
  // trigger a CORS preflight, which Apps Script cannot answer. Do not "fix" this.
  if (e && e.postData && e.postData.contents) {
    try {
      var b = JSON.parse(e.postData.contents);
      for (var k in b) p[k] = b[k];
    } catch (err) {
      return json_({ ok: false, error: 'Bad JSON body: ' + err.message });
    }
  }
  return route_(e, p);
}

function route_(e, p) {
  var action = p.action || 'health';
  try {
    var fn = HANDLERS[action];
    if (!fn) return json_({ ok: false, error: 'Unknown action: ' + action, actions: Object.keys(HANDLERS) });
    var out = fn(p);
    out.ok = out.ok !== false;
    out.codeVersion = CODE_VERSION;
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err),
                   stack: String(err && err.stack || ''), codeVersion: CODE_VERSION });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════
// STORAGE PLUMBING
// ═══════════════════════════════════════════════════════════════════

function props_() { return PropertiesService.getScriptProperties(); }

/** Resolve the master spreadsheet. Order: SS_ID const → script property → Drive search. */
function ss_() {
  if (SS_ID) return SpreadsheetApp.openById(SS_ID);
  var cached = props_().getProperty('SS_ID');
  if (cached) {
    try { return SpreadsheetApp.openById(cached); } catch (e) { props_().deleteProperty('SS_ID'); }
  }
  var folder = folder_();
  var it = folder.getFilesByName(SS_NAME);
  if (!it.hasNext()) throw new Error('Database not found. Run ?action=resetDatabase&confirm=' + RESET_TOKEN);
  var f = it.next();
  props_().setProperty('SS_ID', f.getId());
  return SpreadsheetApp.openById(f.getId());
}

function folder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function sub_(name) {
  var f = folder_(), it = f.getFoldersByName(name);
  return it.hasNext() ? it.next() : f.createFolder(name);
}

function sh_(def) {
  var s = ss_().getSheetByName(def.name);
  if (!s) throw new Error('Missing sheet ' + def.name + ' — database may need a reset.');
  return s;
}

/** Read a whole sheet as objects. Only for SMALL sheets — never _Settings. */
function readAll_(def) {
  var s = sh_(def), last = s.getLastRow();
  if (last < 2) return [];
  var vals = s.getRange(2, 1, last - 1, def.cols.length).getValues();
  return vals.map(function (r) { return rowToObj_(def, r); }).filter(function (o) {
    return String(o[def.cols[0]] || '') !== '';
  });
}

function rowToObj_(def, r) {
  var o = {};
  for (var i = 0; i < def.cols.length; i++) o[def.cols[i]] = r[i];
  return o;
}

function objToRow_(def, o) {
  return def.cols.map(function (c) { return o[c] === undefined || o[c] === null ? '' : o[c]; });
}

function append_(def, objs) {
  if (!objs.length) return 0;
  var s = sh_(def);
  s.getRange(s.getLastRow() + 1, 1, objs.length, def.cols.length)
   .setValues(objs.map(function (o) { return objToRow_(def, o); }));
  return objs.length;
}

/** Find the physical row of a record by its id (first column). 0 if absent. */
function findRow_(def, id) {
  var s = sh_(def), last = s.getLastRow();
  if (last < 2) return 0;
  var ids = s.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function upsert_(def, obj) {
  var s = sh_(def), id = obj[def.cols[0]], row = findRow_(def, id);
  if (!row) row = s.getLastRow() + 1;
  s.getRange(row, 1, 1, def.cols.length).setValues([objToRow_(def, obj)]);
  return obj;
}

function remove_(def, id) {
  var row = findRow_(def, id);
  if (!row) return false;
  sh_(def).deleteRow(row);
  return true;
}

function meta_(k, v) {
  var s = sh_(SHEETS.META), last = s.getLastRow();
  var vals = last > 1 ? s.getRange(2, 1, last - 1, 2).getValues() : [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === k) {
      if (v === undefined) return vals[i][1];
      s.getRange(i + 2, 2).setValue(v); return v;
    }
  }
  if (v === undefined) return '';
  s.appendRow([k, v]);
  return v;
}

function uid_(p) { return p + '-' + Utilities.getUuid().slice(0, 8); }
function now_()  { return new Date().toISOString(); }

function audit_(user, action, entityType, entityId, before, after, note) {
  append_(SHEETS.AUDIT, [{
    auditId: uid_('A'), ts: now_(), user: user || 'unknown', action: action,
    entityType: entityType, entityId: entityId,
    before: typeof before === 'object' ? JSON.stringify(before) : (before || ''),
    after:  typeof after  === 'object' ? JSON.stringify(after)  : (after  || ''),
    note: note || ''
  }]);
}

function lock_(fn) {
  var l = LockService.getScriptLock();
  if (!l.tryLock(25000)) throw new Error('Storage busy — another write is in progress. Retry.');
  try { return fn(); } finally { l.releaseLock(); }
}

// ═══════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════

var HANDLERS = {};

// ── health ─────────────────────────────────────────────────────────
HANDLERS.health = function () {
  var out = { codeVersion: CODE_VERSION, schemaVersion: SCHEMA_VERSION, ssIdConst: !!SS_ID };
  try {
    var s = ss_();
    out.ssId = s.getId();
    out.dbReady = true;
    out.settingsCount = Number(meta_('settingsCount') || 0);
    out.baselineSyncedAt = meta_('baselineSyncedAt');
    out.syncCursor = Number(meta_('syncCursor') || 0);
  } catch (e) {
    out.dbReady = false;
    out.hint = 'Run ?action=resetDatabase&confirm=' + RESET_TOKEN;
  }
  return out;
};

// ── resetDatabase ──────────────────────────────────────────────────
HANDLERS.resetDatabase = function (p) {
  if (p.confirm !== RESET_TOKEN)
    return { ok: false, error: 'Refusing to wipe. Pass confirm=' + RESET_TOKEN };
  return lock_(function () {
    var folder = folder_();
    // Trash the previous master; Drive keeps it recoverable for 30 days.
    var it = folder.getFilesByName(SS_NAME), trashed = 0;
    while (it.hasNext()) { it.next().setTrashed(true); trashed++; }
    props_().deleteProperty('SS_ID');

    var s = SpreadsheetApp.create(SS_NAME);
    var file = DriveApp.getFileById(s.getId());
    folder.addFile(file);
    try { DriveApp.getRootFolder().removeFile(file); } catch (e) {}
    props_().setProperty('SS_ID', s.getId());

    Object.keys(SHEETS).forEach(function (k) {
      var def = SHEETS[k], sheet = s.insertSheet(def.name);
      sheet.getRange(1, 1, 1, def.cols.length).setValues([def.cols])
           .setFontWeight('bold').setBackground('#EFEFEF').setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    });
    s.deleteSheet(s.getSheetByName('Sheet1'));
    SUB_FOLDERS.forEach(sub_);

    meta_('schemaVersion', SCHEMA_VERSION);
    meta_('codeVersion', CODE_VERSION);
    meta_('settingsCount', 0);
    meta_('syncCursor', 0);
    meta_('baselineSyncedAt', '');
    bustBootstrap_();                      // the old database's snapshot must not survive it
    audit_(p.user, 'RESET_DATABASE', 'database', s.getId(), 'trashed:' + trashed, 'created', '');

    return { ssId: s.getId(), url: s.getUrl(), trashedOld: trashed,
             sheets: Object.keys(SHEETS).length,
             next: 'Paste this ssId into SS_ID at the top of code.gs, redeploy as NEW VERSION, then sync.' };
  });
};

// ── syncChunk — resumable bulk load ────────────────────────────────
HANDLERS.syncChunk = function (p) {
  var part = p.part;                       // 'meta' | 'settings' | 'meanings' | 'valueMeanings'
  var rows = p.rows || [];
  var offset = Number(p.offset || 0);
  var totalExpected = Number(p.total || 0);

  return lock_(function () {
    // Sync changes everything bootstrap reports. Without this, a portal that booted against
    // the empty database keeps being served that empty snapshot for the full cache lifetime —
    // Storage is full, the substation looks deserted, and it "fixes itself" 5 minutes later.
    bustBootstrap_();

    if (part === 'meta') {
      // Small reference tables — written whole, cheap.
      [['bays', SHEETS.BAYS], ['profiles', SHEETS.PROFILES],
       ['relays', SHEETS.RELAYS], ['versions', SHEETS.VERSIONS]].forEach(function (pair) {
        var key = pair[0], def = pair[1], data = p[key] || [];
        var sheet = sh_(def);
        if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
        if (data.length) append_(def, data);
      });
      meta_('settingsCount', 0);
      meta_('syncCursor', 0);
      return { part: 'meta', bays: (p.bays || []).length, relays: (p.relays || []).length,
               versions: (p.versions || []).length };
    }

    var def = part === 'settings' ? SHEETS.SETTINGS
            : part === 'meanings' ? SHEETS.MEANINGS
            : part === 'valueMeanings' ? SHEETS.VALMEANINGS : null;
    if (!def) return { ok: false, error: 'Unknown part: ' + part };

    var sheet = sh_(def);
    if (offset === 0 && sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);

    if (rows.length) {
      // rows arrive as arrays already in column order — cheapest possible write
      sheet.getRange(offset + 2, 1, rows.length, def.cols.length).setValues(rows);
    }

    var written = offset + rows.length;
    if (part === 'settings') {
      meta_('syncCursor', written);
      meta_('settingsCount', written);
      if (totalExpected && written >= totalExpected) {
        meta_('baselineSyncedAt', now_());
        audit_(p.user, 'SYNC_BASELINE', 'database', '', '', written + ' settings', '');
      }
    }
    return { part: part, written: rows.length, cursor: written, total: totalExpected };
  });
};

// ── bootstrap — everything the app needs on load, EXCEPT settings ──
HANDLERS.bootstrap = function () {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('bootstrap');
  if (hit) { var o = JSON.parse(hit); o.cached = true; return o; }
  var out = {
    meta: { schemaVersion: SCHEMA_VERSION, codeVersion: CODE_VERSION,
            settingsCount: Number(meta_('settingsCount') || 0),
            baselineSyncedAt: meta_('baselineSyncedAt'), ssId: ss_().getId() },
    bays: readAll_(SHEETS.BAYS),
    relays: readAll_(SHEETS.RELAYS),
    profiles: readAll_(SHEETS.PROFILES),
    panels: readAll_(SHEETS.PANELS),
    panelItems: readAll_(SHEETS.PANELITEMS),
    sections: readAll_(SHEETS.SECTIONS),
    cards: readAll_(SHEETS.CARDS),
    users: readAll_(SHEETS.USERS).map(function (u) { delete u.pwHash; return u; })
  };
  try { cache.put('bootstrap', JSON.stringify(out), 300); } catch (e) {} // >100KB → skip cache
  return out;
};

function bustBootstrap_() { try { CacheService.getScriptCache().remove('bootstrap'); } catch (e) {} }

// ── getRelay — the O(1) read that keeps the portal fast ────────────
HANDLERS.getRelay = function (p) {
  if (!p.relayId) return { ok: false, error: 'relayId required' };
  var relays = readAll_(SHEETS.RELAYS);
  var r = relays.filter(function (x) { return x.relayId === p.relayId; })[0];
  if (!r) return { ok: false, error: 'No such relay: ' + p.relayId };

  var n = Number(r.rowEnd) - Number(r.rowStart) + 1;
  // Read ONLY this relay's span. Never getDataRange() on 45,593 rows.
  var vals = sh_(SHEETS.SETTINGS)
               .getRange(Number(r.rowStart), 1, n, SHEETS.SETTINGS.cols.length).getValues();

  var settings = vals.map(function (row) { return rowToObj_(SHEETS.SETTINGS, row); });
  // Integrity guard: the span must actually contain this relay's rows.
  var stray = settings.filter(function (s) { return s.relayId !== p.relayId; }).length;
  if (stray) return { ok: false, error: 'Row-span corrupt for ' + p.relayId +
                      ' (' + stray + '/' + n + ' foreign rows). Re-sync required.' };

  var vers = readAll_(SHEETS.VERSIONS).filter(function (v) { return v.relayId === p.relayId; });
  var applied = vers.filter(function (v) { return v.state === 'applied'; })[0] || null;
  var vIds = {}; vers.forEach(function (v) { vIds[v.versionId] = 1; });
  var deltas = readAll_(SHEETS.DELTAS).filter(function (d) { return vIds[d.versionId]; });
  var sIds = {}; settings.forEach(function (s) { sIds[s.settingId] = 1; });
  var corr = readAll_(SHEETS.CORRECTIONS).filter(function (c) { return sIds[c.settingId]; });

  return { relay: r, settings: settings, versions: vers, appliedVersionId: applied && applied.versionId,
           deltas: deltas, corrections: corr,
           meanings: meaningsFor_(settings) };
};

/** Only the meanings this relay's settings actually need. */
function meaningsFor_(settings) {
  var want = {}; settings.forEach(function (s) { want[s.meaningKey] = 1; });
  var t = {}, v = {};
  readAll_(SHEETS.MEANINGS).forEach(function (m) {
    if (want[m.meaningKey]) t[m.meaningKey] = m.settingMeaning;
  });
  readAll_(SHEETS.VALMEANINGS).forEach(function (m) {
    if (want[m.meaningKey]) v[m.meaningKey + '\u0001' + m.value] = m.valueMeaning;
  });
  return { title: t, value: v };
}

// ── versions ───────────────────────────────────────────────────────
HANDLERS.createVersion = function (p) {
  return lock_(function () {
    var relayId = p.relayId;
    if (!relayId) return { ok: false, error: 'relayId required' };
    var vers = readAll_(SHEETS.VERSIONS).filter(function (v) { return v.relayId === relayId; });
    var tag = nextTag_(vers, p.direction || 'newer');

    var v = { versionId: uid_('V'), relayId: relayId, tag: tag,
              kind: p.direction === 'older' ? 'archive' : 'revision',
              state: 'draft', label: p.label || '', effectiveDate: p.effectiveDate || '',
              reference: p.reference || '', author: p.author || '', checker: p.checker || '',
              reason: p.reason || '', batchId: p.batchId || '', sourceFileId: p.sourceFileId || '',
              createdAt: now_(), createdBy: p.user || '', appliedAt: '' };
    append_(SHEETS.VERSIONS, [v]);

    var deltas = (p.deltas || []).map(function (d) {
      return { deltaId: uid_('D'), versionId: v.versionId, settingId: d.settingId,
               oldValue: d.oldValue, newValue: d.newValue, outOfRange: d.outOfRange ? 'Y' : '' };
    });
    append_(SHEETS.DELTAS, deltas);
    audit_(p.user, 'CREATE_VERSION', 'version', v.versionId, '', tag, deltas.length + ' deltas');
    return { version: v, deltas: deltas.length };
  });
};

/** newer → next major (v2.0, v3.0). older → sub-version under the current major (v1.1, v1.2). */
function nextTag_(vers, direction) {
  var maj = 1, min = 0;
  vers.forEach(function (v) {
    var m = /^v(\d+)\.(\d+)$/.exec(String(v.tag));
    if (!m) return;
    var a = Number(m[1]), b = Number(m[2]);
    if (a > maj || (a === maj && b > min)) { maj = Math.max(maj, a); }
  });
  if (direction === 'newer') return 'v' + (maj + 1) + '.0';
  var subs = vers.map(function (v) {
    var m = new RegExp('^v' + maj + '\\.(\\d+)$').exec(String(v.tag));
    return m ? Number(m[1]) : -1;
  });
  return 'v' + maj + '.' + (Math.max.apply(null, subs.concat([0])) + 1);
}

HANDLERS.applyVersion = function (p) {
  return lock_(function () {
    var all = readAll_(SHEETS.VERSIONS);
    var v = all.filter(function (x) { return x.versionId === p.versionId; })[0];
    if (!v) return { ok: false, error: 'No such version' };
    if (v.kind === 'archive') return { ok: false, error: 'Archive versions (' + v.tag + ') record history and are never applied.' };
    all.forEach(function (x) {
      if (x.relayId === v.relayId && x.state === 'applied') { x.state = 'superseded'; upsert_(SHEETS.VERSIONS, x); }
    });
    v.state = 'applied'; v.appliedAt = now_();
    upsert_(SHEETS.VERSIONS, v);
    audit_(p.user, 'APPLY_VERSION', 'version', v.versionId, '', v.tag, '');
    return { version: v };
  });
};

HANDLERS.deleteVersion = function (p) {
  return lock_(function () {
    var v = readAll_(SHEETS.VERSIONS).filter(function (x) { return x.versionId === p.versionId; })[0];
    if (!v) return { ok: false, error: 'No such version' };
    // Baseline immutability is enforced HERE, on the server — not by hiding a button.
    if (v.kind === 'baseline') return { ok: false, error: 'The baseline (' + v.tag + ') is immutable and can never be deleted.' };
    if (v.state === 'applied' && p.confirmApplied !== 'YES')
      return { ok: false, error: 'That version is currently APPLIED. Re-send with confirmApplied=YES.' };
    readAll_(SHEETS.DELTAS).filter(function (d) { return d.versionId === v.versionId; })
      .forEach(function (d) { remove_(SHEETS.DELTAS, d.deltaId); });
    remove_(SHEETS.VERSIONS, v.versionId);
    audit_(p.user, 'DELETE_VERSION', 'version', v.versionId, v.tag, '', v.state);
    return { deleted: v.versionId };
  });
};

HANDLERS.compareVersions = function (p) {
  var deltas = readAll_(SHEETS.DELTAS);
  var pick = function (id) {
    var m = {};
    deltas.filter(function (d) { return d.versionId === id; })
          .forEach(function (d) { m[d.settingId] = d.newValue; });
    return m;
  };
  var A = pick(p.versionA), Bv = pick(p.versionB), keys = {};
  Object.keys(A).forEach(function (k) { keys[k] = 1; });
  Object.keys(Bv).forEach(function (k) { keys[k] = 1; });
  var diff = Object.keys(keys).map(function (k) {
    return { settingId: k, a: A[k] === undefined ? null : A[k], b: Bv[k] === undefined ? null : Bv[k],
             changed: A[k] !== Bv[k] };
  });
  return { diff: diff, changed: diff.filter(function (d) { return d.changed; }).length };
};

// ── corrections — a DIFFERENT thing from versions, on purpose ──────
HANDLERS.createCorrection = function (p) {
  return lock_(function () {
    if (!p.settingId) return { ok: false, error: 'settingId required' };
    var prev = readAll_(SHEETS.CORRECTIONS).filter(function (c) {
      return c.settingId === p.settingId && !c.supersededBy;
    });
    var c = { correctionId: uid_('C'), settingId: p.settingId, versionId: p.versionId || '',
              oldValue: p.oldValue, newValue: p.newValue, date: p.date || now_(),
              reason: p.reason || '', user: p.user || '', attachmentId: p.attachmentId || '',
              versionTag: p.versionTag || '', createdAt: now_(), supersededBy: '' };
    prev.forEach(function (old) { old.supersededBy = c.correctionId; upsert_(SHEETS.CORRECTIONS, old); });
    append_(SHEETS.CORRECTIONS, [c]);
    audit_(p.user, 'CORRECT_SETTING', 'setting', p.settingId, p.oldValue, p.newValue, p.reason || '');
    return { correction: c, superseded: prev.length };
  });
};

HANDLERS.listCorrections = function (p) {
  var all = readAll_(SHEETS.CORRECTIONS);
  if (p.settingId) all = all.filter(function (c) { return c.settingId === p.settingId; });
  // readAll_ returns sheet order = insertion order. Reverse FIRST, then stable-sort by time,
  // so two corrections written in the same millisecond still come out newest-first.
  all.reverse();
  all.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return { corrections: all };                       // reverse-chronological
};

// ── CRP panels ─────────────────────────────────────────────────────
HANDLERS.savePanels = function (p) {
  return lock_(function () {
    var bayId = p.bayId;
    if (!bayId) return { ok: false, error: 'bayId required' };
    readAll_(SHEETS.PANELS).filter(function (x) { return x.bayId === bayId; })
      .forEach(function (x) {
        readAll_(SHEETS.PANELITEMS).filter(function (i) { return i.panelId === x.panelId; })
          .forEach(function (i) { remove_(SHEETS.PANELITEMS, i.itemId); });
        remove_(SHEETS.PANELS, x.panelId);
      });
    append_(SHEETS.PANELS, p.panels || []);
    append_(SHEETS.PANELITEMS, p.items || []);
    bustBootstrap_();
    audit_(p.user, 'SAVE_PANELS', 'bay', bayId, '', (p.panels || []).length + 'p/' + (p.items || []).length + 'i', '');
    return { panels: (p.panels || []).length, items: (p.items || []).length };
  });
};

HANDLERS.duplicatePanels = function (p) {
  return lock_(function () {
    var src = readAll_(SHEETS.PANELS).filter(function (x) { return x.bayId === p.fromBayId; });
    if (!src.length) return { ok: false, error: 'Bay ' + p.fromBayId + ' has no panel layout to copy.' };
    var items = readAll_(SHEETS.PANELITEMS);
    var np = [], ni = [];
    src.forEach(function (pan) {
      var id = uid_('PN');
      np.push({ panelId: id, bayId: p.toBayId, slot: pan.slot, name: pan.name, label: pan.label,
                widthMM: pan.widthMM, heightMM: pan.heightMM, gridMM: pan.gridMM,
                order: pan.order, notes: pan.notes });
      items.filter(function (i) { return i.panelId === pan.panelId; }).forEach(function (i) {
        ni.push({ itemId: uid_('PI'), panelId: id, type: i.type,
                  // Relay references are NOT copied — a different bay has different relays.
                  refId: '', label: i.type === 'relay' ? '(unassigned)' : i.label,
                  x: i.x, y: i.y, w: i.w, h: i.h, shape: i.shape, colour: i.colour,
                  rotation: i.rotation, order: i.order, notes: i.notes });
      });
    });
    return HANDLERS.savePanels({ bayId: p.toBayId, panels: np, items: ni, user: p.user });
  });
};

// ── meanings ───────────────────────────────────────────────────────
HANDLERS.importMeanings = function (p) {
  return lock_(function () {
    var rows = p.meanings || [], vrows = p.valueMeanings || [];
    var existing = {}, ev = {};
    readAll_(SHEETS.MEANINGS).forEach(function (m) { existing[m.meaningKey] = m; });
    readAll_(SHEETS.VALMEANINGS).forEach(function (m) { ev[m.meaningKey + '\u0001' + m.value] = m; });

    var added = 0, skippedManual = 0;
    rows.forEach(function (r) {
      var cur = existing[r.meaningKey];
      // A generated meaning never overwrites one a human wrote.
      if (cur && cur.source === 'manual' && p.source !== 'manual') { skippedManual++; return; }
      upsert_(SHEETS.MEANINGS, {
        meaningKey: r.meaningKey, family: r.family, modelOrKind: r.modelOrKind,
        groupName: r.groupName, title: r.title, settingMeaning: r.settingMeaning,
        source: p.source || 'import', confidence: r.confidence || '',
        updatedAt: now_(), updatedBy: p.user || ''
      });
      added++;
    });
    var vadded = 0;
    vrows.forEach(function (r) {
      var k = r.meaningKey + '\u0001' + r.value, cur = ev[k];
      if (cur && cur.source === 'manual' && p.source !== 'manual') { skippedManual++; return; }
      append_(SHEETS.VALMEANINGS, [{
        meaningKey: r.meaningKey, value: r.value, valueMeaning: r.valueMeaning,
        source: p.source || 'import', confidence: r.confidence || '',
        updatedAt: now_(), updatedBy: p.user || ''
      }]);
      vadded++;
    });
    audit_(p.user, 'IMPORT_MEANINGS', 'meanings', '', '', added + '/' + vadded, p.source || 'import');
    return { titleMeanings: added, valueMeanings: vadded, skippedManual: skippedManual };
  });
};

/** Which meaningKeys are still blank — drives resumable AI generation. */
HANDLERS.meaningGaps = function (p) {
  var have = {};
  readAll_(SHEETS.MEANINGS).forEach(function (m) { if (m.settingMeaning) have[m.meaningKey] = 1; });
  var s = sh_(SHEETS.SETTINGS), last = s.getLastRow();
  if (last < 2) return { gaps: [], total: 0 };
  var cols = SHEETS.SETTINGS.cols;
  var gi = cols.indexOf('groupName'), ti = cols.indexOf('title'), ki = cols.indexOf('meaningKey');
  var vals = s.getRange(2, 1, last - 1, cols.length).getValues();
  var seen = {}, gaps = [];
  for (var i = 0; i < vals.length; i++) {
    var k = vals[i][ki];
    if (!k || have[k] || seen[k]) continue;
    seen[k] = 1;
    gaps.push({ meaningKey: k, groupName: vals[i][gi], title: vals[i][ti] });
  }
  var off = Number(p.offset || 0), lim = Number(p.limit || 200);
  return { total: gaps.length, offset: off, gaps: gaps.slice(off, off + lim) };
};

// ── cards ──────────────────────────────────────────────────────────
HANDLERS.saveCards = function (p) {
  return lock_(function () {
    (p.sections || []).forEach(function (s) { upsert_(SHEETS.SECTIONS, s); });
    (p.cards || []).forEach(function (c) { upsert_(SHEETS.CARDS, c); });
    (p.deleteCards || []).forEach(function (id) { remove_(SHEETS.CARDS, id); });
    (p.deleteSections || []).forEach(function (id) { remove_(SHEETS.SECTIONS, id); });
    bustBootstrap_();
    return { sections: (p.sections || []).length, cards: (p.cards || []).length };
  });
};

// ── users ──────────────────────────────────────────────────────────
HANDLERS.saveUser = function (p) {
  return lock_(function () {
    var u = p.user_ || {};
    if (!u.userId) u.userId = uid_('U');
    upsert_(SHEETS.USERS, u);
    bustBootstrap_();
    audit_(p.user, 'SAVE_USER', 'user', u.userId, '', u.state || '', u.role || '');
    return { userId: u.userId };
  });
};

HANDLERS.deleteUser = function (p) {
  return lock_(function () {
    remove_(SHEETS.USERS, p.userId); bustBootstrap_();
    audit_(p.user, 'DELETE_USER', 'user', p.userId, '', '', '');
    return { deleted: p.userId };
  });
};

// ── attachments ────────────────────────────────────────────────────
HANDLERS.uploadAttachment = function (p) {
  return lock_(function () {
    var bytes = Utilities.base64Decode(p.dataB64);
    var blob = Utilities.newBlob(bytes, p.mime || 'application/octet-stream', p.name || 'file');
    var f = sub_('Attachments').createFile(blob);
    var a = { attachmentId: uid_('AT'), driveFileId: f.getId(), name: f.getName(),
              mime: f.getMimeType(), size: f.getSize(), scope: p.scope || '',
              scopeId: p.scopeId || '', uploadedBy: p.user || '', uploadedAt: now_() };
    append_(SHEETS.ATTACHMENTS, [a]);
    return { attachment: a };
  });
};

HANDLERS.getAttachment = function (p) {
  var a = readAll_(SHEETS.ATTACHMENTS).filter(function (x) { return x.attachmentId === p.attachmentId; })[0];
  if (!a) return { ok: false, error: 'No such attachment' };
  var f = DriveApp.getFileById(a.driveFileId);
  return { attachment: a, dataB64: Utilities.base64Encode(f.getBlob().getBytes()) };
};

// ── audit ──────────────────────────────────────────────────────────
HANDLERS.audit = function (p) {
  var all = readAll_(SHEETS.AUDIT);
  all.reverse();                                     // same same-millisecond guard as corrections
  all.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
  return { audit: all.slice(0, Number(p.limit || 200)) };
};
