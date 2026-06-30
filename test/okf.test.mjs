import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, escAttr, summary, isReserved, typeViolation,
  isLocalMd, resolveLinkTarget, siteRelFromRepoRel,
  parseWikilink, scanWikilinks, extractWikilinks, extractCrossLinks, withinWikiSiteRel,
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

// --- wikilinks --------------------------------------------------------------

test('parseWikilink classifies within-wiki slug and topic/slug forms', () => {
  assert.deepEqual(parseWikilink('welcome'), { kind: 'within', target: 'welcome', label: '' });
  assert.deepEqual(parseWikilink('getting-started/welcome'),
    { kind: 'within', target: 'getting-started/welcome', label: '' });
  assert.equal(parseWikilink('welcome', 'Home').label, 'Home');
});

test('parseWikilink classifies a well-formed cross-wiki link', () => {
  const w = parseWikilink('education-wiki:agentic-engineering/overview', 'Overview');
  assert.deepEqual(w, {
    kind: 'cross', peer: 'education-wiki', id: 'agentic-engineering/overview',
    target: 'education-wiki:agentic-engineering/overview', label: 'Overview',
  });
});

test('parseWikilink rejects malformed cross-wiki links (peer + full topic/slug required)', () => {
  assert.equal(parseWikilink('education-wiki:overview').kind, 'malformed');      // peer + bare slug
  assert.equal(parseWikilink('education-wiki:a/b/c').kind, 'malformed');         // too deep
  assert.equal(parseWikilink(':agentic/overview').kind, 'malformed');           // no peer
  assert.equal(parseWikilink('peer:').kind, 'malformed');                       // no id
});

test('parseWikilink rejects a within-wiki target that is too deep', () => {
  assert.equal(parseWikilink('a/b/c').kind, 'malformed');
});

test('scanWikilinks tokenises every link in a body', () => {
  const md = 'see [[welcome]] and [[course-wiki:ai-hero/day-1|Day 1]] plus [[bad:slug]]';
  const kinds = scanWikilinks(md).map((w) => w.kind);
  assert.deepEqual(kinds, ['within', 'cross', 'malformed']);
});

test('extractWikilinks returns within-wiki targets only (education-wiki compat)', () => {
  assert.deepEqual(
    extractWikilinks('[[welcome]] [[t/s]] [[peer:t/s]]'),
    ['welcome', 't/s']
  );
});

test('extractCrossLinks returns peer:topic/slug ids only', () => {
  assert.deepEqual(
    extractCrossLinks('[[welcome]] [[education-wiki:agentic-engineering/overview]] [[bad:x]]'),
    ['education-wiki:agentic-engineering/overview']
  );
});

test('withinWikiSiteRel resolves bare slug against the current topic', () => {
  assert.equal(withinWikiSiteRel('welcome', 'getting-started'), 'getting-started/welcome.html');
  assert.equal(withinWikiSiteRel('other/page', 'getting-started'), 'other/page.html');
});
