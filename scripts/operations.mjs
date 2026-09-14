import * as log from './log.mjs';
import { MODULE_ID, FLAG_RECEIPT, SETTINGS, VISIBILITY } from './constants.mjs';
import {
  attackLabel,
  automaticLowWarning,
  calculateAdjustment,
  calculateReload,
  calculateSpend,
  canUndo,
  enforcedMinimum,
  finiteNumber,
  maximumAffordableShots,
  parseRateOfFire,
  recordReference,
  resolveReference,
  wholeNumber,
} from './core.mjs';
import {
  actorFromUuid,
  collectRangedAttacks,
  collectResourceTrackers,
  rollRangedAttack,
  trackerValue,
} from './gga-adapter.mjs';
import { upsertLoadout } from './store.mjs';

function escapeHtml(value) {
  if (foundry?.utils?.escapeHTML) return foundry.utils.escapeHTML(String(value ?? ''));
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character],
  );
}

function notifyError(error) {
  log.error(error);
  ui.notifications.error(error?.message || String(error));
}

function assertOwnership(actor) {
  if (!actor) throw new Error('No actor was found. Select one token or assign a user character.');
  if (!actor.isOwner && !game.user?.isGM) throw new Error(`You do not own ${actor.name}.`);
}

function resolveLoadoutRecords(actor, loadout, { needsReserve = false } = {}) {
  const attacks = collectRangedAttacks(actor);
  const trackers = collectResourceTrackers(actor);
  const attackResult = resolveReference(attacks, loadout.attack, 'attack');
  const ammoResult = resolveReference(trackers, loadout.ammo, 'tracker');
  const reserveResult = loadout.reserve
    ? resolveReference(trackers, loadout.reserve, 'tracker')
    : { record: null, relinked: false, ambiguous: false };

  if (!attackResult.record) {
    throw new Error(
      attackResult.ambiguous
        ? 'The saved ranged attack is now ambiguous. Open Loadouts and relink it.'
        : 'The saved ranged attack was not found. Open Loadouts and relink it.',
    );
  }
  if (!ammoResult.record) {
    throw new Error(
      ammoResult.ambiguous
        ? 'The saved ammunition tracker is now ambiguous. Open Loadouts and relink it.'
        : 'The saved ammunition tracker was not found. Open Loadouts and relink it.',
    );
  }
  if (needsReserve && loadout.reserve && !reserveResult.record) {
    throw new Error(
      reserveResult.ambiguous
        ? 'The saved reserve tracker is now ambiguous. Open Loadouts and relink it.'
        : 'The saved reserve tracker was not found. Open Loadouts and relink it.',
    );
  }
  if (reserveResult.record?.path === ammoResult.record.path) {
    throw new Error('The magazine and reserve trackers must be different.');
  }

  return { attacks, trackers, attackResult, ammoResult, reserveResult };
}

async function repairReferences(actor, loadout, resolved) {
  if (
    !resolved.attackResult.relinked &&
    !resolved.ammoResult.relinked &&
    !resolved.reserveResult.relinked
  )
    return loadout;
  const repaired = {
    ...loadout,
    attack: recordReference(resolved.attackResult.record, 'attack'),
    ammo: recordReference(resolved.ammoResult.record),
    reserve: resolved.reserveResult.record ? recordReference(resolved.reserveResult.record) : null,
  };
  try {
    return await upsertLoadout(actor, repaired);
  } catch (error) {
    log.warn('Loadout ran successfully but its repaired references could not be saved.', error);
    return repaired;
  }
}

async function chooseShots({ maximum, available, initial }) {
  const max = Math.max(Math.min(maximum, available), 1);
  const content = `
    <div class="gga-ara-quick-prompt">
      <p><strong>${available}</strong> ammunition available. Choose 1–${max} shots.</p>
      <input name="shots" type="number" min="1" max="${max}" step="1" value="${Math.min(initial, max)}" autofocus>
    </div>`;
  const result = await foundry.applications.api.DialogV2.input({
    classes: ['gga-ara-help-dialog'],
    window: { title: 'Shots to Fire' },
    content,
    ok: { label: 'Continue' },
    rejectClose: false,
    modal: true,
  });
  if (!result) return null;
  return Math.max(1, Math.min(wholeNumber(result.shots, initial, 1), max));
}

