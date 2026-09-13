import { ACTIONS, DEFAULT_LOADOUT, MODULE_ID, MODULE_TITLE, SETTINGS, VISIBILITY } from "./constants.mjs";
import {
  attackLabel,
  automaticLowWarning,
  calculateSpend,
  enforcedMinimum,
  exportPayload,
  makeLoadout,
  parseImportPayload,
  parseRateOfFire,
  recordReference,
  resolveReference,
  trackerOptionLabels,
  validateLoadout,
  wholeNumber
} from "./core.mjs";
import {
  availableActors,
  collectRangedAttacks,
  collectResourceTrackers,
  createResourceTrackers,
  selectedActor,
  suggestTracker
} from "./gga-adapter.mjs";
import { executeAdjustment, executeFire, executeReload } from "./operations.mjs";
import {
  deleteLoadoutMacros,
  findLoadoutMacros,
  saveLoadoutToHotbar,
  syncLoadoutMacros
} from "./hotbar.mjs";
import {
  getLastView,
  getLoadouts,
  rememberedLoadoutId,
  rememberView,
  rememberAdvanced,
  removeLoadout,
  setLoadouts,
  upsertLoadout
} from "./store.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function optionise(records, selectedPath, label = record => record.name) {
  return records.map(record => ({
    ...record,
    label: label(record),
    selected: record.path === selectedPath
  }));
}

