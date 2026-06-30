import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localMdLinksIn, buildManifest } from '../build.mjs';

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

// --- unit: manifest shape ---------------------------------------------------

test('buildManifest emits the federation shape with outgoing cross-wiki links', () => {
  const m = buildManifest([{
    key: 'agentic-engineering/overview', slug: 'overview', topic: 'agentic-engineering',
    repoRel: 'wiki/agentic-engineering/overview.md',
    data: { type: 'concept', title: 'Overview', description: 'd', tags: ['a'] },
    content: 'See [[course-wiki:ai-hero/day-1]] and [[other]] and [[bad:x]].',
  }]);
  assert.equal(m.wiki, 'okf-wiki-template');
  const p = m.pages[0];
  assert.deepEqual(
    { id: p.id, topic: p.topic, type: p.type, href: p.href, tags: p.tags, links: p.links },
    {
      id: 'agentic-engineering/overview', topic: 'agentic-engineering', type: 'concept',
      href: 'agentic-engineering/overview.html', tags: ['a'],
      links: ['course-wiki:ai-hero/day-1'], // within-wiki + malformed excluded
    }
  );
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
const runEnv = (dir, env, ...args) =>
  spawnSync('node', ['build.mjs', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
const clean = (dir) => rmSync(dir, { recursive: true, force: true });

// Set package.json `okf.federation` in a sandbox (default off).
function enableFederation(dir) {
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.okf = { ...(pkg.okf || {}), federation: true };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

// Write a minimal peer wiki: a peers.json pointing at one peer whose site/manifest.json has `pages`.
// Returns the absolute peers.json path (for OKF_PEERS).
function writePeer(baseDir, peerName, pages) {
  const peerDir = join(baseDir, peerName);
  mkdirSync(join(peerDir, 'site'), { recursive: true });
  writeFileSync(join(peerDir, 'site', 'manifest.json'),
    JSON.stringify({ wiki: peerName, title: peerName, pages }, null, 2));
  const peersPath = join(baseDir, 'peers.json');
  writeFileSync(peersPath, JSON.stringify({ peers: [{ name: peerName, path: peerName }] }, null, 2));
  return peersPath;
}

// Replace a wiki concept body with `body` (keeps valid frontmatter).
function writeConcept(dir, topicSlug, body) {
  writeFileSync(join(dir, 'wiki', `${topicSlug}.md`),
    `---\ntype: concept\ntitle: T\ndescription: d\n---\n\n${body}\n`);
}

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

// --- e2e: within-wiki wikilinks (re-converged from education-wiki) ----------

test('build renders a within-wiki [[topic/slug]] wikilink to a resolving .html', () => {
  const dir = sandbox();
  writeConcept(dir, 'getting-started/welcome', 'See [[getting-started/writing-concepts]].');
  const r = run(dir);
  const page = join(dir, 'site/getting-started/welcome.html');
  const html = readFileSync(page, 'utf8');
  const m = html.match(/href="([^"]*writing-concepts\.html)"/);
  const resolves = m && existsSync(join(dirname(page), m[1]));
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(m, 'wikilink must render to a writing-concepts.html href');
  assert.ok(resolves, 'rendered wikilink target must exist on disk');
  assert.ok(!html.includes('[['), 'no raw [[ token may survive into HTML');
});

test('build renders a bare [[slug]] against the current topic', () => {
  const dir = sandbox();
  writeConcept(dir, 'getting-started/welcome', 'See [[writing-concepts|the rules]].');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/getting-started/welcome.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /href="writing-concepts\.html">the rules<\/a>/);
});

test('check fails on a within-wiki wikilink to a non-existent page', () => {
  expectCheckFails(
    (dir) => writeConcept(dir, 'getting-started/welcome', 'See [[getting-started/nope]].'),
    /\[\[getting-started\/nope\]\] \(no such page\)/
  );
});

// --- e2e: cross-wiki wikilinks ---------------------------------------------

test('check fails on a malformed cross-wiki wikilink even with federation off', () => {
  expectCheckFails(
    (dir) => writeConcept(dir, 'getting-started/welcome', 'See [[peer-wiki:bareslug]].'),
    /malformed wikilink/
  );
});

test('cross-wiki link is masked (no peer/topic/slug) when federation is OFF', () => {
  const dir = sandbox();
  writeConcept(dir, 'getting-started/welcome',
    'See [[education-wiki:agentic-engineering/overview|Agents overview]].');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/getting-started/welcome.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /Agents overview/, 'human label must render');
  assert.ok(!html.includes('education-wiki'), 'peer name must NOT leak');
  assert.ok(!html.includes('agentic-engineering'), 'topic must NOT leak');
  assert.ok(!html.includes('overview.html'), 'no href into the peer when off');
  assert.ok(!html.includes('[['), 'no raw token may survive');
});

test('cross-wiki link with no label masks to a neutral placeholder when OFF', () => {
  const dir = sandbox();
  writeConcept(dir, 'getting-started/welcome', 'See [[education-wiki:agentic-engineering/overview]].');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/getting-started/welcome.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /\(linked page\)/);
  assert.ok(!html.includes('education-wiki') && !html.includes('agentic-engineering'));
});

test('cross-wiki link resolves to a peer href when federation is ON', () => {
  const dir = sandbox();
  enableFederation(dir);
  writeConcept(dir, 'getting-started/welcome',
    'See [[education-wiki:agentic-engineering/overview|Agents overview]].');
  const peersPath = writePeer(dir, 'education-wiki',
    [{ id: 'agentic-engineering/overview', title: 'Overview',
       href: 'agentic-engineering/overview.html' }]);
  const r = runEnv(dir, { OKF_PEERS: peersPath });
  const html = readFileSync(join(dir, 'site/getting-started/welcome.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  // href points into the peer's site/ (relative path climbs out of this wiki)
  assert.match(html, /href="[^"]*education-wiki\/site\/agentic-engineering\/overview\.html">Agents overview<\/a>/);
});

test('check fails on an unresolved cross-wiki link when federation is ON', () => {
  const dir = sandbox();
  enableFederation(dir);
  writeConcept(dir, 'getting-started/welcome', 'See [[education-wiki:agentic-engineering/ghost]].');
  const peersPath = writePeer(dir, 'education-wiki',
    [{ id: 'agentic-engineering/overview', title: 'Overview', href: 'agentic-engineering/overview.html' }]);
  const r = runEnv(dir, { OKF_PEERS: peersPath }, '--check');
  clean(dir);
  assert.equal(r.status, 1, `expected non-zero; stdout=${r.stdout}`);
  assert.match(r.stderr, /no such page in peer "education-wiki"/);
});

test('cross-wiki check is skipped (link masked, build succeeds) when federation is OFF', () => {
  const dir = sandbox();
  // points at a ghost page, but federation off => not resolved, not checked
  writeConcept(dir, 'getting-started/welcome', 'See [[education-wiki:agentic-engineering/ghost|x]].');
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `cross-wiki link must not fail check when off; stderr=${r.stderr}`);
});
