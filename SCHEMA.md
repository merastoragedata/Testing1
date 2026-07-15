# Karjat Protection Settings Portal — Data Model

Schema v1. For review before build. Everything below lives in **Storage** (Sheets/Drive).
localStorage holds a cache only, never truth.

---

## A. Storage layout

```
Karjat Protection Portal Data/            (Drive folder)
├── Karjat Portal — Master        (1 spreadsheet, 17 sheets, ~600k cells)
├── Images/
├── Attachments/                          (added: PDFs/images for corrections & records)
├── SourceFiles/                          (added: the 62 original WRPC files, verbatim)
└── Overviews/
    ├── Relay — <name>.gsheet             (62, created lazily)
    ├── Bay — <code>.gsheet               (29, created lazily)
    └── Substation — Karjat.gsheet        (1)
```

`SS_ID` constant pastable at top of `code.gs`; surfaced in the UI after first sync.

---

## B. Master spreadsheet sheets

### B1. Reference / parsed (immutable after sync)

**`_Meta`** — `key | value`
> schemaVersion, codeVersion, deployedAt, ssId, baselineSyncedAt, lastSyncBy, settingsCount

**`_Bays`** — 29 rows
`bayId | code | name | voltage | scheme | diameter | position | bus | type | isPseudo | order | notes`
- 400 kV: 401–415 (5 diameters × top/tie/bottom) + Spare ICT **on Bus-2**
- 220 kV: 203–212, odd→Bus-A, even→Bus-B
- 3 pseudo: `400 kV Bus Zone Set-1`, `Set-2`, `220 kV Bus Zone`

**`_Profiles`** — 21 rows
`profileId | family | model | kind | schemaHash | relayCount | settingsPerRelay`
> The dedup backbone. Derived, not hand-maintained.

**`_Relays`** — 62 rows
`relayId | bayId | linkedBayId | file | folder | family | model | kind | profileId | settingsCount | rowStart | rowEnd | sourceFileId | order`
- `bayId` = owning bay. `linkedBayId` = shown-on bay.
  → **ICT Diff / REF / NDR: `bayId`=403/406 (HV), `linkedBayId`=204/203 (IV)** per your call.
- **`rowStart`/`rowEnd`** = the relay's row span in `_Settings`. See §D.

**`_Settings`** — 45,593 rows · **IMMUTABLE baseline v1.0**
`settingId | relayId | profileId | groupName | idx | title | value | unit | step | rangeText | address | meaningKey`
- `settingId` = `<relayId>:<idx>` — stable, never reused.
- Physically **sorted by relayId, then idx**. This is load-bearing (§D).
- `address` populated for MiCOM only.

### B2. Versioning

**`_Versions`**
`versionId | relayId | tag | kind | state | label | effectiveDate | reference | author | checker | reason | batchId | sourceFileId | createdAt | createdBy | appliedAt`
- `kind` ∈ `baseline | revision | archive`
- `state` ∈ `draft | applied | superseded`
- 62 baseline rows (tag `v1.0`) seeded at sync. **Never deletable — enforced server-side, not just hidden in UI.**
- `tag`: newer upload → next major (`v2.0`, `v3.0`); older/archival → sub-version (`v1.1`, `v1.2`), `kind=archive`, never applied.
- `batchId` groups a bay/substation zip upload into one logical action.

**`_SettingDeltas`** — **sparse**
`deltaId | versionId | settingId | oldValue | newValue | outOfRange`
> Only *changed* settings are stored. A revision touching 30 settings = 30 rows, not 45,593.
> Makes "compare any two versions" a diff of two small sets.

**`_Corrections`** — separate layer, architecturally distinct from versions
`correctionId | settingId | versionId | oldValue | newValue | date | reason | user | attachmentId | versionTag | createdAt | supersededBy`
> A correction fixes a *mistake*; a delta records an *engineering change*. Different tables,
> different endpoints, different audit verbs. Not a UI convention.

**`_Audit`**
`auditId | ts | user | action | entityType | entityId | before | after | note`

### B3. Meanings

**`_Meanings`** — ≤ 11,787 rows
`meaningKey | family | modelOrKind | groupName | title | settingMeaning | source | confidence | updatedAt | updatedBy`

**`_ValueMeanings`** — ≤ 12,767 rows
`meaningKey | value | valueMeaning | source | confidence | updatedAt | updatedBy`

- `meaningKey` = hash(`family | model||kind | groupName | title`)
- `source` ∈ `seed | import | ai | manual` — manual always wins; ai never overwrites manual.
- One meaning row serves every relay sharing that profile. **Write once, appears on up to 9 relays.**

### B4. Cards

**`_CardSections`** — `sectionId | scope | scopeId | name | order`
**`_Cards`** — `cardId | sectionId | settingId | label | widthFrac | order | pinnedToBay | source`
- `source` ∈ `vitals | custom` — vitals seed as ordinary editable cards (merged system).
- `widthFrac` persists drag-resize; `sectionId`+`order` persist drag-between-sections.

### B6. CRP (Control & Relay Panel) layout

Each bay renders as a **two-panel CRP arrangement** — a physical mockup of the control-room
panels, not a schematic. Devices are placed by the engineer, never inferred.

