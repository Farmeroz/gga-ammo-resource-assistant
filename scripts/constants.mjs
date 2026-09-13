export const MODULE_ID = 'gga-ammo-resource-assistant';
export const MODULE_TITLE = 'GGA Ammunition & Resource Assistant';
export const FLAG_LOADOUTS = 'loadouts';
export const FLAG_RECEIPT = 'receipt';
export const FLAG_HOTBAR = 'hotbar';
export const LOADOUT_SCHEMA_VERSION = 1;

export const ACTIONS = Object.freeze({
  FIRE: 'fire',
  RELOAD: 'reload',
  ADJUST: 'adjust',
  LOADOUTS: 'loadouts',
});

export const SETTINGS = Object.freeze({
  SHOW_CONTROL: 'showTokenControl',
  CHAT_RECEIPTS: 'chatReceipts',
  DEFAULT_VISIBILITY: 'defaultVisibility',
  GM_OVERRIDES: 'gmOverrides',
  LAST_VIEW: 'lastView',
});

export const VISIBILITY = Object.freeze({
  INHERIT: 'inherit',
  PUBLIC: 'public',
  SELF: 'self',
  GM: 'gm',
});

export const DEFAULT_LOADOUT = Object.freeze({
  schemaVersion: LOADOUT_SCHEMA_VERSION,
  id: '',
  name: '',
  attack: null,
  ammo: null,
  reserve: null,
  shots: 1,
  hotbarShotMode: 'fixed',
  unitsPerShot: 1,
  flatCost: 0,
  reloadMode: 'to-full',
  reloadAmount: 0,
  lowWarningAt: 0,
  visibility: VISIBILITY.INHERIT,
});
