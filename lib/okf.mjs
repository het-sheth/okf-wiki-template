// Pure OKF-profile helpers shared by build.mjs and tests. No I/O, no deps.

export const WIKI_CONCEPT_TYPES = ['concept', 'pattern', 'worked-example'];
const RESERVED = ['index.md', 'log.md'];

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// For HTML attribute values: esc + escape double quotes.
export const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

export const summary = (data) => data.description ?? '';

export const isReserved = (base) => RESERVED.includes(base);

// `area` is 'raw' | 'wiki'. Reserved files are filtered out by the caller, so this
// only ever validates concept documents.
export function typeViolation({ area, type }) {
  if (!type) return 'missing required `type`';
  if (area === 'raw') return type === 'source' ? null : 'expected type "source"';
  if (area === 'wiki') {
    return WIKI_CONCEPT_TYPES.includes(type)
      ? null
      : `expected one of ${WIKI_CONCEPT_TYPES.join(', ')}`;
  }
  return `unknown area "${area}"`;
}

export const isLocalMd = (target) =>
  !/^[a-z][a-z0-9+.-]*:\/\//i.test(target) &&
  !target.startsWith('#') &&
  /\.md(#.*)?$/.test(target);

// Resolve a link target to a repo-root-relative posix path (no leading slash). Drops #frag.
// Bundle root = repo root: a leading '/' is relative to repo root. Returns null if the
// path escapes the repo root (a '..' with nothing left to pop).
export function resolveLinkTarget(fromDir, target) {
  const clean = target.split('#')[0];
  const startParts = clean.startsWith('/') ? [] : (fromDir ? fromDir.split('/') : []);
  const parts = startParts.concat(clean.replace(/^\//, '').split('/'));
  const stack = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      if (stack.length === 0) return null;
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

// wiki/<topic>/<slug>.md -> <topic>/<slug>.html  (site mirrors wiki/ without the prefix)
export const siteRelFromRepoRel = (repoRel) =>
  repoRel.replace(/^wiki\//, '').replace(/\.md$/, '.html');

// --- wikilinks --------------------------------------------------------------
//
// Two flavours, both written `[[...]]` with an optional `|Label`:
//   within-wiki  [[slug]] | [[topic/slug]]                 — resolves to a page in THIS wiki
//   cross-wiki   [[peer:topic/slug]]                       — resolves into a federated peer wiki
// (re-converged from education-wiki's `[[wikilinks]]`, with the `peer:` namespace added on top).
//
// `WIKILINK_RE` is the one source of truth for tokenising `[[...]]`; both the renderer
// and `check` consume it via `parseWikilink` so they can never disagree.
export const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

const SLUG_SEG = '[A-Za-z0-9][A-Za-z0-9._-]*';
// within-wiki: `slug` or `topic/slug` (exactly one or two segments, kebab-ish).
const WITHIN_RE = new RegExp(`^${SLUG_SEG}(?:\\/${SLUG_SEG})?$`);
// cross-wiki: `peer:topic/slug` — peer name AND full topic/slug both required (no bare-slug,
// no peerless form). Peer/topic/slug are each a single slug segment.
const CROSS_RE = new RegExp(`^(${SLUG_SEG}):(${SLUG_SEG}\\/${SLUG_SEG})$`);

// Classify one wikilink's inner `target` (the part before any `|Label`).
// Returns one of:
//   { kind: 'within', target }                       — [[slug]] / [[topic/slug]]
//   { kind: 'cross', peer, id, target }              — [[peer:topic/slug]] (id = "topic/slug")
//   { kind: 'malformed', target, reason }            — anything else (e.g. [[peer:slug]], [[a:b/c/d]])
// A `:` anywhere in the target means the author intended a cross-wiki link, so a bad one is
// reported as malformed rather than silently treated as a within-wiki slug.
export function parseWikilink(rawTarget, label) {
  const target = String(rawTarget).trim();
  const text = label != null ? String(label).trim() : '';
  if (target.includes(':')) {
    const m = CROSS_RE.exec(target);
    if (!m) {
      return { kind: 'malformed', target, label: text,
        reason: 'cross-wiki link must be [[peer:topic/slug]] (peer and full topic/slug both required)' };
    }
    return { kind: 'cross', peer: m[1], id: m[2], target, label: text };
  }
  if (!WITHIN_RE.test(target)) {
    return { kind: 'malformed', target, label: text, reason: 'wikilink target must be a slug or topic/slug' };
  }
  return { kind: 'within', target, label: text };
}

// Scan a markdown string for every `[[...]]` and classify each. Mirrors education-wiki's
// regex-based scan (runs on raw markdown, before marked) so the two wikis stay converged.
export function scanWikilinks(md) {
  const out = [];
  for (const m of String(md).matchAll(WIKILINK_RE)) out.push(parseWikilink(m[1], m[2]));
  return out;
}

// Backwards-compatible with education-wiki: the within-wiki targets only.
export function extractWikilinks(md) {
  return scanWikilinks(md).filter((w) => w.kind === 'within').map((w) => w.target);
}

// The page's outgoing cross-wiki references as `peer:topic/slug` ids — this is the manifest
// `links` field that lets the hub build "referenced by" backlinks.
export function extractCrossLinks(md) {
  return scanWikilinks(md).filter((w) => w.kind === 'cross').map((w) => `${w.peer}:${w.id}`);
}

// Resolve a within-wiki wikilink target to its site-root-relative html path.
//   [[slug]]        -> <currentTopic>/<slug>.html
//   [[topic/slug]]  -> <topic>/<slug>.html
export function withinWikiSiteRel(target, currentTopic) {
  const t = String(target).trim();
  const id = t.includes('/') ? t : `${currentTopic}/${t}`;
  return `${id}.html`;
}
