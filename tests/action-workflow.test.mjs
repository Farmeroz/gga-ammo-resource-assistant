import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
const get = (o, p) => p.split('.').reduce((v, k) => v?.[k], o);
const set = (o, p, v) => {
  const k = p.split('.'),
    last = k.pop();
  k.reduce((r, n) => (r[n] ??= {}), o)[last] = v;
};
globalThis.foundry = {
  utils: { getProperty: get, randomID: () => 'saved' },
  applications: { api: { DialogV2: { input: async () => null } } },
};
globalThis.canvas = { tokens: { controlled: [], placeables: [] } };
const settings = new Map();
globalThis.game = {
  user: { id: 'user', isGM: false },
  release: { generation: 14 },
  settings: { get: (_, key) => settings.get(key) },
  i18n: { localize: (k) => k },
};
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
const messages = [];
globalThis.ChatMessage = {
  create: async (d) => {
    messages.push(d);
    return d;
  },
  getSpeaker: ({ actor }) => ({ actor: actor.id }),
  getWhisperRecipients: () => [{ id: 'gm' }],
  applyRollMode: (d, mode) => {
    if (mode === 'blindroll') {
      d.whisper = ['gm'];
      d.blind = true;
    }
  },
};
const { ActionWorkflow } = await import('../scripts/action-workflow.mjs');
const { shotPromptBridge } = await import('../scripts/gga-adapter.mjs');
let resultQueue = [],
  rolls = [];
