# OKF Wiki Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, clone-based GitHub template repo that produces strict-OKF-profile Markdown wikis with a deterministic Node build/lint and optional Python ingest.

**Architecture:** Markdown under `wiki/` (+ source material in `raw/`) is canonical. `build.mjs` renders `site/` HTML and, with `--check`, validates the OKF profile. Pure helpers live in `lib/okf.mjs` (unit-tested); the generator composes them and uses `marked`'s token API for link handling. Links are standard Markdown (repo-root-relative) targeting wiki concepts; `index.md`/`log.md` are OKF reserved no-frontmatter files. `AGENTS.md` is the canonical agent doc; `CLAUDE.md` shims to it.

**Tech Stack:** Node ≥20 (`node --test`), `gray-matter`, `marked`; optional Python ingest via `uv`; git.

**Spec:** `docs/superpowers/specs/2026-06-27-okf-wiki-template-design.md` (read it first — especially "Bundle scope & link roots").

## Global Constraints

These apply to every task. Exact values copied from the spec.

- **Node ≥ 20.** `package.json` `engines.node` = `">=20"`. Test runner is `node --test` only.
- **Pinned deps:** `gray-matter` `4.0.3`, `marked` `18.0.5`.
- **Bundle root = repo root.** Absolute links start at repo root: `/wiki/<topic>/<slug>.md`.
- **OKF validation scope = `wiki/**` + `raw/**` only** for frontmatter/`type`. Never validate `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/**`, or `ingest/**`.
- **Link resolution = `wiki/` concept bodies only.** Body `.md` links must resolve to an existing `wiki/<topic>/<slug>.md` concept. `raw/` docs are NOT link-validated. Links to `raw/`, to reserved files, that escape repo root, or with no target → **fail `check`**.
- **Concept type rules:** `raw/**` → `source`; `wiki/<topic>/<slug>.md` → one of `concept | pattern | worked-example`. Reserved `index.md`/`log.md` are exempt and MUST have **no frontmatter**.
- **Canonical fields:** `description` (summary), `timestamp` (ISO 8601), `resource` (optional URI). `status` is a permitted custom key. No `[[wikilinks]]`, no `related:`, no auto-generated `## References` — external sources go in a body `# Citations` section.
- **`build.mjs` reads the wiki name from `package.json` `name`** — never hardcode it.
- **Slugs are kebab-case** (`[a-z0-9-]+`); link/file paths contain no spaces or parentheses.
- **Git:** work on branch `feat/okf-template-infra`; Conventional Commits; **no `Co-Authored-By`/AI attribution**. Do not push without explicit go-ahead.

---

## File Structure

- `package.json` — name (read by build), `engines`, deps, scripts (`build`/`check`/`test`; `ingest` added in Task 6).
- `topics.json` — `{ "order": [...] }` topic ordering.
- `assets/wiki.css` — styles for generated `site/` (copied from education-wiki, verbatim).
- `lib/okf.mjs` — **pure** helpers: `esc`, `summary`, `isReserved`, `typeViolation`, `isLocalMd`, `resolveLinkTarget`, `siteRelFromRepoRel`. No I/O, no deps. (Task 2)
- `build.mjs` — generator + `--check` validator. Composes `lib/okf.mjs`; uses `marked` tokens for link extraction/rewrite. Exports `localMdLinksIn` for testing; runs `main()` only when invoked directly. (Task 3)
- `wiki/getting-started/index.md` — reserved, no frontmatter, intro prose. (Task 3)
- `wiki/getting-started/welcome.md`, `writing-concepts.md` — example concepts, cross-linked, with `# Citations`. (Task 3)
- `raw/.gitkeep` — keeps empty source dir. (Task 3)
- `test/okf.test.mjs` — unit tests for `lib/okf.mjs` (pure helpers). (Task 2)
- `test/build-check.test.mjs` — link-extraction unit tests + end-to-end build/check via subprocess. (Task 4)
- `AGENTS.md`, `CLAUDE.md`, `README.md` — docs. (Task 5)
- `ingest/`, `scripts/ingest.mjs` — optional Python pipeline, patched to strict profile. (Task 6)

---

## Task 1: Repo scaffold (package.json, topics.json, assets, branch)

**Files:**
- Create: `package.json`, `topics.json`, `assets/wiki.css`, `raw/.gitkeep`

**Interfaces:**
- Produces: `package.json` with `name: "okf-wiki-template"`, scripts `build`/`check`/`test`; `topics.json` `{ "order": ["getting-started"] }`.

- [ ] **Step 1: Create the implementation branch**

```bash
cd ~/personal/okf-wiki-template
git checkout -b feat/okf-template-infra
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "okf-wiki-template",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Strict OKF-profile Markdown wiki template (clone with 'Use this template').",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "node build.mjs",
    "check": "node build.mjs --check",
    "test": "node --test"
  },
  "dependencies": {
    "gray-matter": "4.0.3",
    "marked": "18.0.5"
  }
}
```

- [ ] **Step 3: Write `topics.json`**

```json
{ "order": ["getting-started"] }
```

- [ ] **Step 4: Copy the stylesheet and keep the raw dir**

```bash
mkdir -p assets raw
cp ~/personal/education/education-wiki/assets/wiki.css assets/wiki.css
touch raw/.gitkeep
```

- [ ] **Step 5: Install deps and verify the toolchain**

Run: `npm install`
Expected: exits 0; creates `package-lock.json` and `node_modules/`.

