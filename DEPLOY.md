# Deploy — Backend (Phase 1)

You asked me to delete the old database and create the new one. I can't reach
`script.google.com` from my sandbox, so **the wipe is code you deploy, not something I ran.**
Five minutes, in this order.

---

## 1. Replace the code

Open your Apps Script project → delete everything in `Code.gs` → paste all of **`code.gs`** → **Save**.

## 2. Redeploy as a NEW VERSION ⚠️

**Deploy → Manage deployments → ✏️ (pencil) → Version: `New version` → Deploy.**

Saving alone keeps serving the old code. This is the trap that cost you hours before.
Keep the same `/exec` URL — it doesn't change.

Settings must be: **Execute as `Me`** · **Who has access: `Anyone`**.

## 3. Confirm the deploy actually landed

Open in a browser:

```
https://script.google.com/macros/s/AKfycbyUi3N86BL-SVuOsKAni5drstGIyw_MNDjNAvsBg4Sr0xFfQtr-H-eJRpWxT-mMe6lL/exec?action=health
```

You want:

```json
{ "ok": true, "codeVersion": "1.0.1", "dbReady": false,
  "hint": "Run ?action=resetDatabase&confirm=KARJAT" }
```

- **`codeVersion` missing or not `1.0.1`** → step 2 didn't take. Redo it. Don't continue.
- **An HTML sign-in page instead of JSON** → access isn't `Anyone`.
- `dbReady: false` is correct right now. The database doesn't exist yet.

## 4. Wipe the old database, create the new one

```
...exec?action=resetDatabase&confirm=KARJAT&user=ashish
```

This trashes the old `Karjat Portal — Master`, builds a fresh one with 21 sheets, creates
`Images/ Attachments/ SourceFiles/ Overviews/`, and logs the wipe as the first audit row.
The old file goes to Drive **Trash — recoverable for 30 days**, not shredded. If you want it
gone for good, empty Trash yourself.

Response:

```json
{ "ok": true, "ssId": "1AbC...", "sheets": 21, "trashedOld": 1 }
```

## 5. Paste `ssId` back into the code ⚠️ (this is the performance fix)

Copy that `ssId`. In `code.gs` line ~30:

```js
const SS_ID = '1AbC...';     // ← paste it here
```

**Save → redeploy as New version again.**

Without it, every single request searches your whole Drive by filename before it can do
anything. That is a large part of why the old portal crawled.

## 6. Verify

```
...exec?action=health
```
→ `dbReady: true`, `ssIdConst: true`, `settingsCount: 0`.

Empty is correct. The 45,593 settings load from the frontend (Phase 2), chunked and resumable.

---

## Endpoints live now

| Action | Purpose |
|---|---|
| `health` | version + readiness. **Check this first, always.** |
| `resetDatabase` | wipe + recreate (needs `confirm=KARJAT`) |
| `syncChunk` | resumable bulk load |
| `bootstrap` | bays/relays/panels/cards — everything except settings |
| `getRelay` | one relay's settings via row-span |
| `createVersion` `applyVersion` `deleteVersion` `compareVersions` | versioning |
| `createCorrection` `listCorrections` | typo corrections (separate layer) |
| `savePanels` `duplicatePanels` | CRP layouts |
| `importMeanings` `meaningGaps` | meanings + resumable generation |
| `saveCards` `saveUser` `deleteUser` | cards, users |
| `uploadAttachment` `getAttachment` | Drive attachments |
| `audit` | audit trail |

---

## If something breaks

| Symptom | Cause |
|---|---|
| `relayId required` / `blockId required` on a call you didn't make | stale deployment → step 2 |
| HTML instead of JSON | access ≠ `Anyone` |
| `Database not found` | run step 4 |
| Everything slow | `SS_ID` still `''` → step 5 |
| `Storage busy` | two writes at once. Retry; the lock is working. |
