import {
  ACTIONS,
  FLAG_LOADOUTS,
  MODULE_ID,
  MODULE_TITLE,
  SETTINGS,
  VISIBILITY
} from "./constants.mjs";
import { makeLoadout } from "./core.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.SHOW_CONTROL, {
    name: `${MODULE_TITLE}: Show Token Control`,
    hint: "Adds an Ammunition & Resource Assistant button to Token Controls.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, SETTINGS.CHAT_RECEIPTS, {
    name: `${MODULE_TITLE}: Chat Receipts`,
    hint: "Posts compact, undoable receipts for ammunition and resource changes.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_VISIBILITY, {
    name: `${MODULE_TITLE}: Default Receipt Visibility`,
    hint: "Attack receipts inherit the attack roll unless a loadout selects another visibility.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [VISIBILITY.INHERIT]: "Inherit attack / current roll mode",
      [VISIBILITY.PUBLIC]: "Public",
      [VISIBILITY.SELF]: "Self only",
      [VISIBILITY.GM]: "GM and acting user"
    },
    default: VISIBILITY.INHERIT
  });

  game.settings.register(MODULE_ID, SETTINGS.GM_OVERRIDES, {
    name: `${MODULE_TITLE}: Allow GM Ammunition Overrides`,
    hint: "Allows GMs to fire a configured burst despite insufficient ammunition. Players never receive this option.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.LAST_VIEW, {
    name: `${MODULE_TITLE}: Last View`,
    scope: "client",
    config: false,
    type: Object,
    default: { mode: ACTIONS.FIRE, actorLoadouts: {}, advancedOpen: false }
  });
}

export function getLoadouts(actor) {
  const saved = actor?.getFlag?.(MODULE_ID, FLAG_LOADOUTS);
  return Array.isArray(saved) ? saved.map(loadout => makeLoadout(loadout, () => loadout.id)) : [];
}

export async function setLoadouts(actor, loadouts) {
  if (!actor?.isOwner && !game.user?.isGM) throw new Error("You do not own this actor.");
  const cleaned = loadouts.map(loadout => makeLoadout(loadout, () => loadout.id));
  await actor.setFlag(MODULE_ID, FLAG_LOADOUTS, cleaned);
  return cleaned;
}

export async function upsertLoadout(actor, loadout) {
  const saved = getLoadouts(actor);
  const cleaned = makeLoadout(loadout);
  const index = saved.findIndex(item => item.id === cleaned.id);
  if (index >= 0) saved[index] = cleaned;
  else saved.push(cleaned);
  await setLoadouts(actor, saved);
  return cleaned;
}

export async function removeLoadout(actor, loadoutId) {
  const saved = getLoadouts(actor).filter(loadout => loadout.id !== loadoutId);
  await setLoadouts(actor, saved);
  return saved;
}

export function getLastView() {
  return game.settings.get(MODULE_ID, SETTINGS.LAST_VIEW) ?? { mode: ACTIONS.FIRE, actorLoadouts: {} };
}

export async function rememberView(actor, mode, loadoutId = "") {
  const current = structuredClone(getLastView());
  current.mode = mode;
  current.actorLoadouts ??= {};
  if (actor?.uuid) current.actorLoadouts[actor.uuid] = loadoutId;
  await game.settings.set(MODULE_ID, SETTINGS.LAST_VIEW, current);
}

export async function rememberAdvanced(open) {
  const current = structuredClone(getLastView());
  current.advancedOpen = Boolean(open);
  await game.settings.set(MODULE_ID, SETTINGS.LAST_VIEW, current);
}

export function rememberedLoadoutId(actor) {
  return getLastView()?.actorLoadouts?.[actor?.uuid] ?? "";
}
