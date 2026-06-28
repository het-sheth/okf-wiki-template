#!/usr/bin/env node
// Thin wrapper: `npm run ingest -- <src> --topic <t> [...]` -> uv-run python ingest.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));            // education-wiki/scripts
const INGEST_DIR = join(ROOT, '..', 'ingest');

// preflight: uv must exist
const uvCheck = spawnSync('uv', ['--version'], { stdio: 'ignore' });
if (uvCheck.status !== 0) {
  console.error('error: `uv` not found on PATH. Install uv (https://docs.astral.sh/uv/).');
  process.exit(127);
}

// Keep cwd unchanged (so relative <src> args resolve as the user typed them); put the
// ingest package on PYTHONPATH so `python -m ingest` can import it.
const PYTHONPATH = INGEST_DIR + (process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : '');

const args = process.argv.slice(2);
const res = spawnSync(
  'uv',
  ['run', '--project', INGEST_DIR, '--locked', 'python', '-m', 'ingest', ...args],
  { stdio: 'inherit', env: { ...process.env, PYTHONPATH } }
);
process.exit(res.status ?? 1);
