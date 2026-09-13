import test from 'node:test';
import assert from 'node:assert/strict';

function getProperty(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function setProperty(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((current, key) => (current[key] ??= {}), object);
  target[last] = value;
}

globalThis.foundry = {
  utils: {
    getProperty,
    escapeHTML: (value) => String(value),
  },
  applications: {
    api: {
      DialogV2: {
        wait: async () => 'cancel',
        input: async () => null,
      },
    },
  },
};
globalThis.canvas = { tokens: { controlled: [] } };
const notificationWarnings = [];
globalThis.ui = {
  notifications: {
    error() {},
    warn(message) {
      notificationWarnings.push(message);
    },
    info() {},
  },
};
const createdMessages = [];
let messageFailure = false;
globalThis.ChatMessage = {
  create: async (data) => {
    if (messageFailure) throw new Error('Chat unavailable');
    createdMessages.push(data);
    return data;
  },
  getSpeaker: ({ actor }) => ({ actor: actor.id }),
  getWhisperRecipients: () => [{ id: 'gm-1' }],
  applyRollMode(data, mode) {
    data.appliedRollMode = mode;
  },
};

const settingValues = new Map([
  ['gga-ammo-resource-assistant.chatReceipts', false],
  ['gga-ammo-resource-assistant.gmOverrides', false],
  ['gga-ammo-resource-assistant.defaultVisibility', 'inherit'],
  ['core.rollMode', 'publicroll'],
  ['core.messageMode', 'publicroll'],
]);
globalThis.game = {
  user: { id: 'user-1', isGM: false },
  release: { generation: 14 },
  settings: {
    get: (namespace, key) => settingValues.get(`${namespace}.${key}`),
  },
  i18n: { localize: (key) => key },
};

const { executeAdjustment, executeFire, executeReload } = await import('../scripts/operations.mjs');
const { shotPromptBridge } = await import('../scripts/gga-adapter.mjs');

function fixture({
  rof = '1',
  ammunition = 6,
  minimum = 0,
  minimumEnforced = false,
  isOwner = true,
} = {}) {
  const actor = {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    name: 'Tester',
    img: 'tester.webp',
    isOwner,
    system: {
      ranged: {
        '0000': { name: 'Pistol', mode: 'Standard', rof, level: 12 },
      },
      additionalresources: {
        tracker: {
          '0000': {
            name: 'Pistol Magazine',
            value: ammunition,
            min: minimum,
            max: 12,
            isMinimumEnforced: minimumEnforced,
          },
          '0001': {
            name: 'Pistol Reserve',
            value: 20,
            min: 5,
            max: 100,
            isMinimumEnforced: true,
          },
        },
      },
    },
    async update(changes) {
      this.updates ??= [];
      this.updates.push(changes);
      for (const [path, value] of Object.entries(changes)) setProperty(this, path, value);
    },
  };
  const loadout = {
    id: 'loadout-1',
    name: 'Pistol',
    attack: { path: 'ranged.0000', name: 'Pistol', mode: 'Standard', uuid: '' },
    ammo: { path: 'additionalresources.tracker.0000', name: 'Pistol Magazine' },
    reserve: null,
    shots: 1,
    hotbarShotMode: 'fixed',
    unitsPerShot: 1,
    flatCost: 0,
    lowWarningAt: 0,
    visibility: 'inherit',
  };
  return { actor, loadout };
}

test.beforeEach(() => {
  createdMessages.length = 0;
  notificationWarnings.length = 0;
  messageFailure = false;
  settingValues.set('gga-ammo-resource-assistant.chatReceipts', false);
  settingValues.set('gga-ammo-resource-assistant.gmOverrides', false);
  game.user.isGM = false;
  game.release.generation = 14;
  settingValues.set('core.rollMode', 'gmroll');
  settingValues.set('core.messageMode', 'publicroll');
  shotPromptBridge.installed = true;
  shotPromptBridge.active = null;
  globalThis.GURPS = {
    LastActor: { id: 'previous-actor' },
    LastTokenDocument: { id: 'previous-token' },
    lastTargetedRolls: {},
    SetLastActor(actor, tokenDocument) {
      this.LastActor = actor;
      this.LastTokenDocument = tokenDocument;
    },
    async executeOTF() {
      this.lastTargetedRolls['actor-1'] = { thing: 'Pistol' };
      return true;
    },
  };
});

test('a completed GGA attack deducts ammunition after the roll', async () => {
  const { actor, loadout } = fixture();
  const result = await executeFire({ actor, loadout, shots: 1, promptIfConfigured: false });

  assert.equal(result.ok, true);
  assert.equal(result.before, 6);
  assert.equal(result.after, 5);
  assert.deepEqual(actor.updates, [{ 'system.additionalresources.tracker.0000.value': 5 }]);
});

test('a GGA miss still deducts ammunition and restores the previous LastActor context', async () => {
  const { actor, loadout } = fixture();
  const previousActor = GURPS.LastActor;
  const previousToken = GURPS.LastTokenDocument;
  GURPS.executeOTF = async () => {
    GURPS.lastTargetedRolls['actor-1'] = { thing: 'Pistol' };
    return false;
  };

  const result = await executeFire({ actor, loadout, shots: 1, promptIfConfigured: false });

  assert.equal(result.ok, true);
  assert.equal(result.after, 5);
  assert.equal(GURPS.LastActor, previousActor);
  assert.equal(GURPS.LastTokenDocument, previousToken);
});

test('an unlinked token attack is detected by its token id and restores token context', async () => {
  const { actor, loadout } = fixture();
  actor.token = { id: 'token-1' };
  const previousActor = GURPS.LastActor;
  const previousToken = GURPS.LastTokenDocument;
  let executionToken;
  GURPS.executeOTF = async () => {
    executionToken = GURPS.LastTokenDocument;
    GURPS.lastTargetedRolls['token-1'] = { thing: 'Pistol' };
    return true;
  };

  const result = await executeFire({ actor, loadout, shots: 1, promptIfConfigured: false });

  assert.equal(result.ok, true);
  assert.equal(executionToken, actor.token);
  assert.equal(GURPS.LastActor, previousActor);
  assert.equal(GURPS.LastTokenDocument, previousToken);
});

test('Fire respects an enforced non-zero tracker minimum', async () => {
  const { actor, loadout } = fixture({ ammunition: 6, minimum: 4, minimumEnforced: true });
  loadout.unitsPerShot = 2;

  const result = await executeFire({ actor, loadout, shots: 1, promptIfConfigured: false });

  assert.equal(result.ok, true);
  assert.equal(result.after, 4);
});

test('a cancelled GGA attack does not deduct ammunition', async () => {
  const { actor, loadout } = fixture();
  GURPS.executeOTF = async () => false;

  const result = await executeFire({ actor, loadout, shots: 1, promptIfConfigured: false });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-rolled');
  assert.equal(actor.system.additionalresources.tracker['0000'].value, 6);
  assert.equal(actor.updates, undefined);
});

test('a rapid-fire attack uses the loadout shot count and matching resource cost', async () => {
  const { actor, loadout } = fixture({ rof: '3x9', ammunition: 10 });
  loadout.shots = 3;
  loadout.unitsPerShot = 2;
  loadout.flatCost = 1;
  GURPS.executeOTF = async () => {
    shotPromptBridge.active.promptSeen = true;
    GURPS.lastTargetedRolls['actor-1'] = { thing: 'Pistol' };
    return true;
  };

  const result = await executeFire({ actor, loadout, shots: 3, promptIfConfigured: false });

  assert.equal(result.ok, true);
  assert.equal(result.shots, 3);
  assert.equal(result.spent, 7);
  assert.equal(result.after, 3);
});

test('a missed GGA shot prompt leaves rapid-fire ammunition untouched', async () => {
  const { actor, loadout } = fixture({ rof: '3', ammunition: 10 });
  loadout.shots = 3;

  const result = await executeFire({ actor, loadout, shots: 3, promptIfConfigured: false });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'compatibility');
  assert.equal(actor.system.additionalresources.tracker['0000'].value, 10);
  assert.equal(actor.updates, undefined);
});

