// Pure OKF-profile helpers shared by build.mjs and tests. No I/O, no deps.

export const WIKI_CONCEPT_TYPES = ['concept', 'pattern', 'worked-example'];
const RESERVED = ['index.md', 'log.md'];

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// For HTML attribute values: esc + escape double quotes.
export const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

export const summary = (data) => data.description ?? '';

export const isReserved = (base, reservedFiles = RESERVED) => reservedFiles.includes(base);

// Whole directories that are reserved like index.md/log.md: their files are neither concepts
// nor topic pages: exempt from the `type` requirement and from link/wikilink resolution.
// `_templates` = note scaffolding; `journal` = the dated private inbox (not published to site/).
const RESERVED_DIRS = ['_templates', 'journal'];
export const isReservedPath = (repoRel) => {
  const parts = String(repoRel).split('/');
  return parts[0] === 'wiki' && RESERVED_DIRS.includes(parts[1]);
};

// `area` is 'raw' | 'wiki'. Reserved files are filtered out by the caller, so this
// only ever validates concept documents.
// `conceptTypes` defaults to the built-in vocabulary so callers that predate configurable
// types keep working unchanged.
export function typeViolation({ area, type, conceptTypes = WIKI_CONCEPT_TYPES }) {
  if (!type) return 'missing required `type`';
  if (area === 'raw') return type === 'source' ? null : 'expected type "source"';
  if (area === 'wiki') {
    return conceptTypes.includes(type) ? null : `expected one of ${conceptTypes.join(', ')}`;
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
//   within-wiki  [[slug]] | [[topic/slug]]                 : resolves to a page in THIS wiki
//   cross-wiki   [[peer:topic/slug]]                       : resolves into a federated peer wiki
// (re-converged from education-wiki's `[[wikilinks]]`, with the `peer:` namespace added on top).
//
// `WIKILINK_RE` is the one source of truth for tokenising `[[...]]`; both the renderer
// and `check` consume it via `parseWikilink` so they can never disagree.
export const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

const SLUG_SEG = '[A-Za-z0-9][A-Za-z0-9._-]*';
// within-wiki: `slug` or `topic/slug` (exactly one or two segments, kebab-ish).
const WITHIN_RE = new RegExp(`^${SLUG_SEG}(?:\\/${SLUG_SEG})?$`);
// cross-wiki: `peer:topic/slug`: peer name AND full topic/slug both required (no bare-slug,
// no peerless form). Peer/topic/slug are each a single slug segment.
const CROSS_RE = new RegExp(`^(${SLUG_SEG}):(${SLUG_SEG}\\/${SLUG_SEG})$`);

// Classify one wikilink's inner `target` (the part before any `|Label`).
// Returns one of:
//   { kind: 'within', target }                       : [[slug]] / [[topic/slug]]
//   { kind: 'cross', peer, id, target }              : [[peer:topic/slug]] (id = "topic/slug")
//   { kind: 'malformed', target, reason }            : anything else (e.g. [[peer:slug]], [[a:b/c/d]])
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

// The page's outgoing cross-wiki references as `peer:topic/slug` ids: this is the manifest
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

// --- v0.2 profile validators ------------------------------------------------
//
// These are AUTHORING-PROFILE rules, stricter than OKF itself: the spec requires consumers to
// tolerate unknown keys, so a document these reject can still be valid OKF. Message text
// therefore says "prohibited by this profile" and never "invalid OKF".

const PROHIBITED_KEYS = { timestamp: '`generated.at`' };

export function prohibitedKeyViolations(data) {
  return Object.keys(PROHIBITED_KEYS)
    .filter((k) => data[k] !== undefined)
    .map((k) => `\`${k}\` is prohibited by this profile; use ${PROHIBITED_KEYS[k]}`);
}

// Strips fenced code before scanning, so a heading shown as an example inside a code block is
// not mistaken for a real one.
const stripFences = (md) => String(md).replace(/^```[\s\S]*?^```/gm, '');

export function citationsHeadingViolation(content) {
  return /^#{1,6}\s+Citations\s*$/m.test(stripFences(content))
    ? 'a `# Citations` heading is prohibited by this profile; use `sources:` with footnote markers'
    : null;
}

// YAML frontmatter parsers (gray-matter's default engine) resolve an unquoted timestamp-shaped
// scalar into a real JS Date before this code ever sees it, so a value can arrive as either a
// string (quoted in the source, or never timestamp-shaped to begin with) or a Date instance. A
// Date instance is accepted outright: it only exists because the YAML parser already recognized
// the scalar as a timestamp.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDateTime = (v) =>
  (v instanceof Date && !Number.isNaN(v.getTime())) ||
  (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
const isIsoDate = (v) => {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  return typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
};

function actorViolations(label, entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return [`\`${label}\` must be a mapping with \`by\` and \`at\``];
  }
  const out = [];
  if (!entry.by) out.push(`\`${label}.by\` is required`);
  if (!isIsoDateTime(entry.at)) out.push(`\`${label}.at\` is not ISO 8601`);
  return out;
}

export function isoViolations(data) {
  const out = [];
  if (data.generated !== undefined) out.push(...actorViolations('generated', data.generated));
  if (data.verified !== undefined) {
    if (!Array.isArray(data.verified)) {
      out.push('`verified` must be a list of { by, at } entries');
    } else {
      data.verified.forEach((e, i) => out.push(...actorViolations(`verified[${i}]`, e)));
    }
  }
  if (data.stale_after !== undefined && !isIsoDate(data.stale_after)) {
    out.push('`stale_after` is not an ISO date (YYYY-MM-DD)');
  }
  return out;
}

const FOOTNOTE_USE_RE = /\[\^([^\]]+)\]/g;

export function sourceViolations(data, content) {
  const sources = data.sources === undefined ? [] : data.sources;
  if (!Array.isArray(sources)) return ['`sources` must be a list'];

  const out = [];
  const ids = new Set();
  for (const s of sources) {
    if (s === null || typeof s !== 'object' || Array.isArray(s)) {
      out.push('each `sources` entry must be a mapping');
      continue;
    }
    if (!s.id) { out.push('a `sources` entry is missing `id`'); continue; }
    if (ids.has(s.id)) out.push(`duplicate source id \`${s.id}\``);
    ids.add(s.id);
    if (!s.resource) out.push(`source \`${s.id}\` is missing \`resource\``);
    if (!s.title) out.push(`source \`${s.id}\` is missing \`title\``);
  }

  // A definition line `[^id]: text` is not a use; only inline markers count.
  const body = stripFences(content).replace(/^\[\^[^\]]+\]:.*$/gm, '');
  const used = new Set(Array.from(body.matchAll(FOOTNOTE_USE_RE), (m) => m[1]));
  for (const u of used) if (!ids.has(u)) out.push(`footnote [^${u}] has no matching source id`);
  for (const id of ids) if (!used.has(id)) out.push(`source \`${id}\` is orphaned (no footnote marker)`);
  return out;
}

