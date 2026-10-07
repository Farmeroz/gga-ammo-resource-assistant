// GURPS Fourth Edition: B279–280, B407; Low-Tech 75; High-Tech 79.
export const CATEGORIES = Object.freeze({
  firearm: 'Firearm',
  revolver: 'Revolver',
  beam: 'Beam weapon',
  grenade: 'Grenade',
  incendiary: 'Incendiary (single-use)',
  single: 'Other single-use weapon',
  mechanical: 'Cheap mechanical missile weapon (Low-Tech)',
  bow: 'Cheap bow or sling (Low-Tech)',
  thrown: 'Ordinary thrown weapon (unaffected)',
});
export function configuration(input = {}) {
  return {
    enabled: input.enabled === true,
    value: String(input.value ?? '17').trim(),
    category: input.category ?? 'firearm',
    explosion: input.explosion ?? 'none',
    weaponKey: String(input.weaponKey ?? '').trim(),
  };
}
export function parseMalf(value) {
  const text = String(value).trim().toLowerCase();
  if (['ver', 'ver.', 'very reliable'].includes(text)) return { threshold: Infinity, confirm: false };
  if (text === '17r') return { threshold: 17, confirm: true };
  if (!/^\d+$/.test(text) || Number(text) < 3 || Number(text) > 99)
    throw new Error('Malf. must be a whole number from 3 to 99, Ver., or 17R (High-Tech reliability confirmation).');
  return { threshold: Number(text), confirm: false };
}
export function validateMalf(input) {
  const c = configuration(input);
  if (!c.enabled) return c;
  parseMalf(c.value);
  if (!Object.hasOwn(CATEGORIES, c.category)) throw new Error('Choose a supported weapon category.');
  if (!['none', 'powder', 'warhead'].includes(c.explosion)) throw new Error('Choose an explosion rule.');
  if (['mechanical', 'bow', 'thrown', 'beam'].includes(c.category) && c.explosion !== 'none')
    throw new Error('This category does not use the B407 explosion option.');
  return c;
}
export function attackTotal(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 3 && value <= 18 ? value : null;
}
export function triggers(input, total, confirmation = null) {
  const c = validateMalf(input);
  if (!c.enabled || c.category === 'thrown') return false;
  const rule = parseMalf(c.value);
  if (rule.threshold > 18) return false;
  if (attackTotal(total) === null) return null;
  if (total < rule.threshold) return false;
  if (rule.confirm && attackTotal(confirmation) === null) return 'confirm';
  return !rule.confirm || confirmation >= rule.threshold;
}
export function outcome(input, tableTotal) {
  const c = validateMalf(input);
  const single = ['grenade', 'incendiary', 'single'].includes(c.category);
  if (c.category === 'mechanical') return { kind: 'jam', fired: 0, spent: 0, blocking: true, ref: 'LT75' };
  if (c.category === 'bow') return { kind: 'broken', fired: 0, spent: 0, blocking: true, ref: 'LT75' };
  if (attackTotal(tableTotal) === null) throw new Error('Invalid 3d malfunction table result.');
  let kind = tableTotal <= 4 || tableTotal >= 15 ? 'mechanical' : tableTotal >= 9 && tableTotal <= 11 ? 'stoppage' : 'misfire';
  if (tableTotal >= 15 && c.explosion !== 'none') kind = 'explosion';
  else if (c.category === 'grenade' && kind === 'mechanical') kind = 'delayed';
  else if (single && (kind === 'stoppage' || kind === 'misfire')) kind = 'dud';
  else if (c.category === 'beam' && kind === 'stoppage') kind = 'mechanical';
  else if (c.category === 'revolver' && kind === 'misfire') kind = 'revolver-misfire';
  return {
    kind,
    fired: kind === 'stoppage' ? 1 : 0,
    // Usable-ammunition convention: remove a dud round/device, retain unfired usable rounds.
    spent: single || ['stoppage', 'misfire', 'revolver-misfire', 'explosion'].includes(kind) ? 1 : 0,
    blocking: !single && kind !== 'revolver-misfire',
    ref: 'B407',
  };
}
export const PROCEDURES = Object.freeze({
  mechanical: 'Diagnose: one Ready and Armoury or IQ-based weapon skill. Repair: Armoury, one hour per attempt; critical failure destroys the weapon (B407).',
  misfire: 'Diagnose: one Ready and Armoury+2 or IQ-based weapon skill. Clear: three Ready manoeuvres, two free hands, same roll; critical failure becomes mechanical trouble (B407).',
  stoppage: 'Clear: three Ready manoeuvres, two free hands; Armoury or IQ-based weapon skill-4. Critical failure becomes mechanical trouble (B407).',
  jam: 'Low-Tech specifies a jam, but gives no universal clearing procedure here. Apply the weapon-specific rule or GM ruling (LT75).',
  broken: 'Broken weapon. Record a completed repair or replacement after resolving it with the GM (LT75; B484).',
  explosion: 'Resolve explosion, injury, and weapon loss with the GM. This action does not apply damage (B407).',
  delayed: 'Resolve the delayed detonation at the table. This record does not advance time (B407).',
  dud: 'This device is unusable. The remaining supply is unaffected (B407).',
  'revolver-misfire': 'The next revolver shot can fire normally; the failed round is removed from usable ammunition (B407).',
  review: 'Check the original attack and any external resolution with the GM. Correct ammunition with Adjust before recording resolution.',
});
export function maintenanceResult(state, action, result) {
  if (!state) throw new Error('No weapon condition is recorded.');
  if (!['success', 'failure', 'critical'].includes(result)) throw new Error('Choose the result of the completed roll.');
  if (action === 'diagnose') {
    if (!['mechanical', 'misfire'].includes(state.kind)) throw new Error('This condition needs no diagnosis.');
    return result === 'success' ? { ...state, diagnosed: true } : state;
  }
  if (action === 'clear') {
    if (!['misfire', 'stoppage', 'jam'].includes(state.kind)) throw new Error('This condition cannot be cleared as a stoppage.');
    if (state.kind === 'misfire' && !state.diagnosed) throw new Error('Diagnose the misfire before clearing it.');
    if (result === 'success') return null;
    if (result === 'critical' && state.kind !== 'jam') return { ...state, kind: 'mechanical', diagnosed: false, blocking: true };
    return state;
  }
  if (action === 'repair') {
    if (state.kind !== 'mechanical' || !state.diagnosed) throw new Error('Diagnose the mechanical problem before recording a repair roll.');
    if (result === 'success') return null;
    return result === 'critical' ? { ...state, kind: 'broken', blocking: true } : state;
  }
  if (action === 'resolved') return result === 'success' ? null : state;
  throw new Error('Unknown maintenance action.');
}
