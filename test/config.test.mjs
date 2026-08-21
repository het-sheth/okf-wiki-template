import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOkfConfig, DEFAULT_CONCEPT_TYPES, DEFAULT_STATUS_VALUES, SPEC_STATUS_VALUES,
} from '../lib/config.mjs';

test('an absent okf block reproduces current behavior', () => {
  const c = resolveOkfConfig();
  assert.deepEqual(c.conceptTypes, DEFAULT_CONCEPT_TYPES);
  assert.deepEqual(c.statusValues, DEFAULT_STATUS_VALUES);
  assert.equal(c.needsWorkStatus, 'stub', 'the muted card class must keep its current trigger');
  assert.equal(c.statusDefault, null, 'the legacy vocabulary has no stable, so no silent default');
  assert.equal(c.federation, false);
  assert.equal(c.archival, false);
  assert.equal(c.title, null);
});

test('legacy defaults are the current vocabulary, not the spec one', () => {
  assert.deepEqual(DEFAULT_STATUS_VALUES, ['stub', 'learning', 'researched', 'solid']);
  assert.deepEqual(SPEC_STATUS_VALUES, ['draft', 'stable', 'deprecated']);
});

test('federation and title are preserved from the existing okf block', () => {
  const c = resolveOkfConfig({ federation: true, title: 'My Wiki' });
  assert.equal(c.federation, true);
  assert.equal(c.title, 'My Wiki');
});

test('conceptTypes and statusValues are overridable', () => {
  const c = resolveOkfConfig({ conceptTypes: ['lesson'], statusValues: ['wip', 'done'] });
  assert.deepEqual(c.conceptTypes, ['lesson']);
  assert.deepEqual(c.statusValues, ['wip', 'done']);
});

test('statusDefault resolves to stable when the vocabulary has it', () => {
  assert.equal(resolveOkfConfig({ statusValues: SPEC_STATUS_VALUES }).statusDefault, 'stable');
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'] }).statusDefault, null);
});

test('an explicit statusDefault must be in the vocabulary', () => {
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'], statusDefault: 'wip' }).statusDefault, 'wip');
  assert.throws(() => resolveOkfConfig({ statusValues: ['wip'], statusDefault: 'nope' }), /statusDefault/);
});

test('needsWorkStatus defaults to the first vocabulary value when stub is absent', () => {
  assert.equal(resolveOkfConfig({ statusValues: SPEC_STATUS_VALUES }).needsWorkStatus, 'draft');
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'] }).needsWorkStatus, 'wip');
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'], needsWorkStatus: 'done' }).needsWorkStatus, 'done');
  assert.equal(resolveOkfConfig({ needsWorkStatus: null }).needsWorkStatus, null);
  assert.throws(() => resolveOkfConfig({ statusValues: ['wip'], needsWorkStatus: 'ghost' }), /needsWorkStatus/);
});

test('archival is an explicit boolean, not derived from the vocabulary', () => {
  assert.equal(resolveOkfConfig({ statusValues: SPEC_STATUS_VALUES }).archival, false);
  assert.equal(resolveOkfConfig({ archival: true }).archival, true);
  assert.throws(() => resolveOkfConfig({ archival: 'yes' }), /archival/);
});

test('malformed input throws', () => {
  assert.throws(() => resolveOkfConfig([]), /must be an object/);
  assert.throws(() => resolveOkfConfig({ conceptTypes: [] }), /conceptTypes/);
  assert.throws(() => resolveOkfConfig({ federation: 'yes' }), /federation/);
});
