import test from 'node:test';
import assert from 'node:assert/strict';

function setProperty(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((current, key) => (current[key] ??= {}), object);
  target[last] = value;
}

globalThis.foundry = {
  utils: {
    getProperty: (object, path) => path.split('.').reduce((value, key) => value?.[key], object),
  },
};
globalThis.canvas = { tokens: { controlled: [] } };
globalThis.game = {
  user: { isGM: false },
  actors: { contents: [] },
  i18n: { localize: (key) => key },
};
globalThis.fromUuid = async () => null;

const { actorFromUuid, availableActors, createResourceTrackers, shotPromptBridge } =
  await import('../scripts/gga-adapter.mjs');

function actorFixture() {
  return {
    id: 'actor-1',
    name: 'Riley',
    uuid: 'Actor.actor-1',
    isOwner: true,
    system: {
      additionalresources: {
        tracker: {
          '0000': { name: 'Existing', value: 2, min: 0, max: 5 },
        },
      },
    },
    async update(changes) {
      this.updates ??= [];
      this.updates.push(changes);
      for (const [path, value] of Object.entries(changes)) setProperty(this, path, value);
    },
  };
}

test.beforeEach(() => {
  game.user.isGM = false;
  game.actors.contents = [];
  shotPromptBridge.active = null;
});

test('creates magazine and reserve trackers together using GGA tracker fields', async () => {
  const actor = actorFixture();
  const created = await createResourceTrackers(actor, [
    { name: 'Pistol Magazine', maximum: 15, current: 12 },
    { name: 'Pistol Reserve', maximum: 100, current: 45 },
  ]);

  assert.deepEqual(
    created.map((tracker) => tracker.path),
    ['additionalresources.tracker.0001', 'additionalresources.tracker.0002'],
  );
  assert.equal(actor.updates.length, 1);
  const magazine = actor.system.additionalresources.tracker['0001'];
  assert.equal(magazine.value, 12);
  assert.equal(magazine.max, 15);
  assert.equal(magazine.min, 0);
  assert.equal(magazine.isDamageTracker, false);
  assert.equal(magazine.isMinimumEnforced, true);
  assert.equal(magazine.isMaximumEnforced, true);
});

test('refuses duplicate tracker names and invalid current values before updating', async () => {
  const actor = actorFixture();
  await assert.rejects(
    createResourceTrackers(actor, [{ name: 'Existing', maximum: 10, current: 5 }]),
    /already exists/,
  );
  await assert.rejects(
    createResourceTrackers(actor, [{ name: 'Magazine', maximum: 10, current: 11 }]),
    /between 0 and 10/,
  );
  assert.equal(actor.updates, undefined);
});

test('actor choices include owned actors for players and all actors for GMs', () => {
  game.actors.contents = [
    { name: 'Zulu', isOwner: false },
    { name: 'Alpha', isOwner: true },
  ];
  assert.deepEqual(
    availableActors().map((actor) => actor.name),
    ['Alpha'],
  );
  game.user.isGM = true;
  assert.deepEqual(
    availableActors().map((actor) => actor.name),
    ['Alpha', 'Zulu'],
  );
});

test('resolves both world actors and actors attached to token documents', async () => {
  const worldActor = { documentName: 'Actor', id: 'a' };
  const tokenActor = { documentName: 'Actor', id: 'b' };
  const tokenDocument = { documentName: 'Token', actor: tokenActor };
  globalThis.fromUuid = async (uuid) => (uuid === 'Actor.a' ? worldActor : tokenDocument);

  assert.equal(await actorFromUuid('Actor.a'), worldActor);
  assert.equal(await actorFromUuid('Scene.s.Token.t'), tokenActor);
});

test("the shot bridge intercepts only GGA's number-of-shots prompt", async () => {
  let wrappedCalls = 0;
  shotPromptBridge.active = { shots: 3, promptSeen: false };
  const wrapped = async () => {
    wrappedCalls += 1;
    return 9;
  };

  const ordinary = await shotPromptBridge.handlePrompt(wrapped, {
    window: { title: 'Confirm Roll' },
  });
  const shots = await shotPromptBridge.handlePrompt(wrapped, {
    window: { title: 'GURPS.combat.rof.numberOfShotsTitle' },
  });
  assert.equal(ordinary, 9);
  assert.equal(shots, 3);
  assert.equal(wrappedCalls, 1);
  assert.equal(shotPromptBridge.active.promptSeen, true);
});