Run: `node -e "import('gray-matter').then(()=>import('marked')).then(()=>console.log('deps ok'))"`
Expected: prints `deps ok`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json topics.json assets/wiki.css raw/.gitkeep
git commit -m "chore: scaffold okf-wiki-template (package, topics, assets)"
```

---

## Task 2: `lib/okf.mjs` pure helpers (TDD)

**Files:**
- Create: `lib/okf.mjs`
- Test: `test/okf.test.mjs`

**Interfaces:**
- Produces (all pure, no I/O, no deps):
  - `esc(s) => string` — HTML-escape `& < >`.
  - `summary(data) => string` — `data.description ?? ''`.
  - `isReserved(base) => boolean` — true for `index.md`/`log.md`.
  - `typeViolation({ area, type }) => string|null` — null if valid. `raw`→`source`; `wiki`→`concept|pattern|worked-example`. Reserved files are filtered by the caller and never passed here.
  - `isLocalMd(target) => boolean` — true for non-URL, non-anchor `.md` (optionally `#frag`) targets; false for images/URLs/anchors.
  - `resolveLinkTarget(fromDir, target) => string|null` — repo-root-relative posix path; `/`-prefixed → from repo root, else resolved against `fromDir`; drops `#frag`. **Returns `null` if the path escapes the repo root.**
  - `siteRelFromRepoRel(repoRel) => string` — `wiki/<t>/<s>.md` → `<t>/<s>.html`.

- [ ] **Step 1: Write the failing tests**

`test/okf.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, summary, isReserved, typeViolation,
  isLocalMd, resolveLinkTarget, siteRelFromRepoRel,
} from '../lib/okf.mjs';

test('esc escapes HTML metacharacters', () => {
  assert.equal(esc('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
});

test('summary returns description or empty string', () => {
  assert.equal(summary({ description: 'd' }), 'd');
  assert.equal(summary({}), '');
});

test('isReserved matches OKF reserved filenames only', () => {
  assert.equal(isReserved('index.md'), true);
  assert.equal(isReserved('log.md'), true);
  assert.equal(isReserved('welcome.md'), false);
});

test('typeViolation enforces area -> type for concepts', () => {
  assert.equal(typeViolation({ area: 'raw', type: 'source' }), null);
  assert.equal(typeViolation({ area: 'wiki', type: 'concept' }), null);
  assert.equal(typeViolation({ area: 'wiki', type: 'pattern' }), null);
  assert.equal(typeViolation({ area: 'wiki', type: 'worked-example' }), null);
  assert.match(typeViolation({ area: 'raw', type: 'concept' }), /expected type "source"/);
  assert.match(typeViolation({ area: 'wiki', type: undefined }), /missing required `type`/);
  assert.match(typeViolation({ area: 'wiki', type: 'banana' }), /expected one of/);
});

test('isLocalMd recognizes local .md links only', () => {
  assert.equal(isLocalMd('./x.md'), true);
  assert.equal(isLocalMd('/wiki/t/y.md#sec'), true);
  assert.equal(isLocalMd('https://e.com/x.md'), false);
  assert.equal(isLocalMd('#anchor'), false);
  assert.equal(isLocalMd('img.png'), false);
});

test('resolveLinkTarget resolves absolute and relative to repo root', () => {
  assert.equal(resolveLinkTarget('wiki/getting-started', '/wiki/getting-started/welcome.md'), 'wiki/getting-started/welcome.md');
  assert.equal(resolveLinkTarget('wiki/getting-started', './writing-concepts.md'), 'wiki/getting-started/writing-concepts.md');
  assert.equal(resolveLinkTarget('wiki/getting-started', '../other/z.md#frag'), 'wiki/other/z.md');
});

test('resolveLinkTarget returns null when the path escapes repo root', () => {
  assert.equal(resolveLinkTarget('wiki', '../../escape.md'), null);
});

test('siteRelFromRepoRel maps wiki md path to site html path', () => {
  assert.equal(siteRelFromRepoRel('wiki/getting-started/welcome.md'), 'getting-started/welcome.html');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/okf.mjs'`.

- [ ] **Step 3: Implement `lib/okf.mjs`**

```js
// Pure OKF-profile helpers shared by build.mjs and tests. No I/O, no deps.

export const WIKI_CONCEPT_TYPES = ['concept', 'pattern', 'worked-example'];
const RESERVED = ['index.md', 'log.md'];

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const summary = (data) => data.description ?? '';

export const isReserved = (base) => RESERVED.includes(base);

// `area` is 'raw' | 'wiki'. Reserved files are filtered out by the caller, so this
// only ever validates concept documents.
export function typeViolation({ area, type }) {
  if (!type) return 'missing required `type`';
  if (area === 'raw') return type === 'source' ? null : 'expected type "source"';
  if (area === 'wiki') {
    return WIKI_CONCEPT_TYPES.includes(type)
      ? null
      : `expected one of ${WIKI_CONCEPT_TYPES.join(', ')}`;
  }
  return `unknown area "${area}"`;
}

export const isLocalMd = (target) =>
  !/^[a-z][a-z0-9+.-]*:\/\//i.test(target) &&
  !target.startsWith('#') &&
  /\.md(#.*)?$/.test(target);

// Resolve a link target to a repo-root-relative posix path (no leading slash). Drops #frag.
// Bundle root = repo root: a leading '/' is relative to repo root. Returns null if the
// path escapes the repo root (a '..' with nothing left to pop).
export function resolveLinkTarget(fromDir, target) {
  const clean = target.split('#')[0];
  const startParts = clean.startsWith('/') ? [] : (fromDir ? fromDir.split('/') : []);
  const parts = startParts.concat(clean.replace(/^\//, '').split('/'));
  const stack = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      if (stack.length === 0) return null;
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

// wiki/<topic>/<slug>.md -> <topic>/<slug>.html  (site mirrors wiki/ without the prefix)
export const siteRelFromRepoRel = (repoRel) =>
  repoRel.replace(/^wiki\//, '').replace(/\.md$/, '.html');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all `okf.test.mjs` tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/okf.mjs test/okf.test.mjs
git commit -m "feat: add pure OKF-profile helpers with unit tests"
```

---

## Task 3: `build.mjs` generator + `--check` validator, with example content

**Files:**
- Create: `build.mjs`
- Create: `wiki/getting-started/index.md`, `wiki/getting-started/welcome.md`, `wiki/getting-started/writing-concepts.md`

