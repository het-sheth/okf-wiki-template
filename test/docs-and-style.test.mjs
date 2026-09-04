import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('README documents ingest statusDefault behavior', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /configured default.*statusDefault|statusDefault.*configured default/i);
  assert.doesNotMatch(readme, /drafts a `status: stub`/);
});

test('shipped files contain no em dash punctuation', () => {
  for (const file of ['../ingest/ingest/draft.py', '../ingest/tests/test_draft.py', '../assets/wiki.css']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /—/, file);
  }
});

test('upgrade docs disclose that --from is unverified local testing only', () => {
  const docs = readFileSync(new URL('../docs/upgrading.md', import.meta.url), 'utf8');
  assert.match(docs, /--from/);
  assert.match(docs, /unverified.*local development and testing|local development and testing.*unverified/i);
});

test('profile docs say reservedFiles controls generator checks', () => {
  const docs = readFileSync(new URL('../docs/okf-profile.md', import.meta.url), 'utf8');
  assert.match(docs, /reservedFiles.*controls|reservedFiles.*reserved-file checks/i);
  assert.doesNotMatch(docs, /checks are fixed to these two names/);
});