test('a loadout can target one usage when a weapon has several modes', async () => {
  const { actor, loadout } = fixture();
  actor.system.ranged['0001'] = { name: 'Pistol', mode: 'Burst', rof: '3', level: 12 };

  const result = await executeFire({ actor, loadout, shots: 1, promptIfConfigured: false });

  assert.equal(result.ok, true);
  assert.equal(result.after, 5);
});

test('players cannot spend from an actor they do not own, while a GM can', async () => {
  const playerFixture = fixture({ isOwner: false });
  const originalConsoleError = console.error;
  let denied;
  try {
    console.error = () => {};
    denied = await executeFire({
      actor: playerFixture.actor,
      loadout: playerFixture.loadout,
      shots: 1,
      promptIfConfigured: false,
    });
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(denied.ok, false);
  assert.equal(playerFixture.actor.updates, undefined);

  game.user.isGM = true;
  const gmFixture = fixture({ isOwner: false });
  const allowed = await executeFire({
    actor: gmFixture.actor,
    loadout: gmFixture.loadout,
    shots: 1,
    promptIfConfigured: false,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.after, 5);
});

test('self-only receipts remain visible only to the acting user', async () => {
  const { actor, loadout } = fixture();
  loadout.visibility = 'self';
  settingValues.set('gga-ammo-resource-assistant.chatReceipts', true);

  const result = await executeFire({ actor, loadout, shots: 1, promptIfConfigured: false });

  assert.equal(result.ok, true);
  assert.deepEqual(createdMessages.at(-1).whisper, ['user-1']);
  assert.equal(createdMessages.at(-1).blind, undefined);
});

test("inherited receipts preserve a captured blind attack's visibility", async () => {
  const { actor, loadout } = fixture();
  settingValues.set('gga-ammo-resource-assistant.chatReceipts', true);
  GURPS.executeOTF = async () => {
    shotPromptBridge.observeChatMessage({
      speaker: { actor: 'actor-1' },
      rolls: [{}],
      content: 'Pistol attack',
      whisper: ['gm-1'],
      blind: true,
    });
    GURPS.lastTargetedRolls['actor-1'] = { thing: 'Pistol' };
    return true;
  };

  const result = await executeFire({ actor, loadout, shots: 1, promptIfConfigured: false });

  assert.equal(result.ok, true);
  assert.deepEqual(createdMessages.at(-1).whisper, ['gm-1']);
  assert.equal(createdMessages.at(-1).blind, true);
});

test("receipt fallbacks use Foundry 14's message mode and Foundry 13's roll mode", async () => {
  settingValues.set('gga-ammo-resource-assistant.chatReceipts', true);
  const v14 = fixture();
  await executeFire({
    actor: v14.actor,
    loadout: v14.loadout,
    shots: 1,
    promptIfConfigured: false,
  });
  assert.equal(createdMessages.at(-1).appliedRollMode, 'publicroll');

  createdMessages.length = 0;
  game.release.generation = 13;
  const v13 = fixture();
  await executeFire({
    actor: v13.actor,
    loadout: v13.loadout,
    shots: 1,
    promptIfConfigured: false,
  });
  assert.equal(createdMessages.at(-1).appliedRollMode, 'gmroll');
});

test('a failed Fire receipt does not report a successful tracker update as failed', async () => {
  const { actor, loadout } = fixture();
  settingValues.set('gga-ammo-resource-assistant.chatReceipts', true);
  messageFailure = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await executeFire({ actor, loadout, shots: 1, promptIfConfigured: false });
    assert.equal(result.ok, true);
    assert.equal(result.after, 5);
  } finally {
    console.error = originalConsoleError;
  }
  assert.match(notificationWarnings.at(-1), /receipt could not be posted/i);
});

test('failed Reload and Adjust receipts also preserve successful updates', async () => {
  const { actor, loadout } = fixture();
  loadout.reserve = { path: 'additionalresources.tracker.0001', name: 'Pistol Reserve' };
  settingValues.set('gga-ammo-resource-assistant.chatReceipts', true);
  messageFailure = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const reloaded = await executeReload({ actor, loadout, amount: 2 });
    assert.equal(reloaded.ok, true);
    assert.equal(actor.system.additionalresources.tracker['0000'].value, 8);
    assert.equal(actor.system.additionalresources.tracker['0001'].value, 18);

    const adjusted = await executeAdjustment({
      actor,
      trackerReference: { path: 'additionalresources.tracker.0000', name: 'Pistol Magazine' },
      operation: 'spend',
      amount: 1,
    });
    assert.equal(adjusted.ok, true);
    assert.equal(actor.system.additionalresources.tracker['0000'].value, 7);
  } finally {
    console.error = originalConsoleError;
  }
});
