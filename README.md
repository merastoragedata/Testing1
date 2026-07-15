# Karjat Protection Settings Portal

400/220 kV Karjat Substation (J966) · MSETCL Western Region
62 relays · 26 bays + 3 bus zones · 45,593 settings

## What to publish

```
index.html          the whole app — HTML + all JS inline. One file.
css/theme.css       MSETCL navy/gold
data/baseline.json  4.9 MB seed, used ONCE to fill Storage, then never read
code.gs             the backend — paste into Apps Script (see DEPLOY.md)
```

Push to a GitHub repo → Settings → Pages → branch `main`, folder `/ (root)`.
No build, no bundler, no JSX transpile.

## First run

1. Deploy `code.gs` and create the database — `DEPLOY.md`, in order.
2. Open the portal → **Load settings** → Start. ~12 resumable chunks.
3. Admin shows the `SS_ID` to paste into `code.gs`. Do it — it's the speed fix.

Backend must report `codeVersion 1.0.1`. The portal says so plainly if it doesn't.

## Editing the JS

`index.html` is generated. The readable sources live in `src/js/`, and `build.py`
inlines them in dependency order:

```
python3 build.py        # src/index.html + src/js/*.js  ->  index.html
```

Editing `index.html` directly is fine too — just know a rebuild would overwrite it.

## Architecture

Storage (Sheets) is the source of truth for everything you create.
localStorage holds a **cache**, the backend URL, and two display toggles. Nothing else.
Delete it and you lose nothing but a few hundred milliseconds.

That is why a layout drawn on your desktop appears on your phone.

## Tests

Not shipped with the site, but they exist and they run against the real files:

- `test_backend.js` — 50 checks: the real `code.gs` on a simulated Sheets, all 45,593 settings
- `test_page.js` — 55 checks: the real `index.html` executed in jsdom against the real backend

Both green as of this build.
