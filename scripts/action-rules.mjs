// GURPS Fourth Edition: B226, B355–356; MA45, MA83, MA103, MA119–120;
// DF11:32–33; Dungeon Fantasy Denizens: Thieves 22–23.
export const ACTION_KINDS = ['bow', 'throw', 'object'];
export const DISTANCES = [
  [0.05, 3.5],
  [0.1, 2.5],
  [0.15, 2],
  [0.2, 1.5],
  [0.25, 1.2],
  [0.3, 1.1],
  [0.4, 1],
  [0.5, 0.8],
  [0.75, 0.7],
  [1, 0.6],
  [1.5, 0.4],
  [2, 0.3],
  [2.5, 0.25],
  [3, 0.2],
  [4, 0.15],
  [5, 0.12],
  [6, 0.1],
  [7, 0.09],
  [8, 0.08],
  [9, 0.07],
  [10, 0.06],
  [12, 0.05],
];
export function number(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return value !== '' && value != null && Number.isFinite(n) ? n : null;
}
export function basicLift(st) {
  const n = (st * st) / 5;
  return n > 10 ? Math.round(n) : n;
}
export function dice(value) {
  const m = String(value ?? '')
    .replace(/[−–]/g, '-')
    .replace(/\s/g, '')
    .match(/^(\d*)d(?:6)?([+-]\d+)?$/i);
  if (!m || Number(m[1] || 1) < 1)
    throw new Error('Enter damage as whole dice, for example 1d-2 or 3d+1.');
  return { count: Number(m[1] || 1), adds: Number(m[2] || 0) };
}
export function diceText(count, adds) {
  return `${count}d${adds > 0 ? '+' : ''}${adds || ''}`;
}
export function skillBonus(kind, level, dx) {
  const relative = level - dx;
  return kind === 'art'
    ? relative >= 1
      ? 2
      : relative >= 0
        ? 1
        : 0
    : kind === 'throwing'
      ? relative >= 2
        ? 2
        : relative >= 1
          ? 1
          : 0
      : 0;
}
export function objectThrow({
  st,
  dx,
  bl,
  weight,
  unit = 'lb',
  method = 'dx',
  level,
  thrust,
  swing,
  profile = 'ordinary',
  area = false,
}) {
  for (const [label, value] of Object.entries({ ST: st, DX: dx, 'Basic Lift': bl, weight })) {
    if (!(Number.isFinite(value) && value > 0)) throw new Error(`Enter a positive ${label}.`);
  }
  const pounds = unit === 'kg' ? weight / 0.45359237 : weight;
  if (pounds > 8 * bl)
    throw new Error('This object exceeds the normal maximum of 8 × Basic Lift (B355).');
  const ratio = pounds / bl;
  const row = DISTANCES.find(([limit]) => ratio <= limit + 1e-10);
  const bonus = skillBonus(method, level ?? dx, dx);
  let damage = dice(profile === 'bat' ? swing : thrust);
  let adjustment = 0;
  if (profile === 'ordinary') {
    adjustment =
      pounds <= bl / 8
        ? -2 * damage.count
        : pounds <= bl / 4
          ? -damage.count
          : pounds <= bl / 2
            ? 0
            : pounds <= bl
              ? damage.count
              : pounds <= 2 * bl
                ? 0
                : pounds <= 4 * bl
                  ? -Math.floor(damage.count / 2)
                  : -damage.count;
  } else {
    if (method !== 'art')
      throw new Error('These improvised-weapon profiles require Throwing Art (B226).');
    adjustment = { blunt: 1, bat: 1, pencil: -3, card: -3 }[profile];
    if (adjustment === undefined) throw new Error('Choose a damage profile.');
  }
  const art = method === 'art' ? bonus * damage.count : 0;
  return {
    pounds,
    ratio,
    factor: row[1],
    distance: (st + bonus) * row[1],
    bonus,
    hands: pounds > 2 * bl ? 2 : 1,
    damage: diceText(damage.count, damage.adds + adjustment + art),
    type: profile === 'pencil' ? 'imp' : profile === 'card' ? 'cut' : 'cr',
    level: method === 'dx' ? dx + (area ? 0 : -3) : level,
    adjustment,
    art,
  };
}
export function quickPenalty(heroic, master) {
  return heroic && master ? -1 : heroic || master ? -3 : -6;
}
export function drawPenalty({
  previous = 0,
  simultaneous = 1,
  heroic = false,
  master = false,
  situational = 0,
}) {
  const repeated = -2 * previous - (simultaneous > 1 ? 2 * simultaneous : 0);
  // WM halves multiple-draw penalties, not all situational penalties.
  const multiple = master ? Math.ceil(repeated / 2) : repeated;
  return heroic ? Math.ceil((multiple + situational) / 2) : multiple + situational;
}
export function throwPenalty(count, { heroic = false, master = false, bothHands = false } = {}) {
  const step = heroic ? (master ? 1 : 3) : master ? 3 : 6;
  return -step * (count - 1) - (bothHands ? (heroic && master ? 1 : 2) : 0);
}
export function flattenTraits(root, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(root ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value.name)
      out.push({ path, name: String(value.name), level: number(value.level), raw: value });
    for (const child of ['contains', 'collapsed'])
      out.push(...flattenTraits(value[child], `${path}.${child}`));
  }
  return out;
}
export function findTrait(records, pattern, linkedPath = '') {
  if (linkedPath === 'none') return null;
  if (linkedPath) return records.find((r) => r.path === linkedPath) ?? null;
  const matches = records.filter((r) => pattern.test(r.name));
  return matches.length === 1 ? matches[0] : null;
}
export function checkAccess(checks) {
  const failed = checks.filter((c) => !c.ok);
  // Rules checks inform the table. Actor ownership and usable inputs are checked separately.
  return { failed, allowed: true };
}
