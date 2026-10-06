import test from 'node:test';
import assert from 'node:assert/strict';
import {
  objectThrow,
  basicLift,
  quickPenalty,
  drawPenalty,
  throwPenalty,
  checkAccess,
} from '../scripts/action-rules.mjs';
const base = { st: 10, dx: 12, bl: 20, weight: 2.5, method: 'throwing', level: 14, thrust: '1d-2' };
test('throwing skill modifies the final ST multiplier, not BL or distance-table row (B356)', () => {
  const r = objectThrow(base);
  assert.equal(r.factor, 2);
  assert.equal(r.distance, 24);
  assert.equal(r.bonus, 2);
});
test('trained area throwing does not gain a blanket +3; untrained area uses DX', () => {
  assert.equal(objectThrow({ ...base, area: true }).level, 14);
  assert.equal(objectThrow({ ...base, method: 'dx', area: true }).level, 12);
  assert.equal(objectThrow({ ...base, method: 'dx', area: false }).level, 9);
});
test('weight units, one/two-hand boundary and maximum throw weight are explicit', () => {
  assert.equal(objectThrow({ ...base, weight: 40 }).hands, 1);
  assert.equal(objectThrow({ ...base, weight: 41 }).hands, 2);
  assert.throws(() => objectThrow({ ...base, weight: 161 }), /8 ×/);
  assert.equal(objectThrow({ ...base, weight: 2.5 * 0.45359237, unit: 'kg' }).distance, 24);
});
test('Throwing Art profiles use their specific damage before per-die bonus (B226)', () => {
  assert.equal(objectThrow({ ...base, method: 'art', profile: 'pencil' }).damage, '1d-3');
  assert.equal(objectThrow({ ...base, method: 'art', profile: 'blunt' }).damage, '1d+1');
  assert.equal(
    objectThrow({ ...base, method: 'art', profile: 'bat', swing: '2d+1' }).damage,
    '2d+6',
  );
  assert.throws(() => objectThrow({ ...base, profile: 'pencil' }), /Throwing Art/);
});
test('damage weight bands preserve per-die adjustments and fractional Basic Lift', () => {
  assert.equal(basicLift(3), 1.8);
  assert.equal(objectThrow({ ...base, weight: 2.5 }).damage, '1d-4');
  assert.equal(objectThrow({ ...base, weight: 5 }).damage, '1d-3');
  assert.equal(objectThrow({ ...base, weight: 10 }).damage, '1d-2');
  assert.equal(objectThrow({ ...base, weight: 20 }).damage, '1d-1');
  assert.equal(objectThrow({ ...base, weight: 80, thrust: '3d-1' }).damage, '3d-2');
});
test('Heroic Archer and Weapon Master stack only on applicable penalties', () => {
  assert.deepEqual(
    [
      quickPenalty(false, false),
      quickPenalty(true, false),
      quickPenalty(false, true),
      quickPenalty(true, true),
    ],
    [-6, -3, -3, -1],
  );
  assert.equal(drawPenalty({ simultaneous: 2, heroic: true, master: true }), -1);
  assert.equal(drawPenalty({ previous: 1, master: true, situational: -4 }), -5);
  assert.equal(drawPenalty({ previous: 1, heroic: true, master: true, situational: -4 }), -2);
});
test('Heroic Thrower multiple attacks count each hand separately', () => {
  assert.equal(throwPenalty(3, { heroic: true, bothHands: true }), -8);
  assert.equal(throwPenalty(2, { heroic: true, bothHands: true }), -5);
  assert.equal(throwPenalty(3, { heroic: true, master: true, bothHands: true }), -3);
});
test('unmet rules are advisory and require no permission checkbox or reason', () => {
  const checks = [{ ok: false, label: 'Missing skill' }];
  assert.equal(checkAccess(checks).allowed, true);
  assert.deepEqual(checkAccess(checks).failed, checks);
  assert.deepEqual(checkAccess([{ ok: true, label: 'Present' }]).failed, []);
});