async function chooseInsufficientAction({
  requestedShots,
  affordableShots,
  available,
  allowOverride,
}) {
  const buttons = [];
  if (affordableShots > 0) {
    buttons.push({
      action: 'available',
      icon: 'fa-solid fa-bullseye',
      label: `Fire ${affordableShots} available shot${affordableShots === 1 ? '' : 's'}`,
      callback: () => 'available',
    });
  }
  if (allowOverride) {
    buttons.push({
      action: 'override',
      icon: 'fa-solid fa-triangle-exclamation',
      label: `GM override: fire ${requestedShots}`,
      callback: () => 'override',
    });
  }
  buttons.push({
    action: 'cancel',
    icon: 'fa-solid fa-xmark',
    label: 'Cancel',
    default: true,
    callback: () => 'cancel',
  });

  return foundry.applications.api.DialogV2.wait({
    classes: ['gga-ara-help-dialog'],
    window: { title: 'Not Enough Ammunition' },
    content: `<p>The configured attack needs more ammunition than is available.</p>
      <dl class="gga-ara-facts">
        <dt>Shots requested</dt><dd>${requestedShots}</dd>
        <dt>Ammunition available</dt><dd>${available}</dd>
      </dl>`,
    buttons,
    rejectClose: false,
    modal: true,
  });
}

function visibilityData(visibility, inherited = null) {
  const data = {};
  if (visibility === VISIBILITY.INHERIT && inherited) {
    if (inherited.whisper?.length) data.whisper = inherited.whisper;
    if (inherited.blind) data.blind = true;
    return data;
  }

  const resolved =
    visibility === VISIBILITY.INHERIT
      ? game.settings.get(MODULE_ID, SETTINGS.DEFAULT_VISIBILITY)
      : visibility;

  if (resolved === VISIBILITY.PUBLIC) return data;
  if (resolved === VISIBILITY.SELF) return { whisper: [game.user.id] };
  if (resolved === VISIBILITY.GM) {
    const recipients = new Set([
      game.user.id,
      ...ChatMessage.getWhisperRecipients('GM').map((user) => user.id),
    ]);
    return { whisper: Array.from(recipients) };
  }

  const rollModeSetting = game.release?.generation >= 14 ? 'messageMode' : 'rollMode';
  const rollMode = game.settings.get('core', rollModeSetting);
  ChatMessage.applyRollMode(data, rollMode);
  return data;
}

