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

const FIXTURES = join(ROOT, 'test/fixtures');

function sandbox(fixture = 'minimal') {
  const dir = mkdtempSync(join(tmpdir(), 'okf-'));
  cpSync(join(FIXTURES, fixture), dir, { recursive: true });
  for (const p of ['build.mjs', 'lib', 'assets']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}
const run = (dir, ...args) => spawnSync('node', ['build.mjs', ...args], { cwd: dir, encoding: 'utf8' });
const runEnv = (dir, env, ...args) =>
  spawnSync('node', ['build.mjs', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
const clean = (dir) => rmSync(dir, { recursive: true, force: true });

// Merge keys into the sandbox package.json `okf` block.
function setOkf(dir, okf) {
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.okf = { ...(pkg.okf || {}), ...okf };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

function enableFederation(dir) { setOkf(dir, { federation: true }); }

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
  const page = join(dir, 'site/demo/alpha.html');
  const html = readFileSync(page, 'utf8');
  const ok = html.includes('<!DOCTYPE html>') && html.includes('<head>') && html.includes('<body>');
  // the ./beta.md link must be rewritten to a relative .html that exists
  const m = html.match(/href="([^"]*beta\.html)"/);
  const resolves = m && existsSync(join(dirname(page), m[1]));
  clean(dir);
  assert.ok(ok, 'page must have DOCTYPE/head/body');
  assert.ok(m, 'beta link must be rewritten to .html');
  assert.ok(resolves, 'rewritten link target must exist');
});

test('check exempts _templates/ and journal/ dirs (frontmatter + dangling wikilinks allowed)', () => {
  const dir = sandbox();
  mkdirSync(join(dir, 'wiki/_templates'), { recursive: true });
  // a template legitimately carries example frontmatter and a placeholder wikilink
  writeFileSync(join(dir, 'wiki/_templates/concept.md'),
    '---\ntype: concept\ntitle: "{{title}}"\n---\n\nSee [[does-not-exist-yet]].\n');
  mkdirSync(join(dir, 'wiki/journal'), { recursive: true });
  // a journal note is frontmatter-free and may link to not-yet-written pages
  writeFileSync(join(dir, 'wiki/journal/2026-01-01.md'), '# 2026-01-01\n\n- [[also-dangling]]\n');
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `expected pass; stdout=${r.stdout} stderr=${r.stderr}`);
  assert.match(r.stdout, /check ok/);
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
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: W\ndescription: d\n---\n\nSee [x](./does-not-exist.md).\n'
  ), /broken link/);
});

test('check fails when a reserved file has frontmatter', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/index.md'),
    '---\ntype: topic\n---\n\n# Getting started\n'
  ), /must have no frontmatter/);
});

test('check fails on an invalid concept type', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: banana\ntitle: W\ndescription: d\n---\n\nbody\n'
  ), /expected one of/);
});

test('check fails on a missing concept type', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntitle: W\ndescription: d\n---\n\nbody\n'
  ), /missing required `type`/);
});

test('check fails on a raw file with the wrong type', () => {
  expectCheckFails((dir) => {
    mkdirSync(join(dir, 'raw/demo'), { recursive: true });
    writeFileSync(join(dir, 'raw/demo/note.md'), '---\ntype: concept\ntitle: n\n---\n\nsrc\n');
  }, /expected type "source"/);
});

// --- e2e: within-wiki wikilinks (re-converged from education-wiki) ----------

test('build renders a within-wiki [[topic/slug]] wikilink to a resolving .html', () => {
  const dir = sandbox();
  writeConcept(dir, 'demo/alpha', 'See [[demo/beta]].');
  const r = run(dir);
  const page = join(dir, 'site/demo/alpha.html');
  const html = readFileSync(page, 'utf8');
  const m = html.match(/href="([^"]*beta\.html)"/);
  const resolves = m && existsSync(join(dirname(page), m[1]));
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(m, 'wikilink must render to a beta.html href');
  assert.ok(resolves, 'rendered wikilink target must exist on disk');
  assert.ok(!html.includes('[['), 'no raw [[ token may survive into HTML');
});

