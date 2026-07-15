#!/usr/bin/env python3
"""
Inline every JS module into index.html as one classic <script>.

CSS, code.gs and data/baseline.json stay separate files.
Modules are concatenated in dependency order and their import/export keywords stripped —
they already share one namespace once inlined.
"""
import re, pathlib, sys

SRC = pathlib.Path('/home/claude/src/js')
OUT = pathlib.Path('/mnt/user-data/outputs')

# Dependency order. Anything importing another must come after it.
ORDER = ['config.js', 'api.js', 'store.js', 'router.js', 'wallpaper.js',
         'pages/dashboard.js', 'pages/bay.js', 'pages/relay.js', 'pages/sync.js', 'main.js']

def strip(src: str, name: str) -> str:
    # drop `import ... from '...'` (single- and multi-line)
    src = re.sub(r"^import\s+[^;]*?\s+from\s+['\"][^'\"]+['\"];?\s*$", '', src, flags=re.M | re.S)
    src = re.sub(r"^import\s+['\"][^'\"]+['\"];?\s*$", '', src, flags=re.M)
    # `export const/let/function/class` -> plain declaration
    src = re.sub(r"^export\s+(?=(const|let|var|function|class|async))", '', src, flags=re.M)
    # `export { a, b };` -> gone
    src = re.sub(r"^export\s*\{[^}]*\};?\s*$", '', src, flags=re.M)
    # the one dynamic import: bay.js pulls refresh lazily; inlined it's already here
    src = src.replace("const { refresh } = await import('../store.js');\n      ", '')
    if 'import ' in re.sub(r"//.*", '', src) and re.search(r"^\s*import\s", src, re.M):
        sys.exit(f'! leftover import in {name}')
    if re.search(r"^\s*export\s", src, re.M):
        sys.exit(f'! leftover export in {name}')
    return src.strip('\n')

parts = []
for name in ORDER:
    p = SRC / name
    if not p.exists():
        sys.exit(f'! missing {p}')
    body = strip(p.read_text(), name)
    parts.append(f"/* ═══════ {name} ═══════ */\n{body}")
    print(f'  inlined {name:<24} {len(body.splitlines()):>4} lines')

bundle = '\n\n'.join(parts)

# Always generate from the template. Editing outputs/index.html in place was not
# idempotent: the second build found no marker, changed nothing, and reported success.
html = (pathlib.Path('/home/claude/src/index.html')).read_text()
if '<!--BUNDLE-->' not in html:
    sys.exit('! template lost its <!--BUNDLE--> placeholder')

INLINE = (
  '<script>\n'
  '/* ══════════════════════════════════════════════════════════════════\n'
  '   All application JS, inlined. Built from js/ by build.py — if you edit\n'
  '   this block by hand, edit it here; there is no build step to re-run.\n'
  '   Classic script, not a module: works from file:// as well as a server.\n'
  '   ══════════════════════════════════════════════════════════════════ */\n'
  '(function () {\n"use strict";\n\n'
  + bundle +
  '\n})();\n</script>'
)

# replace the module tag + the old shell script with the single inline bundle
# lambda, not a template string: the bundle contains regex escapes (\s, \d) that
# re.sub would otherwise try to interpret as replacement groups.
html = html.replace('<!--BUNDLE-->', INLINE)

(OUT / 'index.html').write_text(html)
kb = len(html.encode()) / 1024
print(f'\n  index.html -> {kb:.0f} KB  ({len(html.splitlines())} lines)')
