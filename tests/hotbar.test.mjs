import test from 'node:test';
import assert from 'node:assert/strict';

const MODULE_ID = 'gga-ammo-resource-assistant';

function macroFixture({ id, actorUuid, loadoutId, action }) {
  return {
    id,
    isOwner: true,
    flag: { actorUuid, loadoutId, action },
    getFlag: () => ({ actorUuid, loadoutId, action }),
    async update(changes) {
      this.updated = changes;
    },
    async delete() {
      this.deleted = true;
    },
  };
}

const opened = [];
globalThis.game = {
  macros: [],
  user: {
    id: 'user-1',
    isGM: false,
    hotbar: {},
    async assignHotbarMacro(macro, slot) {
      this.assignments ??= [];
      this.assignments.push({ macro, slot });
    },
  },
  modules: new Map([[MODULE_ID, { api: { open: (options) => opened.push(options) } }]]),
};
globalThis.ui = { notifications: { error() {}, warn() {}, info() {} }, hotbar: { page: 1 } };
globalThis.canvas = { tokens: { controlled: [] } };
globalThis.foundry = { utils: { getProperty() {} } };
globalThis.Macro = { create: async (data) => data };
globalThis.fromUuid = async () => null;

const { deleteLoadoutMacros, findLoadoutMacros, handleHotbarDrop, runHotbar, syncLoadoutMacros } =
  await import('../scripts/hotbar.mjs');

test.beforeEach(() => {
  game.macros.length = 0;
  game.user.hotbar = {};
  game.user.assignments = [];
  opened.length = 0;
});

test('saving a loadout synchronises the names, icons, and linked commands of its macros', async () => {
  const fire = macroFixture({ id: 'm1', actorUuid: 'Actor.a', loadoutId: 'l1', action: 'fire' });
  const reload = macroFixture({
    id: 'm2',
    actorUuid: 'Actor.a',
    loadoutId: 'l1',
    action: 'reload',
  });
  const unrelated = macroFixture({
    id: 'm3',
    actorUuid: 'Actor.other',
    loadoutId: 'l1',
    action: 'fire',
  });
  game.macros.push(fire, reload, unrelated);
  const actor = { uuid: 'Actor.a', img: 'actor.webp' };
  const loadout = { id: 'l1', name: 'Carbine Burst', attack: { img: 'carbine.webp' } };

  assert.equal(findLoadoutMacros(actor.uuid, loadout.id).length, 2);
  assert.equal(await syncLoadoutMacros({ actor, loadout }), 2);
  assert.equal(fire.updated.name, 'Fire – Carbine Burst');
  assert.equal(reload.updated.name, 'Reload – Carbine Burst');
  assert.equal(fire.updated.img, 'carbine.webp');
  assert.match(fire.updated.command, /runHotbar/);
  assert.match(fire.updated.command, /typeof event/);
  assert.doesNotMatch(fire.updated.command, /Carbine Burst/);
  assert.equal(unrelated.updated, undefined);
});

test('deleting linked macros clears their occupied hotbar slots first', async () => {
  const fire = macroFixture({ id: 'm1', actorUuid: 'Actor.a', loadoutId: 'l1', action: 'fire' });
  const reload = macroFixture({
    id: 'm2',
    actorUuid: 'Actor.a',
    loadoutId: 'l1',
    action: 'reload',
  });
  game.macros.push(fire, reload);
  game.user.hotbar = { 2: 'm1', 8: 'other', 14: 'm2' };

  assert.equal(await deleteLoadoutMacros('Actor.a', 'l1'), 2);
  assert.deepEqual(game.user.assignments, [
    { macro: null, slot: 2 },
    { macro: null, slot: 14 },
  ]);
  assert.equal(fire.deleted, true);
  assert.equal(reload.deleted, true);
});

test('shift-clicking a generated macro opens its loadout without firing', async () => {
  const actor = {
    documentName: 'Actor',
    uuid: 'Actor.a',
    name: 'Riley',
    getFlag: () => [
      {
        id: 'l1',
        name: 'Pistol',
        attack: { path: 'ranged.0', name: 'Pistol' },
        ammo: { path: 'tracker.0', name: 'Magazine' },
      },
    ],
  };
  globalThis.fromUuid = async () => actor;

  await runHotbar({ actorUuid: actor.uuid, loadoutId: 'l1', action: 'reload' }, { shiftKey: true });
  assert.deepEqual(opened, [{ actor, loadoutId: 'l1', mode: 'reload' }]);
});

test('hotbarDrop cancellation is synchronous for recognised assistant drops', () => {
  const actor = {
    documentName: 'Actor',
    uuid: 'Actor.a',
    name: 'Riley',
    img: 'riley.webp',
    getFlag: () => [
      { id: 'l1', name: 'Pistol', attack: { name: 'Pistol' }, ammo: { name: 'Magazine' } },
    ],
  };
  globalThis.fromUuid = async () => actor;
  assert.equal(handleHotbarDrop(null, { type: 'SomethingElse' }, 1), true);
  assert.equal(
    handleHotbarDrop(
      null,
      { type: MODULE_ID, actorUuid: actor.uuid, loadoutId: 'l1', action: 'fire' },
      1,
    ),
    false,
  );
});
