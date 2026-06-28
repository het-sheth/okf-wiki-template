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
