// Pure helpers for `npm run upgrade`. No I/O, no deps.
//
// Upgrades are a file sync from a pinned release, not a git merge: this template is used via
// GitHub's "Use this template", which produces a repository with unrelated history, so no
// template commit is ever an ancestor of a clone.
import {
  DEFAULT_CONCEPT_TYPES, DEFAULT_STATUS_VALUES, DEFAULT_RESERVED_FILES,
} from './config.mjs';

// ENGINE: replaced wholesale, because these files have exactly one owner.
export const ENGINE_PATHS = [
  'lib', 'build.mjs', 'scripts', 'test', '.github', 'assets',
  'docs/profile-min.md', 'docs/okf-profile.md', 'docs/upgrading.md', 'docs/composing.md',
];

// Files that must exist in a downloaded release for it to be considered intact.
export const REQUIRED_RELEASE_FILES = ['package.json', 'build.mjs', 'lib/okf.mjs', 'docs/profile-min.md'];

// package.json fields the template owns. Everything else in that file is the clone's.
export const ENGINE_PKG_FIELDS = ['scripts', 'dependencies'];

export const MARKER = 'okf-template:profile-min';

export function patchPackageJson(clonePkg, templatePkg) {
  const out = { ...clonePkg };
  for (const field of ENGINE_PKG_FIELDS) {
    if (templatePkg[field] === undefined) continue;
    // Template entries win per key; clone-only entries survive.
    out[field] = { ...(clonePkg[field] || {}), ...templatePkg[field] };
  }
  // `engines` is a whole-value replacement: a version floor is not a merge.
  if (templatePkg.engines !== undefined) out.engines = { ...templatePkg.engines };
  return out;
}

export function replaceMarkedBlock(text, block, marker = MARKER) {
  const begin = `<!-- ${marker}:begin -->`;
  const end = `<!-- ${marker}:end -->`;
  const i = text.indexOf(begin);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(`missing ${marker} marker pair; add ${begin} and ${end} to the file first`);
  }
  const body = block.replace(/^\n+|\n+$/g, '');
  return `${text.slice(0, i + begin.length)}\n${body}\n${text.slice(j)}`;
}

// A clone with no `okf` block gets the LEGACY vocabulary written explicitly, so upgrading never
// silently changes which documents are valid or how cards render. Adopting the spec vocabulary
// is a separate, deliberate step the message names.
export function configTransition(clonePkg) {
  if (clonePkg.okf !== undefined) return { action: 'keep' };
  return {
    action: 'write-legacy',
    okf: {
      conceptTypes: [...DEFAULT_CONCEPT_TYPES],
      statusValues: [...DEFAULT_STATUS_VALUES],
      statusDefault: null,
      needsWorkStatus: 'stub',
      reservedFiles: [...DEFAULT_RESERVED_FILES],
      archival: false,
      federation: false,
    },
    message:
      'wrote the legacy `okf` block to preserve current behavior. To adopt the OKF v0.2 ' +
      'vocabulary run: npm run migrate -- --status-map ' +
      'stub=draft,learning=draft,researched=stable,solid=stable ' +
      'then set statusValues to draft/stable/deprecated and needsWorkStatus to draft.',
  };
}
