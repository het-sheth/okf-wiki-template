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
