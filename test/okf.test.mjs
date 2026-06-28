import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, escAttr, summary, isReserved, typeViolation,
  isLocalMd, resolveLinkTarget, siteRelFromRepoRel,
} from '../lib/okf.mjs';

test('esc escapes HTML metacharacters', () => {
  assert.equal(esc('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
});

test('escAttr also escapes double quotes for attribute context', () => {
  assert.equal(escAttr('a "b" & <c>'), 'a &quot;b&quot; &amp; &lt;c&gt;');
});

test('summary returns description or empty string', () => {
  assert.equal(summary({ description: 'd' }), 'd');
  assert.equal(summary({}), '');
});

test('isReserved matches OKF reserved filenames only', () => {
  assert.equal(isReserved('index.md'), true);
  assert.equal(isReserved('log.md'), true);
  assert.equal(isReserved('welcome.md'), false);
});

test('typeViolation enforces area -> type for concepts', () => {
  assert.equal(typeViolation({ area: 'raw', type: 'source' }), null);
  assert.equal(typeViolation({ area: 'wiki', type: 'concept' }), null);
  assert.equal(typeViolation({ area: 'wiki', type: 'pattern' }), null);
  assert.equal(typeViolation({ area: 'wiki', type: 'worked-example' }), null);
  assert.match(typeViolation({ area: 'raw', type: 'concept' }), /expected type "source"/);
  assert.match(typeViolation({ area: 'wiki', type: undefined }), /missing required `type`/);
  assert.match(typeViolation({ area: 'wiki', type: 'banana' }), /expected one of/);
});

test('isLocalMd recognizes local .md links only', () => {
  assert.equal(isLocalMd('./x.md'), true);
  assert.equal(isLocalMd('/wiki/t/y.md#sec'), true);
  assert.equal(isLocalMd('https://e.com/x.md'), false);
  assert.equal(isLocalMd('#anchor'), false);
  assert.equal(isLocalMd('img.png'), false);
});

test('resolveLinkTarget resolves absolute and relative to repo root', () => {
  assert.equal(resolveLinkTarget('wiki/getting-started', '/wiki/getting-started/welcome.md'), 'wiki/getting-started/welcome.md');
  assert.equal(resolveLinkTarget('wiki/getting-started', './writing-concepts.md'), 'wiki/getting-started/writing-concepts.md');
  assert.equal(resolveLinkTarget('wiki/getting-started', '../other/z.md#frag'), 'wiki/other/z.md');
});

test('resolveLinkTarget returns null when the path escapes repo root', () => {
  assert.equal(resolveLinkTarget('wiki', '../../escape.md'), null);
});

test('siteRelFromRepoRel maps wiki md path to site html path', () => {
  assert.equal(siteRelFromRepoRel('wiki/getting-started/welcome.md'), 'getting-started/welcome.html');
});
