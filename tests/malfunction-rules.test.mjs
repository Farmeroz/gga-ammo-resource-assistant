import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configuration,
  triggers,
  outcome,
  parseMalf,
  maintenanceResult,
} from '../scripts/malfunction-rules.mjs';
const config = (category = 'firearm', value = '17') => ({ enabled: true, category, value });
test('malfunction thresholds use dice totals independently of critical-miss status', () => {
  for (let malf = 3; malf <= 20; malf++)
    for (let total = 3; total <= 18; total++)
      assert.equal(triggers(config('firearm', String(malf)), total), total >= malf);
  assert.equal(triggers(configuration(), 18), false);
  assert.equal(triggers(config('thrown', '3'), 18), false);
  assert.equal(triggers(config('firearm', 'Ver.'), 18), false);
  assert.equal(triggers(config(), undefined), null);
  assert.equal(triggers(config(), '18'), null);
  assert.equal(triggers(config(), 0), null);
});
test('HT79 confirmation is distinct from numeric 18 and Very Reliable', () => {
  assert.equal(triggers(config('firearm', '17R'), 16), false);
  assert.equal(triggers(config('firearm', '17R'), 17), 'confirm');
  assert.equal(triggers(config('firearm', '17R'), 18, 16), false);
  assert.equal(triggers(config('firearm', '17R'), 17, 17), true);
  assert.equal(triggers(config('firearm', '18'), 18), true);
  for (const bad of ['', '17junk', '17.5', 'Crit', '17+', 'Infinity', '-1'])
    assert.throws(() => parseMalf(bad));
});
test('every B407 table entry has the correct outcome and no burst-wide expenditure', () => {
  for (let n = 3; n <= 18; n++) {
    const r = outcome(config(), n);
    const expected = n <= 4 || n >= 15 ? 'mechanical' : n >= 9 && n <= 11 ? 'stoppage' : 'misfire';
    assert.equal(r.kind, expected);
    assert.equal(r.fired, expected === 'stoppage' ? 1 : 0);
    assert.equal(r.spent, expected === 'mechanical' ? 0 : 1);
  }
});
test('grenades, revolvers, beam weapons, single-use and Low-Tech exceptions', () => {
  assert.equal(outcome(config('grenade'), 3).kind, 'delayed');
  assert.equal(outcome(config('grenade'), 18).kind, 'delayed');
  for (const category of ['grenade', 'single', 'incendiary']) {
    for (const total of [5, 9, 14]) {
      const r = outcome(config(category), total);
      assert.equal(r.kind, 'dud');
      assert.equal(r.spent, 1);
      assert.equal(r.blocking, false);
    }
  }
  assert.equal(outcome(config('revolver'), 5).blocking, false);
  assert.equal(outcome(config('revolver'), 9).kind, 'stoppage');
  assert.equal(outcome(config('beam'), 9).kind, 'mechanical');
  assert.equal(outcome(config('beam'), 9).fired, 0);
  assert.equal(outcome(config('mechanical', '15')).kind, 'jam');
  assert.equal(outcome(config('bow', '16')).kind, 'broken');
  assert.equal(outcome({ ...config(), explosion: 'powder' }, 15).kind, 'explosion');
  assert.equal(outcome({ ...config(), explosion: 'powder' }, 4).kind, 'mechanical');
});
test('recorded clearing and repair failures persist and critical failures escalate', () => {
  let state = { kind: 'misfire', blocking: true, diagnosed: false };
  assert.throws(() => maintenanceResult(state, 'clear', 'success'));
  state = maintenanceResult(state, 'diagnose', 'success');
  assert.equal(state.diagnosed, true);
  assert.equal(maintenanceResult(state, 'clear', 'failure'), state);
  state = maintenanceResult(state, 'clear', 'critical');
  assert.equal(state.kind, 'mechanical');
  assert.throws(() => maintenanceResult(state, 'repair', 'success'));
  state = maintenanceResult(state, 'diagnose', 'success');
  assert.equal(maintenanceResult(state, 'repair', 'success'), null);
  assert.equal(maintenanceResult(state, 'repair', 'critical').kind, 'broken');
});