function actor() {
  return {
    id: 'archer',
    uuid: 'Actor.archer',
    isOwner: true,
    name: 'Archer',
    flags: {},
    system: {
      attributes: { ST: { value: 10 }, DX: { value: 12 } },
      liftingmoving: { basiclift: '20 lb' },
      thrust: '1d-2',
      swing: '1d',
      skills: {
        bow: { name: 'Bow', level: 18 },
        draw: { name: 'Fast-Draw (Arrow)', level: 16 },
        knife: { name: 'Fast-Draw (Knife)', level: 16 },
        art: { name: 'Throwing Art', level: 16 },
      },
      ads: { ha: { name: 'Heroic Archer' }, ht: { name: 'Heroic Thrower' } },
      ranged: {
        bow: { name: 'Longbow', mode: 'Shot', level: 18, rof: '1', acc: '3' },
        knife: { name: 'Knife', mode: 'Thrown', level: 16, rof: '1', acc: '1' },
      },
      additionalresources: {
        tracker: {
          ammo: {
            name: 'Arrows',
            value: 10,
            min: 0,
            max: 20,
            isMinimumEnforced: true,
            isMaximumEnforced: true,
          },
        },
      },
    },
    async update(changes) {
      for (const [p, v] of Object.entries(changes)) set(this, p, v);
    },
    getFlag(ns, k) {
      return this.flags?.[ns]?.[k];
    },
  };
}
function workflow(kind = 'bow') {
  const w = new ActionWorkflow(actor(), kind);
  w.data.attackPath = kind === 'throw' ? 'ranged.knife' : 'ranged.bow';
  w.data.ammoPath = 'additionalresources.tracker.ammo';
  return w;
}
test.beforeEach(() => {
  settings.clear();
  for (const key of [
    'quickBows',
    'doubleArrows',
    'dfArchery',
    'rapidThrows',
    'heroicThrows',
    'throwingArt',
    'chatReceipts',
  ])
    settings.set(key, true);
  settings.set('defaultVisibility', 'inherit');
  settings.set('messageMode', 'blindroll');
  game.user.isGM = false;
  messages.length = 0;
  rolls = [];
  resultQueue = [];
  shotPromptBridge.installed = true;
  shotPromptBridge.active = null;
  globalThis.GURPS = {
    LastActor: null,
    lastTargetedRolls: {},
    SetLastActor(a, t) {
      this.LastActor = a;
      this.LastTokenDocument = t;
    },
    ModifierBucket: {
      modifierStack: { modifierList: [{ modint: -4, desc: 'Range' }] },
      clear() {
        this.modifierStack.modifierList = [];
      },
      addModifier(modint, desc) {
        this.modifierStack.modifierList.push({ modint, desc });
      },
    },
    async executeOTF(otf, _a, _b, a) {
      rolls.push({ otf, mods: structuredClone(this.ModifierBucket.modifierStack.modifierList) });
      const next = resultQueue.shift() ?? 'success';
      if (next === 'cancel') return false;
      this.lastTargetedRolls[a.id] = {
        thing: otf.startsWith('[R:') ? 'Longbow' : 'skill',
        failure: next === 'fail' || next === 'critical',
        isCritFailure: next === 'critical',
      };
      this.ModifierBucket.clear();
      return next === 'success';
    },
  };
});
test('bow sequence isolates preparation modifiers and spends only after the attack', async () => {
  const w = workflow();
  await w.next();
  assert.equal(rolls[0].mods.length, 0);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
  assert.deepEqual(GURPS.ModifierBucket.modifierStack.modifierList, [
    { modint: -4, desc: 'Range' },
  ]);
  await w.next();
  assert.equal(rolls[1].mods[0].modint, -3);
  await w.next();
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
  assert.equal(w.session, null);
  assert.deepEqual(
    rolls[2].mods.map((m) => m.modint),
    [-4, -3, 3],
  );
});
test('cancelled prerequisite and attack rolls do not advance or spend', async () => {
  const w = workflow();
  resultQueue = ['cancel'];
  await w.next();
  assert.equal(w.session.index, 0);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
  w.session = null;
  w.data.start = 'ready';
  resultQueue = ['cancel'];
  await w.next();
  assert.equal(w.session.index, 0);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
  assert.deepEqual(GURPS.ModifierBucket.modifierStack.modifierList, [
    { modint: -4, desc: 'Range' },
  ]);
});
test('failed bow readying retains readiness for a later unpenalised shot', async () => {
  const w = workflow();
  w.data.start = 'drawn';
  resultQueue = ['fail'];
  await w.next();
  assert.equal(w.data.start, 'ready');
  assert.equal(w.session, null);
  assert.equal(w.compute().quick, 0);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
});
test('failed arrow draw records a dropped, recoverable arrow with atomic undo data', async () => {
  const w = workflow();
  resultQueue = ['fail'];
  await w.next();
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
  assert.equal(get(w.actor, 'flags.gga-ammo-resource-assistant.recoverable.ammo'), 1);
  assert.equal(w.session, null);
  const receipt = messages.at(-1).flags['gga-ammo-resource-assistant'].receipt;
  assert.equal(receipt.changes.length, 2);
  assert.equal(messages.at(-1).blind, true);
});
test('two-arrow attacks are separate single-shot rolls and retain first cost on second cancellation', async () => {
  const w = workflow();
  w.data.start = 'ready';
  w.data.twoArrows = true;
  await w.next();
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
  resultQueue = ['cancel'];
  await w.next();
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
  assert.equal(w.session.index, 1);
});
test('player can run despite campaign warnings, which are posted once even with receipts off', async () => {
  const w = workflow();
  settings.set('quickBows', false);
  settings.set('playerRuleOverrides', false);
  settings.set('chatReceipts', false);
  assert.equal(w.compute().allowed, true);
  const dom = parseHTML(w.render()).document;
  assert.equal(dom.querySelector('[data-action="wf-run"]').hasAttribute('disabled'), false);
  assert.equal(dom.querySelector('[name="wf.overrideReason"]'), null);
  assert.equal(dom.querySelector('[name="wf.override"]'), null);
  assert.match(
    dom.querySelector('.gga-ara-rule-advisory').textContent,
    /Quick-shooting enabled by GM/,
  );
  await w.run();
  assert.equal(rolls.length, 3);
  const notes = messages.filter((m) =>
    m.content.includes('Sequence started with unmet rule checks'),
  );
  assert.equal(notes.length, 1);
  assert.match(notes[0].content, /Quick-shooting enabled by GM/);
  assert.equal(notes[0].blind, true);
});

test('rule advisories are not posted for cancelled rolls; unusable inputs still block', async () => {
  const w = workflow();
  settings.set('quickBows', false);
  resultQueue = ['cancel'];
  await w.run();
  assert.equal(messages.length, 0);
  w.session = null;
  w.data.bowPath = 'none';
  assert.equal(w.compute().allowed, false);
  w.data.bowOverride = 18;
  assert.equal(w.compute().allowed, true);
  w.actor.isOwner = false;
  assert.equal(w.compute().allowed, false);
});