// Takes the whole supersession graph, because a cycle is not visible from a single edge.
// Runs whenever any page carries `superseded_by`, independent of the archival flag: a pointer
// that goes nowhere is a broken link either way.
export function supersessionViolations(pages) {
  const out = [];
  const keys = new Set(pages.map((p) => p.key));
  const edges = new Map();

  for (const { key, supersededBy } of pages) {
    if (supersededBy === undefined) continue;
    if (typeof supersededBy !== 'string') {
      out.push(`${key} -> \`superseded_by\` must be a topic/slug string`);
      continue;
    }
    if (supersededBy === key) { out.push(`${key} -> \`superseded_by\` points at itself`); continue; }
    if (!keys.has(supersededBy)) {
      out.push(`${key} -> \`superseded_by\` ${supersededBy} (no such page)`);
      continue;
    }
    edges.set(key, supersededBy);
  }

  // Walk each chain; a revisit within one walk is a cycle. Report each cycle once, keyed by
  // its lexicographically smallest member, so the message is stable across page order.
  const reported = new Set();
  for (const start of edges.keys()) {
    const seen = [];
    let node = start;
    while (node !== undefined && !seen.includes(node)) {
      seen.push(node);
      node = edges.get(node);
    }
    if (node === undefined) continue;
    const cycle = seen.slice(seen.indexOf(node));
    const id = [...cycle].sort()[0];
    if (reported.has(id)) continue;
    reported.add(id);
    out.push(`\`superseded_by\` cycle: ${[...cycle, node].join(' -> ')}`);
  }
  return out;
}

// A page's `status`, if present, must be a member of the configured vocabulary. Absent
// `status` is not a violation: silent defaulting is `resolveOkfConfig`'s job, not this check's.
export function statusViolation(data, statusValues) {
  if (data.status === undefined) return null;
  if (statusValues.includes(data.status)) return null;
  return `\`status: ${data.status}\` is not in the configured vocabulary (${statusValues.join(', ')})`;
}
