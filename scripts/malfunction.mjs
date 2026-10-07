import { MODULE_ID, VISIBILITY } from './constants.mjs';
import {
  configuration,
  validateMalf,
  triggers,
  outcome,
  PROCEDURES,
  CATEGORIES,
  maintenanceResult,
} from './malfunction-rules.mjs';
import { visibilityData, postReceiptSafely } from './operations.mjs';

const pending = new Map();
const locks = new Set();
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export async function withWeaponLock(actor, callback) {
  const key = actor?.uuid || actor?.id;
  if (locks.has(key))
    throw new Error('An ammunition or weapon-condition action is already running for this actor.');
  locks.add(key);
  try {
    return await callback();
  } finally {
    locks.delete(key);
  }
}
export function conditionPath(attack, input) {
  const c = configuration(input);
  const identity =
    c.weaponKey || attack?.uuid || JSON.stringify([attack?.name || '', attack?.mode || '']);
  // Encode every UTF-16 unit: no dots, prototype keys, or hash collisions in a flag path.
  const key = Array.from(identity, (ch) =>
    Array.from({ length: ch.length }, (_, i) =>
      ch.charCodeAt(i).toString(16).padStart(4, '0'),
    ).join(''),
  ).join('');
  return `flags.${MODULE_ID}.weaponConditions.w${key}`;
}
function memoryKey(actor, path) {
  return `${actor.uuid || actor.id}:${path}`;
}
export function weaponCondition(actor, attack, input) {
  if (!attack) return null;
  const path = conditionPath(attack, input);
  return pending.get(memoryKey(actor, path)) || foundry.utils.getProperty(actor, path) || null;
}
export function assertWeaponReady(actor, attack, input) {
  validateMalf(input);
  const state = weaponCondition(actor, attack, input);
  if (state?.blocking)
    throw new Error(
      `Weapon condition: ${state.kind}. Use Weapon condition before attacking again.`,
    );
}
export function conditionChange(actor, attack, input, state) {
  const path = conditionPath(attack, input);
  return {
    path,
    before: foundry.utils.getProperty(actor, path) ?? null,
    after: state,
    kind: 'weaponCondition',
  };
}
export function markApplied(actor, change) {
  if (change) pending.delete(memoryKey(actor, change.path));
}
async function dice(formula, records) {
  const roll = await new Roll(formula).evaluate();
  records.push(roll);
  return roll.total;
}
export async function resolveMalfunction(actor, attack, input, attackRoll) {
  const c = validateMalf(input);
  if (!c.enabled || c.category === 'thrown') return null;
  const rolls = [];
  let triggered = triggers(c, attackRoll.total);
  if (triggered === false) return null;
  const path = conditionPath(attack, c);
  pending.set(memoryKey(actor, path), {
    id: foundry.utils.randomID?.() || crypto.randomUUID(),
    kind: 'review',
    blocking: true,
    detail:
      'An attack occurred, but malfunction resolution has not finished. Check the original roll and correct ammunition before recording resolution.',
  });
  if (attackRoll.externalMalfunction) triggered = null;
  if (triggered === 'confirm') triggered = triggers(c, attackRoll.total, await dice('3d6', rolls));
  if (triggered === false) {
    pending.delete(memoryKey(actor, path));
    return {
      triggered: false,
      rolls,
      detail:
        'Reliability confirmation passed; no malfunction (HT79). Resolve the original attack normally.',
    };
  }
  let state;
  if (triggered === null || attackRoll.externalMalfunction) {
    state = {
      kind: 'review',
      blocking: true,
      fired: 0,
      spent: 0,
      ref: 'B407',
      detail: attackRoll.externalMalfunction
        ? 'Another system reported a malfunction. No second outcome was rolled; review its result and ammunition.'
        : 'The actual attack dice total was unavailable. No malfunction was guessed; review this attack and ammunition.',
    };
  } else {
    const table = ['mechanical', 'bow'].includes(c.category) ? null : await dice('3d6', rolls);
    state = { ...outcome(c, table), table };
    if (state.kind === 'delayed') state.delay = await dice('1d6', rolls);
    state.detail = `${state.kind}${state.delay ? `: detonation ${state.delay} seconds late` : ''}. ${state.fired} shot(s) fired. ${PROCEDURES[state.kind]}`;
    if (state.kind === 'stoppage')
      state.detail +=
        ' Resolve the one shot normally; discard any burst bonus and extra hits from the selected burst (B373, B407).';
    if (state.kind === 'explosion')
      state.detail +=
        c.explosion === 'warhead'
          ? ' Use the warhead damage.'
          : ' Explosion damage: 1d+2 cr ex [2d].';
  }
  state = {
    ...state,
    id: foundry.utils.randomID?.() || crypto.randomUUID(),
    attackTotal: attackRoll.total,
    category: c.category,
    diagnosed: false,
  };
  const change = conditionChange(actor, attack, c, state);
  pending.set(memoryKey(actor, change.path), state);
  return { triggered: true, state, change, rolls, detail: state.detail };
}
export async function reportMalfunction(actor, result, visibility, inherited, changes = []) {
  if (!result) return;
  await postReceiptSafely({
    actor,
    title: result.triggered ? 'Malfunction' : 'Reliability check',
    summary: result.detail,
    details: result.triggered
      ? [
          'Resolve only the malfunction, not an additional critical-miss result (GURPS 4e FAQ 3.4.2.4).',
          'Ammunition tracks usable rounds. Use Adjust for ejected rounds, charges, or weapon-specific exceptions.',
        ]
      : [],
    changes,
    force: true,
    rolls: result.rolls,
    visibility,
    inheritedVisibility: inherited,
  });
}
export function malfunctionPanel(actor, attack, input) {
  const c = configuration(input),
    state = weaponCondition(actor, attack, c);
  return `<section class="gga-ara-malfunction"><p><strong>Optional GURPS 4e malfunctions:</strong> ${c.enabled ? esc(CATEGORIES[c.category] || c.category) + ', Malf. ' + esc(c.value) : 'Off'}${state ? ' · Condition: ' + esc(state.kind) : ''}</p><button type="button" data-action="malf-configure">Malfunction settings</button>${state ? '<button type="button" data-action="malf-maintain">Weapon condition</button>' : ''}</section>`;
}
export async function configureMalfunction(input) {
  const c = configuration(input);
  const options = Object.entries(CATEGORIES)
    .map(
      ([value, label]) =>
        `<option value="${value}" ${c.category === value ? 'selected' : ''}>${label}</option>`,
    )
    .join('');
  const response = await foundry.applications.api.DialogV2.input({
    window: { title: 'Optional GURPS 4e malfunctions' },
    content: `<label><input name="enabled" type="checkbox" ${c.enabled ? 'checked' : ''}>Enable for this loadout</label>
      <label>Weapon category<select name="category">${options}</select></label>
      <label>Effective Malf.<input name="value" value="${esc(c.value)}"></label>
      <p>Enter all condition and quality modifiers yourself. B279 defaults: TL3 12; TL4 14; TL5 16; TL6+ 17. Low-Tech cheap mechanical weapons: 15; cheap bows/slings: 16 (LT75). Changing category does not change your value.</p>
      <p>18 triggers only on 18. 19+ and Ver. do not trigger. 17R means Malf.17 with a second 17+ confirmation roll (HT79); it is distinct from Ver.</p>
      <label>B407 explosion exception<select name="explosion">
      <option value="none" ${c.explosion === 'none' ? 'selected' : ''}>None (including TL5+)</option>
      <option value="powder" ${c.explosion === 'powder' ? 'selected' : ''}>Eligible TL3 firearm / TL4 grenade, breechloader, or repeater</option>
      <option value="warhead" ${c.explosion === 'warhead' ? 'selected' : ''}>Same eligible low-TL weapon, explosive warhead damage</option></select></label>
      <label>Shared weapon identifier (optional)<input name="weaponKey" value="${esc(c.weaponKey)}"></label>
      <p>Use the same identifier for every usage/loadout of one physical weapon. Otherwise condition follows the attack UUID, or its name and usage. Use a different identifier for a different weapon.</p>`,
    ok: { label: 'Apply to configuration' },
    rejectClose: false,
  });
  return response ? validateMalf(response) : null;
}
export async function maintainWeapon(actor, attack, input, visibility = VISIBILITY.INHERIT) {
  if (!actor?.isOwner && !game.user?.isGM) throw new Error('You do not own this actor.');
  return withWeaponLock(actor, async () => {
    const state = weaponCondition(actor, attack, input);
    if (!state) return;
    const response = await foundry.applications.api.DialogV2.input({
      window: { title: 'Weapon condition' },
      content: `<p><strong>${esc(state.kind)}</strong>: ${esc(PROCEDURES[state.kind])}</p>
      <p>Record work and rolls completed at the table. This does not advance turns, roll skills, apply damage, or refill ammunition.</p>
      <label>Action<select name="action"><option value="diagnose">Record diagnosis</option><option value="clear">Record clearing attempt</option><option value="repair">Record mechanical repair attempt</option><option value="resolved">Record GM-resolved consequences / replacement</option></select></label>
      <label>Completed roll/result<select name="result"><option value="success">Success</option><option value="failure">Failure</option><option value="critical">Critical failure</option></select></label>
      <label><input type="checkbox" name="completed">Required time, hands, skills, and any GM ruling have been resolved</label>`,
      ok: { label: 'Record result' },
      rejectClose: false,
    });
    if (!response?.completed) return;
    if (weaponCondition(actor, attack, input)?.id !== state.id)
      throw new Error('Weapon condition changed; review it again.');
    let after = maintenanceResult(state, response.action, response.result);
    if (after) after = { ...after, id: foundry.utils.randomID?.() || crypto.randomUUID() };
    const change = conditionChange(actor, attack, input, after);
    await actor.update({ [change.path]: after });
    markApplied(actor, change);
    await postReceiptSafely({
      actor,
      title: 'Weapon condition',
      summary: `${response.action}: ${response.result}. ${after ? after.kind : 'Condition resolved'}; ammunition unchanged.`,
      changes: [change],
      force: true,
      visibility,
    });
  });
}