async function postReceipt({
  actor,
  title,
  summary,
  details = [],
  changes,
  warning = '',
  visibility,
  inheritedVisibility,
}) {
  if (!game.settings.get(MODULE_ID, SETTINGS.CHAT_RECEIPTS)) return null;
  const detailHtml = details
    .filter(Boolean)
    .map((detail) => `<span>${escapeHtml(detail)}</span>`)
    .join('');
  const content = `
    <section class="gga-ara-receipt">
      <header><i class="fa-solid fa-bullseye"></i><strong>${escapeHtml(title)}</strong></header>
      <div class="gga-ara-receipt-summary">${escapeHtml(summary)}</div>
      ${detailHtml ? `<div class="gga-ara-receipt-details">${detailHtml}</div>` : ''}
      ${warning ? `<div class="gga-ara-receipt-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(warning)}</div>` : ''}
      <footer>
        <button type="button" data-gga-ara-action="undo"><i class="fa-solid fa-rotate-left"></i> Undo</button>
        <span class="gga-ara-undone" hidden>Undone</span>
      </footer>
    </section>`;
  const messageData = {
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: {
      [MODULE_ID]: {
        [FLAG_RECEIPT]: {
          actorUuid: actor.uuid,
          userId: game.user.id,
          changes,
          undone: false,
        },
      },
    },
    ...visibilityData(visibility, inheritedVisibility),
  };
  return ChatMessage.create(messageData);
}

async function postReceiptSafely(options) {
  try {
    return await postReceipt(options);
  } catch (error) {
    log.error('The resource changed, but its chat receipt could not be posted.', error);
    ui.notifications.warn(
      'The resource was updated, but its chat receipt could not be posted. Undo is unavailable for this change.',
    );
    return null;
  }
}

async function postCompatibilityWarning(actor, loadout) {
  const content = `<section class="gga-ara-receipt">
    <header><i class="fa-solid fa-triangle-exclamation"></i><strong>Ammunition not deducted</strong></header>
    <div>The ${escapeHtml(attackLabel(loadout.attack))} attack was rolled, but the GGA shot choice could not be captured safely. Adjust the tracker manually.</div>
  </section>`;
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    ...visibilityData(VISIBILITY.GM),
  });
}

export async function executeFire({
  actor,
  loadout,
  shots = null,
  promptIfConfigured = true,
} = {}) {
  try {
    assertOwnership(actor);
    let resolved = resolveLoadoutRecords(actor, loadout);
    loadout = await repairReferences(actor, loadout, resolved);
    resolved = resolveLoadoutRecords(actor, loadout);
    const attack = resolved.attackResult.record;
    const ammo = resolved.ammoResult.record;
    const minimum = enforcedMinimum(ammo);

    const duplicates = resolved.attacks.filter(
      (candidate) => attackLabel(candidate) === attackLabel(attack),
    );
    if (duplicates.length > 1) {
      throw new Error(
        `More than one ranged attack is named ${attackLabel(attack)}. Give the usages distinct names or modes in GGA.`,
      );
    }

    const maximumRof = parseRateOfFire(attack.rof);
    const available = Math.max(trackerValue(actor, ammo.path) - minimum, 0);
    const maxAffordable = maximumAffordableShots(
      available,
      loadout.unitsPerShot,
      loadout.flatCost,
      maximumRof,
    );

    let chosenShots =
      shots == null ? wholeNumber(loadout.shots, maximumRof, 1) : wholeNumber(shots, 1, 1);
    chosenShots = Math.min(chosenShots, maximumRof);
    if (shots == null && promptIfConfigured && loadout.hotbarShotMode === 'ask' && maximumRof > 1) {
      if (maxAffordable < 1) {
        ui.notifications.warn(`${ammo.name} is empty.`);
        return { ok: false, reason: 'empty' };
      }
      chosenShots = await chooseShots({
        maximum: maximumRof,
        available: maxAffordable,
        initial: chosenShots,
      });
      if (chosenShots == null) return { ok: false, reason: 'cancelled' };
    }

    let cost = calculateSpend(chosenShots, loadout.unitsPerShot, loadout.flatCost);
    let overrideShortage = false;
    if (available < cost) {
      const decision = await chooseInsufficientAction({
        requestedShots: chosenShots,
        affordableShots: maxAffordable,
        available,
        allowOverride: Boolean(
          game.user.isGM && game.settings.get(MODULE_ID, SETTINGS.GM_OVERRIDES),
        ),
      });
      if (decision === 'available') {
        chosenShots = maxAffordable;
        cost = calculateSpend(chosenShots, loadout.unitsPerShot, loadout.flatCost);
      } else if (decision === 'override') {
        overrideShortage = true;
      } else {
        return { ok: false, reason: 'cancelled' };
      }
    }

    const roll = await rollRangedAttack(actor, attack, chosenShots);
    if (!roll.rolled) {
      ui.notifications.warn(
        'The attack was cancelled or could not be rolled. No ammunition was spent.',
      );
      return { ok: false, reason: 'not-rolled' };
    }
    if (roll.promptExpected && !roll.promptSeen) {
      await postCompatibilityWarning(actor, loadout);
      ui.notifications.error(
        'The attack rolled, but its shot count was not captured. Ammunition was not changed.',
      );
      return { ok: false, reason: 'compatibility' };
    }

    const current = trackerValue(actor, ammo.path);
    const spendable = Math.max(current - minimum, 0);
    const after = overrideShortage ? current - cost : Math.max(current - cost, minimum);
    const shortage = Math.max(cost - spendable, 0);
    const updatePath = `system.${ammo.path}.value`;
    await actor.update({ [updatePath]: after });

    const threshold = automaticLowWarning(loadout, attack);
    const warnings = [];
    if (shortage > 0) warnings.push(`The attack exceeded the ammunition available by ${shortage}.`);
    const remaining = Math.max(after - minimum, 0);
    if (threshold > 0 && remaining <= threshold)
      warnings.push(`${ammo.name} is low: ${remaining} available.`);

    await postReceiptSafely({
      actor,
      title: attackLabel(attack),
      summary: `${ammo.name}: ${current} → ${after}`,
      details: [
        `${chosenShots} shot${chosenShots === 1 ? '' : 's'}`,
        cost === chosenShots ? '' : `${cost} resource units spent`,
      ],
      changes: [{ path: updatePath, before: current, after }],
      warning: warnings.join('  '),
      visibility: loadout.visibility,
      inheritedVisibility: roll.visibility,
    });

    return { ok: true, shots: chosenShots, spent: cost, before: current, after };
  } catch (error) {
    notifyError(error);
    return { ok: false, reason: 'error', error };
  }
}

export async function executeReload({ actor, loadout, amount = null } = {}) {
  try {
    assertOwnership(actor);
    let resolved = resolveLoadoutRecords(actor, loadout, { needsReserve: true });
    loadout = await repairReferences(actor, loadout, resolved);
    resolved = resolveLoadoutRecords(actor, loadout, { needsReserve: true });
    const attack = resolved.attackResult.record;
    const ammo = resolved.ammoResult.record;
    const reserve = resolved.reserveResult.record;
    if (ammo.max <= 0)
      throw new Error(`${ammo.name} needs a maximum value before it can be reloaded.`);

    const ammoBefore = Math.max(trackerValue(actor, ammo.path), 0);
    const reserveBefore = reserve ? trackerValue(actor, reserve.path) : null;
    const reserveAvailable = reserve ? Math.max(reserveBefore - enforcedMinimum(reserve), 0) : null;
    const calculated = calculateReload({
      current: ammoBefore,
      capacity: ammo.max,
      reserve: reserveAvailable,
      requested: amount ?? loadout.reloadAmount,
      mode: amount == null ? loadout.reloadMode : 'fixed',
      hasReserve: Boolean(reserve),
    });
    const reload = {
      ...calculated,
      reserveAfter: reserve ? reserveBefore - calculated.transferred : null,
    };
    if (reload.transferred <= 0) {
      ui.notifications.info(
        reload.availableSpace <= 0
          ? `${ammo.name} is already full.`
          : 'No reserve ammunition is available.',
      );
      return { ok: false, reason: 'nothing-to-reload' };
    }

    const ammoPath = `system.${ammo.path}.value`;
    const update = { [ammoPath]: reload.ammoAfter };
    const changes = [{ path: ammoPath, before: ammoBefore, after: reload.ammoAfter }];
    if (reserve) {
      const reservePath = `system.${reserve.path}.value`;
      update[reservePath] = reload.reserveAfter;
      changes.push({ path: reservePath, before: reserveBefore, after: reload.reserveAfter });
    }
    await actor.update(update);

    await postReceiptSafely({
      actor,
      title: `Reload: ${attackLabel(attack)}`,
      summary: `${ammo.name}: ${ammoBefore} → ${reload.ammoAfter}`,
      details: [
        `${reload.transferred} transferred`,
        reserve
          ? `${reserve.name}: ${reserveBefore} → ${reload.reserveAfter}`
          : 'Untracked replenishment',
        attack.shots ? `GGA Shots: ${attack.shots}` : '',
      ],
      changes,
      warning:
        reload.shortfall > 0
          ? `Reserve ammunition was ${reload.shortfall} short of the requested reload.`
          : '',
      visibility: loadout.visibility,
    });
    return { ok: true, ...reload };
  } catch (error) {
    notifyError(error);
    return { ok: false, reason: 'error', error };
  }
}

export async function executeAdjustment({
  actor,
  trackerReference,
  operation,
  amount,
  visibility = VISIBILITY.INHERIT,
} = {}) {
  try {
    assertOwnership(actor);
    const trackers = collectResourceTrackers(actor, { includeDamage: true });
    const resolved = resolveReference(trackers, trackerReference, 'tracker');
    if (!resolved.record) throw new Error('The selected resource tracker was not found.');
    const tracker = resolved.record;
    const before = trackerValue(actor, tracker.path);
    if (operation === 'spend' && amount > before && !game.user.isGM) {
      throw new Error(`Only ${before} is available in ${tracker.name}.`);
    }
    const after = calculateAdjustment(before, operation, amount, {
      minimum: tracker.isMinimumEnforced ? tracker.min : null,
      maximum: tracker.isMaximumEnforced ? tracker.max : null,
    });
    const path = `system.${tracker.path}.value`;
    await actor.update({ [path]: after });
    await postReceiptSafely({
      actor,
      title: `Resource: ${tracker.name}`,
      summary: `${before} → ${after}`,
      details: [`${operation} ${amount}`],
      changes: [{ path, before, after }],
      visibility,
    });
    return { ok: true, before, after };
  } catch (error) {
    notifyError(error);
    return { ok: false, reason: 'error', error };
  }
}

export async function undoReceipt(message) {
  const receipt = message?.getFlag?.(MODULE_ID, FLAG_RECEIPT);
  if (!receipt || receipt.undone) return false;
  if (receipt.userId !== game.user.id && !game.user.isGM) {
    ui.notifications.warn('Only the acting user or a GM can undo this change.');
    return false;
  }
  const actor = await actorFromUuid(receipt.actorUuid);
  if (!actor || (!actor.isOwner && !game.user.isGM)) {
    ui.notifications.warn(
      'The actor is unavailable or you no longer have permission to change it.',
    );
    return false;
  }
  if (!canUndo(receipt.changes, (path) => foundry.utils.getProperty(actor, path))) {
    ui.notifications.warn(
      'The resource has changed since this receipt was created, so it was not overwritten.',
    );
    return false;
  }
  const update = Object.fromEntries(receipt.changes.map((change) => [change.path, change.before]));
  await actor.update(update);
  await message.setFlag(MODULE_ID, FLAG_RECEIPT, { ...receipt, undone: true });
  ui.notifications.info('Resource change undone.');
  return true;
}

export function bindReceiptActions(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const receipt = message?.getFlag?.(MODULE_ID, FLAG_RECEIPT);
  if (!receipt) return;
  const button = root.querySelector('[data-gga-ara-action="undo"]');
  const status = root.querySelector('.gga-ara-undone');
  if (receipt.undone) {
    if (button) button.hidden = true;
    if (status) status.hidden = false;
    return;
  }
  if (button && !button.dataset.ggaAraBound) {
    button.dataset.ggaAraBound = 'true';
    button.addEventListener('click', () => undoReceipt(message));
  }
}