test('build renders a bare [[slug]] against the current topic', () => {
  const dir = sandbox();
  writeConcept(dir, 'demo/alpha', 'See [[beta|the rules]].');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/demo/alpha.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /href="beta\.html">the rules<\/a>/);
});

test('check fails on a within-wiki wikilink to a non-existent page', () => {
  expectCheckFails(
    (dir) => writeConcept(dir, 'demo/alpha', 'See [[demo/nope]].'),
    /\[\[demo\/nope\]\] \(no such page\)/
  );
});

// --- e2e: cross-wiki wikilinks ---------------------------------------------

test('check fails on a malformed cross-wiki wikilink even with federation off', () => {
  expectCheckFails(
    (dir) => writeConcept(dir, 'demo/alpha', 'See [[peer-wiki:bareslug]].'),
    /malformed wikilink/
  );
});

test('cross-wiki link is masked (no peer/topic/slug) when federation is OFF', () => {
  const dir = sandbox();
  writeConcept(dir, 'demo/alpha',
    'See [[education-wiki:agentic-engineering/overview|Agents overview]].');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/demo/alpha.html'), 'utf8');
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
  writeConcept(dir, 'demo/alpha', 'See [[education-wiki:agentic-engineering/overview]].');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/demo/alpha.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /\(linked page\)/);
  assert.ok(!html.includes('education-wiki') && !html.includes('agentic-engineering'));
});

test('cross-wiki link resolves to a peer href when federation is ON', () => {
  const dir = sandbox();
  enableFederation(dir);
  writeConcept(dir, 'demo/alpha',
    'See [[education-wiki:agentic-engineering/overview|Agents overview]].');
  const peersPath = writePeer(dir, 'education-wiki',
    [{ id: 'agentic-engineering/overview', title: 'Overview',
       href: 'agentic-engineering/overview.html' }]);
  const r = runEnv(dir, { OKF_PEERS: peersPath });
  const html = readFileSync(join(dir, 'site/demo/alpha.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  // href points into the peer's site/ (relative path climbs out of this wiki)
  assert.match(html, /href="[^"]*education-wiki\/site\/agentic-engineering\/overview\.html">Agents overview<\/a>/);
});

test('check fails on an unresolved cross-wiki link when federation is ON', () => {
  const dir = sandbox();
  enableFederation(dir);
  writeConcept(dir, 'demo/alpha', 'See [[education-wiki:agentic-engineering/ghost]].');
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
  writeConcept(dir, 'demo/alpha', 'See [[education-wiki:agentic-engineering/ghost|x]].');
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `cross-wiki link must not fail check when off; stderr=${r.stderr}`);
});

// --- e2e: config-driven vocabularies ----------------------------------------

test('check accepts a custom conceptTypes vocabulary', () => {
  const dir = sandbox();
  setOkf(dir, { conceptTypes: ['lesson'] });
  for (const slug of ['alpha', 'beta']) {
    writeFileSync(join(dir, `wiki/demo/${slug}.md`),
      `---\ntype: lesson\ntitle: ${slug}\ndescription: d\n---\n\nbody\n`);
  }
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `expected pass; stderr=${r.stderr}`);
});

test('an unconfigured clone still mutes a stub card', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nstatus: stub\n---\n\nbody\n');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/index.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /class="card needs-work"/);
});

test('a custom vocabulary mutes its own needs-work status', () => {
  const dir = sandbox();
  setOkf(dir, { statusValues: ['wip', 'done'], needsWorkStatus: 'wip' });
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nstatus: wip\n---\n\nbody\n');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/index.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /class="card needs-work"/);
  assert.ok(!html.includes('class="card wip"'), 'the status word must not become a class');
});

test('check fails on a prohibited timestamp key', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\ntimestamp: 2026-01-01T00:00:00Z\n---\n\nbody\n'
  ), /`timestamp` is prohibited by this profile/);
});

test('check fails on a prohibited Citations heading', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nbody\n\n# Citations\n\n- x\n'
  ), /use `sources:`/);
});

test('check fails on an unresolved footnote marker', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nclaim[^ghost]\n'
  ), /footnote \[\^ghost\]/);
});

test('check fails on a dangling superseded_by regardless of archival config', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nsuperseded_by: demo/ghost\n---\n\nbody\n'
  ), /no such page/);
});

