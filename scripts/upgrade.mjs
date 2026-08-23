#!/usr/bin/env node
// Syncs ENGINE files from a pinned template release.
//
// Usage:
//   npm run upgrade -- --release v2.1.0 [--dry-run]
//   npm run upgrade -- --from ../okf-wiki-template   (an already-present tree; used by tests)
//
// There is deliberately no default release: `latest` is not a tag, and guessing one would
// either fail or silently pull an unintended version.
import {
  readFileSync, writeFileSync, cpSync, existsSync, rmSync, mkdtempSync, renameSync, mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ENGINE_PATHS, REQUIRED_RELEASE_FILES, patchPackageJson, replaceMarkedBlock, configTransition, MARKER,
} from '../lib/upgrade.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
const DRY = argv.includes('--dry-run');
const REPO = 'https://github.com/het-sheth/okf-wiki-template';

const die = (msg) => { console.error(`upgrade: ${msg}`); process.exit(1); };
const log = (m) => console.log(m);

// SHA256SUMS is `<hex>  <name>` per line. Match the line naming this asset rather than trusting
// position, so a release that also lists other assets still verifies.
function expectedSum(sums, name) {
  const lines = sums.split('\n').map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => l.split(/\s+/).slice(1).join(' ').replace(/^\*/, '') === name);
  if (hit) return hit.split(/\s+/)[0];
  if (lines.length === 1) return lines[0].split(/\s+/)[0];
  return null;
}

// --- 1. stage the release ---------------------------------------------------
function stageRelease(tag) {
  const stage = mkdtempSync(join(tmpdir(), 'okf-stage-'));
  const tarName = `okf-wiki-template-${tag}.tar.gz`;
  const tarPath = join(stage, 'release.tar.gz');
  const base = `${REPO}/releases/download/${tag}`;

  const get = (url, dest) =>
    spawnSync('curl', ['-fsSL', '-o', dest, url], { encoding: 'utf8' });

  if (get(`${base}/${tarName}`, tarPath).status !== 0) {
    die(`could not download the ${tag} tarball from ${base}`);
  }
  const sumsPath = join(stage, 'SHA256SUMS');
  if (get(`${base}/SHA256SUMS`, sumsPath).status !== 0) {
    die(`${tag} has no published SHA256SUMS, so the download cannot be verified`);
  }

  const actual = createHash('sha256').update(readFileSync(tarPath)).digest('hex');
  const expected = expectedSum(readFileSync(sumsPath, 'utf8'), tarName);
  if (!expected) die(`SHA256SUMS for ${tag} has no entry for ${tarName}, so it cannot be verified`);
  if (actual !== expected) die(`checksum mismatch for ${tag}: expected ${expected}, got ${actual}`);
  log(`verified ${tag} (sha256 ${actual.slice(0, 12)})`);

  const out = join(stage, 'tree');
  mkdirSync(out);
  const x = spawnSync('tar', ['-xzf', tarPath, '-C', out, '--strip-components=1'], { encoding: 'utf8' });
  if (x.status !== 0) die(`could not extract ${tag}: ${x.stderr}`);
  return out;
}

const from = flag('--from');
const tag = flag('--release');
if (!from && !tag) die('pass --release <tag> (or --from <dir>). There is no default release.');
const src = from ? from : stageRelease(tag);

// --- 2. validate the staged tree before touching anything ------------------
for (const f of REQUIRED_RELEASE_FILES) {
  if (!existsSync(join(src, f))) die(`the release is incomplete: ${f} is missing. Nothing was changed.`);
}
const tmplPkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));

if (DRY) {
  log('dry run. Would replace:');
  for (const p of ENGINE_PATHS) if (existsSync(join(src, p))) log(`  ${p}`);
  log('  package.json (scripts, dependencies, engines)');
  log('  the AGENTS.md marked block');
  log('\nnot touched: wiki/ raw/ topics.json README.md, and your AGENTS.md prose');
  process.exit(0);
}

// --- 3. replace engine paths, staging each swap ----------------------------
for (const p of ENGINE_PATHS) {
  const s = join(src, p);
  if (!existsSync(s)) continue;
  const target = join(ROOT, p);
  const staged = `${target}.upgrade-new`;
  rmSync(staged, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(s, staged, { recursive: true });
  rmSync(target, { recursive: true, force: true });
  renameSync(staged, target);
  log(`replaced ${p}`);
}

// --- 4. package.json and the config transition -----------------------------
const clonePkgPath = join(ROOT, 'package.json');
const clonePkg = JSON.parse(readFileSync(clonePkgPath, 'utf8'));
let nextPkg = patchPackageJson(clonePkg, tmplPkg);
const t = configTransition(clonePkg);
if (t.action === 'write-legacy') { nextPkg = { ...nextPkg, okf: t.okf }; log(`config: ${t.message}`); }
else log('config: kept your existing `okf` block');
writeFileSync(clonePkgPath, `${JSON.stringify(nextPkg, null, 2)}\n`);
log('patched package.json (scripts, dependencies, engines)');

// --- 5. the AGENTS.md normative block --------------------------------------
const agentsPath = join(ROOT, 'AGENTS.md');
try {
  const canonical = readFileSync(join(ROOT, 'docs/profile-min.md'), 'utf8');
  writeFileSync(agentsPath, replaceMarkedBlock(readFileSync(agentsPath, 'utf8'), canonical, MARKER));
  log('replaced the AGENTS.md normative block; your prose was left alone');
} catch (e) {
  log(`SKIPPED AGENTS.md: ${e.message}`);
}

// --- 6. lockfile is derived, never merged ----------------------------------
const install = spawnSync('npm', ['install', '--silent'], { cwd: ROOT, encoding: 'utf8' });
if (install.status !== 0) {
  console.error(install.stderr);
  die('npm install failed. Engine files are updated but the lockfile is not, and the recorded '
      + 'template version was NOT advanced. Fix the install, then re-run.');
}
log('regenerated package-lock.json');

// --- 7. record the release, last, only on success --------------------------
writeFileSync(join(ROOT, '.okf-template-version'), `${tmplPkg.version || tag}\n`);
log('\nnot touched: wiki/ raw/ topics.json README.md, and your AGENTS.md prose');
log(`now on template ${tmplPkg.version || tag}. Run: npm run check`);