**Interfaces:**
- Consumes: all exports from `lib/okf.mjs` (Task 2).
- Produces: `node build.mjs` writes `site/`; `node build.mjs --check` validates and exits non-zero on any problem. Exports `localMdLinksIn(md) => string[]` (local `.md` link hrefs via marked tokens, images/code excluded) for tests. `main()` runs only when the file is invoked directly. The example bundle MUST pass `check` and `build`.

- [ ] **Step 1: Create the example reserved index (no frontmatter)**

`wiki/getting-started/index.md`:
```markdown
# Getting started

This topic shows the shape of a strict-OKF-profile wiki. The card list below is generated
from the concept files in this folder — do not hand-maintain it.
```

- [ ] **Step 2: Create the first example concept**

`wiki/getting-started/welcome.md`:
```markdown
---
type: concept
title: Welcome to OKF wikis
description: What this template is and how a concept page is structured.
tags: [okf, meta]
timestamp: 2026-06-27T00:00:00Z
status: solid
---

This is a **concept** page — one idea per file. Frontmatter carries `type` (required),
`title`, `description`, `tags`, and `timestamp`; the body is plain Markdown.

Cross-link other concepts with standard Markdown links, e.g. see
[writing concepts](./writing-concepts.md) for the authoring rules.

> [!NOTE]
> `site/` is generated. Edit Markdown in `wiki/`, then run `npm run build`.

# Citations

- Open Knowledge Format v0.1 — https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
```

- [ ] **Step 3: Create the second example concept (link target)**

`wiki/getting-started/writing-concepts.md`:
```markdown
---
type: concept
title: Writing concepts
description: Rules for authoring concept pages in this wiki.
tags: [okf, authoring]
timestamp: 2026-06-27T00:00:00Z
status: solid
---

One concept per file. Required frontmatter is `type`; recommended: `title`, `description`,
`tags`, `timestamp`. Use an absolute, repo-root link to point back to the
[welcome page](/wiki/getting-started/welcome.md).

External sources belong under a `# Citations` heading, not in frontmatter. To cite source
material under `raw/`, reference it as inline code like `raw/getting-started/notes.md`.

# Citations