test('legacy saved override values no longer gate execution or require a reason', async () => {
  const w = workflow();
  const saved = w.loadout();
  saved.workflow.override = false;
  saved.workflow.overrideReason = '';
  settings.set('quickBows', false);
  settings.set('playerRuleOverrides', false);
  const reopened = new ActionWorkflow(w.actor, 'bow', saved);
  assert.equal(reopened.compute().allowed, true);
  assert.equal('overrideReason' in reopened.loadout().workflow, false);
  await reopened.run();
  assert.equal(rolls.length, 3);
});
test('Heroic Thrower waives ordinary Fast-Draw at 16 and applies separate hand penalties', () => {
  const w = workflow('throw');
  w.data.heroicSmall = true;
  w.data.drawPath = 'skills.knife';
  w.data.count = 3;
  w.data.offCount = 2;
  const steps = w.steps(w.compute());
  assert.equal(steps[0].automatic, true);
  assert.equal(steps[1].mod, -8);
  assert.equal(steps[7].mod, -5);
});
test('object view hides bow controls and ordinary view omits cinematic profiles', () => {
  const w = workflow('object');
  const { document } = parseHTML(w.render());
  assert.ok(document.querySelector('[name="wf.weight"]'));
  assert.equal(document.querySelector('[name="wf.twoArrows"]'), null);
  assert.equal(document.querySelector('[name="wf.profile"]'), null);
  w.data.method = 'art';
  assert.ok(parseHTML(w.render()).document.querySelector('[name="wf.profile"]'));
});
test('object throws have no tracker requirement and use B356 corrected distance', async () => {
  const w = workflow('object');
  w.data.ammoPath = '';
  w.data.weight = 2.5;
  w.data.method = 'art';
  w.data.methodPath = 'skills.art';
  assert.equal(w.compute().calc.distance, 24);
  await w.next();
  assert.equal(w.lastDamage, '1d-2 cr');
  assert.equal(w.session, null);
});
test('a failure after an executed roll terminates the sequence to prevent duplicate attacks', async () => {
  const w = workflow();
  w.data.start = 'ready';
  w.actor.update = async () => {
    throw new Error('Update failed');
  };
  await assert.rejects(() => w.next(), /Update failed/);
  assert.equal(w.session, null);
  assert.match(w.status, /roll occurred/);
});
test('busy workflows reject a second click while an asynchronous roll is outstanding', async () => {
  const w = workflow();
  let finish;
  GURPS.executeOTF = () => new Promise((r) => (finish = r));
  const first = w.next();
  await w.next();
  assert.equal(w.busy, true);
  finish(false);
  await first;
  assert.equal(w.busy, false);
  assert.equal(w.session.index, 0);
});
test('saved skill links follow identity and missing ammunition never becomes untracked', () => {
  const w = workflow();
  const saved = w.loadout();
  w.actor.system.skills.renamed = w.actor.system.skills.bow;
  w.actor.system.skills.bow = { name: 'Cooking', level: 20 };
  delete w.actor.system.additionalresources.tracker.ammo;
  const restored = new ActionWorkflow(w.actor, 'bow', saved);
  assert.equal(restored.data.bowPath, 'skills.renamed');
  assert.equal(restored.data.ammoPath, 'missing:ammo');
  assert.equal(restored.compute().allowed, false);
  assert.match(restored.render(), /Missing link: choose a replacement/);
});
test('recovery restores only the quantity specified and decrements its recovery record', async () => {
  const w = workflow();
  await w.spend(w.records().ammo, 2, true);
  foundry.applications.api.DialogV2.input = async () => ({ amount: 1 });
  await w.recover();
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
  assert.equal(get(w.actor, 'flags.gga-ammo-resource-assistant.recoverable.ammo'), 1);
  foundry.applications.api.DialogV2.input = async () => null;
});
test('object workflows ignore hidden tracker links and reject unsupported damage types', () => {
  const w = workflow('object');
  w.data.weight = 1;
  assert.equal(w.records().ammo, null);
  w.data.damageType = 'cr] /command';
  assert.equal(w.compute().allowed, false);
});

