# OKF Wiki Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, clone-based GitHub template repo that produces strict-OKF-profile Markdown wikis with a deterministic Node build/lint and optional Python ingest.

**Architecture:** Markdown under `wiki/` (+ source material in `raw/`) is canonical. `build.mjs` renders `site/` HTML and, with `--check`, validates the OKF profile. Pure logic lives in `lib/okf.mjs` (unit-tested); the generator composes it. Links are standard Markdown (repo-root-relative); `index.md`/`log.md` are OKF reserved no-frontmatter files. `AGENTS.md` is the canonical agent doc; `CLAUDE.md` shims to it.

**Tech Stack:** Node ≥20 (`node --test`), `gray-matter`, `marked`; optional Python ingest via `uv`; git.

**Spec:** `docs/superpowers/specs/2026-06-27-okf-wiki-template-design.md` (read it first).

## Global Constraints

These apply to every task. Exact values copied from the spec.

- **Node ≥ 20.** `package.json` `engines.node` = `">=20"`. Test runner is `node --test` only.
- **Pinned deps:** `gray-matter` `4.0.3`, `marked` `18.0.5`.
- **Bundle root = repo root.** Absolute links start at repo root: `/wiki/<topic>/<slug>.md`.
- **OKF validation scope = `wiki/**` + `raw/**` only.** Never validate `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/**`, or `ingest/**`.
- **Concept type rules:** `raw/**` → `source`; `wiki/<topic>/<slug>.md` → one of `concept | pattern | worked-example`. Reserved `index.md`/`log.md` are exempt and MUST have **no frontmatter**.
- **Canonical fields:** `description` (summary), `timestamp` (ISO 8601), `resource` (optional URI). `status` is a permitted custom key. No `[[wikilinks]]`, no `related:`, no auto-generated `## References` — external sources go in a body `# Citations` section.
- **Unresolved local `.md` link fails `check`** (non-zero exit), even though base OKF tolerates broken links.
- **`build.mjs` reads the wiki name from `package.json` `name`** — never hardcode it.
- **Git:** work on branch `feat/okf-template-infra`; Conventional Commits; **no `Co-Authored-By`/AI attribution**. Do not push without explicit go-ahead.

---

## File Structure

- `package.json` — name (read by build), `engines`, deps, scripts (`build`/`check`/`test`; `ingest` added in Task 6).
- `topics.json` — `{ "order": [...] }` topic ordering.
- `assets/wiki.css` — styles for generated `site/` (copied from education-wiki, verbatim).
- `lib/okf.mjs` — **pure** helpers: `esc`, `summary`, `isReserved`, `typeViolation`, `extractMarkdownLinks`, `isLocalMd`, `resolveLinkTarget`, `siteRelFromRepoRel`. No I/O. (Task 2)
- `build.mjs` — generator + `--check` validator. Composes `lib/okf.mjs`. (Task 3)
- `wiki/getting-started/index.md` — reserved, no frontmatter, intro prose. (Task 3)
- `wiki/getting-started/welcome.md`, `writing-concepts.md` — example concepts, cross-linked, with `# Citations`. (Task 3)
- `raw/.gitkeep` — keeps empty source dir. (Task 3)
- `test/okf.test.mjs` — unit tests for `lib/okf.mjs`. (Task 2)
- `test/build-check.test.mjs` — end-to-end: check passes, build emits expected HTML, broken-link/frontmatter violations are caught. (Task 4)
- `AGENTS.md`, `CLAUDE.md`, `README.md` — docs. (Task 5)
- `ingest/`, `scripts/ingest.mjs` — optional Python pipeline. (Task 6)

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

