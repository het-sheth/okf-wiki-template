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

const CITATIONS_BLOCK = /\n#{1,6}[ \t]+Citations[ \t]*\n([\s\S]*?)(?=\n#{1,6}[ \t]|$)/;

// A `# Citations` list becomes `sources:` entries, an inline marker per source, and a definition
// list. `existingIds` are ids the page already declares in frontmatter, so a generated id can
// never collide with one and trip the duplicate-id check.
export function migrateBody(content, existingIds = new Set()) {
  const m = CITATIONS_BLOCK.exec(content);
  if (!m) return { content, sources: [], notes: [] };

  const items = m[1].split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim().replace(/^`|`$/g, ''));

  const taken = new Set(existingIds);
  const sources = items.map((resource, i) => {
    const base = slugifyId(resource, i);
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    taken.add(id);
    return { id, resource, title: resource };
  });

  let body = content.replace(CITATIONS_BLOCK, '\n').replace(/\s*$/, '');
  if (sources.length) {
    const markers = sources.map((s) => `[^${s.id}]`).join('');
    const defs = sources.map((s) => `[^${s.id}]: ${s.resource}`).join('\n');
    // Markers attach to a sourced-material sentence rather than to an arbitrary claim: the
    // original page cited at page level, so nothing finer is knowable from the input.
    body = `${body}\n\nSourced material.${markers}\n\n${defs}\n`;
  } else {
    body = `${body}\n`;
  }
  return { content: body, sources, notes: [] };
}
