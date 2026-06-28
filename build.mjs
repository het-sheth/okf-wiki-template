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
  esc, escAttr, summary, isReserved, typeViolation,
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
  const t = title ? ` title="${escAttr(title)}"` : '';
  return `<a href="${escAttr(rewriteHref(href))}"${t}>${text}</a>`;
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
