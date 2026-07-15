# Karjat Protection Settings Portal

400/220 kV Karjat Substation (J966) · MSETCL Western Region
62 relays · 26 bays + 3 bus zones · 45,593 settings

## The app is two files

```
index.html     everything — markup, all JS, and all 45,593 settings   (1.4 MB)
styles.css     MSETCL navy/gold                                 (16 KB)
```

Push to a GitHub repo → Settings → Pages → branch `main`, folder `/ (root)`.
No build, no bundler, no modules, no JSX transpile.

`code.gs` is the third file, but it isn't part of the website — it lives in Apps Script.
See `DEPLOY.md`.

## Where the settings data lives

Inside `index.html`. All 45,593 settings are gzipped and base64'd into an inert
`<script type="application/gzip-base64">` tag — 4.87 MB of JSON compressed to 1.33 MB.
The browser stores it as plain text and never parses it as code. It is decoded exactly
once, when you press **Load settings**, and never touched again.

That's why `index.html` is 1.4 MB rather than 50 KB. The browser caches it, so you pay
that once. There is no separate data file to misplace.

## First run

See `DEPLOY.md` — four steps, no URLs to open.

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

- backend: 54 checks — the real `code.gs` against a simulated Sheets, all 45,593 settings
- page: 63 checks — the real `index.html` executed in jsdom against the real backend

Both green as of this build.
