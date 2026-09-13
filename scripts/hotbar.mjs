import { FLAG_HOTBAR, MODULE_ID } from "./constants.mjs";
import { actorFromUuid } from "./gga-adapter.mjs";
import { executeFire, executeReload } from "./operations.mjs";
import { getLoadouts } from "./store.mjs";

function macroCommand({ actorUuid, loadoutId, action }) {
  const args = JSON.stringify({ actorUuid, loadoutId, action });
  return `const api = game.modules.get("${MODULE_ID}")?.api;\nif (!api) ui.notifications.error("GGA Ammunition & Resource Assistant is not active.");\nelse await api.runHotbar(${args}, typeof event === "undefined" ? null : event);`;
}

function macroFlagMatches(macro, data) {
  const flag = macro.getFlag?.(MODULE_ID, FLAG_HOTBAR);
  return flag?.actorUuid === data.actorUuid && flag?.loadoutId === data.loadoutId && flag?.action === data.action;
}

function macroName(loadout, action) {
  return `${action === "reload" ? "Reload" : "Fire"} – ${loadout.name}`;
}

export function findLoadoutMacros(actorUuid, loadoutId) {
  return game.macros.filter(macro => {
    if (!macro.isOwner) return false;
    const flag = macro.getFlag?.(MODULE_ID, FLAG_HOTBAR);
    return flag?.actorUuid === actorUuid && flag?.loadoutId === loadoutId;
  });
}

export async function syncLoadoutMacros({ actor, loadout }) {
  const macros = findLoadoutMacros(actor.uuid, loadout.id);
  for (const macro of macros) {
    const flag = macro.getFlag(MODULE_ID, FLAG_HOTBAR);
    await macro.update({
      name: macroName(loadout, flag.action),
      img: loadout.attack?.img || actor.img || "icons/svg/bullseye.svg",
      command: macroCommand(flag)
    });
  }
  return macros.length;
}

export async function deleteLoadoutMacros(actorUuid, loadoutId) {
  const macros = findLoadoutMacros(actorUuid, loadoutId);
  for (const macro of macros) {
    const slots = Object.entries(game.user.hotbar ?? {})
      .filter(([, macroId]) => macroId === macro.id)
      .map(([slot]) => Number(slot));
    for (const slot of slots) await game.user.assignHotbarMacro(null, slot);
    await macro.delete();
  }
  return macros.length;
}

function currentPageSlots() {
  const page = Number(ui.hotbar?.page ?? ui.hotbar?._page ?? 1);
  const first = (Math.max(1, Math.min(page, 5)) - 1) * 10 + 1;
  return Array.from({ length: 10 }, (_, index) => first + index);
}

function findEmptySlot() {
  const hotbar = game.user?.hotbar ?? {};
  return currentPageSlots().find(slot => !hotbar[slot])
    ?? Array.from({ length: 50 }, (_, index) => index + 1).find(slot => !hotbar[slot])
    ?? null;
}

export async function saveLoadoutToHotbar({ actor, loadout, action = "fire", slot = null }) {
  if (!actor || !loadout) throw new Error("Save the loadout before adding it to the hotbar.");
  const data = { actorUuid: actor.uuid, loadoutId: loadout.id, action };
  let macro = game.macros.find(candidate => candidate.isOwner && macroFlagMatches(candidate, data));
  const update = {
    name: macroName(loadout, action),
    type: "script",
    img: loadout.attack?.img || actor.img || "icons/svg/bullseye.svg",
    command: macroCommand(data),
    flags: { [MODULE_ID]: { [FLAG_HOTBAR]: data } }
  };
  if (macro) await macro.update(update);
  else macro = await Macro.create(update);

  const existingSlot = Object.entries(game.user.hotbar ?? {}).find(([, macroId]) => macroId === macro.id)?.[0];
  const targetSlot = slot ?? (existingSlot ? Number(existingSlot) : findEmptySlot());
  if (targetSlot) {
    await game.user.assignHotbarMacro(macro, targetSlot);
    ui.notifications.info(`${macro.name} saved to hotbar slot ${targetSlot}.`);
  } else {
    ui.notifications.warn(`${macro.name} was created in the Macros directory, but all hotbar slots are occupied.`);
  }
  return macro;
}

export async function runHotbar({ actorUuid, loadoutId, action = "fire" } = {}, triggerEvent = null) {
  let actor = await actorFromUuid(actorUuid);
  if (!actor) {
    ui.notifications.error("The actor saved in this hotbar action is no longer available.");
    return false;
  }
  const loadout = getLoadouts(actor).find(item => item.id === loadoutId);
  if (!loadout) {
    ui.notifications.error(`The saved loadout was not found on ${actor.name}.`);
    return false;
  }
  if (triggerEvent?.shiftKey) {
    return game.modules.get(MODULE_ID)?.api?.open({ actor, loadoutId, mode: action === "reload" ? "reload" : "fire" });
  }
  if (action === "reload") return executeReload({ actor, loadout });
  return executeFire({ actor, loadout, promptIfConfigured: true });
}

export function handleHotbarDrop(_bar, data, slot) {
  if (data?.type !== MODULE_ID) return true;
  void (async () => {
    const actor = await actorFromUuid(data.actorUuid);
    const loadout = getLoadouts(actor).find(item => item.id === data.loadoutId);
    if (!actor || !loadout) throw new Error("That saved loadout is no longer available.");
    await saveLoadoutToHotbar({ actor, loadout, action: data.action, slot });
  })().catch(error => {
    console.error(`${MODULE_ID} | Could not create the dropped hotbar action.`, error);
    ui.notifications.error(error?.message || "The hotbar action could not be created.");
  });
  return false;
}
