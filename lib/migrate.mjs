// Pure v0.1 -> v0.2 transforms. No I/O, no deps, so tests call them directly.
//
// The rule that shapes everything here: `generated.by` records WHO produced a page, and a v0.1
// page does not carry that fact. So the default path never writes it. `legacy_timestamp` is an
// extension key that makes no provenance claim, which is what lets the default finish in a state
// `check` accepts without inventing an author.

export const DEFAULT_STATUS_MAP = {
  stub: 'draft', learning: 'draft', researched: 'stable', solid: 'stable',
};

export function parseStatusMap(spec) {
  const out = { ...DEFAULT_STATUS_MAP };
  if (!spec) return out;
  for (const pair of String(spec).split(',')) {
    const [from, to] = pair.split('=');
    if (!from || !to) throw new Error(`bad --status-map entry "${pair}": expected \`old=new\``);
    out[from.trim()] = to.trim();
  }
  return out;
}

export function migrateFrontmatter(input, { generatedBy = null, statusMap = DEFAULT_STATUS_MAP } = {}) {
  const data = { ...input };
  const notes = [];

  if (data.timestamp !== undefined) {
    const at = data.timestamp;
    delete data.timestamp;
    if (generatedBy) data.generated = { by: generatedBy, at };
    else data.legacy_timestamp = at;
  }

  if (data.status !== undefined) {
    const mapped = statusMap[data.status];
    if (mapped) data.status = mapped;
    else notes.push(`unmapped status \`${data.status}\` left as is; use --status-map to convert it`);
  }

  return { data, notes };
}

const slugifyId = (resource, i) => {
  const base = String(resource)
    .replace(/^https?:\/\//, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .split('-').filter(Boolean).slice(0, 4).join('-');
  return base || `source-${i + 1}`;
};

const CITATIONS_HEADING = /^#{1,6}[ \t]+Citations[ \t]*$/m;

// A trailing separator between a title and the resource that follows it: whitespace, commas,
// colons, semicolons, hyphens, or a dash character. The profile prohibits em/en dashes in
// content, but v0.1 citations commonly used one as exactly this separator, so it is recognized
// and dropped here rather than carried into the migrated title.
const TITLE_SEP = /[\s,:;\-\u2013\u2014]+$/;

// Split a citation item into `{ resource, title }`. Two known v0.1 shapes carry an explicit
// resource: a backtick-wrapped path, or a bare URL, each optionally preceded by a title and a
// separator. Anything else has no extractable resource, so the whole item stands in for both
// fields, same as before this split existed.
function splitCitation(raw) {
  const backtick = raw.match(/`([^`]+)`/);
  if (backtick) {
    const resource = backtick[1];
    const title = raw.slice(0, backtick.index).replace(TITLE_SEP, '').trim();
    return { resource, title: title || resource };
  }
  const url = raw.match(/https?:\/\/\S+/);
  if (url) {
    const resource = url[0];
    const title = raw.slice(0, url.index).replace(TITLE_SEP, '').trim();
    return { resource, title: title || resource };
  }
  return { resource: raw, title: raw };
}

// A `# Citations` list becomes `sources:` entries, an inline marker per source, and a definition
// list. `existingIds` are ids the page already declares in frontmatter, so a generated id can
// never collide with one and trip the duplicate-id check.
export function migrateBody(content, existingIds = new Set()) {
  const m = CITATIONS_HEADING.exec(content);
  if (!m) return { content, sources: [], notes: [] };

  const headingStart = m.index;
  const headingEnd = headingStart + m[0].length;
  const nextHeading = /\n#{1,6}[ \t]+.*(?:\n|$)/g;
  nextHeading.lastIndex = headingEnd;
  const next = nextHeading.exec(content);
  const sectionEnd = next ? next.index + 1 : content.length;
  const section = content.slice(headingEnd, sectionEnd);

  const items = section.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());

  const taken = new Set(existingIds);
  const sources = items.map((raw, i) => {
    const { resource, title } = splitCitation(raw);
    const base = slugifyId(resource, i);
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    taken.add(id);
    return { id, resource, title };
  });

  const preservedSection = section.split('\n')
    .filter((line) => !line.trim().startsWith('- '))
    .join('\n');
  const sectionBody = preservedSection.replace(/^\n{2,}/, '\n');
  let body = `${content.slice(0, headingStart)}${sectionBody}${content.slice(sectionEnd)}`;
  const notes = [];
  if (sources.length) {
    const markers = sources.map((s) => `[^${s.id}]`).join('');
    // A non-URL resource is a local path (e.g. `raw/topic/file.md` or a repo doc). Wrapping only
    // the destination in backticks does not stop `marked` from parsing the line as a link
    // reference definition: the backticks land inside `href`, `isLocalMd` no longer matches
    // (it ends in a backtick, not `.md`), and `check` goes green over a genuinely broken
    // anchor (`marked.parse` still renders `<a href="...">`). The fix used elsewhere in this
    // repo (the ingest pipeline's citation handling) is to wrap the *entire* definition line,
    // marker included, in inline code: that makes it a code span, so `marked` never emits a
    // `def` token for it at all, and the line reads as a literal citation, matching this
    // profile's rule that `raw/` and other non-concept material is cited as code, never a
    // clickable link. A URL resource is left bare: `[^id]: https://...` is meant to parse as a
    // real link definition, since an external source should render as a real link.
    const defs = sources.map((s) => {
      const line = `[^${s.id}]: ${s.resource}`;
      return /^https?:\/\//.test(s.resource) ? line : `\`${line}\``;
    }).join('\n');
    const lines = body.split('\n');
    const anchor = lines.findLastIndex((line) => line.trim() !== '');
    if (anchor >= 0) {
      lines[anchor] += markers;
      body = lines.join('\n');
    } else {
      body = `${body}${markers}`;
      notes.push('added source markers to an otherwise empty migrated body');
    }
    body = `${body.replace(/\s*$/, '')}\n\n${defs}\n`;
  } else {
    body = `${body.replace(/\s*$/, '')}\n`;
  }
  return { content: body, sources, notes };
}
