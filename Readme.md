# Karjat Protection Settings Portal

400/220 kV Karjat Substation (J966) · MSETCL Western Region
62 relays · 26 bays + 3 bus zones · 45,593 settings

## The app is two files

```
index.html     everything — markup + all JS inline   (50 KB)
styles.css     MSETCL navy/gold                      (16 KB)
```

Push to a GitHub repo → Settings → Pages → branch `main`, folder `/ (root)`.
No build, no bundler, no modules, no JSX transpile.

## Two supporting files that are not the app

```
code.gs             the backend. Lives in Apps Script, not in a web page.  → DEPLOY.md
data/baseline.json  4.9 MB one-time seed (see below)
```

**Why `baseline.json` is not inlined.** It is read exactly once, when you press
**Load settings**, to fill Storage. Inlined, `index.html` would go from 50 KB to 5 MB —
downloaded on every page load, forever, for a file needed once. Kept separate, the portal
stays 50 KB and only ever fetches it on the sync page.

After the first sync you could delete it. Keep it: it's how you rebuild the database
from scratch if you ever need to.

## First run

1. Deploy `code.gs` and create the database — `DEPLOY.md`, in order.
2. Open the portal → **Load settings** → Start. ~12 resumable chunks.
3. Admin shows the `SS_ID` to paste into `code.gs`. Do it — it's the speed fix.

Backend must report `codeVersion 1.0.1`. Admin says so plainly if it doesn't.

## Editing

`index.html` is now the source of truth for the JS — there is no build step and no
`src/` folder. Edit it directly. Inside the single `<script>`, the old module boundaries
are still marked as comment banners (`/* ═══ store.js ═══ */`) so it stays navigable.

## Architecture

Storage (Sheets) is the source of truth for everything you create.
localStorage holds a **cache**, the backend URL, and two display toggles. Nothing else.
Delete it and you lose nothing but a few hundred milliseconds.

That is why a CRP layout drawn on your desktop appears on your phone.

## What is built

Overview · Bay Register · Bay page with two-panel CRP (drag to place, saves to Storage) ·
Relay page with settings table, search and meanings · Load settings · Admin.

## What is not built

SLD · cards · versions & corrections UI · Overview mirroring · Excel export ·
File Manager · manuals · interruptions · users. `/sld` is an honest stub, and Admin
lists the gaps rather than implying otherwise.

## Tests (not shipped with the site)

- backend: 50 checks — the real `code.gs` against a simulated Sheets, all 45,593 settings
- page: 58 checks — the real `index.html` executed in jsdom against the real backend

Both green as of this build.
