import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINE_PATHS, patchPackageJson, replaceMarkedBlock, configTransition, MARKER,
} from '../lib/upgrade.mjs';

test('the engine manifest excludes every user-owned path', () => {
  for (const p of ['wiki', 'raw', 'topics.json', 'README.md', 'AGENTS.md', 'package.json']) {
    assert.ok(!ENGINE_PATHS.includes(p), `${p} must not be engine-owned`);
  }
  for (const p of ['lib', 'build.mjs', 'scripts', 'test', '.github']) {
    assert.ok(ENGINE_PATHS.includes(p), `${p} must be engine-owned`);
  }
});

test('patchPackageJson replaces engine fields and preserves clone fields', () => {
  const clone = {
    name: 'my-wiki', description: 'mine', version: '3.1.0',
    okf: { statusValues: ['wip'] },
    scripts: { check: 'old', mine: 'keep' },
    dependencies: { 'gray-matter': '4.0.2', chalk: '5.0.0' },
    engines: { node: '>=18' },
  };
  const tmpl = {
    name: 'okf-wiki-template', version: '2.0.0',
    scripts: { check: 'new', migrate: 'node scripts/migrate.mjs' },
    dependencies: { 'gray-matter': '4.0.3', marked: '18.0.5' },
    engines: { node: '>=20' },
  };
  const out = patchPackageJson(clone, tmpl);
  assert.equal(out.name, 'my-wiki');
  assert.equal(out.description, 'mine');
  assert.equal(out.version, '3.1.0');
  assert.deepEqual(out.okf, { statusValues: ['wip'] });
  assert.equal(out.scripts.check, 'new');
  assert.equal(out.scripts.migrate, 'node scripts/migrate.mjs');
  assert.equal(out.scripts.mine, 'keep', 'a clone script must survive');
  assert.equal(out.dependencies['gray-matter'], '4.0.3');
  assert.equal(out.dependencies.chalk, '5.0.0', 'a clone dependency must survive');
  assert.deepEqual(out.engines, { node: '>=20' });
});

test('replaceMarkedBlock swaps only the marked region and is idempotent', () => {
  const block = '<!-- managed -->\n## Rules\n\nNEW';
  const text = [
    '# My Wiki', '', 'My own prose.', '',
    `<!-- ${MARKER}:begin -->`, '<!-- managed -->', '## Rules', '', 'OLD', `<!-- ${MARKER}:end -->`,
    '', 'More of my prose.', '',
  ].join('\n');
  const once = replaceMarkedBlock(text, block, MARKER);
  assert.ok(once.includes('NEW'));
  assert.ok(!once.includes('OLD'));
  assert.ok(once.includes('My own prose.') && once.includes('More of my prose.'));
  assert.ok(once.includes('<!-- managed -->'), 'the managed comment must survive');
  assert.equal(replaceMarkedBlock(once, block, MARKER), once, 'replacement is idempotent');
});

test('replaceMarkedBlock throws when the markers are missing', () => {
  assert.throws(() => replaceMarkedBlock('no markers here', 'X', MARKER), /marker/);
});

test('configTransition writes the legacy block when the clone has none', () => {
  const t = configTransition({ name: 'w' });
  assert.equal(t.action, 'write-legacy');
  assert.deepEqual(t.okf.statusValues, ['stub', 'learning', 'researched', 'solid']);
  assert.deepEqual(t.okf.conceptTypes, ['concept', 'pattern', 'worked-example']);
  assert.equal(t.okf.needsWorkStatus, 'stub', 'rendering must not change');
  assert.match(t.message, /npm run migrate/);
});

test('configTransition never touches an existing block', () => {
  const t = configTransition({ okf: { statusValues: ['wip'] } });
  assert.equal(t.action, 'keep');
  assert.equal(t.okf, undefined);
});

// --- e2e --------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('upgrade replaces engine files and preserves everything of the clone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'okf-up-'));
  cpSync(join(ROOT, 'test/fixtures/minimal'), dir, { recursive: true });
  for (const p of ['build.mjs', 'lib', 'scripts', 'assets']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  mkdirSync(join(dir, 'docs'), { recursive: true });
  cpSync(join(ROOT, 'docs/profile-min.md'), join(dir, 'docs/profile-min.md'));
  // A real copy, never a symlink to the repo's node_modules: this test runs `npm install`, and
  // npm resolves the symlink and would prune the template's own tree through it.
  cpSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), { recursive: true });

  writeFileSync(join(dir, 'wiki/demo/mine.md'),
    '---\ntype: concept\ntitle: Mine\ndescription: d\n---\n\nMy page.\n');
  writeFileSync(join(dir, 'AGENTS.md'),
    '# demo wiki\n\nMy own conventions.\n\n'
    + '<!-- okf-template:profile-min:begin -->\nOLD\n<!-- okf-template:profile-min:end -->\n\n'
    + 'More of mine.\n');
  writeFileSync(join(dir, 'lib', 'okf.mjs'), '// stale\n');

  const r = spawnSync('node', ['scripts/upgrade.mjs', '--from', ROOT], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);

  assert.ok(readFileSync(join(dir, 'lib/okf.mjs'), 'utf8').includes('typeViolation'),
    'the stale engine file must be replaced');
  assert.ok(readFileSync(join(dir, 'wiki/demo/mine.md'), 'utf8').includes('My page.'),
    'user content must survive');
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('My own conventions.') && agents.includes('More of mine.'),
    'user prose must survive');
  assert.ok(!agents.includes('OLD'), 'the normative block must be replaced');
  assert.ok(agents.includes('is prohibited by this profile'), 'new rules must be present');

  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'fixture-minimal', 'the clone name must survive');
  assert.deepEqual(pkg.okf.statusValues, ['stub', 'learning', 'researched', 'solid'],
    'a clone with no block gets the legacy vocabulary, not the spec one');

  const check = spawnSync('node', ['build.mjs', '--check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(check.status, 0, `upgraded clone must pass check; stderr=${check.stderr}`);
  rmSync(dir, { recursive: true, force: true });
});

test('upgrade refuses to run without a release and changes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'okf-up2-'));
  cpSync(join(ROOT, 'test/fixtures/minimal'), dir, { recursive: true });
  cpSync(join(ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'lib'), join(dir, 'lib'), { recursive: true });
  const before = readFileSync(join(dir, 'package.json'), 'utf8');
  const r = spawnSync('node', ['scripts/upgrade.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no default release/);
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), before);
  rmSync(dir, { recursive: true, force: true });
});
