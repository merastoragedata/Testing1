# Setup — four steps

No URLs to open. No spreadsheet IDs to copy. No checking things in a browser tab.

---

## 1. Put the code in Apps Script

Open your Apps Script project → select everything in `Code.gs` → delete → paste all of
**`code.gs`** → **Save** (💾).

## 2. Create the database — press ▶ Run

At the top of the editor there's a **function dropdown**. Choose **`setupDatabase`**.
Press **▶ Run**.

First time only, Google asks for permission: *Review permissions → your account →
Advanced → Go to (project) → Allow*. That's normal for a script that touches your Drive.

The black **Execution log** at the bottom should say:

```
  ✓ DATABASE CREATED
  ─────────────────────────────────────
  Spreadsheet : https://docs.google.com/spreadsheets/d/...
  Sheets      : 21
  Code version: 1.0.1
```

That's the database made. It's **empty on purpose** — the settings go in at step 4.

> Re-runnable any time. It trashes the old database and builds a fresh one. The old copy
> goes to Drive Trash, recoverable for 30 days.

## 3. Deploy

**Deploy → Manage deployments → ✏️ (pencil) → Version: `New version` → Deploy**

- **Execute as:** Me
- **Who has access:** Anyone

⚠️ Saving in step 1 is not deploying. If you skip this, the web address keeps serving your
**old** code and the portal will misbehave in confusing ways. The portal checks for this and
says so on the Admin page — you don't have to test it yourself.

## 4. Load the settings

Open the portal → **Load settings** → **Start**.

All 45,593 settings are already inside `index.html`; this unpacks them and writes them to
your spreadsheet in about 12 chunks. If it stops, press Start again — it picks up where it
left off rather than starting over.

Done.

---

## Other functions you can ▶ Run

| Function | What it does |
|---|---|
| `setupDatabase` | Wipe and rebuild the database from scratch |
| `checkStatus` | Print code version, spreadsheet, settings count, last load |
| `clearAllSettings` | Empty the settings but keep the database, revisions and layouts |

## If something looks wrong

| What you see | What it means |
|---|---|
| Portal says **"No database yet"** | Step 2 hasn't been run |
| Admin says **backend is out of date** | Step 3 wasn't done as a *New version* |
| Portal says it got a **sign-in page** | Step 3: Who has access → Anyone |
| **"Storage busy"** | Two writes at once. Press again — the lock is doing its job. |

Run `checkStatus` and read the log. It reports the code **in the editor** — if that disagrees
with what the portal reports, step 3 is the answer.