Run: `node -e "import('gray-matter').then(m=>import('marked')).then(()=>console.log('deps ok'))"`
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
- Produces (all pure, no I/O):
  - `esc(s: string) => string` — HTML-escape `& < >`.
  - `summary(data: object) => string` — returns `data.description ?? ''`.
  - `isReserved(base: string) => boolean` — true for `index.md`/`log.md`.
  - `typeViolation({ area: 'raw'|'wiki', type?: string }) => string|null` — null if valid, else message. `raw`→`source`; `wiki`→`concept|pattern|worked-example`. Reserved files are handled by the caller (never passed here).
  - `extractMarkdownLinks(md: string) => string[]` — link targets (first token only, `<>` stripped), excluding images.
  - `isLocalMd(target: string) => boolean` — true for non-URL, non-anchor `.md` (optionally `#frag`) targets.
  - `resolveLinkTarget(fromDir: string, target: string) => string` — repo-root-relative posix path. `/`-prefixed → from repo root; otherwise resolved against `fromDir`. Drops any `#frag`.
  - `siteRelFromRepoRel(repoRel: string) => string` — `wiki/<t>/<s>.md` → `<t>/<s>.html` (strips leading `wiki/`, swaps extension).

- [ ] **Step 1: Write the failing tests**

`test/okf.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, summary, isReserved, typeViolation,
  extractMarkdownLinks, isLocalMd, resolveLinkTarget, siteRelFromRepoRel,
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

test('extractMarkdownLinks pulls link targets, ignores images', () => {
  const md = 'see [a](./x.md) and [b](/wiki/t/y.md "T") not ![img](z.png)';
  assert.deepEqual(extractMarkdownLinks(md), ['./x.md', '/wiki/t/y.md', 'z.png']);
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

test('siteRelFromRepoRel maps wiki md path to site html path', () => {
  assert.equal(siteRelFromRepoRel('wiki/getting-started/welcome.md'), 'getting-started/welcome.html');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/okf.mjs'` (or undefined exports).

- [ ] **Step 3: Implement `lib/okf.mjs`**

```js
// Pure OKF-profile helpers shared by build.mjs and tests. No I/O.

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

// [text](target) / [text](target "title") -> ['target', ...]. Images (![..](..)) are skipped.
export function extractMarkdownLinks(md) {
  const out = [];
  const re = /(^|[^!])\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  let m;
  while ((m = re.exec(md)) !== null) out.push(m[2].trim());
  return out;
}

export const isLocalMd = (target) =>
  !/^[a-z][a-z0-9+.-]*:\/\//i.test(target) &&
  !target.startsWith('#') &&
  /\.md(#.*)?$/.test(target);

// Resolve a link target to a repo-root-relative posix path (no leading slash). Drops #frag.
// Bundle root = repo root: a leading '/' is relative to repo root.
export function resolveLinkTarget(fromDir, target) {
  const clean = target.split('#')[0];
  const startParts = clean.startsWith('/') ? [] : (fromDir ? fromDir.split('/') : []);
  const parts = startParts.concat(clean.replace(/^\//, '').split('/'));
  const stack = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
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
- Produces: `node build.mjs` writes `site/`; `node build.mjs --check` validates and exits non-zero on any problem. The example bundle MUST pass `check` and `build` cleanly.

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

External sources belong under a `# Citations` heading, not in frontmatter.

# Citations

- This template's design spec — `docs/superpowers/specs/2026-06-27-okf-wiki-template-design.md`
```

- [ ] **Step 4: Write `build.mjs`**

```js
#!/usr/bin/env node
// okf-wiki-template generator: wiki/**/*.md -> site/ (deterministic, no LLM).
// Strict OKF profile. Markdown in wiki/ is canonical; site/ is generated — never hand-edit it.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import {
  esc, summary, isReserved, typeViolation,
  extractMarkdownLinks, isLocalMd, resolveLinkTarget, siteRelFromRepoRel,
} from './lib/okf.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WIKI_DIR = join(ROOT, 'wiki');
const RAW_DIR = join(ROOT, 'raw');
const SITE_DIR = join(ROOT, 'site');
const ASSETS_SRC = join(ROOT, 'assets');
const CHECK = process.argv.includes('--check');
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

// --- markdown rendering -----------------------------------------------------

