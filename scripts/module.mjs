import { ACTIONS, MODULE_ID, MODULE_TITLE, SETTINGS } from "./constants.mjs";
import { AmmoAssistantApp } from "./application.mjs";
import { bindReceiptActions } from "./operations.mjs";
import { handleHotbarDrop, runHotbar, saveLoadoutToHotbar } from "./hotbar.mjs";
import { selectedActor, shotPromptBridge } from "./gga-adapter.mjs";
import { registerSettings } from "./store.mjs";

let assistant = null;

export async function openAssistant({ actor = null, actorUuid = "", loadoutId = "", mode = "" } = {}) {
  actor ??= selectedActor();
  if (assistant?.rendered) {
    if (actor || actorUuid) {
      assistant.actor = actor;
      assistant.actorUuid = actor?.uuid || actorUuid;
      assistant._actorInitialised = "";
      assistant.draft = null;
      assistant.selectedLoadoutId = loadoutId;
      assistant.actorPickerOpen = false;
    }
    if (mode) assistant.mode = mode;
    assistant.render({ force: true });
    assistant.bringToFront();
    return assistant;
  }
  assistant = new AmmoAssistantApp({ actor, actorUuid, loadoutId, mode });
  assistant.render({ force: true });
  return assistant;
}

function addTokenControl(controls) {
  if (!game.settings.get(MODULE_ID, SETTINGS.SHOW_CONTROL)) return;
  const tokenControls = game.release.generation >= 13
    ? controls.tokens
    : controls.find(control => control.name === "token");
  if (!tokenControls) return;
  const tool = {
    name: MODULE_ID,
    title: MODULE_TITLE,
    icon: "fa-solid fa-bullseye",
    button: true,
    visible: true,
    onClick: () => openAssistant(),
    onChange: () => openAssistant()
  };
  if (game.release.generation >= 13) tokenControls.tools[MODULE_ID] = tool;
  else tokenControls.tools.push(tool);
}

function onChatCommand(_log, message) {
  const content = String(message ?? "").trim().toLowerCase();
  if (content !== "/ammo" && content !== "/ammunition") return true;
  openAssistant();
  return false;
}

Hooks.once("init", () => {
  registerSettings();
  game.keybindings.register(MODULE_ID, "openAssistant", {
    name: `Open ${MODULE_TITLE}`,
    hint: "Opens the assistant for the selected token or assigned character.",
    editable: [],
    onDown: () => {
      openAssistant();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
  Hooks.on("getSceneControlButtons", addTokenControl);
  Hooks.on("hotbarDrop", handleHotbarDrop);
  Hooks.on("preCreateChatMessage", message => shotPromptBridge.observeChatMessage(message));
  Hooks.on("renderChatMessage", (message, html) => bindReceiptActions(message, html));
  Hooks.on("renderChatMessageHTML", (message, html) => bindReceiptActions(message, html));
  Hooks.on("chatMessage", onChatCommand);
});

Hooks.once("libWrapper.Ready", () => shotPromptBridge.install());

Hooks.once("ready", () => {
  if (game.system.id !== "gurps") {
    ui.notifications.error(`${MODULE_TITLE} requires GURPS Game Aid.`);
    return;
  }
  if (!shotPromptBridge.installed && !shotPromptBridge.install()) {
    ui.notifications.error(`${MODULE_TITLE} requires the libWrapper module.`);
    return;
  }

  const module = game.modules.get(MODULE_ID);
  module.api = {
    open: openAssistant,
    runHotbar,
    saveLoadoutToHotbar
  };
});

Hooks.on("updateActor", actor => {
  if (assistant?.rendered && assistant.actor?.uuid === actor.uuid) assistant.render({ force: true });
});

Hooks.on("updateActorDelta", delta => {
  const actor = delta?.parent?.actor;
  if (assistant?.rendered && actor && assistant.actor?.uuid === actor.uuid) {
    assistant.actor = actor;
    assistant.render({ force: true });
  }
});
