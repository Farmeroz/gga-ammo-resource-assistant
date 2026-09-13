import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attackLabel,
  automaticLowWarning,
  calculateAdjustment,
  calculateReload,
  calculateSpend,
  canUndo,
  enforcedMinimum,
  exportPayload,
  makeLoadout,
  maximumAffordableShots,
  parseImportPayload,
  parseRateOfFire,
  rangedAttackOtf,
  recordReference,
  resolveReference,
  trackerOptionLabels,
  validateLoadout,
} from '../scripts/core.mjs';

test('parses common GGA RoF values by their leading attack count', () => {
  assert.equal(parseRateOfFire('3'), 3);
  assert.equal(parseRateOfFire('3x9'), 3);
  assert.equal(parseRateOfFire('10!'), 10);
  assert.equal(parseRateOfFire('Jet'), 1);
  assert.equal(parseRateOfFire(''), 1);
});

test('uses attack mode in display labels and OtF', () => {
  const attack = { name: 'Carbine "Mk II"', mode: 'Burst' };
  assert.equal(attackLabel(attack), 'Carbine "Mk II" (Burst)');
  assert.equal(rangedAttackOtf(attack), '[R:\'Carbine "Mk II" (Burst)\']');
  assert.equal(
    rangedAttackOtf({ name: "Ranger's Carbine", mode: 'Single' }),
    '[R:"Ranger\'s Carbine (Single)"]',
  );
  assert.equal(
    rangedAttackOtf({ name: 'Ranger\'s "Betsy"', mode: 'Single' }),
    "[R:'Ranger\\'s \"Betsy\" (Single)']",
  );
});

test('only enforced tracker minima reserve unavailable resource', () => {
  assert.equal(enforcedMinimum({ min: 4, isMinimumEnforced: true }), 4);
  assert.equal(enforcedMinimum({ min: 4, isMinimumEnforced: false }), 0);
});

test('calculates shot and flat resource costs', () => {
  assert.equal(calculateSpend(3, 1, 0), 3);
  assert.equal(calculateSpend(3, 2, 1), 7);
  assert.equal(calculateSpend(0, 0, -1), 1);
});

test('calculates the maximum affordable shots', () => {
  assert.equal(maximumAffordableShots(10, 2, 1, 10), 4);
  assert.equal(maximumAffordableShots(1, 2, 1, 10), 0);
  assert.equal(maximumAffordableShots(100, 1, 0, 3), 3);
});

test('automatic warning is the cost of one full-RoF attack', () => {
  assert.equal(
    automaticLowWarning({ lowWarningAt: 0, unitsPerShot: 2, flatCost: 1 }, { rof: '3x9' }),
    7,
  );
  assert.equal(automaticLowWarning({ lowWarningAt: 4 }, { rof: '10' }), 4);
});

test('reload to full transfers atomically calculated values', () => {
  assert.deepEqual(
    calculateReload({
      current: 4,
      capacity: 15,
      reserve: 30,
      requested: 0,
      mode: 'to-full',
      hasReserve: true,
    }),
    {
      transferred: 11,
      ammoAfter: 15,
      reserveAfter: 19,
      shortfall: 0,
      availableSpace: 11,
    },
  );
});

test('reload never overfills and reports reserve shortfall', () => {
  assert.deepEqual(
    calculateReload({
      current: 4,
      capacity: 15,
      reserve: 3,
      requested: 20,
      mode: 'fixed',
      hasReserve: true,
    }),
    {
      transferred: 3,
      ammoAfter: 7,
      reserveAfter: 0,
      shortfall: 8,
      availableSpace: 11,
    },
  );
});

test('negative reserve cannot reverse a reload', () => {
  const result = calculateReload({
    current: 4,
    capacity: 15,
    reserve: -2,
    mode: 'to-full',
    hasReserve: true,
  });
  assert.equal(result.transferred, 0);
  assert.equal(result.ammoAfter, 4);
  assert.equal(result.reserveAfter, 0);
});

test('untracked replenishment fills without a reserve result', () => {
  const result = calculateReload({
    current: 4,
    capacity: 15,
    reserve: 0,
    mode: 'to-full',
    hasReserve: false,
  });
  assert.equal(result.transferred, 11);
  assert.equal(result.ammoAfter, 15);
  assert.equal(result.reserveAfter, null);
});

test('adjustments obey supplied limits', () => {
  assert.equal(calculateAdjustment(5, 'spend', 7, { minimum: 0 }), 0);
  assert.equal(calculateAdjustment(5, 'add', 7, { maximum: 10 }), 10);
  assert.equal(calculateAdjustment(5, 'set', 3), 3);
  assert.throws(() => calculateAdjustment(5, 'bogus', 1));
});