**`_Panels`**
`panelId | bayId | slot | name | label | widthMM | heightMM | gridMM | order | notes`
- `slot` ∈ `1 | 2` (left / right). Default 2 per bay; add/remove supported.
- `widthMM`/`heightMM` default **800 × 2200** (standard simplex CRP). Real proportions, so the
  on-screen panel is scaled from millimetres — a 4U relay looks like a 4U relay.
- `gridMM` default 25 — snap grid.

**`_PanelItems`**
`itemId | panelId | type | refId | label | x | y | w | h | shape | colour | rotation | order | notes`
- `type` ∈ `relay | annunciator | control_switch | meter | semaphore | mimic | mcb | lamp | ttb | trip_relay | text | blank`
- `refId` → `relayId` when `type=relay`; else null.
- `x, y, w, h` in **mm**, panel-origin top-left. Resolution-independent; survives any zoom.
- `shape` ∈ `rect | rounded | circle` — covers "variable shapes and sizes".
- Placement is **persisted to Storage** (§5), so a layout drawn on your desktop is there on
  your phone. This is exactly the class of data the old build lost in localStorage.

**Unplaced tray**: relays in `_Relays` for a bay with no `_PanelItems` row render in a tray
below the panels. Bay page shows `n relays unplaced` until the tray is empty. No auto-placement,
no assumed Main-1/Main-2 panel convention.

**Mobile**: drag-to-place is an **edit mode**, desktop-primary (drag-drop at 2200 mm scaled to a
phone is not honest UX). On mobile the panel is read-only and tappable → relay page. Placement
can still be nudged via a numeric x/y field. Stated up front rather than shipped broken.

### B5. Everything else

**`_Users`** — `userId | name | email | role | state | pwHash | createdAt | approvedBy`
> ⚠️ `pwHash` is **not real security** — client-side hash, no salt rotation, no server secret.
> Will be stated in a code comment and in the Admin UI. Real auth arrives with LTS.

**`_Attachments`** — `attachmentId | driveFileId | name | mime | size | scope | scopeId | uploadedBy | uploadedAt`
**`_Interruptions`** — `intId | bayId | ts | type | description | relaysOperated | analysis | attachmentIds | createdBy`
**`_OverviewRegistry`** — `entityType | entityId | spreadsheetId | url | createdAt | dbTabSyncedAt`
**`_Manuals`** — `manualId | relayKind | family | title | url | source | attachmentId`
**`_CustomColumns`** — `colId | scope | scopeId | name | order`

---

## C. Effective value resolution

```
effective(settingId, versionId) =
    1. _Settings.value                                   (baseline v1.0)
    2. ← override: _SettingDeltas where versionId in applied chain
    3. ← override: _Corrections where versionId matches, latest non-superseded wins
```
Three layers, each independently auditable. Baseline is never mutated by anything.

---

## D. Why `rowStart`/`rowEnd` matters

Apps Script cannot range-query a sheet. Naive `getDataRange()` on `_Settings` pulls all
45,593 rows (~4 MB) on **every relay page load**. That is exactly how the old build crawled.

Because `_Settings` is sorted by relayId and each relay's span is recorded in `_Relays`:

```js
const r = relayRow;                       // 1 small read, cached
sh.getRange(r.rowStart, 1, r.rowEnd - r.rowStart + 1, 12).getValues();
```

Worst case = a P643 REF at 3,883 rows. Typical = 237. **~99% less data per load.**
Invariant: any operation that reorders `_Settings` must recompute all spans. Guarded by
a checksum in `_Meta`.

---

## E. Sync strategy (the 45,593-row write)

Apps Script has a 6-min execution ceiling; one `setValues` of 45,593×12 will not survive it.

- Frontend parses Excel client-side (SheetJS) → POSTs JSON.
- Chunked + **resumable**: `syncChunk(offset, limit=4000)` ≈ 12 calls, each ~8 s.
- `_Meta.syncCursor` tracks progress; interrupted sync resumes, never restarts.
- Repo ships `data/baseline.json` used **only** to seed the first sync — not as a read source
  (Trap 6). Freshness badge reads `_Meta.baselineSyncedAt` from Storage, never from the bundle.

---

## F. Reset / bootstrap (your "delete the old database")

Runs **inside** the new `code.gs` — I cannot reach `script.google.com` from my sandbox (Trap 3),
so this is code you deploy, not something I execute.

```
GET ?action=health                        → {codeVersion, schemaVersion, ssId, ok}
GET ?action=resetDatabase&confirm=KARJAT  → trashes old folder, creates fresh, returns new ssId
```
`health` exists specifically so the portal can tell you **"your deployed backend is out of date"**
instead of throwing `relayId required` (Trap 1). Reset requires the literal confirm token and
writes an `_Audit` row as its first act.

---

## G. Sizing

| | rows | cells |
|---|---|---|
| `_Settings` | 45,593 | ~547k |
| `_Meanings` + `_ValueMeanings` | ≤ 24,564 | ~245k |
| everything else | small | — |
| **Master total** | | **~850k / 10M** ✅ |
| Substation Overview `Database (auto)` | 45,593 | ~501k ✅ |

---

## H. Open question (see chat)

MiCOM setting-group columns — whether `Column 3A / 3C / 3E` are the same function across
Setting Groups 1–4. If yes, `meaningKey` should normalise them and ~12k meanings drop further.
Building group-inclusive (safe/over-fragmented) until you confirm; collapsing later is a
one-line key change + re-key migration. Over-fragmenting costs effort; collapsing wrongly
costs correctness — so it defaults safe.