function preprocessLinks(md, fromDir, outDir) {
  return md.replace(/(\]\()(\s*<?[^)\s>]+>?)(\s+"[^"]*")?(\s*\))/g, (whole, open, rawTarget, title, close) => {
    const t = rawTarget.trim().replace(/^</, '').replace(/>$/, '');
    if (!isLocalMd(t)) return whole;
    const [path, hash] = t.split('#');
    const repoTarget = resolveLinkTarget(fromDir, path);
    const siteAbs = join(SITE_DIR, siteRelFromRepoRel(repoTarget));
    const href = (toPosix(relative(outDir, siteAbs)) || basename(siteAbs)) + (hash ? `#${hash}` : '');
    return `${open}${href}${title || ''}${close}`;
  });
}

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

const renderer = new marked.Renderer();
renderer.code = ({ text, lang: infostring }) => {
  const info = (infostring || '').trim();
  const title = (info.match(/title="([^"]*)"/) || [])[1];
  const lang = info.split(/\s+/)[0] || '';
  const head = title || lang;
  return `<div class="code-block">${head ? `<div class="code-head">${esc(head)}</div>` : ''}<pre><code>${esc(text)}</code></pre></div>`;
};
marked.use({ renderer });

const renderMarkdown = (md, fromDir, outDir) =>
  marked.parse(preprocessAlerts(preprocessLinks(md, fromDir, outDir)));

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
  const allMd = new Set([...walk(WIKI_DIR), ...walk(RAW_DIR)].map(rootRel));

  for (const r of [...reserved, ...rawDocs.filter((d) => d.reserved)]) {
    if (hasFrontmatter(r.raw)) problems.push(`${r.repoRel} -> reserved file (${r.base}) must have no frontmatter`);
  }
  for (const c of concepts) {
    const v = typeViolation({ area: 'wiki', type: c.data.type });
    if (v) problems.push(`${c.key} -> ${v}`);
  }
  for (const d of rawDocs) {
    if (d.reserved) continue;
    const v = typeViolation({ area: 'raw', type: d.data.type });
    if (v) problems.push(`${d.repoRel} -> ${v}`);
  }
  for (const topic of TOPICS.order) {
    if (!existsSync(join(WIKI_DIR, topic))) problems.push(`topic "${topic}" -> no wiki/${topic}/ directory`);
  }
  for (const c of concepts) {
    const fromDir = dirname(c.repoRel);
    for (const target of extractMarkdownLinks(c.content)) {
      if (!isLocalMd(target)) continue;
      const repoTarget = resolveLinkTarget(fromDir, target);
      if (!allMd.has(repoTarget)) problems.push(`${c.key} -> broken link ${target} (no such file)`);
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

main();
```

- [ ] **Step 5: Run `check` and verify it passes on the example**

Run: `npm run check`
Expected: prints `check ok: 2 concepts, 0 problems`; exit 0.

- [ ] **Step 6: Run `build` and verify the site is generated**

Run: `npm run build && ls site site/getting-started`
Expected: `built 2 concepts -> site/`; `site/index.html`, `site/getting-started/index.html`, `welcome.html`, `writing-concepts.html`, and `site/assets/wiki.css` exist.

- [ ] **Step 7: Spot-check the rewritten link**

Run: `grep -o 'href="[^"]*welcome.html"' site/getting-started/writing-concepts.html`
Expected: a relative href like `href="welcome.html"` (the `/wiki/getting-started/welcome.md` link rewritten to a sibling `.html`).

- [ ] **Step 8: Commit**

```bash
git add build.mjs wiki/getting-started
git commit -m "feat: add strict-OKF build/check generator and example bundle"
```

---

## Task 4: End-to-end conformance test

**Files:**
- Create: `test/build-check.test.mjs`

**Interfaces:**
- Consumes: `build.mjs` via `node --test` subprocess + temp-dir fixtures.
- Produces: regression coverage that `check` passes the example, catches a broken link, and catches frontmatter on a reserved file.

- [ ] **Step 1: Write the failing tests**

`test/build-check.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'okf-'));
  for (const p of ['build.mjs', 'lib', 'wiki', 'raw', 'assets', 'topics.json', 'package.json']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  return dir;
}
const run = (dir, ...args) => spawnSync('node', ['build.mjs', ...args], { cwd: dir, encoding: 'utf8' });

