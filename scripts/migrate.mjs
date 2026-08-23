#!/usr/bin/env node
// Rewrites v0.1 wiki content to v0.2 in place. Idempotent: a second run changes nothing.
//
// Scope is `wiki/` only. `raw/` is immutable source material and the profile's prohibitions do
// not apply to it, so it is never read for writing here.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { migrateFrontmatter, migrateBody, parseStatusMap } from '../lib/migrate.mjs';
import { resolveOkfConfig } from '../lib/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};

const generatedBy = flag('--generated-by');
const statusMap = parseStatusMap(flag('--status-map'));
const CFG = resolveOkfConfig(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).okf);

const walk = (dir) => {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
};

const wikiDir = join(ROOT, 'wiki');
if (!existsSync(wikiDir)) {
  console.log('migrate: no wiki/ directory, nothing to do');
  process.exit(0);
}

let changed = 0;
const notes = [];
for (const file of walk(wikiDir)) {
  const rel = relative(ROOT, file);
  // Reserved files carry no frontmatter, except the bundle root's lone okf_version. Neither
  // needs migrating, and round-tripping them through matter.stringify would reformat them.
  if (CFG.reservedFiles.includes(basename(file))) continue;
  const raw = readFileSync(file, 'utf8');
  if (!raw.startsWith('---')) continue;

  const parsed = matter(raw);
  const existingIds = new Set((parsed.data.sources || []).map((s) => s && s.id).filter(Boolean));
  const fm = migrateFrontmatter(parsed.data, { generatedBy, statusMap });
  const body = migrateBody(parsed.content, existingIds);

  const data = { ...fm.data };
  if (body.sources.length) data.sources = [...(data.sources || []), ...body.sources];
  for (const n of [...fm.notes, ...body.notes]) notes.push(`${rel}: ${n}`);

  // Write only when a transform actually changed something, so an already-migrated file is
  // never reformatted just by being visited.
  const fmChanged = JSON.stringify(data) !== JSON.stringify(parsed.data);
  const bodyChanged = body.content !== parsed.content;
  if (!fmChanged && !bodyChanged) continue;

  writeFileSync(file, matter.stringify(body.content, data));
  changed += 1;
  console.log(`migrated ${rel}`);
}

console.log(`\nmigrate: ${changed} file(s) changed`);
if (notes.length) {
  console.log('\nneeds a human:');
  for (const n of notes) console.log(`  ${n}`);
}
if (!generatedBy) {
  console.log('\nnote: `timestamp` moved to `legacy_timestamp`, which claims no provenance.');
  console.log('      Re-run with --generated-by <actor> to record real provenance instead.');
}