- This template's design spec — `docs/superpowers/specs/2026-06-27-okf-wiki-template-design.md`
```

- [ ] **Step 4: Write `build.mjs`**

```js
#!/usr/bin/env node
// okf-wiki-template generator: wiki/**/*.md -> site/ (deterministic, no LLM).
// Strict OKF profile. Markdown in wiki/ is canonical; site/ is generated — never hand-edit it.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync, cpSync, realpathSync } from 'node:fs';
import { join, dirname, relative, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';
import matter from 'gray-matter';
import { marked } from 'marked';
import {
  esc, summary, isReserved, typeViolation,
  isLocalMd, resolveLinkTarget, siteRelFromRepoRel,
} from './lib/okf.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WIKI_DIR = join(ROOT, 'wiki');
const RAW_DIR = join(ROOT, 'raw');
const SITE_DIR = join(ROOT, 'site');
const ASSETS_SRC = join(ROOT, 'assets');
const CHECK = argv.includes('--check');
const TOPICS = JSON.parse(readFileSync(join(ROOT, 'topics.json'), 'utf8'));
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const WIKI_NAME = PKG.name;

const ALERTS = { TIP: 'tip', NOTE: 'note', WARNING: 'warn', CAUTION: 'gotcha', IMPORTANT: 'note' };
const toPosix = (p) => p.split(/[\\/]/).join('/');
const rootRel = (file) => toPosix(relative(ROOT, file));
const hasFrontmatter = (raw) => /^---\r?\n/.test(raw);

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(p));
    else if (name.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// --- link handling via marked tokens (skips code blocks/spans; parses parens correctly) ---

// Return local .md link hrefs found in a markdown string (images excluded — they are
// `image` tokens, not `link`). Exported for tests.
export function localMdLinksIn(md) {
  const out = [];
  const tokens = marked.lexer(md);
  marked.walkTokens(tokens, (tok) => {
    if (tok.type === 'link' && isLocalMd(tok.href)) out.push(tok.href);
  });
  return out;
}

// Rendering context for renderer.link (single-threaded; set before each parse).
let LINKCTX = { fromDir: '', outDir: SITE_DIR };

function rewriteHref(href) {
  if (!isLocalMd(href)) return href;
  const [path, hash] = href.split('#');
  const repoTarget = resolveLinkTarget(LINKCTX.fromDir, path);
  if (repoTarget === null) return href; // escapes root; check reports it as broken
  const siteAbs = join(SITE_DIR, siteRelFromRepoRel(repoTarget));
  return (toPosix(relative(LINKCTX.outDir, siteAbs)) || basename(siteAbs)) + (hash ? `#${hash}` : '');
}

const renderer = new marked.Renderer();
renderer.code = ({ text, lang: infostring }) => {
  const info = (infostring || '').trim();
  const title = (info.match(/title="([^"]*)"/) || [])[1];
  const lang = info.split(/\s+/)[0] || '';
  const head = title || lang;
  return `<div class="code-block">${head ? `<div class="code-head">${esc(head)}</div>` : ''}<pre><code>${esc(text)}</code></pre></div>`;
};
renderer.link = function ({ href, title, tokens }) {
  const text = this.parser.parseInline(tokens);
  const t = title ? ` title="${esc(title)}"` : '';
  return `<a href="${esc(rewriteHref(href))}"${t}>${text}</a>`;
};
marked.use({ renderer });

function preprocessAlerts(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^>\s*\[!(TIP|NOTE|WARNING|CAUTION|IMPORTANT)\]\s*(.*)$/);
    if (m) {
      const cls = ALERTS[m[1]];
      const label = (m[2].trim() || (m[1][0] + m[1].slice(1).toLowerCase()));
      const buf = [];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<div class="callout ${cls}"><span class="label">${esc(label)}</span>\n${marked.parse(buf.join('\n'))}\n</div>`);
    } else { out.push(lines[i]); i++; }
  }
  return out.join('\n');
}

function renderMarkdown(md, fromDir, outDir) {
  LINKCTX = { fromDir, outDir };
  return marked.parse(preprocessAlerts(md));
}

// --- collect ----------------------------------------------------------------

function collect() {
  const concepts = [];
  const reserved = [];
  for (const file of walk(WIKI_DIR)) {
    const base = basename(file);
    const raw = readFileSync(file, 'utf8');
    if (isReserved(base)) { reserved.push({ file, repoRel: rootRel(file), base, raw }); continue; }
    const { data, content } = matter(raw);
    const topic = toPosix(relative(WIKI_DIR, file)).split('/')[0];
    concepts.push({ file, repoRel: rootRel(file), topic, slug: basename(file, '.md'),
      key: `${topic}/${basename(file, '.md')}`, data, content });
  }
  const rawDocs = walk(RAW_DIR).map((file) => {
    const base = basename(file);
    const raw = readFileSync(file, 'utf8');
    if (isReserved(base)) return { file, repoRel: rootRel(file), base, raw, reserved: true };
    const { data } = matter(raw);
    return { file, repoRel: rootRel(file), data, reserved: false };
  });
  return { concepts, reserved, rawDocs };
}

// --- validate (OKF profile) -------------------------------------------------

function validate({ concepts, reserved, rawDocs }) {
  const problems = [];
  const conceptPaths = new Set(concepts.map((c) => c.repoRel)); // linkable targets

  // reserved files (index.md / log.md, in wiki/ or raw/) must have no frontmatter
  for (const r of [...reserved, ...rawDocs.filter((d) => d.reserved)]) {
    if (hasFrontmatter(r.raw)) problems.push(`${r.repoRel} -> reserved file (${r.base}) must have no frontmatter`);
  }
  // concept type rules
  for (const c of concepts) {
    const v = typeViolation({ area: 'wiki', type: c.data.type });
    if (v) problems.push(`${c.key} -> ${v}`);
  }
  for (const d of rawDocs) {
    if (d.reserved) continue;
    const v = typeViolation({ area: 'raw', type: d.data.type });
    if (v) problems.push(`${d.repoRel} -> ${v}`);
  }
  // every ordered topic has a directory
  for (const topic of TOPICS.order) {
    if (!existsSync(join(WIKI_DIR, topic))) problems.push(`topic "${topic}" -> no wiki/${topic}/ directory`);
  }
  // wiki concept body links must resolve to an existing wiki concept
  for (const c of concepts) {
    const fromDir = dirname(c.repoRel);
    for (const href of localMdLinksIn(c.content)) {
      const repoTarget = resolveLinkTarget(fromDir, href);
      if (repoTarget === null || !conceptPaths.has(repoTarget)) {
        problems.push(`${c.key} -> broken link ${href} (must point to an existing wiki concept)`);
      }
    }
  }
  return problems;
}

// --- render -----------------------------------------------------------------

function metaRow(data) {
  const parts = [];
  if (data.status) parts.push(`<span><span class="k">status:</span> ${esc(data.status)}</span>`);
  if (data.timestamp) parts.push(`<span><span class="k">updated:</span> ${esc(data.timestamp)}</span>`);
  const tags = (data.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('\n');
  if (tags) parts.push(`<span class="tags">${tags}</span>`);
  return parts.length ? `<div class="meta-row">${parts.join('\n')}</div>` : '';
}

function shell({ title, crumb, css, body, backHref }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(WIKI_NAME)}</title>
<link rel="stylesheet" href="${css}">
</head>
<body>
<header class="topbar">
  <div class="wrap">
    <span class="brand"><a href="${backHref}">${esc(WIKI_NAME)}</a></span>
    <span class="crumb">${crumb}</span>
    <span class="spacer"></span>
    <span class="crumb"><a href="${backHref}">hub</a></span>
  </div>
</header>
<main class="wrap">
${body}
  <footer class="foot"><a href="${backHref}">← back to the hub</a></footer>
</main>
</body>
</html>
`;
}

function render({ concepts, reserved }) {
  const writes = [];
  const cssRel = (outFile) => toPosix(relative(dirname(outFile), join(SITE_DIR, 'assets', 'wiki.css'))) || 'assets/wiki.css';
  const backTo = (outFile) => toPosix(relative(dirname(outFile), join(SITE_DIR, 'index.html'))) || 'index.html';
  const introFor = (topic) => {
    const idx = reserved.find((r) => r.base === 'index.md' && r.repoRel === `wiki/${topic}/index.md`);
    return idx ? idx.raw : '';
  };
  const byTopic = (topic) => concepts.filter((c) => c.topic === topic)
    .sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99)
      || String(a.data.title || a.slug).localeCompare(String(b.data.title || b.slug)));
  const card = (hrefPrefix, c) =>
    `<a class="card${c.data.status === 'stub' ? ' stub' : ''}" href="${hrefPrefix}${c.slug}.html"><div class="card-title">${esc(c.data.title || c.slug)}</div><div class="card-desc">${esc(summary(c.data))}</div></a>`;

  // concept pages
  for (const c of concepts) {
    const outFile = join(SITE_DIR, c.topic, `${c.slug}.html`);
    const lede = summary(c.data) ? `<p class="lede">${esc(summary(c.data))}</p>` : '';
    const body = [
      `<h1>${esc(c.data.title || c.slug)}</h1>`,
      lede,
      metaRow(c.data),
      renderMarkdown(c.content, `wiki/${c.topic}`, dirname(outFile)),
    ].filter(Boolean).join('\n');
    const crumb = `<span class="sep">/</span> ${esc(c.topic)} <span class="sep">/</span> ${esc(c.data.title || c.slug)}`;
    writes.push([outFile, shell({ title: c.data.title || c.slug, crumb, css: cssRel(outFile), body, backHref: backTo(outFile) })]);
  }

  // topic landing pages (auto-generated listing + optional intro prose)
  for (const topic of TOPICS.order) {
    const outFile = join(SITE_DIR, topic, 'index.html');
    const intro = introFor(topic);
    const introHtml = intro ? renderMarkdown(intro, `wiki/${topic}`, dirname(outFile)) : `<h1>${esc(topic)}</h1>`;
    const cards = byTopic(topic).map((c) => `      ${card('', c)}`).join('\n');
    const body = [introHtml, `<div class="cards">\n${cards}\n</div>`].join('\n');
    writes.push([outFile, shell({ title: topic, crumb: `<span class="sep">/</span> ${esc(topic)}`, css: cssRel(outFile), body, backHref: backTo(outFile) })]);
  }

  // portal
  const outIndex = join(SITE_DIR, 'index.html');
  const sections = TOPICS.order.map((topic) => {
    const cards = byTopic(topic).map((c) => `      ${card(`${topic}/`, c)}`).join('\n');
    return `  <section class="group">\n    <h2><a href="${topic}/index.html">${esc(topic)}</a></h2>\n    <div class="cards">\n${cards}\n    </div>\n  </section>`;
  }).join('\n');
  const body = `  <h1>${esc(WIKI_NAME)}</h1>
  <p class="lede">A strict OKF-profile wiki. Markdown in <code>wiki/</code> is the source of truth; this HTML is generated.</p>
${sections}`;
  writes.push([outIndex, shell({ title: WIKI_NAME, crumb: 'local · generated', css: cssRel(outIndex), body, backHref: 'index.html' })]);

  return writes;
}