test('Run sequence executes bow preparation and both attacks with the same target modifiers', async () => {
  const w = workflow();
  w.data.twoArrows = true;
  await w.run();
  assert.equal(rolls.length, 4);
  assert.equal(w.session, null);
  assert.equal(w.busy, false);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 8);
  for (const roll of rolls.slice(2)) {
    assert.equal(roll.mods.filter((m) => m.desc === 'Range').length, 1);
    assert.equal(roll.mods.find((m) => m.desc === 'Range').modint, -4);
    assert.equal(roll.mods.filter((m) => m.desc === 'Heroic Accuracy').length, 1);
  }
  assert.deepEqual(GURPS.ModifierBucket.modifierStack.modifierList, []);
});

test('Run sequence stops at failed preparation and at a cancelled roll', async () => {
  const w = workflow();
  resultQueue = ['success', 'fail'];
  await w.run();
  assert.equal(rolls.length, 2);
  assert.equal(w.session, null);
  assert.equal(w.data.start, 'ready');
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
  resultQueue = ['cancel'];
  await w.run();
  assert.equal(rolls.length, 3);
  assert.equal(w.session.index, 0);
  assert.equal(w.busy, false);
});

test('missed attacks continue, but cancellation preserves partial cost and can resume', async () => {
  const w = workflow();
  w.data.start = 'ready';
  w.data.twoArrows = true;
  resultQueue = ['fail', 'cancel'];
  await w.run();
  assert.equal(rolls.length, 2);
  assert.equal(w.session.index, 1);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
  await w.run();
  assert.equal(rolls.length, 3);
  assert.equal(w.session, null);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 8);
});

test('different-target sequences pause and use replacement modifiers on continuation', async () => {
  const w = workflow();
  w.data.start = 'ready';
  w.data.twoArrows = true;
  w.data.differentTargets = true;
  await w.run();
  assert.equal(rolls.length, 1);
  assert.equal(w.session.index, 1);
  GURPS.ModifierBucket.addModifier(-6, 'New range');
  await w.run();
  assert.equal(rolls.length, 2);
  assert.equal(rolls[1].mods.find((m) => m.desc === 'New range').modint, -6);
  assert.equal(
    rolls[1].mods.some((m) => m.desc === 'Range'),
    false,
  );
  assert.equal(w.session, null);
});

test('automatic sequences hold their busy lock and refuse a duplicate run or step', async () => {
  const w = workflow();
  let finish;
  GURPS.executeOTF = () => new Promise((resolve) => (finish = resolve));
  const pending = w.run();
  await w.run();
  await w.next();
  assert.equal(w.busy, true);
  finish(false);
  await pending;
  assert.equal(w.busy, false);
  assert.equal(w.session.index, 0);
  assert.match(w.render(), /Continue sequence/);
});

test('critical attack failure stops automatic continuation after spending the fired arrow', async () => {
  const w = workflow();
  w.data.start = 'ready';
  w.data.twoArrows = true;
  resultQueue = ['critical'];
  await w.run();
  assert.equal(rolls.length, 1);
  assert.equal(w.session, null);
  assert.match(w.status, /Critical failure/);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
});

test('critical arrow draw spills the entire quiver and blocks a reopened workflow', async () => {
  const w = workflow();
  resultQueue = ['critical'];
  await w.run();
  assert.equal(rolls.length, 1);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 0);
  assert.equal(get(w.actor, 'flags.gga-ammo-resource-assistant.recoverable.ammo'), 10);
  assert.match(w.pendingEffect().message, /quiver dropped/);
  const reopened = new ActionWorkflow(w.actor, 'bow');
  assert.equal(reopened.compute().allowed, false);
  await assert.rejects(() => reopened.run(), /critical effects/);
  assert.equal(rolls.length, 1);
  foundry.applications.api.DialogV2.input = async () => ({ resolved: true });
  await reopened.resolveEffect();
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 0);
  assert.equal(get(w.actor, 'flags.gga-ammo-resource-assistant.recoverable.ammo'), 10);
  foundry.applications.api.DialogV2.input = async () => null;
});