test('check passes on the shipped example bundle', () => {
  const dir = sandbox();
  const r = run(dir, '--check');
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /check ok: 2 concepts, 0 problems/);
});

test('build emits the expected site files', () => {
  const dir = sandbox();
  const r = run(dir);
  const ok = existsSync(join(dir, 'site/index.html'))
    && existsSync(join(dir, 'site/getting-started/welcome.html'));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(ok, 'expected site/index.html and site/getting-started/welcome.html');
});

test('check fails on a broken local link', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/getting-started/welcome.md'),
    '---\ntype: concept\ntitle: W\ndescription: d\n---\n\nSee [x](./does-not-exist.md).\n');
  const r = run(dir, '--check');
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /broken link/);
});

test('check fails when a reserved file has frontmatter', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/getting-started/index.md'),
    '---\ntype: topic\n---\n\n# Getting started\n');
  const r = run(dir, '--check');
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /must have no frontmatter/);
});
```

- [ ] **Step 2: Run and verify the suite passes**

Run: `npm test`
Expected: PASS — `okf.test.mjs` and all four `build-check.test.mjs` tests green.

- [ ] **Step 3: Commit**

```bash
git add test/build-check.test.mjs
git commit -m "test: add end-to-end OKF conformance checks"
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
- `wiki/<topic>/<slug>.md` — atomic concept pages (one concept per file).
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
- Cross-link concepts with **standard Markdown links**: `[Label](/wiki/<topic>/<slug>.md)`
  (absolute, repo-root-relative — preferred) or `[Label](./<slug>.md)` (relative). No `[[wikilinks]]`.
- External sources go under a `# Citations` heading in the body — NOT in frontmatter.
- `> [!TIP]` / `[!NOTE]` / `[!WARNING]` / `[!CAUTION]` / `[!IMPORTANT]` → callouts.
- ` ```lang title="…" ` → code block with a head bar. Tables, lists, headings → standard Markdown.

## The one inviolable rule: never invent content
Pages capture only what was in the source material (`raw/`) or what the author provided. Ground every
claim in `raw/` or a cited source. Flag third-party/unverified claims inline (e.g. "{{partly third-party}}").
Missing material → leave a `status: stub` with a note, don't fabricate.

## OKF profile (enforced by `npm run check`)
Validation applies to `wiki/**` and `raw/**` only (never `README`/`AGENTS`/`CLAUDE`/`docs`/`ingest`).

| Path | required `type` |
|------|------|
| `raw/**/*.md` | `source` |
| `wiki/<topic>/<slug>.md` | `concept` \| `pattern` \| `worked-example` |
| `wiki/**/index.md`, `**/log.md` | reserved — **no frontmatter** |

`check` fails on: missing/wrong `type` on a concept, frontmatter on a reserved file, a topic in
`topics.json` with no `wiki/<topic>/` directory, or an unresolved local `.md` link. This profile is
*stricter* than base OKF on purpose; every bundle it accepts is still valid OKF v0.1.

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
[`uv`](https://docs.astral.sh/uv/)).
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

## Task 6: Optional Python ingest pipeline

**Files:**
- Create: `ingest/` (copied), `scripts/ingest.mjs` (copied)
- Modify: `package.json` (add `ingest` script)

**Interfaces:**
- Consumes: education-wiki's existing ingest pipeline, verbatim.
- Produces: `npm run ingest` wrapper; `check` must remain green (ingest is outside validation scope).

- [ ] **Step 1: Copy the ingest pipeline and wrapper verbatim**

```bash
cd ~/personal/okf-wiki-template
cp -R ~/personal/education/education-wiki/ingest ingest
mkdir -p scripts
cp ~/personal/education/education-wiki/scripts/ingest.mjs scripts/ingest.mjs
```

- [ ] **Step 2: Add the `ingest` script to `package.json`**

In `package.json`, add to `scripts` (after `"test"`):
```json
    "test": "node --test",
    "ingest": "node scripts/ingest.mjs"