// --- main -------------------------------------------------------------------

function main() {
  const collected = collect();
  const problems = validate(collected);
  if (problems.length) {
    console.error('OKF check problems:\n  ' + problems.join('\n  '));
    if (CHECK) process.exit(1);
  }
  if (CHECK) {
    console.log(`check ok: ${collected.concepts.length} concepts, ${problems.length} problems`);
    return;
  }
  const writes = render(collected);
  if (existsSync(SITE_DIR)) rmSync(SITE_DIR, { recursive: true, force: true });
  mkdirSync(join(SITE_DIR, 'assets'), { recursive: true });
  cpSync(join(ASSETS_SRC, 'wiki.css'), join(SITE_DIR, 'assets', 'wiki.css'));
  for (const [file, html] of writes) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, html); }
  console.log(`built ${collected.concepts.length} concepts -> site/`);
}

// Run only when invoked directly (so tests can import helpers without side effects).
const invokedDirectly = argv[1] && realpathSync(resolve(argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
```

- [ ] **Step 5: Run `check` and verify it passes on the example**

Run: `npm run check`
Expected: prints `check ok: 2 concepts, 0 problems`; exit 0.

- [ ] **Step 6: Run `build` and verify the site is generated**

Run: `npm run build && ls site site/getting-started`
Expected: `built 2 concepts -> site/`; files `site/index.html`, `site/getting-started/index.html`, `welcome.html`, `writing-concepts.html`, `site/assets/wiki.css` exist.

- [ ] **Step 7: Spot-check the rewritten link**

Run: `grep -o 'href="[^"]*welcome.html"' site/getting-started/writing-concepts.html`
Expected: `href="welcome.html"` — the `/wiki/getting-started/welcome.md` link rewritten to a sibling `.html` (NOT `.md`).

- [ ] **Step 8: Commit**

```bash
git add build.mjs wiki/getting-started
git commit -m "feat: add strict-OKF build/check generator and example bundle"
```

---

## Task 4: Tests — link extraction unit tests + end-to-end conformance

**Files:**
- Create: `test/build-check.test.mjs`

**Interfaces:**
- Consumes: `localMdLinksIn` imported from `build.mjs`; `build.mjs` run as a subprocess against temp-dir fixtures (with `node_modules` symlinked so deps resolve).
- Produces: coverage that link extraction excludes images/code; that `check` passes the example; that build emits valid HTML with a rewritten, resolving link; and that the profile's negatives (broken link, reserved frontmatter, bad concept type, bad raw type, missing type) fail `check`.

- [ ] **Step 1: Write the failing tests**

`test/build-check.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localMdLinksIn } from '../build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- unit: link extraction via marked tokens --------------------------------

test('localMdLinksIn returns local .md links only', () => {
  assert.deepEqual(localMdLinksIn('see [a](./x.md) and [b](/wiki/t/y.md "T")'), ['./x.md', '/wiki/t/y.md']);
});

test('localMdLinksIn excludes images and external URLs', () => {
  assert.deepEqual(localMdLinksIn('![img](z.md) and [e](https://e.com/x.md)'), []);
});

test('localMdLinksIn ignores links inside fenced code blocks', () => {
  assert.deepEqual(localMdLinksIn('text\n\n```\n[x](./missing.md)\n```\n'), []);
});

test('localMdLinksIn handles parentheses in the destination', () => {
  assert.deepEqual(localMdLinksIn('[x](<./a (b).md>)'), ['./a (b).md']);
});

// --- e2e helpers ------------------------------------------------------------

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'okf-'));
  for (const p of ['build.mjs', 'lib', 'wiki', 'raw', 'assets', 'topics.json', 'package.json']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}
const run = (dir, ...args) => spawnSync('node', ['build.mjs', ...args], { cwd: dir, encoding: 'utf8' });
const clean = (dir) => rmSync(dir, { recursive: true, force: true });

// --- e2e: happy path --------------------------------------------------------

test('check passes on the shipped example bundle', () => {
  const dir = sandbox();
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /check ok: 2 concepts, 0 problems/);
});

test('build emits valid HTML with a rewritten, resolving link', () => {
  const dir = sandbox();
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const page = join(dir, 'site/getting-started/writing-concepts.html');
  const html = readFileSync(page, 'utf8');
  const ok = html.includes('<!DOCTYPE html>') && html.includes('<head>') && html.includes('<body>');
  // the /wiki/.../welcome.md link must be rewritten to a relative .html that exists
  const m = html.match(/href="([^"]*welcome\.html)"/);
  const resolves = m && existsSync(join(dirname(page), m[1]));
  clean(dir);
  assert.ok(ok, 'page must have DOCTYPE/head/body');
  assert.ok(m, 'welcome link must be rewritten to .html');
  assert.ok(resolves, 'rewritten link target must exist');
});