test('check fails on a two-page superseded_by cycle', () => {
  expectCheckFails((dir) => {
    writeFileSync(join(dir, 'wiki/demo/alpha.md'),
      '---\ntype: concept\ntitle: A\ndescription: d\nsuperseded_by: demo/beta\n---\n\nbody\n');
    writeFileSync(join(dir, 'wiki/demo/beta.md'),
      '---\ntype: concept\ntitle: B\ndescription: d\nsuperseded_by: demo/alpha\n---\n\nbody\n');
  }, /cycle/);
});

test('a past stale_after is not a check failure', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nstale_after: 2020-01-01\n---\n\nbody\n');
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `staleness is advisory; stderr=${r.stderr}`);
});

// A YAML-shaped-but-out-of-range date (e.g. month 13) is not a useful malformed case here:
// gray-matter's default YAML engine resolves it into a real (silently rolled-over) Date before
// this code ever runs, the same way it resolves a valid date. A value that never matches the
// YAML timestamp grammar at all is the only kind of malformed input a frontmatter round trip
// can still exercise.
test('check fails on a malformed stale_after', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nstale_after: 2027/01/01\n---\n\nbody\n'
  ), /not an ISO date/);
});

test('check fails on a status outside the configured vocabulary', () => {
  expectCheckFails((dir) => {
    setOkf(dir, { statusValues: ['draft', 'stable', 'deprecated'] });
    writeFileSync(join(dir, 'wiki/demo/alpha.md'),
      '---\ntype: concept\ntitle: A\ndescription: d\nstatus: solid\n---\n\nbody\n');
  }, /`status: solid`.*draft, stable, deprecated/s);
});

test('a page with no status does not fail the status check', () => {
  const dir = sandbox();
  setOkf(dir, { statusValues: ['draft', 'stable', 'deprecated'] });
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nbody\n');
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
});

test('the legacy fixture fails check, and migrate makes it pass', () => {
  const dir = sandbox('legacy-v01');
  cpSync(join(ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true });
  const before = run(dir, '--check');
  assert.equal(before.status, 1, 'the v0.1 fixture must be rejected');
  const mig = spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(mig.status, 0, mig.stderr);
  const after = run(dir, '--check');
  clean(dir);
  assert.equal(after.status, 0, `migrated fixture must pass; stderr=${after.stderr}`);
});

// --- e2e: okf_version on the bundle root ------------------------------------

test('the bundle-root index.md may declare only okf_version', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/index.md'), '---\nokf_version: "0.2"\n---\n\n# Demo wiki\n');
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `expected pass; stderr=${r.stderr}`);
});

test('the bundle-root index.md rejects any other key', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/index.md'), '---\nokf_version: "0.2"\ntitle: Nope\n---\n\n# Demo\n'
  ), /may declare only `okf_version`/);
});

test('a non-root index.md still rejects all frontmatter', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/index.md'), '---\nokf_version: "0.2"\n---\n\n# Demo\n'
  ), /must have no frontmatter/);
});

test('build exits non-zero when validation fails, not just check', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nSee [x](./does-not-exist.md).\n');
  const r = run(dir);
  clean(dir);
  assert.equal(r.status, 1, 'a bundle that fails validation must fail the build');
  assert.match(r.stderr, /broken link/);
});

test('build does not write a partial site/ when validation fails', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nSee [x](./does-not-exist.md).\n');
  run(dir);
  const wrote = existsSync(join(dir, 'site'));
  clean(dir);
  assert.equal(wrote, false, 'a failed build must not leave a partial site/');
});

// The test above passes vacuously on a fresh sandbox: site/ never existed. The stale case is the
// one that bites, because the leftover site/ is a COMPLETE render of the previous, valid tree and
// reads as current output.
test('a failed build removes a site/ left by an earlier successful build', () => {
  const dir = sandbox();
  const first = run(dir);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(existsSync(join(dir, 'site/demo/alpha.html')), 'the first build must publish');
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nSee [x](./does-not-exist.md).\n');
  const second = run(dir);
  const stale = existsSync(join(dir, 'site'));
  clean(dir);
  assert.equal(second.status, 1, 'the second build must fail');
  assert.equal(stale, false, 'a stale site/ must not survive a failed build');
});