test('resolves a reference by path when identity agrees', () => {
  const records = [{ path: 'a', name: 'Magazine' }];
  assert.deepEqual(resolveReference(records, { path: 'a', name: 'Magazine' }), {
    record: records[0],
    relinked: false,
    ambiguous: false,
  });
});

test('does not trust a reused path with the wrong identity', () => {
  const records = [
    { path: 'a', name: 'Battery' },
    { path: 'b', name: 'Magazine' },
  ];
  assert.deepEqual(resolveReference(records, { path: 'a', name: 'Magazine' }), {
    record: records[1],
    relinked: true,
    ambiguous: false,
  });
});

test('relinks attacks using stable UUID before names', () => {
  const records = [{ path: 'new', name: 'Renamed', mode: 'Shot', uuid: 'attack-1' }];
  const result = resolveReference(
    records,
    { path: 'old', name: 'Old', mode: 'Shot', uuid: 'attack-1' },
    'attack',
  );
  assert.equal(result.record, records[0]);
  assert.equal(result.relinked, true);
});

test('refuses ambiguous exact-name fallbacks', () => {
  const records = [
    { path: 'a', name: 'Magazine' },
    { path: 'b', name: 'Magazine' },
  ];
  assert.deepEqual(resolveReference(records, { path: 'old', name: 'Magazine' }), {
    record: null,
    relinked: false,
    ambiguous: true,
  });
});

test('records attack identity including mode', () => {
  assert.deepEqual(
    recordReference({ path: 'ranged.0', name: 'Pistol', mode: 'Burst', uuid: 'u1' }, 'attack'),
    {
      path: 'ranged.0',
      name: 'Pistol',
      uuid: 'u1',
      mode: 'Burst',
    },
  );
});

test('tracker choices show values and paths only for duplicate names', () => {
  const labelled = trackerOptionLabels([
    { path: 'tracker.0', name: 'Magazine', value: 8, max: 15 },
    { path: 'tracker.1', name: 'Magazine', value: 3, max: 15 },
    { path: 'tracker.2', name: 'Reserve', value: 40, max: 100 },
  ]);
  assert.equal(labelled[0].label, 'Magazine · 8 / 15 [tracker.0]');
  assert.equal(labelled[1].label, 'Magazine · 3 / 15 [tracker.1]');
  assert.equal(labelled[2].label, 'Reserve · 40 / 100');
});

test('normalises and validates loadouts', () => {
  const loadout = makeLoadout(
    {
      name: 'Pistol',
      attack: { name: 'Pistol', path: 'ranged.0' },
      ammo: { name: 'Magazine', path: 'additionalresources.tracker.0000' },
      shots: 3,
      unitsPerShot: 1,
    },
    () => 'fixed-id',
  );
  assert.equal(loadout.id, 'fixed-id');
  assert.deepEqual(validateLoadout(loadout, { maximumRof: 3 }), []);
  assert.deepEqual(validateLoadout({ ...loadout, shots: 4 }, { maximumRof: 3 }), [
    'Shots cannot exceed RoF 3.',
  ]);
});

test('detects an invalid same-tracker reserve', () => {
  const loadout = makeLoadout(
    {
      name: 'Pistol',
      attack: { name: 'Pistol', path: 'ranged.0' },
      ammo: { name: 'Magazine', path: 'tracker.0' },
      reserve: { name: 'Magazine', path: 'tracker.0' },
    },
    () => 'id',
  );
  assert.match(validateLoadout(loadout).join(' '), /must be different/);
});

test('undo guard accepts only unchanged after-values', () => {
  const current = new Map([
    ['system.a', 3],
    ['system.b', 8],
  ]);
  const changes = [
    { path: 'system.a', before: 5, after: 3 },
    { path: 'system.b', before: 10, after: 8 },
  ];
  assert.equal(
    canUndo(changes, (path) => current.get(path)),
    true,
  );
  current.set('system.b', 7);
  assert.equal(
    canUndo(changes, (path) => current.get(path)),
    false,
  );
});

test('exports and imports loadouts without preserving imported IDs', () => {
  const original = makeLoadout(
    {
      name: 'Rifle',
      attack: { name: 'Rifle', path: 'ranged.0' },
      ammo: { name: 'Magazine', path: 'tracker.0' },
    },
    () => 'old-id',
  );
  const payload = exportPayload('Tester', [original]);
  const imported = parseImportPayload(payload, () => 'new-id');
  assert.equal(payload.type, 'gga-ammo-resource-assistant-loadouts');
  assert.equal(imported[0].id, 'new-id');
  assert.equal(imported[0].name, 'Rifle');
});

test('rejects unrelated import files', () => {
  assert.throws(() => parseImportPayload({ type: 'other', loadouts: [] }), /not an Ammunition/);
});