// --- e2e: profile negatives -------------------------------------------------

function expectCheckFails(mutate, rx) {
  const dir = sandbox();
  mutate(dir);
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 1, `expected non-zero exit; stdout=${r.stdout}`);
  assert.match(r.stderr, rx);
}

test('check fails on a broken local link', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/getting-started/welcome.md'),
    '---\ntype: concept\ntitle: W\ndescription: d\n---\n\nSee [x](./does-not-exist.md).\n'
  ), /broken link/);
});

test('check fails when a reserved file has frontmatter', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/getting-started/index.md'),
    '---\ntype: topic\n---\n\n# Getting started\n'
  ), /must have no frontmatter/);
});

test('check fails on an invalid concept type', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/getting-started/welcome.md'),
    '---\ntype: banana\ntitle: W\ndescription: d\n---\n\nbody\n'
  ), /expected one of/);
});

test('check fails on a missing concept type', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/getting-started/welcome.md'),
    '---\ntitle: W\ndescription: d\n---\n\nbody\n'
  ), /missing required `type`/);
});

test('check fails on a raw file with the wrong type', () => {
  expectCheckFails((dir) => {
    mkdirSync(join(dir, 'raw/getting-started'), { recursive: true });
    writeFileSync(join(dir, 'raw/getting-started/note.md'), '---\ntype: concept\ntitle: n\n---\n\nsrc\n');
  }, /expected type "source"/);
});
```

- [ ] **Step 2: Run and verify the suite passes**

Run: `npm test`
Expected: PASS — `okf.test.mjs` plus all `build-check.test.mjs` unit and e2e tests green.

- [ ] **Step 3: Commit**

```bash
git add test/build-check.test.mjs
git commit -m "test: add link-extraction and end-to-end OKF conformance tests"
```

---

## Task 5: Docs — AGENTS.md (canonical), CLAUDE.md (shim), README.md

**Files:**
- Create: `AGENTS.md`, `CLAUDE.md`, `README.md`

**Interfaces:**
- Produces: `CLAUDE.md` whose sole content imports `AGENTS.md`; `AGENTS.md` carrying the full OKF profile + no-invent rule; `README.md` human onboarding.

- [ ] **Step 1: Write `AGENTS.md`**

````markdown
# OKF Wiki — schema & conventions (canonical agent doc)

A Markdown-canonical knowledge base conforming to a **strict OKF profile** (Google Open Knowledge
Format v0.1). **Markdown in `wiki/` is the source of truth. `site/` is generated — never edit it by hand.**

## Layout
- `wiki/<topic>/<slug>.md` — atomic concept pages (one concept per file). Slugs are kebab-case.
- `wiki/<topic>/index.md` — OPTIONAL, reserved, **no frontmatter**: intro prose for the topic. The
  card listing is auto-generated from the concept files.
- `raw/<topic>/` — immutable source material. Read, never rewrite.
- `topics.json` — `{ "order": [...] }` controls topic order on the hub.
- `build.mjs` — `npm run build` regenerates `site/`; `npm run check` validates without writing.

## Concept frontmatter (required: `type`)
```
---
type: concept           # required. wiki concepts: concept | pattern | worked-example
title: Human Title      # recommended
description: one-sentence summary    # recommended; canonical summary field
tags: [a, b]            # recommended
timestamp: 2026-06-27T00:00:00Z      # recommended; ISO 8601, last meaningful change
resource: https://...   # optional; URI of the underlying asset
status: stub | learning | researched | solid   # optional custom lifecycle key
---
```

## Reserved files (OKF)
- `index.md` and `log.md` carry **NO frontmatter**. `index.md` = intro prose (listing is generated).
  `log.md` = chronological update history. Both are exempt from the `type` requirement.

## Body conventions the generator understands
- Cross-link **concepts** with **standard Markdown links**: `[Label](/wiki/<topic>/<slug>.md)`
  (absolute, repo-root-relative — preferred) or `[Label](./<slug>.md)` (relative). No `[[wikilinks]]`.
  A link must resolve to an existing concept; to cite `raw/` source material, reference it as inline
  code (`` `raw/<topic>/file.md` ``) or via `resource:` — not as a clickable link.
- External sources go under a `# Citations` heading in the body — NOT in frontmatter.
- `> [!TIP]` / `[!NOTE]` / `[!WARNING]` / `[!CAUTION]` / `[!IMPORTANT]` → callouts.
- ` ```lang title="…" ` → code block with a head bar. Tables, lists, headings → standard Markdown.

## The one inviolable rule: never invent content
Pages capture only what was in the source material (`raw/`) or what the author provided. Ground every
claim in `raw/` or a cited source. Flag third-party/unverified claims inline (e.g. "{{partly third-party}}").
Missing material → leave a `status: stub` with a note, don't fabricate.

## OKF profile (enforced by `npm run check`)
Frontmatter/`type` rules apply to `wiki/**` and `raw/**` (never `README`/`AGENTS`/`CLAUDE`/`docs`/`ingest`).
Link resolution applies to `wiki/` concept bodies only (raw/ is not link-validated).

| Path | required `type` |
|------|------|
| `raw/**/*.md` | `source` |
| `wiki/<topic>/<slug>.md` | `concept` \| `pattern` \| `worked-example` |
| `wiki/**/index.md`, `**/log.md` | reserved — **no frontmatter** |

`check` fails on: missing/wrong `type` on a concept, wrong `type` on a raw doc, frontmatter on a
reserved file, a topic in `topics.json` with no `wiki/<topic>/` directory, or a body `.md` link that
does not resolve to a wiki concept. This profile is *stricter* than base OKF on purpose; every bundle
it accepts is still valid OKF v0.1.

## Operations
- **Build:** `npm run build`. **Lint:** `npm run check`. **Test:** `npm test`.
- **Optional ingest** (if `ingest/` is present): `npm run ingest -- <src> --topic <t>`. See README.
````

- [ ] **Step 2: Write `CLAUDE.md` (shim)**

```markdown
@AGENTS.md
```

- [ ] **Step 3: Write `README.md`**

````markdown
# okf-wiki-template

A clone-and-go template for a **strict [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)-profile**
Markdown wiki: atomic concept pages with YAML frontmatter, standard Markdown cross-links, a
deterministic Node build to static HTML, and a `check` that enforces the profile. Optional Python
ingest turns PDFs/docs into source pages.

## Use this template
1. Click **"Use this template"** on GitHub (or clone this repo).
2. Rename in three places: `name` in `package.json`, the topic list in `topics.json`, and the title
   of this README.
3. `npm install`
4. Write pages under `wiki/<topic>/`, then `npm run check` and `npm run build`.

## What's an OKF profile?
OKF (Google Cloud, v0.1) is a vendor-neutral Markdown standard for giving AI agents curated context.
This template ships a *strict profile*: every bundle it produces is valid OKF, but `npm run check`
adds extra rules (typed concepts, resolved links, reserved-file discipline) to keep wikis tidy. See
`AGENTS.md` for the full schema and conventions.

## Commands
- `npm run build` — regenerate `site/` (do not hand-edit `site/`).
- `npm run check` — validate the OKF profile; non-zero exit on any violation.
- `npm test` — `node --test` (helper unit tests + end-to-end conformance).

## Layout
- `wiki/<topic>/<slug>.md` — concept pages (canonical).
- `wiki/<topic>/index.md` — optional, no-frontmatter intro prose (listing is auto-generated).
- `raw/<topic>/` — immutable source material.
- `site/` — generated HTML (gitignored).

## Optional: document ingestion
This template includes a Python ingest pipeline (`ingest/`, `scripts/ingest.mjs`) for converting
PDFs/docs into `raw/` source pages via `uv`. **If you don't need it, remove it:**

```bash
rm -rf ingest scripts/ingest.mjs
# then delete the "ingest" line from package.json "scripts"
```

To use it: `npm run ingest -- <source> --topic <topic> --title "..."` (requires
[`uv`](https://docs.astral.sh/uv/)). It writes a `type: source` page to `raw/<topic>/` and drafts a
`status: stub` concept in `wiki/<topic>/` for you to distill.
````

- [ ] **Step 4: Verify the shim and that docs don't break `check`**

Run: `cat CLAUDE.md`
Expected: exactly `@AGENTS.md`.

Run: `npm run check`
Expected: still `check ok: 2 concepts, 0 problems` (docs are outside validation scope).

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CLAUDE.md README.md
git commit -m "docs: add canonical AGENTS.md, CLAUDE shim, and README"
```