```

- [ ] **Step 3: Verify `check` still passes (ingest is out of scope)**

Run: `npm run check`
Expected: `check ok: 2 concepts, 0 problems` — `ingest/` is not validated.

- [ ] **Step 4: Verify the ingest wrapper preflights `uv` cleanly**

Run: `npm run ingest -- --help` (or with no args)
Expected: either ingest help output, or a clear `error: uv not found ...` message if `uv` is absent — NOT a crash/stack trace. (If `uv` is installed, optionally run `cd ingest && uv run --extra dev pytest` → green.)

- [ ] **Step 5: Commit**

```bash
git add ingest scripts/ingest.mjs package.json
git commit -m "feat: add optional uv-based document ingest pipeline"
```

---

## Task 7: Finalize and publishing prep (gated — no push without go-ahead)

**Files:**
- Verify: whole repo

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a green branch ready to merge + the exact publish commands, NOT executed.

- [ ] **Step 1: Full verification**

Run: `npm run check && npm run build && npm test`
Expected: check ok; site built; all tests pass. Exit 0 overall.

- [ ] **Step 2: Confirm `.gitignore` covers generated/output dirs**

Verify `.gitignore` contains `site/`, `node_modules/`, `ingest/.venv/`. (Created during scaffolding; add any missing line and commit.)

- [ ] **Step 3: Open a PR for the infra branch**

```bash
git push -u origin feat/okf-template-infra    # GH_HOST=github.com, remote = het-sheth/okf-wiki-template
gh pr create --fill --base main
```
> Requires the remote to already exist. If it does not, STOP — repo creation is Step 4 and needs Het's go-ahead.

- [ ] **Step 4: Publish — ONLY after Het's explicit confirmation**

> **GATE:** Do not run this without Het saying "publish it". Creating a public repo is outward-facing and irreversible-ish.

```bash
export GH_HOST=github.com
gh repo create het-sheth/okf-wiki-template --public --source . --remote origin --push
gh repo edit het-sheth/okf-wiki-template --template     # mark as a GitHub template repository
```
Expected: public repo at `github.com/het-sheth/okf-wiki-template` with the "Use this template" button enabled.

---

## Self-Review

**Spec coverage:**
- Public clone-based template, no generator → Tasks 1–6 (files), Task 7 (publish as template repo). ✓
- Strict OKF profile (standard links, no-frontmatter `index.md`, `# Citations`, `resource`/`timestamp`) → Task 2 (`isLocalMd`/`resolveLinkTarget`/`typeViolation`), Task 3 (build/check), Task 5 (AGENTS schema). ✓
- Bundle scope (validate `wiki/**`+`raw/**` only) → Task 3 `validate()`; verified in Task 5 Step 4 and Task 6 Step 3. ✓
- Bundle root = repo root → Task 2 `resolveLinkTarget`, tested in Task 2 + Task 4. ✓
- `index.md` no frontmatter, listing auto-generated → Task 3 `render()` + Task 4 reserved-frontmatter test. ✓
- `log.md` reserved, no `type: log` convention → Task 2 `isReserved`, Task 3 `validate()`. ✓
- AGENTS canonical + CLAUDE shim → Task 5. ✓
- Optional ingest with exact removal → Task 6 + README (Task 5 Step 3). ✓
- No-invent rule verbatim → Task 5 `AGENTS.md`. ✓
- Name from `package.json` (no hardcoded `education-wiki`) → Task 3 `WIKI_NAME = PKG.name`. ✓
- Publishing gated → Task 7 Step 4 gate. ✓
- Node ≥20, pinned deps → Task 1 `package.json`. ✓
- "valid HTML" = build exits 0 + files exist + links resolve → Tasks 3/4. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output. ✓

**Type consistency:** Helper names match across tasks — `extractMarkdownLinks`, `isLocalMd`, `resolveLinkTarget`, `siteRelFromRepoRel`, `typeViolation({area,type})`, `summary`, `isReserved`, `esc` are defined in Task 2 and consumed with identical signatures in Tasks 3–4. ✓

**Out of scope (per spec):** generator script, infra-sync mechanism, migrating existing wikis, hosting `site/`, W3C/WCAG validation. Not planned — correct. ✓