test('critical readying drops the bow without treating an arrow as fired', async () => {
  const w = workflow();
  resultQueue = ['success', 'critical'];
  await w.run();
  assert.equal(rolls.length, 2);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
  assert.match(w.pendingEffect().message, /bow dropped/);
  assert.equal(w.compute().allowed, false);
});

test('critical Fast-Draw of a thrown weapon records one dropped weapon', async () => {
  const w = workflow('throw');
  w.data.heroicPath = 'none';
  w.data.drawPath = 'skills.knife';
  resultQueue = ['critical'];
  await w.run();
  assert.equal(rolls.length, 1);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
  assert.equal(get(w.actor, 'flags.gga-ammo-resource-assistant.recoverable.ammo'), 1);
  assert.match(w.pendingEffect().message, /weapon dropped/);
});

test('critical consequences persist for untracked ammunition; resolution does not refill a quiver', async () => {
  const w = workflow();
  w.data.ammoPath = '';
  resultQueue = ['critical'];
  await w.run();
  assert.ok(w.pendingEffect());
  foundry.applications.api.DialogV2.input = async () => null;
  await w.resolveEffect();
  assert.ok(w.pendingEffect());
  foundry.applications.api.DialogV2.input = async () => ({ resolved: true });
  await w.resolveEffect();
  assert.equal(w.pendingEffect(), null);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
  assert.equal(w.data.start, 'stowed');
  foundry.applications.api.DialogV2.input = async () => null;
});

test('failed atomic critical bookkeeping stops without rerolling or partially spending', async () => {
  const w = workflow();
  resultQueue = ['critical'];
  w.actor.update = async () => {
    throw new Error('Update failed');
  };
  await assert.rejects(() => w.run(), /Update failed/);
  assert.equal(rolls.length, 1);
  assert.equal(w.session, null);
  assert.equal(w.busy, false);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
  assert.ok(w.pendingEffect());
});

test('critical prerequisite success still performs a separate attack roll', async () => {
  const w = workflow();
  const execute = GURPS.executeOTF;
  GURPS.executeOTF = async function (...args) {
    const result = await execute.apply(this, args);
    if (rolls.length === 1) this.lastTargetedRolls[w.actor.id].isCritSuccess = true;
    return result;
  };
  await w.next();
  assert.match(w.status, /critically succeeded/);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
  await w.run();
  assert.equal(rolls.length, 3);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
});

test('cheap bow malfunction stops a two-arrow sequence, retains condition, and supersedes critical effects', async () => {
  const w = workflow();
  w.data.start = 'ready';
  w.data.twoArrows = true;
  w.data.malfunction = { enabled: true, category: 'bow', value: '16' };
  const execute = GURPS.executeOTF;
  GURPS.executeOTF = async function (...args) {
    const result = await execute.apply(this, args);
    this.lastTargetedRolls[w.actor.id].rtotal = 18;
    this.lastTargetedRolls[w.actor.id].isCritFailure = true;
    return result;
  };
  await w.run();
  assert.equal(rolls.length, 1);
  assert.equal(w.session, null);
  assert.equal(w.pendingEffect(), null);
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 10);
  assert.match(w.status, /broken/);
  assert.equal(w.compute().allowed, false);
  const reopened = new ActionWorkflow(w.actor, 'bow');
  reopened.data.attackPath = 'ranged.bow';
  assert.equal(reopened.compute().allowed, false);
  assert.ok(parseHTML(reopened.render()).document.querySelector('[data-action="malf-maintain"]'));
});
test('ordinary thrown weapons ignore Low-Tech malfunctions and retain ordinary expenditure', async () => {
  const w = workflow('throw');
  w.data.start = 'ready';
  w.data.malfunction = { enabled: true, category: 'thrown', value: '3' };
  const execute = GURPS.executeOTF;
  GURPS.executeOTF = async function (...args) {
    const result = await execute.apply(this, args);
    this.lastTargetedRolls[w.actor.id].rtotal = 17;
    this.lastTargetedRolls[w.actor.id].thing = 'Knife';
    return result;
  };
  await w.run();
  assert.equal(get(w.actor, 'system.additionalresources.tracker.ammo.value'), 9);
  assert.equal(w.session, null);
});
