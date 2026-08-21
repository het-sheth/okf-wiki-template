// Pure resolver for package.json's `okf` block. Every key defaults to v1 behavior, so a repo
// with no `okf` key sees zero change, including in rendered HTML. No I/O, no deps.

export const DEFAULT_CONCEPT_TYPES = ['concept', 'pattern', 'worked-example'];
export const DEFAULT_STATUS_VALUES = ['stub', 'learning', 'researched', 'solid'];
export const SPEC_STATUS_VALUES = ['draft', 'stable', 'deprecated'];
export const DEFAULT_RESERVED_FILES = ['index.md', 'log.md'];

const isStringArray = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim() !== '');

const arrayKey = (okf, key, fallback) => {
  const v = okf[key] === undefined ? fallback : okf[key];
  if (!isStringArray(v)) throw new Error(`\`okf.${key}\` must be a non-empty array of strings`);
  return v;
};

const boolKey = (okf, key, fallback) => {
  const v = okf[key] === undefined ? fallback : okf[key];
  if (typeof v !== 'boolean') throw new Error(`\`okf.${key}\` must be a boolean`);
  return v;
};

// A member of `values`, or null to disable. Explicit wins; otherwise `preferred` if present,
// else the fallback picker.
function memberKey(okf, key, values, { preferred, fallback }) {
  if (okf[key] === null) return null;
  if (okf[key] !== undefined) {
    if (typeof okf[key] === 'string' && values.includes(okf[key])) return okf[key];
    throw new Error(`\`okf.${key}\` must be one of \`okf.statusValues\` or null`);
  }
  if (preferred && values.includes(preferred)) return preferred;
  return fallback(values);
}

export function resolveOkfConfig(okf = {}) {
  if (okf === null || typeof okf !== 'object' || Array.isArray(okf)) {
    throw new Error('package.json `okf` must be an object');
  }
  const conceptTypes = arrayKey(okf, 'conceptTypes', DEFAULT_CONCEPT_TYPES);
  const statusValues = arrayKey(okf, 'statusValues', DEFAULT_STATUS_VALUES);
  const reservedFiles = arrayKey(okf, 'reservedFiles', DEFAULT_RESERVED_FILES);

  // What an ABSENT `status:` means. 'stable' when the vocabulary has it (the v0.2 rule),
  // else null, because a custom vocabulary without 'stable' has no principled silent default.
  const statusDefault = memberKey(okf, 'statusDefault', statusValues, {
    preferred: 'stable', fallback: () => null,
  });

  // Which status gets the muted "needs work" card. Separate from statusDefault on purpose:
  // today's build mutes `status: stub`, and 'stub' is not the absent-status default. Deriving
  // one from the other would silently change rendering for every unconfigured clone.
  const needsWorkStatus = memberKey(okf, 'needsWorkStatus', statusValues, {
    preferred: 'stub', fallback: (v) => v[0],
  });

  // Explicit, never inferred from whether the vocabulary contains 'deprecated'. `superseded_by`
  // is validated whenever present regardless: lifecycle policy and reference integrity are
  // separate concerns.
  const archival = boolKey(okf, 'archival', false);
  const federation = boolKey(okf, 'federation', false);

  const title = okf.title === undefined ? null : okf.title;
  if (title !== null && typeof title !== 'string') throw new Error('`okf.title` must be a string');

  return {
    conceptTypes, statusValues, statusDefault, needsWorkStatus,
    reservedFiles, archival, federation, title,
  };
}
