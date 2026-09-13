import { MODULE_ID } from "./constants.mjs";
import { attackLabel, finiteNumber, normalise, rangedAttackOtf } from "./core.mjs";

function getProperty(object, path) {
  return foundry.utils.getProperty(object, path);
}

export function collectResourceTrackers(actor, { includeDamage = false } = {}) {
  const root = actor?.system?.additionalresources?.tracker ?? {};
  return Object.entries(root)
    .filter(([, tracker]) => tracker && typeof tracker === "object" && String(tracker.name ?? "").trim())
    .map(([key, tracker]) => ({
      key,
      path: `additionalresources.tracker.${key}`,
      name: tracker.name || tracker.alias || `Tracker ${key}`,
      value: finiteNumber(tracker.value, 0),
      min: finiteNumber(tracker.min, 0),
      max: finiteNumber(tracker.max, 0),
      isDamageTracker: Boolean(tracker.isDamageTracker),
      isMinimumEnforced: Boolean(tracker.isMinimumEnforced),
      isMaximumEnforced: Boolean(tracker.isMaximumEnforced),
      raw: tracker
    }))
    .filter(tracker => includeDamage || !tracker.isDamageTracker)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isRangedAttack(value) {
  if (!value || typeof value !== "object" || !String(value.name ?? "").trim()) return false;
  return ["rof", "shots", "acc", "rcl", "range", "damage", "level", "import"].some(key => key in value);
}

export function collectRangedAttacks(actor) {
  const found = [];
  const visit = (object, path) => {
    if (!object || typeof object !== "object") return;
    for (const [key, value] of Object.entries(object)) {
      if (!value || typeof value !== "object") continue;
      const childPath = path ? `${path}.${key}` : key;
      if (isRangedAttack(value)) {
        found.push({
          path: childPath,
          name: value.name,
          mode: value.mode || "",
          uuid: value.uuid || "",
          rof: value.rof || "",
          shots: value.shots || "",
          rcl: value.rcl || "",
          ammo: value.ammo || "",
          img: value.img || actor.img,
          raw: value
        });
      }
      visit(value.contains, `${childPath}.contains`);
    }
  };
  visit(actor?.system?.ranged, "ranged");
  return found.sort((a, b) => attackLabel(a).localeCompare(attackLabel(b)));
}

export function trackerValue(actor, path) {
  return finiteNumber(getProperty(actor, `system.${path}.value`), 0);
}

export function selectedActor() {
  const controlled = canvas?.tokens?.controlled ?? [];
  if (controlled.length === 1 && controlled[0].actor) return controlled[0].actor;
  if (controlled.length > 1) return null;
  if (game.user?.character?.isOwner) return game.user.character;
  if (globalThis.GURPS?.LastActor?.isOwner) return globalThis.GURPS.LastActor;
  return null;
}

export function availableActors() {
  const actors = game.actors?.contents ?? Array.from(game.actors ?? []);
  return actors
    .filter(actor => game.user?.isGM || actor.isOwner)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function trackerData({ name, current = 0, maximum = 0 }) {
  const safeMaximum = Math.max(Math.trunc(finiteNumber(maximum, 0)), 0);
  const safeCurrent = Math.max(0, Math.min(Math.trunc(finiteNumber(current, 0)), safeMaximum));
  return {
    name: String(name ?? "").trim(),
    alias: "",
    pdf: "",
    max: safeMaximum,
    min: 0,
    value: safeCurrent,
    points: 0,
    isDamageTracker: false,
    isDamageType: false,
    isMinimumEnforced: true,
    isMaximumEnforced: true,
    initialValue: "",
    thresholds: [],
    breakpoints: true
  };
}

export async function createResourceTrackers(actor, definitions) {
  if (!actor || (!actor.isOwner && !game.user?.isGM)) throw new Error("You do not own this actor.");
  const requested = Array.isArray(definitions) ? definitions : [];
  if (!requested.length) return [];

  const existingRoot = actor.system?.additionalresources?.tracker ?? {};
  const names = new Set(Object.values(existingRoot).map(tracker => normalise(tracker?.name)).filter(Boolean));
  const createdNames = new Set();
  for (const definition of requested) {
    const name = String(definition?.name ?? "").trim();
    if (!name) throw new Error("Enter a name for every resource tracker.");
    const key = normalise(name);
    if (names.has(key) || createdNames.has(key)) throw new Error(`A resource tracker named ${name} already exists.`);
    const maximum = Math.trunc(finiteNumber(definition.maximum, NaN));
    const current = Math.trunc(finiteNumber(definition.current, NaN));
    if (!Number.isFinite(maximum) || maximum < 1) throw new Error(`${name} needs a maximum of at least 1.`);
    if (!Number.isFinite(current) || current < 0 || current > maximum) {
      throw new Error(`${name}'s current value must be between 0 and ${maximum}.`);
    }
    createdNames.add(key);
  }

  const usedKeys = new Set(Object.keys(existingRoot));
  let nextIndex = Math.max(-1, ...Array.from(usedKeys)
    .map(key => /^\d+$/.test(key) ? Number.parseInt(key, 10) : -1)) + 1;
  const updates = {};
  const pending = [];
  for (const definition of requested) {
    let key = String(nextIndex++).padStart(4, "0");
    while (usedKeys.has(key)) key = String(nextIndex++).padStart(4, "0");
    usedKeys.add(key);
    const path = `additionalresources.tracker.${key}`;
    const data = trackerData(definition);
    updates[`system.${path}`] = data;
    pending.push({ key, path, ...data, raw: data });
  }

  await actor.update(updates);
  return pending;
}

export async function actorFromUuid(actorUuid) {
  if (!actorUuid) return selectedActor();
  const document = await fromUuid(actorUuid);
  if (document?.documentName === "Actor") return document;
  if (document?.actor) return document.actor;
  return null;
}

function lastRoll(actor) {
  const rolls = globalThis.GURPS?.lastTargetedRolls;
  if (!rolls) return null;
  const tokenDocument = tokenDocumentForActor(actor);
  return rolls[tokenDocument?.id] ?? rolls[actor.id] ?? null;
}

function tokenDocumentForActor(actor) {
  if (actor?.token) return actor.token;
  const token = canvas?.tokens?.placeables?.find(candidate => candidate.actor === actor)
    ?? canvas?.tokens?.controlled?.find(candidate => candidate.actor === actor);
  return token?.document ?? null;
}

class ShotPromptBridge {
  constructor() {
    this.active = null;
    this.installed = false;
  }

  install() {
    if (this.installed) return true;
    if (!globalThis.libWrapper) return false;
    try {
      libWrapper.register(
        MODULE_ID,
        "foundry.applications.api.DialogV2.prompt",
        function (wrapped, options = {}) {
          return shotPromptBridge.handlePrompt(wrapped, options);
        },
        "MIXED"
      );
      this.installed = true;
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not register the GGA shot prompt adapter.`, error);
      return false;
    }
  }

  handlePrompt(wrapped, options) {
    const transaction = this.active;
    if (!transaction) return wrapped(options);
    const title = options?.window?.title ?? options?.title ?? "";
    const expected = game.i18n.localize("GURPS.combat.rof.numberOfShotsTitle");
    if (title !== expected) return wrapped(options);
    transaction.promptSeen = true;
    return transaction.shots;
  }

  observeChatMessage(message) {
    const transaction = this.active;
    if (!transaction) return;
    const speaker = message?.speaker ?? message?._source?.speaker ?? {};
    if (speaker.actor !== transaction.actorId) return;
    const rolls = message?.rolls ?? message?._source?.rolls ?? [];
    if (!rolls?.length) return;
    const content = normalise(message?.content ?? message?._source?.content);
    if (!content.includes(normalise(transaction.attackName))) return;
    transaction.messageSeen = true;
    transaction.messageVisibility = {
      whisper: Array.from(message.whisper ?? message?._source?.whisper ?? []),
      blind: Boolean(message.blind ?? message?._source?.blind)
    };
  }

  async run({ actor, attackName, shots, expectsPrompt }, callback) {
    if (this.active) throw new Error("Another ammunition-assisted attack is already in progress on this client.");
    const beforeRoll = lastRoll(actor);
    const transaction = {
      actorId: actor.id,
      attackName,
      shots,
      expectsPrompt,
      promptSeen: false,
      messageSeen: false,
      messageVisibility: null
    };
    this.active = transaction;
    try {
      // GGA's executeOTF result describes success or failure of the attack roll,
      // not whether a roll occurred. Deliberately detect execution from the chat
      // message or lastTargetedRolls so misses still expend ammunition.
      await callback();
      const afterRoll = lastRoll(actor);
      transaction.rollSeen = Boolean(
        afterRoll
        && afterRoll !== beforeRoll
        && normalise(afterRoll.thing).includes(normalise(transaction.attackName))
      );
      return transaction;
    } finally {
      this.active = null;
    }
  }
}

export const shotPromptBridge = new ShotPromptBridge();

export async function rollRangedAttack(actor, attack, shots) {
  if (!actor?.isOwner && !game.user?.isGM) throw new Error("You do not own this actor.");
  if (!globalThis.GURPS?.executeOTF) throw new Error("GURPS Game Aid attack execution was not found.");
  if (!shotPromptBridge.installed) throw new Error("The GGA shot-selection compatibility layer is not ready.");

  const maximumRof = Number.parseInt(attack.rof, 10) || 1;
  const transaction = await shotPromptBridge.run({
    actor,
    attackName: attack.name,
    shots,
    expectsPrompt: maximumRof > 1
  }, async () => {
    const previousActor = GURPS.LastActor;
    const previousTokenDocument = GURPS.LastTokenDocument;
    try {
      GURPS.SetLastActor?.(actor, tokenDocumentForActor(actor));
      return await GURPS.executeOTF(rangedAttackOtf(attack), false, {
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        data: {}
      }, actor);
    } finally {
      GURPS.SetLastActor?.(previousActor, previousTokenDocument);
    }
  });

  return {
    rolled: transaction.messageSeen || transaction.rollSeen,
    promptSeen: transaction.promptSeen,
    promptExpected: transaction.expectsPrompt,
    visibility: transaction.messageVisibility
  };
}

export function suggestTracker(attack, trackers) {
  if (!trackers.length) return null;
  const ammoText = normalise(attack?.ammo);
  if (ammoText) {
    const exact = trackers.find(tracker => normalise(tracker.name) === ammoText);
    if (exact) return exact;
    const related = trackers.filter(tracker => ammoText.includes(normalise(tracker.name)) || normalise(tracker.name).includes(ammoText));
    if (related.length === 1) return related[0];
  }

  const words = normalise(attack?.name).split(/[^a-z0-9]+/).filter(word => word.length >= 3);
  const scored = trackers.map(tracker => ({
    tracker,
    score: words.reduce((score, word) => score + (normalise(tracker.name).includes(word) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].tracker : trackers[0];
}