---

## Task 6: Optional Python ingest pipeline (patched to strict profile)

**Files:**
- Create: `ingest/` (copied), `scripts/ingest.mjs` (copied)
- Modify: `ingest/ingest/draft.py`, `ingest/tests/test_draft.py`, `ingest/ingest/cli.py`, `package.json`

**Interfaces:**
- Consumes: education-wiki's ingest pipeline. The raw writer already emits `type: source` (conformant). The stub drafter must be patched: it currently emits dialect fields (`topic:`, `sources:`).
- Produces: `npm run ingest` wrapper; auto-drafted stubs that conform to the strict profile (`type: concept`, `resource:`, `# Citations`, `timestamp`, no `topic:`/`sources:`). `check` must remain green (ingest is outside validation scope).

- [ ] **Step 1: Copy the ingest pipeline and wrapper verbatim**

```bash
cd ~/personal/okf-wiki-template
cp -R ~/personal/education/education-wiki/ingest ingest
rm -rf ingest/.venv ingest/.pytest_cache
mkdir -p scripts
cp ~/personal/education/education-wiki/scripts/ingest.mjs scripts/ingest.mjs
```

- [ ] **Step 2: Patch `ingest/ingest/draft.py` to the strict profile**

Replace the `build_stub` function (the `extract_headings` function and the two `BANNER`/`NO_OUTLINE` constants stay unchanged) with:
```python
def build_stub(*, title: str, raw_path: str, headings: list[str], timestamp: str) -> str:
    front = (
        "---\n"
        "type: concept\n"
        f"title: {title}\n"
        "status: stub\n"
        f"timestamp: {timestamp}\n"
        f"resource: {raw_path}\n"
        "---\n"
    )
    outline = (BANNER + "\n\n" + "\n\n".join(headings) + "\n") if headings else (NO_OUTLINE + "\n")
    citations = f"\n# Citations\n\n- `{raw_path}`\n"
    return front + "\n" + outline + citations
```

- [ ] **Step 3: Update `ingest/ingest/cli.py` to pass `timestamp` and drop `topic`**

At the top of `cli.py`, add to the imports:
```python
from datetime import datetime, timezone
```
Then replace the stub-drafting call (currently `stub = build_stub(title=title, topic=args.topic, raw_path=rel_raw, headings=extract_headings(markdown))`) with:
```python
    stub = build_stub(
        title=title,
        raw_path=rel_raw,
        headings=extract_headings(markdown),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
```

- [ ] **Step 4: Update `ingest/tests/test_draft.py` for the strict profile**

Replace the two `build_stub` tests (the `extract_headings` tests stay) with:
```python
def test_build_stub_with_headings_is_strict_profile():
    out = build_stub(title="Deck", raw_path="raw/system-design/deck.md",
                     headings=["# Deck", "## Intro"], timestamp="2026-06-27T00:00:00Z")
    assert "type: concept" in out
    assert "status: stub" in out
    assert "resource: raw/system-design/deck.md" in out
    assert "timestamp: 2026-06-27T00:00:00Z" in out
    assert "topic:" not in out          # dialect field dropped
    assert "sources:" not in out        # dialect field dropped
    assert "# Citations" in out
    assert "`raw/system-design/deck.md`" in out
    assert "auto-extracted from source — not yet distilled" in out
    assert "# Deck" in out and "## Intro" in out


def test_build_stub_without_headings_emits_no_outline_banner_and_no_invented_headings():
    out = build_stub(title="Talk", raw_path="raw/system-design/talk.md",
                     headings=[], timestamp="2026-06-27T00:00:00Z")
    assert "no outline was extracted" in out
    # the only heading in the body is the fixed "# Citations" section — nothing fabricated
    body = out.split("---", 2)[-1]
    headings = [ln for ln in body.splitlines() if ln.startswith("#")]
    assert headings == ["# Citations"]
```

