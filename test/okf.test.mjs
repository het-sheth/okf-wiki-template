import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, escAttr, summary, isReserved, isReservedPath, typeViolation,
  isLocalMd, resolveLinkTarget, siteRelFromRepoRel,
  parseWikilink, scanWikilinks, extractWikilinks, extractCrossLinks, withinWikiSiteRel,
  prohibitedKeyViolations, citationsHeadingViolation, isoViolations, sourceViolations,
  supersessionViolations, statusViolation,
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

test('isReservedPath exempts _templates and journal directories', () => {
  assert.equal(isReservedPath('wiki/_templates/daily.md'), true);
  assert.equal(isReservedPath('wiki/journal/2026-07-02.md'), true);
  assert.equal(isReservedPath('wiki/tools/okta.md'), false);
  assert.equal(isReservedPath('wiki/getting-started/index.md'), false);
  assert.equal(isReservedPath('raw/meetings/x.md'), false);
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

test('typeViolation accepts a custom concept vocabulary', () => {
  assert.equal(typeViolation({ area: 'wiki', type: 'lesson', conceptTypes: ['lesson'] }), null);
  assert.match(
    typeViolation({ area: 'wiki', type: 'concept', conceptTypes: ['lesson'] }),
    /expected one of lesson/
  );
});

test('typeViolation without a vocabulary keeps the built-in default', () => {
  assert.equal(typeViolation({ area: 'wiki', type: 'concept' }), null);
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

test('timestamp is prohibited and names its replacement', () => {
  const v = prohibitedKeyViolations({ timestamp: '2026-01-01T00:00:00Z' });
  assert.equal(v.length, 1);
  assert.match(v[0], /`timestamp` is prohibited by this profile; use `generated.at`/);
});

test('legacy_timestamp is allowed because it claims nothing', () => {
  assert.deepEqual(prohibitedKeyViolations({ legacy_timestamp: '2026-01-01T00:00:00Z' }), []);
});

test('a Citations heading is prohibited and names its replacement', () => {
  assert.match(citationsHeadingViolation('body\n\n# Citations\n\n- x\n'), /use `sources:`/);
  assert.equal(citationsHeadingViolation('body\n\n## Citations in context\n'), null);
  assert.equal(citationsHeadingViolation('```\n# Citations\n```\n'), null);
});

test('generated and verified must carry by and at', () => {
  assert.deepEqual(isoViolations({ generated: { by: 'human:x', at: '2026-01-01T00:00:00Z' } }), []);
  assert.match(isoViolations({ generated: { at: '2026-01-01T00:00:00Z' } })[0], /`generated.by`/);
  assert.match(isoViolations({ generated: { by: 'x', at: 'nope' } })[0], /not ISO 8601/);
  assert.match(isoViolations({ verified: { by: 'x', at: '2026-01-01T00:00:00Z' } })[0], /must be a list/);
  assert.deepEqual(isoViolations({ stale_after: '2027-01-01' }), []);
  assert.match(isoViolations({ stale_after: '2027-13-99' })[0], /not an ISO date/);
});

test('source ids must be unique and every footnote must resolve', () => {
  const data = { sources: [{ id: 'a', resource: 'r', title: 't' }] };
  assert.deepEqual(sourceViolations(data, 'claim[^a]\n\n[^a]: note\n'), []);
  assert.match(sourceViolations(data, 'claim[^ghost]\n')[0], /\[\^ghost\]/);
  assert.match(sourceViolations(data, 'no markers here\n')[0], /orphaned/);
  const dupe = {
    sources: [{ id: 'a', resource: 'r', title: 't' }, { id: 'a', resource: 'r2', title: 't2' }],
  };
  assert.match(sourceViolations(dupe, 'x[^a]\n')[0], /duplicate source id/);
  assert.match(sourceViolations({ sources: [{ id: 'a' }] }, 'x[^a]\n')[0], /missing `resource`/);
});

test('supersession rejects missing targets, self-links, and cycles of any length', () => {
  const ok = [{ key: 't/old', supersededBy: 't/new' }, { key: 't/new', supersededBy: undefined }];
  assert.deepEqual(supersessionViolations(ok), []);

  assert.match(supersessionViolations([{ key: 't/a', supersededBy: 't/ghost' }])[0], /no such page/);
  assert.match(supersessionViolations([{ key: 't/a', supersededBy: 't/a' }])[0], /points at itself/);

  const two = [{ key: 't/a', supersededBy: 't/b' }, { key: 't/b', supersededBy: 't/a' }];
  assert.match(supersessionViolations(two).join('\n'), /cycle/);

  const three = [
    { key: 't/a', supersededBy: 't/b' },
    { key: 't/b', supersededBy: 't/c' },
    { key: 't/c', supersededBy: 't/a' },
  ];
  assert.match(supersessionViolations(three).join('\n'), /cycle/);
});

test('statusViolation flags a status outside the configured vocabulary', () => {
  const v = statusViolation({ status: 'solid' }, ['draft', 'stable', 'deprecated']);
  assert.match(v, /`status: solid`/);
  assert.match(v, /draft, stable, deprecated/);
});

test('statusViolation allows a member of the vocabulary', () => {
  assert.equal(statusViolation({ status: 'stable' }, ['draft', 'stable', 'deprecated']), null);
});

test('statusViolation allows an absent status', () => {
  assert.equal(statusViolation({}, ['draft', 'stable', 'deprecated']), null);
});
