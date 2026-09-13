import { DEFAULT_LOADOUT, LOADOUT_SCHEMA_VERSION, VISIBILITY } from './constants.mjs';

export function normalise(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function wholeNumber(value, fallback = 0, minimum = Number.MIN_SAFE_INTEGER) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(number, minimum) : fallback;
}

export function parseRateOfFire(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^\s*(\d+)/);
  const parsed = match ? Number.parseInt(match[1], 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function attackLabel(attack) {
  if (!attack) return '';
  const name = String(attack.name ?? '').trim();
  const mode = String(attack.mode ?? '').trim();
  return mode ? `${name} (${mode})` : name;
}

export function trackerOptionLabels(trackers) {
  const records = Array.isArray(trackers) ? trackers : [];
  const counts = records.reduce((map, tracker) => {
    const key = normalise(tracker?.name);
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map());

  return records.map((tracker) => {
    const duplicate = counts.get(normalise(tracker.name)) > 1;
    const maximum = finiteNumber(tracker.max, 0);
    return {
      ...tracker,
      label: `${tracker.name} · ${finiteNumber(tracker.value, 0)} / ${maximum}${duplicate ? ` [${tracker.path}]` : ''}`,
    };
  });
}

export function quoteForOtf(value) {
  let text = String(value ?? '');
  if (text.includes('"')) {
    text = text.replace(/'/g, "\\'");
    return `'${text}'`;
  }
  return `"${text}"`;
}

export function rangedAttackOtf(attack) {
  return `[R:${quoteForOtf(attackLabel(attack))}]`;
}

export function enforcedMinimum(record) {
  return record?.isMinimumEnforced ? finiteNumber(record.min, 0) : 0;
}

export function calculateSpend(shots, unitsPerShot = 1, flatCost = 0) {
  const safeShots = wholeNumber(shots, 1, 1);
  const safeUnits = wholeNumber(unitsPerShot, 1, 1);
  const safeFlat = wholeNumber(flatCost, 0, 0);
  return safeShots * safeUnits + safeFlat;
}

export function maximumAffordableShots(
  available,
  unitsPerShot = 1,
  flatCost = 0,
  maximum = Infinity,
) {
  const safeAvailable = Math.max(wholeNumber(available, 0), 0);
  const safeUnits = wholeNumber(unitsPerShot, 1, 1);
  const safeFlat = wholeNumber(flatCost, 0, 0);
  if (safeAvailable <= safeFlat) return 0;
  const affordable = Math.floor((safeAvailable - safeFlat) / safeUnits);
  return Math.max(0, Math.min(affordable, maximum));
}

export function automaticLowWarning(loadout, attack) {
  const configured = wholeNumber(loadout?.lowWarningAt, 0, 0);
  if (configured > 0) return configured;
  return calculateSpend(parseRateOfFire(attack?.rof), loadout?.unitsPerShot, loadout?.flatCost);
}

export function calculateReload({
  current,
  capacity,
  reserve,
  requested,
  mode = 'to-full',
  hasReserve = true,
}) {
  const safeCurrent = Math.max(wholeNumber(current, 0), 0);
  const safeCapacity = Math.max(wholeNumber(capacity, 0), 0);
  const availableSpace = Math.max(safeCapacity - safeCurrent, 0);
  const wanted =
    mode === 'to-full' ? availableSpace : Math.min(wholeNumber(requested, 0, 0), availableSpace);
  const safeReserve = hasReserve ? Math.max(wholeNumber(reserve, 0), 0) : Infinity;
  const transferred = Math.max(0, Math.min(wanted, safeReserve));

  return {
    transferred,
    ammoAfter: safeCurrent + transferred,
    reserveAfter: hasReserve ? safeReserve - transferred : null,
    shortfall: Math.max(wanted - transferred, 0),
    availableSpace,
  };
}

export function calculateAdjustment(
  current,
  operation,
  amount,
  { minimum = null, maximum = null } = {},
) {
  const before = finiteNumber(current, 0);
  const safeAmount = finiteNumber(amount, 0);
  let after = before;
  if (operation === 'add') after += safeAmount;
  else if (operation === 'spend') after -= safeAmount;
  else if (operation === 'set') after = safeAmount;
  else throw new Error(`Unknown resource adjustment: ${operation}`);

  if (minimum !== null && minimum !== '' && Number.isFinite(Number(minimum))) {
    after = Math.max(after, Number(minimum));
  }
  if (maximum !== null && maximum !== '' && Number.isFinite(Number(maximum))) {
    after = Math.min(after, Number(maximum));
  }
  return after;
}

export function recordReference(record, kind = 'tracker') {
  if (!record) return null;
  const reference = {
    path: record.path,
    name: record.name,
  };
  if (kind === 'attack') {
    reference.uuid = record.uuid || '';
    reference.mode = record.mode || '';
  }
  return reference;
}

export function resolveReference(records, reference, kind = 'tracker') {
  if (!reference || !Array.isArray(records))
    return { record: null, relinked: false, ambiguous: false };

  const pathMatch = records.find((record) => record.path === reference.path);
  if (pathMatch) {
    const identityMatches =
      kind === 'attack'
        ? normalise(pathMatch.name) === normalise(reference.name) &&
          normalise(pathMatch.mode) === normalise(reference.mode)
        : normalise(pathMatch.name) === normalise(reference.name);
    if (identityMatches) return { record: pathMatch, relinked: false, ambiguous: false };
  }

  if (kind === 'attack' && reference.uuid) {
    const uuidMatches = records.filter((record) => record.uuid && record.uuid === reference.uuid);
    if (uuidMatches.length === 1)
      return { record: uuidMatches[0], relinked: true, ambiguous: false };
    if (uuidMatches.length > 1) return { record: null, relinked: false, ambiguous: true };
  }

  const nameMatches = records.filter((record) => {
    if (normalise(record.name) !== normalise(reference.name)) return false;
    return kind !== 'attack' || normalise(record.mode) === normalise(reference.mode);
  });

  if (nameMatches.length === 1) return { record: nameMatches[0], relinked: true, ambiguous: false };
  return { record: null, relinked: false, ambiguous: nameMatches.length > 1 };
}

export function makeLoadout(input = {}, randomId = () => crypto.randomUUID()) {
  const loadout = {
    ...DEFAULT_LOADOUT,
    ...input,
    schemaVersion: LOADOUT_SCHEMA_VERSION,
    id: String(input.id || randomId()),
    name: String(input.name || '').trim(),
    shots: wholeNumber(input.shots, 1, 1),
    unitsPerShot: wholeNumber(input.unitsPerShot, 1, 1),
    flatCost: wholeNumber(input.flatCost, 0, 0),
    reloadAmount: wholeNumber(input.reloadAmount, 0, 0),
    lowWarningAt: wholeNumber(input.lowWarningAt, 0, 0),
    hotbarShotMode: input.hotbarShotMode === 'ask' ? 'ask' : 'fixed',
    reloadMode: input.reloadMode === 'fixed' ? 'fixed' : 'to-full',
    visibility: Object.values(VISIBILITY).includes(input.visibility)
      ? input.visibility
      : VISIBILITY.INHERIT,
  };
  return loadout;
}

export function validateLoadout(loadout, { maximumRof = Infinity } = {}) {
  const errors = [];
  if (!String(loadout?.name ?? '').trim()) errors.push('Enter a loadout name.');
  if (!loadout?.attack?.name) errors.push('Choose a ranged attack.');
  if (!loadout?.ammo?.name) errors.push('Choose an ammunition tracker.');
  if (loadout?.reserve?.path && loadout.reserve.path === loadout.ammo?.path) {
    errors.push('The magazine and reserve trackers must be different.');
  }
  if (wholeNumber(loadout?.shots, 0) < 1) errors.push('Shots must be at least 1.');
  if (wholeNumber(loadout?.shots, 0) > maximumRof)
    errors.push(`Shots cannot exceed RoF ${maximumRof}.`);
  if (wholeNumber(loadout?.unitsPerShot, 0) < 1) errors.push('Units per shot must be at least 1.');
  return errors;
}

export function canUndo(changes, getCurrentValue) {
  return (
    Array.isArray(changes) &&
    changes.length > 0 &&
    changes.every(
      (change) =>
        finiteNumber(getCurrentValue(change.path), NaN) === finiteNumber(change.after, NaN),
    )
  );
}

export function exportPayload(actorName, loadouts) {
  return {
    type: 'gga-ammo-resource-assistant-loadouts',
    schemaVersion: LOADOUT_SCHEMA_VERSION,
    actorName: String(actorName ?? ''),
    exportedAt: new Date().toISOString(),
    loadouts: (loadouts ?? []).map((loadout) => makeLoadout(loadout, () => loadout.id)),
  };
}

export function parseImportPayload(payload, randomId = () => crypto.randomUUID()) {
  if (
    !payload ||
    payload.type !== 'gga-ammo-resource-assistant-loadouts' ||
    !Array.isArray(payload.loadouts)
  ) {
    throw new Error('This is not an Ammunition & Resource Assistant loadout file.');
  }
  return payload.loadouts.map((loadout) => makeLoadout({ ...loadout, id: '' }, randomId));
}