- [ ] **Step 5: Add the `ingest` script to `package.json`**

In `package.json`, change the `scripts` block so it reads:
```json
  "scripts": {
    "build": "node build.mjs",
    "check": "node build.mjs --check",
    "test": "node --test",
    "ingest": "node scripts/ingest.mjs"
  },
```

- [ ] **Step 6: Verify `check` still passes (ingest is out of scope)**

Run: `npm run check`
Expected: `check ok: 2 concepts, 0 problems` — `ingest/` is not validated.

- [ ] **Step 7: Verify the ingest wrapper and Python tests**

Run: `npm run ingest` (no args)
Expected: argparse usage error (exit 2) or a clear `error: uv not found ...` message — NOT a stack trace.

If `uv` is installed, run: `cd ingest && uv run --extra dev pytest -q`
Expected: all tests pass (including the updated `test_draft.py`). If `uv` is not installed, skip this and note it.

- [ ] **Step 8: Commit**

```bash
git add ingest scripts/ingest.mjs package.json
git commit -m "feat: add optional ingest pipeline, drafting strict-profile stubs"
```

---

## Task 7: Finalize and publishing prep (gated — no push without go-ahead)

**Files:**
- Verify: whole repo

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a green branch + the exact publish commands, NOT executed without Het's go-ahead.

- [ ] **Step 1: Full verification**

Run: `npm run check && npm run build && npm test`
Expected: check ok; site built; all tests pass. Exit 0 overall.

- [ ] **Step 2: Confirm `.gitignore` covers generated/output dirs**

Verify `.gitignore` contains `site/`, `node_modules/`, `ingest/.venv/`. (Created during scaffolding; add any missing line, then `git add .gitignore && git commit -m "chore: ignore generated and venv dirs"`.)

- [ ] **Step 3: Publish — ONLY after Het's explicit confirmation**

> **GATE:** Do not run any command in this step without Het saying "publish it". Creating a public repo is outward-facing and effectively irreversible. Consider `--private` first and flip to public after a final look.

Run in order (the repo already has `main` with the spec+plan commits and the `feat/okf-template-infra` branch with the implementation):
```bash
export GH_HOST=github.com

# 1. Create the empty remote under the personal namespace and wire the origin.
gh repo create het-sheth/okf-wiki-template --public --description "Strict OKF-profile Markdown wiki template"
git remote add origin https://github.com/het-sheth/okf-wiki-template.git

# 2. Bootstrap: push main (docs only) so it is the default branch and PRs have a base.
git push -u origin main

# 3. Push the implementation branch and open a PR into main (respects branch+PR).
git push -u origin feat/okf-template-infra
gh pr create --base main --head feat/okf-template-infra --fill

# 4. After the PR is merged, mark the repo a GitHub template repository.
gh repo edit het-sheth/okf-wiki-template --template
```
Expected: public repo at `github.com/het-sheth/okf-wiki-template`; after merge + `--template`, the "Use this template" button is enabled.

---

## Self-Review

**Spec coverage:**
- Public clone-based template, no generator → Tasks 1–6 (files), Task 7 (template repo). ✓
- Strict OKF profile (standard links, no-frontmatter `index.md`, `# Citations`, `resource`/`timestamp`) → Task 2 helpers, Task 3 build/check, Task 5 AGENTS schema. ✓
- Bundle scope (frontmatter/type = `wiki/**`+`raw/**`; links = wiki concepts only; raw not link-validated) → Task 3 `validate()`; asserted in Task 4 (raw type test, broken-link test) and Task 5 Step 4. ✓
- Bundle root = repo root; escape → null → broken → Task 2 `resolveLinkTarget` + test, Task 3 `validate()`. ✓
- `index.md` no frontmatter, listing auto-generated → Task 3 `render()`/`introFor`; Task 4 reserved-frontmatter test. ✓
- `log.md` reserved; no `type: log` convention → Task 2 `isReserved`, Task 3 `validate()`. ✓
- Link handling robust to code blocks / parens / images → Task 3 marked-token `localMdLinksIn` + `renderer.link`; Task 4 unit tests. ✓
- "valid HTML" = exits 0 + DOCTYPE/head/body + links resolve → Task 4 "build emits valid HTML…" test. ✓
- AGENTS canonical + CLAUDE shim → Task 5. ✓
- Optional ingest, patched to strict profile, exact removal → Task 6 + README. ✓
- No-invent rule verbatim → Task 5 AGENTS.md; preserved in ingest no-outline test (Task 6 Step 4). ✓
- Name from `package.json` → Task 3 `WIKI_NAME = PKG.name`. ✓
- Publishing gated + correct order → Task 7 Step 3. ✓
- Node ≥20, pinned deps → Task 1. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; every command has expected output. ✓

**Type consistency:** `lib/okf.mjs` exports (`esc`, `summary`, `isReserved`, `typeViolation`, `isLocalMd`, `resolveLinkTarget`, `siteRelFromRepoRel`) are defined in Task 2 and imported with identical names/signatures in Task 3. `localMdLinksIn` is defined+exported in Task 3 and imported in Task 4. `build_stub(title, raw_path, headings, timestamp)` signature is consistent across Task 6 Steps 2–4. ✓

**Out of scope (per spec):** generator script, infra-sync mechanism, migrating existing wikis, hosting `site/`, W3C/WCAG validation. Not planned — correct. ✓