function slug(value) {
  return String(value ?? "loadouts").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function suggestedCapacity(attack) {
  const match = String(attack?.shots ?? "").trim().match(/^\s*(\d+)/);
  return match ? Math.max(Number.parseInt(match[1], 10), 1) : parseRateOfFire(attack?.rof);
}

export class AmmoAssistantApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "gga-ammo-resource-assistant",
    tag: "form",
    classes: ["gga-ara", "standard-form"],
    window: {
      title: MODULE_TITLE,
      icon: "fa-solid fa-bullseye",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 720,
      height: 690
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/ammo-assistant.hbs`
    }
  };

  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? null;
    this.actorUuid = options.actorUuid ?? this.actor?.uuid ?? "";
    this.mode = Object.values(ACTIONS).includes(options.mode) ? options.mode : getLastView().mode;
    this.selectedLoadoutId = options.loadoutId ?? "";
    this.draft = null;
    this._actorInitialised = "";
    this.advancedOpen = Boolean(getLastView().advancedOpen);
    this.actorPickerOpen = false;
    this._lastSyncedMacros = 0;
  }

  async _resolveActor() {
    if (this.actor?.uuid === this.actorUuid) return this.actor;
    if (this.actorUuid) {
      const document = await fromUuid(this.actorUuid);
      this.actor = document?.documentName === "Actor" ? document : document?.actor ?? null;
    }
    this.actor ??= selectedActor();
    this.actorUuid = this.actor?.uuid ?? "";
    return this.actor;
  }

  _newDraft(actor, attacks, trackers) {
    const attack = attacks[0] ?? null;
    const ammo = suggestTracker(attack, trackers);
    const rof = parseRateOfFire(attack?.rof);
    return {
      ...DEFAULT_LOADOUT,
      id: "",
      name: attack ? attackLabel(attack) : "",
      attackPath: attack?.path ?? "",
      ammoPath: ammo?.path ?? "",
      reservePath: "",
      shots: rof,
      adjustTrackerPath: trackers[0]?.path ?? "",
      adjustOperation: "spend",
      adjustAmount: 1,
      actorUuid: actor?.uuid ?? ""
    };
  }

  _draftFromLoadout(loadout, attacks, trackers) {
    const attack = resolveReference(attacks, loadout.attack, "attack").record;
    const ammo = resolveReference(trackers, loadout.ammo, "tracker").record;
    const reserve = resolveReference(trackers, loadout.reserve, "tracker").record;
    return {
      ...DEFAULT_LOADOUT,
      ...loadout,
      attackPath: attack?.path ?? loadout.attack?.path ?? "",
      ammoPath: ammo?.path ?? loadout.ammo?.path ?? "",
      reservePath: reserve?.path ?? loadout.reserve?.path ?? "",
      adjustTrackerPath: ammo?.path ?? trackers[0]?.path ?? "",
      adjustOperation: "spend",
      adjustAmount: 1
    };
  }

  async _ensureDraft(actor, attacks, trackers, loadouts) {
    if (this._actorInitialised === actor.uuid && this.draft) return;
    this._actorInitialised = actor.uuid;
    this.selectedLoadoutId ||= rememberedLoadoutId(actor);
    const selected = loadouts.find(loadout => loadout.id === this.selectedLoadoutId) ?? loadouts[0] ?? null;
    this.selectedLoadoutId = selected?.id ?? "";
    this.draft = selected
      ? this._draftFromLoadout(selected, attacks, trackers)
      : this._newDraft(actor, attacks, trackers);
  }

  async _prepareContext() {
    const actor = await this._resolveActor();
    const actorOptions = availableActors().map(candidate => ({
      uuid: candidate.uuid,
      name: candidate.name,
      searchName: String(candidate.name ?? "").toLowerCase(),
      img: candidate.img,
      current: candidate.uuid === actor?.uuid
    }));
    if (!actor) {
      return {
        noActor: true,
        modes: this._modes(),
        title: MODULE_TITLE,
        actorPickerOpen: this.actorPickerOpen,
        availableActors: actorOptions,
        hasAvailableActors: actorOptions.length > 0
      };
    }

    const attacks = collectRangedAttacks(actor);
    const trackers = collectResourceTrackers(actor);
    const allTrackers = collectResourceTrackers(actor, { includeDamage: true });
    const loadouts = getLoadouts(actor);
    await this._ensureDraft(actor, attacks, trackers, loadouts);

    const attack = attacks.find(record => record.path === this.draft.attackPath) ?? attacks[0] ?? null;
    if (attack && !this.draft.attackPath) this.draft.attackPath = attack.path;
    const ammo = trackers.find(record => record.path === this.draft.ammoPath) ?? suggestTracker(attack, trackers);
    if (ammo && !this.draft.ammoPath) this.draft.ammoPath = ammo.path;
    const reserve = trackers.find(record => record.path === this.draft.reservePath) ?? null;
    const maximumRof = parseRateOfFire(attack?.rof);
    this.draft.shots = Math.min(wholeNumber(this.draft.shots, maximumRof, 1), maximumRof);
    const spend = calculateSpend(this.draft.shots, this.draft.unitsPerShot, this.draft.flatCost);
    const minimum = enforcedMinimum(ammo);
    const ammoAfter = ammo ? Math.max(ammo.value - spend, minimum) : 0;
    const threshold = automaticLowWarning(this.draft, attack);
    const affordableShots = ammo
      ? Math.max(0, Math.min(maximumRof, Math.floor((ammo.value - minimum - this.draft.flatCost) / Math.max(this.draft.unitsPerShot, 1))))
      : 0;
    const ammoPercent = ammo?.max > 0 ? Math.max(0, Math.min(100, Math.round((ammo.value / ammo.max) * 100))) : 0;
    const canModifyActor = Boolean(actor.isOwner || game.user.isGM);
    const gmCanOverride = Boolean(game.user.isGM && game.settings.get(MODULE_ID, SETTINGS.GM_OVERRIDES));

    const loadoutOptions = loadouts.map(loadout => ({
      ...loadout,
      selected: loadout.id === this.selectedLoadoutId,
      attackLabel: loadout.name,
      draggableData: JSON.stringify({
        type: MODULE_ID,
        actorUuid: actor.uuid,
        loadoutId: loadout.id,
        action: "fire"
      })
    }));

    return {
      title: MODULE_TITLE,
      actor: {
        name: actor.name,
        img: actor.img,
        uuid: actor.uuid,
        owned: actor.isOwner || game.user.isGM
      },
      noActor: false,
      actorPickerOpen: this.actorPickerOpen,
      availableActors: actorOptions,
      hasAvailableActors: actorOptions.length > 0,
      noAttacks: attacks.length === 0,
      noTrackers: trackers.length === 0,
      modes: this._modes(),
      isFire: this.mode === ACTIONS.FIRE,
      isReload: this.mode === ACTIONS.RELOAD,
      isAdjust: this.mode === ACTIONS.ADJUST,
      isLoadouts: this.mode === ACTIONS.LOADOUTS,
      loadouts: loadoutOptions,
      hasLoadouts: loadouts.length > 0,
      selectedLoadoutId: this.selectedLoadoutId,
      draft: {
        ...this.draft,
        hotbarFixed: this.draft.hotbarShotMode === "fixed",
        hotbarAsk: this.draft.hotbarShotMode === "ask",
        reloadFull: this.draft.reloadMode === "to-full",
        reloadFixed: this.draft.reloadMode === "fixed",
        visibilityInherit: this.draft.visibility === VISIBILITY.INHERIT,
        visibilityPublic: this.draft.visibility === VISIBILITY.PUBLIC,
        visibilitySelf: this.draft.visibility === VISIBILITY.SELF,
        visibilityGm: this.draft.visibility === VISIBILITY.GM
      },
      attacks: optionise(attacks, attack?.path, attackLabel),
      trackers: optionise(trackerOptionLabels(trackers), ammo?.path, record => record.label),
      reserveTrackers: optionise(
        trackerOptionLabels(trackers.filter(record => record.path !== ammo?.path)),
        reserve?.path,
        record => record.label
      ),
      allTrackers: optionise(trackerOptionLabels(allTrackers), this.draft.adjustTrackerPath, record => record.label),
      attack,
      ammo,
      reserve,
      maximumRof,
      spend,
      ammoAfter,
      ammoPercent,
      lowAfterShot: ammo ? Math.max(ammoAfter - minimum, 0) <= threshold : false,
      threshold,
      canFire: Boolean(canModifyActor && attack && ammo && (affordableShots > 0 || gmCanOverride)),
      canReload: Boolean(canModifyActor && attack && ammo && ammo.max > ammo.value),
      canAdjust: Boolean(canModifyActor && allTrackers.length),
      advancedOpen: this.advancedOpen
    };
  }

  _modes() {
    return [
      { id: ACTIONS.FIRE, label: "Fire", icon: "fa-solid fa-bullseye", active: this.mode === ACTIONS.FIRE },
      { id: ACTIONS.RELOAD, label: "Reload", icon: "fa-solid fa-arrows-rotate", active: this.mode === ACTIONS.RELOAD },
      { id: ACTIONS.ADJUST, label: "Adjust", icon: "fa-solid fa-sliders", active: this.mode === ACTIONS.ADJUST },
      { id: ACTIONS.LOADOUTS, label: "Loadouts", icon: "fa-solid fa-list", active: this.mode === ACTIONS.LOADOUTS }
    ];
  }

  _readForm() {
    const form = this.element;
    if (!(form instanceof HTMLFormElement)) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const fields = [
      "name", "attackPath", "ammoPath", "reservePath", "hotbarShotMode", "reloadMode", "visibility",
      "adjustTrackerPath", "adjustOperation"
    ];
    for (const field of fields) if (field in data) this.draft[field] = data[field];
    for (const field of ["shots", "unitsPerShot", "flatCost", "reloadAmount", "lowWarningAt", "adjustAmount"]) {
      if (field in data) this.draft[field] = wholeNumber(data[field], this.draft[field] ?? 0, 0);
    }
  }

  _currentRecords() {
    const attacks = collectRangedAttacks(this.actor);
    const trackers = collectResourceTrackers(this.actor);
    return {
      attacks,
      trackers,
      attack: attacks.find(record => record.path === this.draft.attackPath),
      ammo: trackers.find(record => record.path === this.draft.ammoPath),
      reserve: trackers.find(record => record.path === this.draft.reservePath)
    };
  }

  _buildLoadout({ requireName = true } = {}) {
    this._readForm();
    const records = this._currentRecords();
    const name = String(this.draft.name || attackLabel(records.attack)).trim();
    const loadout = makeLoadout({
      ...this.draft,
      id: this.draft.id || "",
      name,
      attack: recordReference(records.attack, "attack"),
      ammo: recordReference(records.ammo),
      reserve: recordReference(records.reserve)
    }, () => foundry.utils.randomID());
    if (loadout.attack) loadout.attack.img = records.attack?.img || this.actor.img;
    const errors = validateLoadout(loadout, { maximumRof: parseRateOfFire(records.attack?.rof) });
    if (!requireName) {
      const index = errors.indexOf("Enter a loadout name.");
      if (index >= 0) errors.splice(index, 1);
    }
    if (errors.length) throw new Error(errors.join(" "));
    return loadout;
  }

  async _saveCurrent() {
    const loadout = this._buildLoadout();
    const saved = await upsertLoadout(this.actor, loadout);
    this._lastSyncedMacros = 0;
    try {
      this._lastSyncedMacros = await syncLoadoutMacros({ actor: this.actor, loadout: saved });
    } catch (error) {
      console.warn(`${MODULE_ID} | The loadout was saved but its hotbar macros could not all be updated.`, error);
      ui.notifications.warn("The loadout was saved, but a linked hotbar macro could not be updated.");
    }
    this.selectedLoadoutId = saved.id;
    this.draft = this._draftFromLoadout(saved, collectRangedAttacks(this.actor), collectResourceTrackers(this.actor));
    await rememberView(this.actor, this.mode, saved.id);
    return saved;
  }

  async _switchActor(actorUuid) {
    const document = await fromUuid(actorUuid);
    const actor = document?.documentName === "Actor" ? document : document?.actor ?? null;
    if (!actor || (!actor.isOwner && !game.user.isGM)) throw new Error("That actor is unavailable or not owned by you.");
    this.actor = actor;
    this.actorUuid = actor.uuid;
    this._actorInitialised = "";
    this.selectedLoadoutId = "";
    this.draft = null;
    this.actorPickerOpen = false;
    return this.render({ force: true });
  }

  async _createTracker(kind) {
    this._readForm();
    const attacks = collectRangedAttacks(this.actor);
    const attack = attacks.find(record => record.path === this.draft.attackPath) ?? attacks[0] ?? null;
    const reserve = kind === "reserve";
    const capacity = reserve ? 100 : suggestedCapacity(attack);
    const suggestedName = `${attackLabel(attack) || "Ammunition"} ${reserve ? "Reserve" : "Magazine"}`;
    const result = await foundry.applications.api.DialogV2.input({
      window: { title: `Create ${reserve ? "Reserve" : "Magazine"} Tracker` },
      position: { width: 430 },
      content: `<div class="gga-ara-quick-prompt gga-ara-setup-fields">
        <p>Create a normal GGA Resource Tracker on <strong>${escapeHtml(this.actor.name)}</strong>.</p>
        <label>Name<input name="name" type="text" value="${escapeHtml(suggestedName)}" required autofocus></label>
        <label>Maximum<input name="maximum" type="number" min="1" step="1" value="${capacity}" required></label>
        <label>Current value<input name="current" type="number" min="0" step="1" value="${reserve ? 0 : capacity}" required></label>
      </div>`,
      ok: { label: "Create tracker" },
      rejectClose: false,
      modal: true
    });
    if (!result) return null;
    const [tracker] = await createResourceTrackers(this.actor, [{
      name: result.name,
      maximum: result.maximum,
      current: result.current
    }]);
    if (reserve) this.draft.reservePath = tracker.path;
    else {
      this.draft.ammoPath = tracker.path;
      this.draft.adjustTrackerPath = tracker.path;
    }
    ui.notifications.info(`${tracker.name} created.`);
    return this.render({ force: true });
  }

  async _runSetupWizard() {
    const attacks = collectRangedAttacks(this.actor);
    if (!attacks.length) throw new Error("Add a ranged attack to the actor before setting up ammunition.");
    const initialAttack = attacks.find(record => record.path === this.draft?.attackPath) ?? attacks[0];
    const capacity = suggestedCapacity(initialAttack);
    const attackOptions = attacks.map(attack => (
      `<option value="${escapeHtml(attack.path)}" ${attack.path === initialAttack.path ? "selected" : ""}>${escapeHtml(attackLabel(attack))}</option>`
    )).join("");
    const result = await foundry.applications.api.DialogV2.input({
      window: { title: "Set Up Ammunition" },
      position: { width: 540 },
      content: `<div class="gga-ara-quick-prompt gga-ara-setup-wizard">
        <p>Create the first ammunition tracker and saved loadout for <strong>${escapeHtml(this.actor.name)}</strong>.</p>
        <label>Ranged attack<select name="attackPath">${attackOptions}</select></label>
        <label>Loadout name<input name="loadoutName" type="text" value="${escapeHtml(attackLabel(initialAttack))}" required></label>
        <fieldset>
          <legend>Magazine or power source</legend>
          <label>Name<input name="magazineName" type="text" value="${escapeHtml(`${attackLabel(initialAttack)} Magazine`)}" required></label>
          <label>Capacity<input name="magazineMaximum" type="number" min="1" step="1" value="${capacity}" required></label>
          <label>Currently loaded<input name="magazineCurrent" type="number" min="0" step="1" value="${capacity}" required></label>
        </fieldset>
        <fieldset>
          <legend><label class="gga-ara-check"><input name="createReserve" type="checkbox"> Create a reserve tracker too</label></legend>
          <label>Reserve name<input name="reserveName" type="text" value="${escapeHtml(`${attackLabel(initialAttack)} Reserve`)}"></label>
          <label>Reserve maximum<input name="reserveMaximum" type="number" min="1" step="1" value="100"></label>
          <label>Reserve currently available<input name="reserveCurrent" type="number" min="0" step="1" value="100"></label>
        </fieldset>
        <label>Hotbar shooting<select name="hotbarShotMode"><option value="fixed">Fire the saved burst</option><option value="ask">Ask for shots each time</option></select></label>
        <label class="gga-ara-check"><input name="addToHotbar" type="checkbox"> Add the Fire action to my hotbar</label>
      </div>`,
      render: (_event, dialog) => {
        const element = dialog.element;
        const attackSelect = element.querySelector('select[name="attackPath"]');
        const fields = {
          loadoutName: element.querySelector('input[name="loadoutName"]'),
          magazineName: element.querySelector('input[name="magazineName"]'),
          magazineMaximum: element.querySelector('input[name="magazineMaximum"]'),
          magazineCurrent: element.querySelector('input[name="magazineCurrent"]'),
          reserveName: element.querySelector('input[name="reserveName"]')
        };
        const reserveToggle = element.querySelector('input[name="createReserve"]');
        const reserveFields = [
          fields.reserveName,
          element.querySelector('input[name="reserveMaximum"]'),
          element.querySelector('input[name="reserveCurrent"]')
        ];
        const syncReserve = () => reserveFields.forEach(field => { if (field) field.disabled = !reserveToggle?.checked; });
        reserveToggle?.addEventListener("change", syncReserve);
        syncReserve();
        Object.values(fields).forEach(field => field?.addEventListener("input", () => { field.dataset.touched = "true"; }));
        attackSelect?.addEventListener("change", () => {
          const selected = attacks.find(attack => attack.path === attackSelect.value);
          if (!selected) return;
          const label = attackLabel(selected);
          const nextCapacity = suggestedCapacity(selected);
          const suggestions = {
            loadoutName: label,
            magazineName: `${label} Magazine`,
            magazineMaximum: nextCapacity,
            magazineCurrent: nextCapacity,
            reserveName: `${label} Reserve`
          };
          for (const [name, value] of Object.entries(suggestions)) {
            const field = fields[name];
            if (field && !field.dataset.touched) field.value = value;
          }
        });
      },
      ok: { label: "Create loadout" },
      rejectClose: false,
      modal: true
    });
    if (!result) return null;

    const attack = attacks.find(record => record.path === result.attackPath);
    if (!attack) throw new Error("Choose a valid ranged attack.");
    if (!String(result.loadoutName ?? "").trim()) throw new Error("Enter a loadout name.");
    const definitions = [{
      name: result.magazineName,
      maximum: result.magazineMaximum,
      current: result.magazineCurrent
    }];
    if (result.createReserve) {
      definitions.push({
        name: result.reserveName,
        maximum: result.reserveMaximum,
        current: result.reserveCurrent
      });
    }
    const created = await createResourceTrackers(this.actor, definitions);
    const loadout = makeLoadout({
      name: result.loadoutName,
      actorUuid: this.actor.uuid,
      attack: { ...recordReference(attack, "attack"), img: attack.img || this.actor.img },
      ammo: recordReference(created[0]),
      reserve: recordReference(created[1]),
      shots: parseRateOfFire(attack.rof),
      hotbarShotMode: result.hotbarShotMode
    }, () => foundry.utils.randomID());
    const errors = validateLoadout(loadout, { maximumRof: parseRateOfFire(attack.rof) });
    if (errors.length) throw new Error(errors.join(" "));
    const saved = await upsertLoadout(this.actor, loadout);
    this.selectedLoadoutId = saved.id;
    this.draft = this._draftFromLoadout(saved, collectRangedAttacks(this.actor), collectResourceTrackers(this.actor));
    this._actorInitialised = this.actor.uuid;
    this.mode = ACTIONS.FIRE;
    await rememberView(this.actor, this.mode, saved.id);
    if (result.addToHotbar) {
      try {
        await saveLoadoutToHotbar({ actor: this.actor, loadout: saved, action: "fire" });
      } catch (error) {
        console.warn(`${MODULE_ID} | Initial setup succeeded but its hotbar action could not be created.`, error);
        ui.notifications.warn("The loadout was created, but its hotbar action could not be added.");
      }
    }
    ui.notifications.info(`${saved.name} is ready.`);
    return this.render({ force: true });
  }

  async _handleAction(action, target) {
    try {
      if (action === "toggle-actor-picker") {
        this.actorPickerOpen = !this.actorPickerOpen;
        return this.render({ force: true });
      }
      if (action === "select-actor") return this._switchActor(target.dataset.actorUuid);
      if (action === "use-selected") {
        const actor = selectedActor();
        if (!actor) throw new Error("Select exactly one token first.");
        this.actor = actor;
        this.actorUuid = actor.uuid;
        this._actorInitialised = "";
        this.selectedLoadoutId = "";
        this.draft = null;
        this.actorPickerOpen = false;
        return this.render({ force: true });
      }
      if (!this.actor) return;
      if (action === "create-magazine") return this._createTracker("magazine");
      if (action === "create-reserve") return this._createTracker("reserve");
      if (action === "setup-ammunition") return this._runSetupWizard();
      if (action === "mode") {
        this._readForm();
        this.mode = target.dataset.mode;
        await rememberView(this.actor, this.mode, this.selectedLoadoutId);
        return this.render({ force: true });
      }
      if (action === "new-loadout") {
        this.selectedLoadoutId = "";
        this.draft = this._newDraft(this.actor, collectRangedAttacks(this.actor), collectResourceTrackers(this.actor));
        this.mode = ACTIONS.FIRE;
        return this.render({ force: true });
      }
      if (action === "save-loadout") {
        await this._saveCurrent();
        ui.notifications.info(this._lastSyncedMacros
          ? `Loadout saved; ${this._lastSyncedMacros} linked hotbar action${this._lastSyncedMacros === 1 ? "" : "s"} updated.`
          : "Loadout saved.");
        return this.render({ force: true });
      }
      if (action === "fire") {
        const loadout = this._buildLoadout({ requireName: false });
        const result = await executeFire({ actor: this.actor, loadout, shots: this.draft.shots, promptIfConfigured: false });
        if (result.ok) return this.render({ force: true });
        return;
      }
      if (action === "reload") {
        const loadout = this._buildLoadout({ requireName: false });
        const result = await executeReload({ actor: this.actor, loadout });
        if (result.ok) return this.render({ force: true });
        return;
      }
      if (action === "adjust") {
        this._readForm();
        const tracker = collectResourceTrackers(this.actor, { includeDamage: true })
          .find(record => record.path === this.draft.adjustTrackerPath);
        if (!tracker) throw new Error("Choose a resource tracker.");
        const result = await executeAdjustment({
          actor: this.actor,
          trackerReference: recordReference(tracker),
          operation: this.draft.adjustOperation,
          amount: this.draft.adjustAmount,
          visibility: this.draft.visibility
        });
        if (result.ok) return this.render({ force: true });
        return;
      }
      if (action === "hotbar-fire" || action === "hotbar-reload") {
        const loadoutId = target.dataset.loadoutId;
        const loadout = loadoutId
          ? getLoadouts(this.actor).find(item => item.id === loadoutId)
          : await this._saveCurrent();
        if (!loadout) throw new Error("The saved loadout was not found.");
        await saveLoadoutToHotbar({
          actor: this.actor,
          loadout,
          action: action === "hotbar-reload" ? "reload" : "fire"
        });
        return this.render({ force: true });
      }
      if (action === "load-loadout") {
        const loadout = getLoadouts(this.actor).find(item => item.id === target.dataset.loadoutId);
        if (!loadout) throw new Error("The saved loadout was not found.");
        this.selectedLoadoutId = loadout.id;
        this.draft = this._draftFromLoadout(loadout, collectRangedAttacks(this.actor), collectResourceTrackers(this.actor));
        this.mode = ACTIONS.FIRE;
        await rememberView(this.actor, this.mode, loadout.id);
        return this.render({ force: true });
      }
      if (action === "duplicate-loadout") {
        const loadout = getLoadouts(this.actor).find(item => item.id === target.dataset.loadoutId);
        if (!loadout) throw new Error("The saved loadout was not found.");
        const duplicate = makeLoadout({ ...loadout, id: "", name: `${loadout.name} Copy` }, () => foundry.utils.randomID());
        await upsertLoadout(this.actor, duplicate);
        this.selectedLoadoutId = duplicate.id;
        this.draft = this._draftFromLoadout(duplicate, collectRangedAttacks(this.actor), collectResourceTrackers(this.actor));
        ui.notifications.info("Loadout duplicated.");
        return this.render({ force: true });
      }
      if (action === "delete-loadout") {
        const loadoutId = target.dataset.loadoutId;
        const loadout = getLoadouts(this.actor).find(item => item.id === loadoutId);
        if (!loadout) throw new Error("The saved loadout was not found.");
        const linkedMacros = findLoadoutMacros(this.actor.uuid, loadoutId);
        const buttons = linkedMacros.length ? [
          {
            action: "delete-all",
            icon: "fa-solid fa-trash",
            label: `Delete with ${linkedMacros.length} linked macro${linkedMacros.length === 1 ? "" : "s"}`,
            callback: () => "delete-all"
          },
          {
            action: "keep-macros",
            icon: "fa-solid fa-link-slash",
            label: "Delete loadout only",
            callback: () => "keep-macros"
          }
        ] : [{
          action: "delete",
          icon: "fa-solid fa-trash",
          label: "Delete",
          callback: () => "delete"
        }];
        buttons.push({
          action: "cancel",
          icon: "fa-solid fa-xmark",
          label: "Cancel",
          default: true,
          callback: () => "cancel"
        });
        const decision = await foundry.applications.api.DialogV2.wait({
          window: { title: "Delete Loadout" },
          content: `<p>Delete <strong>${escapeHtml(loadout.name)}</strong>?${linkedMacros.length
            ? " You can also remove its linked hotbar macros that you own."
            : ""}</p>`,
          buttons,
          rejectClose: false,
          modal: true
        });
        if (!decision || decision === "cancel") return;
        await removeLoadout(this.actor, loadoutId);
        const removedMacros = decision === "delete-all"
          ? await deleteLoadoutMacros(this.actor.uuid, loadoutId)
          : 0;
        if (this.selectedLoadoutId === loadoutId) {
          this.selectedLoadoutId = "";
          this._actorInitialised = "";
          this.draft = null;
        }
        ui.notifications.info(removedMacros
          ? `Loadout and ${removedMacros} linked hotbar macro${removedMacros === 1 ? "" : "s"} deleted.`
          : "Loadout deleted.");
        return this.render({ force: true });
      }
      if (action === "export-loadouts") {
        const payload = exportPayload(this.actor.name, getLoadouts(this.actor));
        saveDataToFile(JSON.stringify(payload, null, 2), "application/json", `${slug(this.actor.name)}-ammo-loadouts.json`);
        return;
      }
      if (action === "import-loadouts") {
        this.element.querySelector('input[name="importFile"]')?.click();
      }
    } catch (error) {
      console.error(`${MODULE_ID} |`, error);
      ui.notifications.error(error.message || String(error));
    }
  }

  async _selectLoadout(loadoutId) {
    this._readForm();
    const attacks = collectRangedAttacks(this.actor);
    const trackers = collectResourceTrackers(this.actor);
    if (!loadoutId) {
      this.selectedLoadoutId = "";
      this.draft = this._newDraft(this.actor, attacks, trackers);
    } else {
      const loadout = getLoadouts(this.actor).find(item => item.id === loadoutId);
      if (!loadout) return;
      this.selectedLoadoutId = loadout.id;
      this.draft = this._draftFromLoadout(loadout, attacks, trackers);
    }
    await rememberView(this.actor, this.mode, this.selectedLoadoutId);
    this.render({ force: true });
  }

  async _importFile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const imported = parseImportPayload(parsed, () => foundry.utils.randomID());
      const existing = getLoadouts(this.actor);
      await setLoadouts(this.actor, [...existing, ...imported]);
      ui.notifications.info(`${imported.length} loadout${imported.length === 1 ? "" : "s"} imported. Relink any unmatched trackers before use.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} |`, error);
      ui.notifications.error(error.message || "The loadout file could not be imported.");
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._preventSubmit ??= event => event.preventDefault();
    this.element.removeEventListener("submit", this._preventSubmit);
    this.element.addEventListener("submit", this._preventSubmit);
    this.element.querySelectorAll("[data-action]").forEach(element => {
      element.addEventListener("click", event => {
        event.preventDefault();
        this._handleAction(element.dataset.action, element);
      });
    });
    this.element.querySelector('select[name="selectedLoadoutId"]')?.addEventListener("change", event => {
      this._selectLoadout(event.currentTarget.value);
    });
    this.element.querySelector('input[name="importFile"]')?.addEventListener("change", event => {
      const file = event.currentTarget.files?.[0];
      if (file) this._importFile(file);
      event.currentTarget.value = "";
    });
    this.element.querySelector('input[name="actorSearch"]')?.addEventListener("input", event => {
      const query = String(event.currentTarget.value ?? "").trim().toLowerCase();
      this.element.querySelectorAll("[data-actor-option]").forEach(option => {
        option.hidden = Boolean(query && !String(option.dataset.actorName ?? "").includes(query));
      });
    });
    this.element.querySelectorAll("[data-hotbar-drag]").forEach(element => {
      element.addEventListener("dragstart", event => {
        event.dataTransfer.setData("text/plain", element.dataset.hotbarDrag);
        event.dataTransfer.effectAllowed = "copy";
      });
    });
    this.element.querySelectorAll("select, input").forEach(element => {
      if (["selectedLoadoutId", "importFile"].includes(element.name)) return;
      element.addEventListener("change", () => {
        this._readForm();
        if (element.name === "attackPath") {
          const attacks = collectRangedAttacks(this.actor);
          const trackers = collectResourceTrackers(this.actor);
          const attack = attacks.find(record => record.path === this.draft.attackPath);
          if (!this.draft.id && attack) {
            this.draft.name = attackLabel(attack);
            this.draft.shots = parseRateOfFire(attack.rof);
            this.draft.ammoPath = suggestTracker(attack, trackers)?.path ?? this.draft.ammoPath;
          }
        }
        if (["attackPath", "ammoPath", "reservePath", "reloadMode", "shots", "unitsPerShot", "flatCost", "lowWarningAt"].includes(element.name)) {
          this.render({ force: true });
        }
      });
    });
    this.element.querySelectorAll("details.gga-ara-advanced").forEach(details => {
      details.addEventListener("toggle", () => {
        this.advancedOpen = details.open;
        rememberAdvanced(details.open);
      });
    });
  }
}
