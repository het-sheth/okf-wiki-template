import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STATUS_MAP, migrateFrontmatter, migrateBody, parseStatusMap,
} from '../lib/migrate.mjs';

test('the default status map covers the legacy vocabulary', () => {
  assert.deepEqual(DEFAULT_STATUS_MAP,
    { stub: 'draft', learning: 'draft', researched: 'stable', solid: 'stable' });
});

test('timestamp moves to legacy_timestamp by default, claiming nothing', () => {
  const { data } = migrateFrontmatter({ type: 'concept', timestamp: '2026-01-01T00:00:00Z' }, {});
  assert.equal(data.timestamp, undefined);
  assert.equal(data.legacy_timestamp, '2026-01-01T00:00:00Z');
  assert.equal(data.generated, undefined);
});

test('--generated-by promotes timestamp to real provenance', () => {
  const { data } = migrateFrontmatter(
    { type: 'concept', timestamp: '2026-01-01T00:00:00Z' }, { generatedBy: 'human:het' });
  assert.deepEqual(data.generated, { by: 'human:het', at: '2026-01-01T00:00:00Z' });
  assert.equal(data.legacy_timestamp, undefined);
});

test('status values map through the table', () => {
  assert.equal(migrateFrontmatter({ status: 'solid' }, {}).data.status, 'stable');
  assert.equal(migrateFrontmatter({ status: 'stub' }, {}).data.status, 'draft');
});

test('an unmapped status is left alone and reported', () => {
  const { data, notes } = migrateFrontmatter({ status: 'mystery' }, {});
  assert.equal(data.status, 'mystery');
  assert.match(notes.join('\n'), /unmapped status `mystery`/);
});

test('a Citations list becomes sources with resolving footnote markers', () => {
  const { content, sources } = migrateBody(
    'A claim.\n\n# Citations\n\n- https://example.com/a\n- `raw/t/f.md`\n', new Set());
  assert.ok(!content.includes('# Citations'));
  assert.equal(sources.length, 2);
  assert.equal(sources[0].resource, 'https://example.com/a');
  assert.equal(sources[1].resource, 'raw/t/f.md');
  assert.ok(sources.every((s) => s.id && s.title));
  for (const s of sources) {
    assert.ok(content.includes(`[^${s.id}]`), `an inline marker for ${s.id}`);
    assert.ok(content.includes(`[^${s.id}]: `), `a definition for ${s.id}`);
  }
});

test('generated ids never collide with ids the page already declares', () => {
  const { sources } = migrateBody(
    'A.\n\n# Citations\n\n- https://example.com/a\n', new Set(['example-com-a']));
  assert.notEqual(sources[0].id, 'example-com-a');
});

test('a body with no Citations section is untouched', () => {
  const { content, sources } = migrateBody('Just prose.\n', new Set());
  assert.equal(content, 'Just prose.\n');
  assert.deepEqual(sources, []);
});

test('migration is idempotent', () => {
  const once = migrateFrontmatter({ timestamp: '2026-01-01T00:00:00Z', status: 'solid' }, {});
  const twice = migrateFrontmatter(once.data, {});
  assert.deepEqual(twice.data, once.data);
  const b1 = migrateBody('A.\n\n# Citations\n\n- https://e.com/a\n', new Set());
  const b2 = migrateBody(b1.content, new Set(b1.sources.map((s) => s.id)));
  assert.equal(b2.content, b1.content);
  assert.deepEqual(b2.sources, []);
});

test('a "Title, `path`" citation splits the title from the backticked resource', () => {
  const { sources } = migrateBody('A.\n\n# Citations\n\n- Design spec, `docs/spec.md`\n', new Set());
  assert.equal(sources[0].resource, 'docs/spec.md');
  assert.equal(sources[0].title, 'Design spec');
});

test('a "Title, url" citation splits the title from the URL resource', () => {
  const { sources } = migrateBody(
    'A.\n\n# Citations\n\n- OKF spec, https://example.com/spec\n', new Set());
  assert.equal(sources[0].resource, 'https://example.com/spec');
  assert.equal(sources[0].title, 'OKF spec');
});

test('a bare URL citation keeps today\'s behavior: resource and title are equal', () => {
  const { sources } = migrateBody('A.\n\n# Citations\n\n- https://example.com/a\n', new Set());
  assert.equal(sources[0].resource, 'https://example.com/a');
  assert.equal(sources[0].title, 'https://example.com/a');
});

test('a citation with neither a URL nor a backticked path falls back to the whole item', () => {
  const { sources } = migrateBody('A.\n\n# Citations\n\n- Just some plain text\n', new Set());
  assert.equal(sources[0].resource, 'Just some plain text');
  assert.equal(sources[0].title, 'Just some plain text');
});

test('parseStatusMap reads the CLI form and extends the default', () => {
  const m = parseStatusMap('mystery=draft,solid=deprecated');
  assert.equal(m.mystery, 'draft');
  assert.equal(m.solid, 'deprecated');
  assert.equal(m.stub, 'draft');
  assert.throws(() => parseStatusMap('garbage'), /expected `old=new`/);
});

import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function migrateSandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'okf-mig-'));
  cpSync(join(ROOT, 'test/fixtures/legacy-v01'), dir, { recursive: true });
  for (const p of ['build.mjs', 'lib', 'scripts', 'assets']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

test('migrate converts a v0.1 page and twice is a no-op', () => {
  const dir = migrateSandbox();
  const r1 = spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r1.status, 0, r1.stderr);

  const after = readFileSync(join(dir, 'wiki/demo/alpha.md'), 'utf8');
  assert.ok(after.includes('legacy_timestamp'), 'timestamp must become legacy_timestamp');
  assert.ok(!/\ntimestamp:/.test(after), 'no timestamp key may survive');
  assert.ok(!/generated:/.test(after), 'no provenance may be invented');
  assert.ok(after.includes('status: stable'), 'solid must map to stable');
  assert.ok(!after.includes('# Citations'), 'the Citations heading must be gone');
  assert.ok(after.includes('sources:'), 'sources must be declared');
  assert.match(after, /\[\^example-com-a\]/, 'a footnote marker must be present');

  spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(readFileSync(join(dir, 'wiki/demo/alpha.md'), 'utf8'), after, 'second run is a no-op');
  rmSync(dir, { recursive: true, force: true });
});

test('migrate never touches raw/ or reserved files', () => {
  const dir = migrateSandbox();
  writeFileSync(join(dir, 'raw/source.md'),
    '---\ntype: source\ntitle: S\ntimestamp: 2026-01-01T00:00:00Z\n---\n\n# Citations\n\n- x\n');
  writeFileSync(join(dir, 'wiki/index.md'), '---\nokf_version: "0.2"\n---\n\n# Fixture\n');
  const rawBefore = readFileSync(join(dir, 'raw/source.md'), 'utf8');
  const idxBefore = readFileSync(join(dir, 'wiki/index.md'), 'utf8');

  spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });

  assert.equal(readFileSync(join(dir, 'raw/source.md'), 'utf8'), rawBefore, 'raw/ is immutable');
  assert.equal(readFileSync(join(dir, 'wiki/index.md'), 'utf8'), idxBefore, 'reserved files untouched');
  rmSync(dir, { recursive: true, force: true });
});
