import {
  assertWeaponReady,
  resolveMalfunction,
  reportMalfunction,
  markApplied,
  malfunctionPanel,
  withWeaponLock,
} from './malfunction.mjs';
import { MODULE_ID, VISIBILITY } from './constants.mjs';
import {
  attackLabel,
  quoteForOtf,
  recordReference,
  resolveReference,
  enforcedMinimum,
} from './core.mjs';
import {
  collectRangedAttacks,
  collectResourceTrackers,
  rollRangedAttack,
  rollActionCheck,
  withActionModifiers,
  trackerValue,
} from './gga-adapter.mjs';
import { visibilityData, postReceiptSafely } from './operations.mjs';
import {
  flattenTraits,
  findTrait,
  number,
  basicLift,
  objectThrow,
  quickPenalty,
  drawPenalty,
  throwPenalty,
  checkAccess,
} from './action-rules.mjs';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '—');
const signed = (n) => (n >= 0 ? `+${n}` : String(n));
const setting = (key) => game.settings.get(MODULE_ID, key);
const field = (name, label, value, type = 'text', extra = '') =>
  `<label>${esc(label)}<input name="wf.${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (name, label, value, options) => {
  if (value && !options.some(([v]) => String(v) === String(value)))
    options.unshift([value, 'Missing link: choose a replacement']);
  return `<label>${esc(label)}<select name="wf.${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
};
const skillLinks = ['bowPath', 'drawPath', 'methodPath', 'quickPath', 'dwaPath', 'doubleDrawPath'];
const traitLinks = ['heroicPath', 'masterPath', 'enhancedPath'];
const check = (name, label, value) =>
  `<label class="gga-ara-check"><input name="wf.${name}" type="checkbox" ${value ? 'checked' : ''}>${esc(label)}</label>`;
const button = (action, label, disabled = false, primary = false) =>
  `<button type="button" data-action="${action}" ${disabled ? 'disabled' : ''} class="${primary ? 'primary' : 'secondary'}">${esc(label)}</button>`;
const numerical = new Set([
  'weight',
  'drawMod',
  'readyMod',
  'attackMod',
  'count',
  'offCount',
  'previousDraws',
  'st',
  'dx',
  'bl',
  'skillOverride',
  'bowOverride',
  'drawOverride',
  'quickLevel',
  'dwaLevel',
  'doubleDrawLevel',
]);
const bools = new Set([
  'qualifies',
  'twoArrows',
  'heroicSmall',
  'close',
  'differentTargets',
  'applyAcc',
]);

export function registerActionSettings() {
  for (const [key, name, hint] of [
    ['quickBows', 'Quick-shooting bows', 'Allow quick-shooting (MA119–120).'],
    [
      'doubleArrows',
      'Two-arrow attacks',
      'Allow Dual-Weapon Attack (Bow), MA83, and DF Double-Shot.',
    ],
    [
      'dfArchery',
      'Dungeon Fantasy archery power-ups',
      'Allow Quick-Shot and Double-Shot (DF11:32–33).',
    ],
    [
      'rapidThrows',
      'Rapid Strike with thrown weapons',
      'Allow MA120–121 cinematic multiple throws.',
    ],
    [
      'heroicThrows',
      'Heroic Thrower',
      'Allow the Heroic Thrower advantage (Denizens: Thieves 22–23).',
    ],
    ['throwingArt', 'Throwing Art', 'Allow cinematic improvised-weapon profiles (B226).'],
  ])
    game.settings.register(MODULE_ID, key, {
      name: `Ammunition Assistant: ${name}`,
      hint: `${hint} Advisory only: players may proceed, with unmet checks noted in chat.`,
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
    });
}

export class ActionWorkflow {
  constructor(actor, kind, saved = null) {
    this.actor = actor;
    this.kind = kind;
    this.skills = flattenTraits(actor.system?.skills, 'skills');
    this.traits = flattenTraits(actor.system?.ads, 'ads');
    const attacks = collectRangedAttacks(actor);
    const skill = (name) => this.skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
    const st = number(actor.system?.attributes?.ST?.value);
    const dx = number(actor.system?.attributes?.DX?.value);
    const rawBL = String(actor.system?.liftingmoving?.basiclift ?? '').trim();
    const blMatch = rawBL.match(/^([\d,.]+)\s*(lb|lbs|kg)?$/i);
    const bl = blMatch
      ? Number(blMatch[1].replaceAll(',', '')) *
        (blMatch[2]?.toLowerCase() === 'kg' ? 1 / 0.45359237 : 1)
      : st
        ? basicLift(st)
        : '';
    this.data = {
      kind,
      name: '',
      malfunction: saved?.malfunction ?? {
        enabled: false,
        category: kind === 'bow' ? 'bow' : 'thrown',
        value: kind === 'bow' ? '16' : '17',
      },
      attackPath:
        attacks.find((a) => (kind === 'bow' ? /bow/i.test(a.name) : /throw/i.test(a.mode)))?.path ??
        '',
      ammoPath: '',
      start: kind === 'object' ? 'ready' : 'stowed',
      twoArrows: false,
      count: 1,
      offCount: 0,
      bowPath: skill('Bow')?.path ?? '',
      drawPath:
        this.skills.find(
          (s) =>
            /fast.?draw/i.test(s.name) &&
            (kind === 'bow' ? /arrow/i.test(s.name) : /knife|shuriken/i.test(s.name)),
        )?.path ?? '',
      heroicPath: '',
      masterPath: 'none',
      enhancedPath: '',
      quickPath: '',
      dwaPath: '',
      doubleDrawPath: '',
      drawMod: 0,
      readyMod: 0,
      attackMod: 0,
      previousDraws: 0,
      maneuver: 'attack',
      close: false,
      differentTargets: false,
      applyAcc: true,
      heroicSmall: false,
      skillOverride: '',
      bowOverride: '',
      drawOverride: '',
      quickLevel: '',
      dwaLevel: '',
      doubleDrawLevel: '',
      objectName: 'Improvised object',
      weight: '',
      unit: 'lb',
      st: st ?? '',
      dx: dx ?? '',
      bl,
      thrust: actor.system?.thrust ?? '',
      swing: actor.system?.swing ?? '',
      method: 'dx',
      methodPath: '',
      profile: 'ordinary',
      damageType: 'cr',
      qualifies: false,
      area: 'specific',
      ...structuredClone(saved?.workflow ?? {}),
    };
    this.id = saved?.id ?? '';
    if (saved) {
      this.data.name = saved.name;
      if (saved.attack)
        this.data.attackPath =
          resolveReference(attacks, saved.attack, 'attack').record?.path ?? 'missing:attack';
      if (saved.ammo)
        this.data.ammoPath =
          resolveReference(collectResourceTrackers(actor), saved.ammo).record?.path ??
          'missing:ammo';
      for (const [key, reference] of Object.entries(saved.workflow?.links ?? {})) {
        if (![...skillLinks, ...traitLinks].includes(key)) continue;
        this.data[key] =
          resolveReference(skillLinks.includes(key) ? this.skills : this.traits, reference).record
            ?.path ?? `missing:${key}`;
      }
    }
    this.session = null;
    this.busy = false;
    this.status = '';
    this.lastDamage = null;
  }
  read(root) {
    if (this.busy) return;
    for (const el of root.querySelectorAll('[name^="wf."]')) {
      const key = el.name.slice(3);
      this.data[key] = bools.has(key)
        ? el.checked
        : numerical.has(key)
          ? el.value === ''
            ? ''
            : number(el.value)
          : el.value;
    }
  }
  records() {
    this.skills = flattenTraits(this.actor.system?.skills, 'skills');
    this.traits = flattenTraits(this.actor.system?.ads, 'ads');
    const d = this.data;
    const attack = collectRangedAttacks(this.actor).find((a) => a.path === d.attackPath);
    const ammo =
      this.kind === 'object'
        ? null
        : collectResourceTrackers(this.actor).find((a) => a.path === d.ammoPath);
    const linked = (path, pattern) => findTrait(this.skills, pattern, path);
    const bow = linked(d.bowPath, /^Bow$/i);
    const draw = linked(
      d.drawPath,
      this.kind === 'bow' ? /^Fast.?Draw.*Arrow/i : /^Fast.?Draw.*(?:Knife|Shuriken)/i,
    );
    const heroic = findTrait(
      this.traits,
      this.kind === 'bow' ? /^Heroic Archer(?:\s*\(|$)/i : /^Heroic Thrower(?:\s*\(|$)/i,
      d.heroicPath,
    );
    const master = findTrait(this.traits, /^Weapon Master/i, d.masterPath);
    const quick = linked(d.quickPath, /^Quick.Shooting(?:\s*\(|$)/i);
    const dwa = linked(d.dwaPath, /^(Dual.Weapon Attack|DWA).*Bow/i);
    const doubleDraw = linked(d.doubleDrawPath, /^Double.Draw/i);
    const enhanced = findTrait(this.traits, /^Enhanced Tracking/i, d.enhancedPath);
    return { attack, ammo, bow, draw, heroic, master, quick, dwa, doubleDraw, enhanced };
  }
  compute() {
    const d = this.data,
      r = this.records(),
      checks = [],
      errors = [];
    const need = (label, ok, ref) => checks.push({ label, ok: Boolean(ok), ref });
    if (this.pendingEffect())
      errors.push('Resolve the recorded critical effects before starting another sequence.');
    for (const key of [...skillLinks, ...traitLinks])
      if (String(d[key]).startsWith('missing:'))
        errors.push('Relink the missing skill or advantage under Skills and rules.');
    if (!['cr', 'cut', 'imp', 'pi'].includes(d.damageType))
      errors.push('Choose a supported damage type.');
    for (const key of ['drawMod', 'readyMod', 'attackMod', 'previousDraws'])
      if (!Number.isInteger(d[key]))
        errors.push('Modifiers and earlier draw counts must be whole numbers.');
    if (d.previousDraws < 0) errors.push('Earlier draw count cannot be negative.');
    const numeric = (key, fallback) => (d[key] === '' ? fallback : number(d[key]));
    const bowLevel = numeric('bowOverride', r.bow?.level);
    const drawLevel = numeric('drawOverride', r.draw?.level);
    const isObject = this.kind === 'object';
    let calc = null;
    if (!isObject) {
      try {
        assertWeaponReady(this.actor, r.attack, d.malfunction);
      } catch (error) {
        errors.push(error.message);
      }
      if (!r.attack) errors.push('Choose the exact ranged attack and usage from the sheet.');
      if (
        r.attack &&
        collectRangedAttacks(this.actor).filter((a) => attackLabel(a) === attackLabel(r.attack))
          .length > 1
      )
        errors.push('This attack name and usage are duplicated. Give them distinct names in GGA.');
      if (d.ammoPath && !r.ammo) errors.push('Relink the missing resource tracker.');
      if (this.kind === 'bow') {
        need(
          'Selected usage uses Bow skill',
          /bow/i.test(r.attack?.name ?? '') && !/crossbow/i.test(r.attack?.name ?? ''),
          'MA45, MA119',
        );
        if (!Number.isFinite(bowLevel) || bowLevel < 1)
          errors.push('Link Bow, or enter a valid Bow level under Skills and rules.');
        if (d.start !== 'ready')
          need('Quick-shooting enabled by GM', setting('quickBows'), 'MA119–120');
        if (d.twoArrows) need('Two-arrow attacks enabled by GM', setting('doubleArrows'), 'MA83');
        if (d.maneuver === 'move')
          need('Heroic Archer for Move and Attack quick-shooting', r.heroic, 'MA45');
        if (r.quick || d.quickLevel !== '' || r.doubleDraw || d.doubleDrawLevel !== '') {
          need('DF archery power-ups enabled by GM', setting('dfArchery'), 'DF11:32–33');
          need('Heroic Archer for DF archery techniques', r.heroic, 'DF11:32–33');
        }
      } else {
        need(
          'Selected usage is a thrown attack',
          /throw|toss|hurl/i.test(`${r.attack?.name ?? ''} ${r.attack?.mode ?? ''}`),
          'B356',
        );
        for (const key of ['count', 'offCount'])
          if (!Number.isInteger(d[key]) || d[key] < (key === 'count' ? 1 : 0) || d[key] > 20)
            errors.push('Choose 1–20 primary-hand throws and 0–20 off-hand throws.');
        if (r.heroic) {
          need('Heroic Thrower enabled by GM', setting('heroicThrows'), 'Thieves 22–23');
          need('Small throwing weapon; not a spear or javelin', d.heroicSmall, 'Thieves 22');
        }
        if (d.count + d.offCount > 1 && !r.heroic)
          need(
            'Rapid Strike with thrown weapons enabled by GM',
            setting('rapidThrows'),
            'MA120–121',
          );
        if (d.offCount > 0)
          need('Heroic Thrower for this two-hand sequence', r.heroic, 'Thieves 22–23');
        if (d.maneuver === 'move' && d.count + d.offCount > 1)
          need('Heroic Thrower for multiple throws on Move and Attack', r.heroic, 'Thieves 22');
      }
      if (d.start === 'stowed' && !(Number.isFinite(drawLevel) && drawLevel > 0))
        errors.push(
          'Link the applicable Fast-Draw skill, or enter its level under Skills and rules.',
        );
    } else {
      const skill = this.skills.find((s) => s.path === d.methodPath);
      const level = numeric('skillOverride', skill?.level);
      if (d.method !== 'dx' && !(Number.isFinite(level) && level > 0))
        errors.push('Choose the throwing skill or enter a valid override level.');
      if (d.method === 'throwing') need('Object fits ordinary Throwing skill', d.qualifies, 'B226');
      if (d.method === 'art') {
        need('Throwing Art enabled by GM', setting('throwingArt'), 'B226');
        need(
          'Throwing Art learning prerequisite',
          this.traits.some((t) =>
            /^(Trained [bB]y [aA] Master|Weapon Master|Heroic Thrower)(?:\s*\(|$)/.test(t.name),
          ),
          'B226; Thieves 22',
        );
      }
      if (d.start !== 'ready') errors.push('Ready the object first, then select Already in hand.');
      try {
        calc = objectThrow({
          st: number(d.st),
          dx: number(d.dx),
          bl: number(d.bl),
          weight: number(d.weight),
          unit: d.unit,
          method: d.method,
          level,
          thrust: d.thrust,
          swing: d.swing,
          profile: d.profile,
          area: d.area === 'area',
        });
      } catch (e) {
        errors.push(e.message);
      }
    }
    for (const [key, label] of [
      ['bowOverride', 'Bow'],
      ['drawOverride', 'Fast-Draw'],
      ['skillOverride', 'Throwing'],
      ['quickLevel', 'Quick-Shooting'],
      ['dwaLevel', 'DWA'],
      ['doubleDrawLevel', 'Double-Draw'],
    ]) {
      if (d[key] !== '' && (!Number.isInteger(d[key]) || d[key] < 1))
        errors.push(`${label} override must be a positive whole number.`);
      if (d[key] !== '') need(`${label} level explicitly overridden`, false, 'Manual level');
    }
    const access = checkAccess(checks);
    const count = isObject ? 1 : this.kind === 'bow' ? (d.twoArrows ? 2 : 1) : d.count + d.offCount;
    if (r.ammo && r.ammo.value - enforcedMinimum(r.ammo) < count && !this.session)
      errors.push(
        `This sequence needs ${count} projectiles; ${r.ammo.name} has ${Math.max(0, r.ammo.value - enforcedMinimum(r.ammo))}.`,
      );
    let quick = d.start === 'ready' ? 0 : quickPenalty(Boolean(r.heroic), Boolean(r.master));
    const qLevel = numeric('quickLevel', r.quick?.level);
    if (qLevel != null && d.start !== 'ready')
      quick = Math.min(0, Math.max(quick, qLevel - bowLevel));
    let dwa = d.twoArrows ? (r.heroic ? -2 : -4) : 0;
    const dwLevel = numeric('dwaLevel', r.dwa?.level);
    if (d.twoArrows && dwLevel != null) dwa = Math.min(0, Math.max(dwa, dwLevel - bowLevel));
    const draw = drawPenalty({
      previous: d.previousDraws,
      simultaneous: this.kind === 'bow' && d.twoArrows ? 2 : 1,
      heroic: Boolean(r.heroic),
      master: Boolean(r.master),
      situational: d.drawMod + (d.maneuver === 'move' ? -2 : 0),
    });
    let effectiveDraw = draw;
    const ddLevel = numeric('doubleDrawLevel', r.doubleDraw?.level);
    if (this.kind === 'bow' && d.twoArrows && ddLevel != null) {
      const baseline = drawPenalty({
        simultaneous: 2,
        heroic: Boolean(r.heroic),
        master: Boolean(r.master),
      });
      effectiveDraw += Math.min(-baseline, Math.max(0, ddLevel - (drawLevel + baseline)));
    }
    const acc =
      r.heroic && d.applyAcc && d.maneuver !== 'move' && !d.close
        ? (number(r.attack?.raw?.acc) ?? 0)
        : 0;
    return {
      r,
      checks,
      errors,
      access,
      calc,
      count,
      bowLevel,
      drawLevel,
      quick,
      dwa,
      draw: effectiveDraw,
      acc,
      allowed: errors.length === 0 && access.allowed && (this.actor.isOwner || game.user.isGM),
    };
  }
  skillSelect(key, label, pattern = null) {
    const options = [
      ['', 'Auto-detect'],
      ['none', 'Not present / do not use'],
      ...this.skills
        .filter((s) => !pattern || pattern.test(s.name))
        .map((s) => [s.path, `${s.name}${s.level != null ? ` – ${s.level}` : ''}`]),
    ];
    return select(key, label, this.data[key], options);
  }
  traitSelect(key, label) {
    return select(key, label, this.data[key], [
      ['', 'Auto-detect'],
      ['none', 'Not present / do not use'],
      ...this.traits.map((t) => [t.path, t.name]),
    ]);
  }
  render() {
    const d = this.data,
      p = this.compute(),
      object = this.kind === 'object',
      bow = this.kind === 'bow';
    const titles = { bow: 'Bow sequence', throw: 'Throw a weapon', object: 'Throw an object' };
    const session = this.session;
    const recoverable = p.r.ammo
      ? (number(
          foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.recoverable.${p.r.ammo.key}`),
        ) ?? 0)
      : 0;
    let body = `<header class="gga-ara-workflow-heading"><h2>${titles[this.kind]}</h2><p>${object ? 'Enter the object, choose your method, and review range and damage.' : bow ? 'Draw, ready, and shoot with the appropriate checks.' : 'Use a sheet attack for each weapon thrown.'}</p></header>`;
    body += `<fieldset class="gga-ara-workflow-fields" ${session || this.busy ? 'disabled' : ''}><legend>${object ? 'Object and method' : 'Weapon and preparation'}</legend><div class="gga-ara-details-grid">`;
    if (object) {
      body +=
        field('objectName', 'Object', d.objectName) +
        field('weight', 'Weight', d.weight, 'number', 'min="0.001" step="any"') +
        select('unit', 'Weight unit', d.unit, [
          ['lb', 'Pounds'],
          ['kg', 'Kilograms'],
        ]);
      body += select('method', 'Throw using', d.method, [
        ['dx', 'Basic DX'],
        ['throwing', 'Throwing'],
        ['art', 'Throwing Art'],
      ]);
      if (d.method !== 'dx')
        body += this.skillSelect(
          'methodPath',
          'Skill on sheet',
          d.method === 'art' ? /throwing art/i : /^throwing$/i,
        );
      if (d.method === 'throwing')
        body += check('qualifies', 'Small, relatively smooth, palm-sized object', d.qualifies);
      body += select('area', 'Target', d.area, [
        ['specific', 'Specific target'],
        ['area', 'General area'],
      ]);
      if (d.method === 'art')
        body += select('profile', 'Damage treatment', d.profile, [
          ['ordinary', 'Ordinary object: weight table'],
          ['blunt', 'Small blunt object'],
          ['bat', 'Baseball bat'],
          ['pencil', 'Pencil'],
          ['card', 'Playing card'],
        ]);
      if (d.profile === 'ordinary')
        body += select('damageType', 'Impact damage (GM decides sharp objects)', d.damageType, [
          ['cr', 'Crushing'],
          ['cut', 'Cutting'],
          ['imp', 'Impaling'],
          ['pi', 'Piercing'],
        ]);
      body += select('start', 'Readiness', d.start, [
        ['ready', 'Already in hand'],
        ['stowed', 'Needs Ready manoeuvre(s)'],
      ]);
    } else {
      body += select('attackPath', 'Attack and usage', d.attackPath, [
        ['', 'Choose an attack…'],
        ...collectRangedAttacks(this.actor).map((a) => [a.path, attackLabel(a)]),
      ]);
      body += select(
        'ammoPath',
        bow ? 'Quiver / accessible arrows' : 'Available weapons',
        d.ammoPath,
        [
          ['', 'Untracked quantity'],
          ...collectResourceTrackers(this.actor).map((a) => [
            a.path,
            `${a.name} · ${a.value}/${a.max}`,
          ]),
        ],
      );
      body += select(
        'start',
        'Starting state',
        d.start,
        bow
          ? [
              ['stowed', 'Arrows in quiver'],
              ['drawn', 'Arrow(s) in hand; bow not drawn'],
              ['ready', 'Bow already readied'],
            ]
          : [
              ['stowed', 'Weapons stowed: use Fast-Draw'],
              ['ready', 'All selected weapons already ready'],
            ],
      );
      if (bow) body += check('twoArrows', 'Loose two arrows together', d.twoArrows);
      else {
        body += field(
          'count',
          'Primary-hand throws',
          d.count,
          'number',
          'min="1" max="20" step="1"',
        );
        if (p.r.heroic)
          body +=
            field(
              'offCount',
              'Off-hand throws',
              d.offCount,
              'number',
              'min="0" max="20" step="1"',
            ) + check('heroicSmall', 'Small throwing weapon (not spear/javelin)', d.heroicSmall);
      }
      body += select('maneuver', 'Manoeuvre (match actor in GGA)', d.maneuver, [
        ['attack', 'Attack'],
        ['allout', 'All-Out Attack (Determined)'],
        ['move', 'Move and Attack'],
      ]);
      if (p.r.heroic)
        body +=
          check('applyAcc', 'Apply Heroic Acc here (not already included elsewhere)', d.applyAcc) +
          check('close', 'In close combat (no Heroic Acc)', d.close);
      if (bow && d.twoArrows)
        body += check('differentTargets', 'Arrows aimed at different targets', d.differentTargets);
      if (!bow && d.count + d.offCount > 1)
        body += check(
          'differentTargets',
          'Pause between attacks to change targets',
          d.differentTargets,
        );
    }
    body += '</div></fieldset>';
    const c = p.calc;
    body += `<section class="gga-ara-sequence-preview" aria-live="polite"><strong>${session ? `Step ${session.index + 1} of ${session.steps.length}` : 'Before you roll'}</strong>`;
    if (object && c)
      body += `<div class="gga-ara-stat-row"><span><b>${fmt(c.distance)} yd</b>maximum range</span><span><b>${esc(c.damage)} ${esc(d.profile === 'ordinary' ? d.damageType : c.type)}</b>damage</span><span><b>${fmt(c.level)}</b>base target</span><span><b>${c.hands}</b>hand${c.hands === 1 ? '' : 's'}</span></div>`;
    else if (!object) {
      body += `<ol class="gga-ara-sequence">`;
      const stages = session?.steps ?? this.steps(p);
      body +=
        stages
          .map(
            (s, i) =>
              `<li class="${session && i < session.index ? 'complete' : session && i === session.index ? 'current' : ''}">${esc(s.label)}${s.automatic ? ' · automatic' : s.level != null ? ` · target ${fmt(s.level + s.mod)}` : s.mod != null ? ` · ${signed(s.mod)}${s.acc ? `, Acc +${s.acc}` : ''}` : ''}</li>`,
          )
          .join('') + '</ol>';
      body += `<p>${p.count} projectile${p.count === 1 ? '' : 's'} · ${p.r.ammo ? esc(p.r.ammo.name) : 'quantity untracked'}. Attack rolls also use the GGA Modifier Bucket.</p>`;
      body +=
        '<p class="hint">Run sequence rolls preparation and attacks automatically, stopping if preparation fails or a roll is cancelled. Set your target and attack modifiers first; same-target attacks reuse those modifiers. Match the manoeuvre on the actor in GGA.</p>';
      if (bow)
        body +=
          '<p class="hint">Use a tracker for this quiver, not combined reserves. A critical arrow draw spills its remaining contents.</p>';
      if (recoverable)
        body += `<p>${recoverable} thrown or dropped item(s) recorded. ${button('wf-recover', 'Recover items', this.busy || Boolean(session))}</p>`;
      if (d.maneuver === 'allout')
        body +=
          '<p class="gga-ara-warning">No active defences, including if preparation fails.</p>';
      if (d.maneuver === 'move' && !p.r.heroic)
        body += '<p>Apply normal Move and Attack penalties in GGA.</p>';
    }
    body += '</section>';
    body += `<div class="gga-ara-details-grid gga-ara-stage-mods">`;
    if (!object && d.start === 'stowed')
      body += field('drawMod', 'Fast-Draw situational modifier', d.drawMod, 'number', 'step="1"');
    if (bow && d.start !== 'ready')
      body += field(
        'readyMod',
        'Bow-readying situational modifier',
        d.readyMod,
        'number',
        'step="1"',
      );
    body +=
      field('attackMod', 'Additional attack modifier', d.attackMod, 'number', 'step="1"') +
      '</div>';
    body += `<details class="gga-ara-workflow-details" ${this.rulesOpen ? 'open' : ''}><summary>Skills and rule checks${p.access.failed.length ? ` · ${p.access.failed.length} checks need attention` : ''}</summary><fieldset ${session || this.busy ? 'disabled' : ''}><div class="gga-ara-details-grid">`;
    if (object) {
      body +=
        field('st', 'ST for distance', d.st, 'number', 'min="1"') +
        field('dx', 'DX', d.dx, 'number', 'min="1"') +
        field('bl', 'Actual Basic Lift (lb)', d.bl, 'number', 'min="0.01" step="any"') +
        field('thrust', 'Thrust damage', d.thrust);
      if (d.profile === 'bat') body += field('swing', 'Swing damage', d.swing);
      if (d.method !== 'dx')
        body += field(
          'skillOverride',
          'Manual skill level (optional)',
          d.skillOverride,
          'number',
          'min="1"',
        );
    } else {
      if (bow)
        body +=
          this.skillSelect('bowPath', 'Bow skill', /^bow$/i) +
          field('bowOverride', 'Manual Bow level (optional)', d.bowOverride, 'number', 'min="1"');
      if (d.start === 'stowed')
        body +=
          this.skillSelect('drawPath', 'Fast-Draw skill', /fast.?draw/i) +
          field(
            'drawOverride',
            'Manual Fast-Draw level (optional)',
            d.drawOverride,
            'number',
            'min="1"',
          ) +
          field(
            'previousDraws',
            'Earlier draws with this hand this turn',
            d.previousDraws,
            'number',
            'min="0" step="1"',
          );
      body +=
        this.traitSelect('heroicPath', bow ? 'Heroic Archer' : 'Heroic Thrower') +
        this.traitSelect('masterPath', 'Applicable Weapon Master (select scope)');
      if (bow) {
        body +=
          this.skillSelect('quickPath', 'Quick-Shooting technique', /quick.shoot/i) +
          field(
            'quickLevel',
            'Manual Quick-Shooting level (optional)',
            d.quickLevel,
            'number',
            'min="1"',
          );
        if (d.twoArrows)
          body +=
            this.skillSelect('dwaPath', 'DWA (Bow) technique', /dual.weapon|dwa/i) +
            field('dwaLevel', 'Manual DWA level (optional)', d.dwaLevel, 'number', 'min="1"') +
            this.skillSelect('doubleDrawPath', 'Double-Draw technique', /double.draw/i) +
            field(
              'doubleDrawLevel',
              'Manual Double-Draw level (optional)',
              d.doubleDrawLevel,
              'number',
              'min="1"',
            ) +
            this.traitSelect('enhancedPath', 'Enhanced Tracking');
      }
    }
    body +=
      '</div><ul class="gga-ara-checks">' +
      p.checks
        .map(
          (c) =>
            `<li class="${c.ok ? 'pass' : 'needs-review'}">${c.ok ? '✓' : '!'} ${esc(c.label)} <small>${esc(c.ref)}</small></li>`,
        )
        .join('') +
      '</ul>';
    body +=
      '<p class="hint">Rules checks are advisory. You can roll with unmet checks; they will be listed in chat automatically.</p>';
    body +=
      '<p class="hint">Manual links identify renamed traits. Select Weapon Master only when its specialisation covers this weapon. Modifiers, hands, and readiness are declarations; combat turns are not advanced automatically.</p></fieldset></details>';
    if (!object) body += malfunctionPanel(this.actor, p.r.attack, d.malfunction);
    body += `<div class="gga-ara-workflow-status" role="status">${esc(this.status)}</div>`;
    const effect = this.pendingEffect();
    if (effect)
      body += `<section class="gga-ara-warning"><strong>Critical effects to resolve</strong><p>${esc(effect.message)}</p><p>Resolve recovery and any required Ready manoeuvres before another action. This record persists when the window is closed.</p>${button('wf-resolve', 'Resolve effects', this.busy)}</section>`;
    if (p.errors.length)
      body += `<div class="gga-ara-warning">${p.errors.map(esc).join('<br>')}</div>`;
    if (p.access.failed.length)
      body += `<section class="gga-ara-rule-advisory"><strong>Rules to check with your GM</strong><ul>${p.access.failed.map((c) => `<li>${esc(c.label)} <small>${esc(c.ref)}</small></li>`).join('')}</ul><p>You can still run the sequence. These checks will be noted in chat; no explanation is required.</p></section>`;
    if (!session)
      body += `<div class="gga-ara-profile-name">${field('name', 'Save as (optional)', d.name)}</div>`;
    body += `<footer class="gga-ara-actions">${session ? button('wf-stop', 'End sequence', this.busy) : button('wf-save', 'Save loadout', this.busy) + button('wf-hotbar', 'Add to hotbar', this.busy)}`;
    if (this.lastDamage) body += button('wf-damage', 'Roll damage', this.busy);
    if (!object) body += button('wf-next', 'One step', this.busy || !p.allowed);
    body +=
      button(
        'wf-run',
        this.busy
          ? 'Rolling…'
          : session
            ? 'Continue sequence'
            : object
              ? 'Roll throw'
              : 'Run sequence',
        this.busy || !p.allowed,
        true,
      ) + '</footer>';
    return body;
  }
  steps(p) {
    const d = this.data,
      bow = this.kind === 'bow',
      steps = [];
    if (this.kind === 'object') return [{ type: 'object', label: 'Throw object' }];
    if (bow) {
      if (d.start === 'stowed')
        steps.push({
          type: 'draw',
          label: `Fast-Draw ${d.twoArrows ? 'two arrows' : 'arrow'}`,
          mod: p.draw,
          level: p.drawLevel,
        });
      if (d.start !== 'ready')
        steps.push({
          type: 'ready',
          label: 'Ready bow quickly',
          mod: p.quick + d.readyMod + (d.maneuver === 'allout' ? 1 : 0),
          level: p.bowLevel,
        });
      for (let i = 0; i < p.count; i++)
        steps.push({
          type: 'attack',
          label: p.count > 1 ? `Shoot arrow ${i + 1}` : 'Shoot',
          mod: p.quick + p.dwa,
          acc: i === 1 && d.differentTargets && !p.r.enhanced ? 0 : p.acc,
        });
    } else {
      for (const [hand, count] of [
        ['primary', d.count],
        ['off', d.offCount],
      ])
        for (let i = 0; i < count; i++) {
          if (d.start === 'stowed')
            steps.push({
              type: 'draw',
              label: `Fast-Draw ${hand}-hand weapon ${i + 1}`,
              level: p.drawLevel,
              mod: drawPenalty({
                previous: d.previousDraws + i,
                heroic: Boolean(p.r.heroic),
                master: Boolean(p.r.master),
                situational: d.drawMod + (d.maneuver === 'move' ? -2 : 0),
              }),
              automatic: Boolean(p.r.heroic && p.drawLevel >= 16),
            });
          steps.push({
            type: 'attack',
            label: `Throw ${hand}-hand weapon ${i + 1}`,
            mod: throwPenalty(count, {
              heroic: Boolean(p.r.heroic),
              master: Boolean(p.r.master),
              bothHands: d.offCount > 0,
            }),
            acc: p.acc,
          });
        }
    }
    return steps;
  }
  loadout() {
    const { r, errors } = this.compute();
    if (errors.length) throw new Error(errors.join(' '));
    const workflow = structuredClone(this.data);
    delete workflow.override;
    delete workflow.overrideReason;
    workflow.links = {};
    for (const key of [...skillLinks, ...traitLinks]) {
      const record = (skillLinks.includes(key) ? this.skills : this.traits).find(
        (r) => r.path === workflow[key],
      );
      if (record) workflow.links[key] = recordReference(record);
    }
    return {
      id: this.id || foundry.utils.randomID(),
      name:
        this.data.name.trim() ||
        (this.kind === 'object'
          ? this.data.objectName
          : `${this.kind === 'bow' ? 'Bow' : 'Throw'}: ${attackLabel(r.attack)}`),
      attack: recordReference(r.attack, 'attack'),
      ammo: recordReference(r.ammo),
      workflow,
      malfunction: structuredClone(this.data.malfunction),
      shots: 1,
      unitsPerShot: 1,
      flatCost: 0,
      visibility: VISIBILITY.INHERIT,
    };
  }
  async receipt(title, detail, changes = [], inherited = null) {
    if (changes.length)
      return postReceiptSafely({
        actor: this.actor,
        title,
        summary: detail,
        details: [],
        changes,
        visibility: VISIBILITY.INHERIT,
        inheritedVisibility: inherited,
      });
    return ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<section class="gga-ara-receipt"><strong>${esc(title)}</strong><p>${esc(detail)}</p></section>`,
      ...visibilityData(VISIBILITY.INHERIT, inherited),
    });
  }
  async next() {
    if (this.busy) return;
    this.busy = true;
    try {
      return await this._step();
    } finally {
      this.busy = false;
    }
  }
  async noteRuleWarnings(checks, inherited = null) {
    if (!checks.length || this.session?.warningsPosted) return;
    try {
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<section class="gga-ara-receipt"><strong>Sequence started with unmet rule checks</strong><p>${esc(this.actor.name)} chose to proceed.</p><ul>${checks.map((c) => `<li>${esc(c.label)} (${esc(c.ref)})</li>`).join('')}</ul></section>`,
        ...visibilityData(VISIBILITY.INHERIT, inherited),
      });
      if (this.session) this.session.warningsPosted = true;
    } catch {
      ui.notifications.warn(
        'The roll proceeded, but its rule-check note could not be posted to chat.',
      );
    }
  }
  async run() {
    if (this.busy) return;
    this.busy = true;
    const bucket = globalThis.GURPS?.ModifierBucket;
    const attackModifiers = structuredClone(bucket?.modifierStack?.modifierList ?? []);
    let attacks = 0;
    try {
      do {
        const step = this.session?.steps[this.session.index] ?? this.steps(this.compute())[0];
        const attack = step.type === 'attack' || step.type === 'object';
        // A same-target sequence must not lose range/target modifiers after its first shot.
        if (attack && attacks > 0) {
          await bucket.clear();
          for (const mod of attackModifiers) await bucket.addModifier(mod.modint, mod.desc);
        }
        const advanced = await this._step();
        if (!advanced || !this.session) break;
        if (attack) {
          attacks++;
          if (this.data.differentTargets) {
            this.status += ' Choose the next target and its modifiers, then Continue sequence.';
            break;
          }
        }
      } while (this.session);
    } finally {
      this.busy = false;
    }
  }
  async _step() {
    return withWeaponLock(this.actor, () => this._stepUnlocked());
  }
  async _stepUnlocked() {
    const p = this.compute();
    if (!p.allowed)
      throw new Error([...p.errors, ...p.access.failed.map((c) => c.label)].join(' '));
    let completedRoll = false;
    try {
      this.session ??= { steps: this.steps(p), index: 0, attackBucket: null };
      this.session.steps = this.steps(p);
      const step = this.session.steps[this.session.index],
        d = this.data;
      let result;
      if (step.type === 'draw' || step.type === 'ready') {
        const record = step.type === 'draw' ? p.r.draw : p.r.bow;
        const override = step.type === 'draw' ? d.drawOverride : d.bowOverride;
        const actual = record?.level;
        const dx = number(this.actor.system?.attributes?.DX?.value);
        const otf = record ? `[S:${quoteForOtf(record.name)}]` : `[DX${signed(step.level - dx)}]`;
        if (!record && !Number.isFinite(dx))
          throw new Error('Actor DX is unavailable for the manual-level roll.');
        result = step.automatic
          ? { rolled: true, success: true }
          : await rollActionCheck(this.actor, otf, [
              {
                value: step.mod + (override !== '' && actual != null ? step.level - actual : 0),
                label: step.label,
              },
            ]);
        if (!result.rolled) {
          this.status =
            'Roll cancelled. No resources changed; retry this step or end the sequence.';
          return;
        }
        completedRoll = true;
        await this.noteRuleWarnings(p.access.failed, result.visibility);
        if (!result.success) {
          const ready = step.type === 'ready' && !result.critical;
          this.status = ready
            ? 'Bow readied too slowly. No shot this turn. The next sequence starts with the bow ready.'
            : step.type === 'draw'
              ? this.kind === 'bow'
                ? 'Fast-Draw failed: arrow dropped; turn ends. Resolve any quiver spill with the GM (B195, MA120).'
                : result.critical
                  ? 'Critical Fast-Draw failure: weapon dropped; turn ends.'
                  : 'Fast-Draw failed; turn ends. Resolve ordinary readying with the GM (B194).'
              : 'Critical readying failure: bow dropped; no shot.';
          if (ready) d.start = 'ready';
          const dropped = step.type === 'draw' && (this.kind === 'bow' || result.critical);
          if (result.critical && step.type === 'draw' && this.kind === 'bow')
            this.status =
              'Critical Fast-Draw failure: quiver dropped and loose arrows scattered; turn ends (B195).';
          const amount = dropped
            ? result.critical && this.kind === 'bow' && p.r.ammo
              ? Math.max(0, trackerValue(this.actor, p.r.ammo.path) - enforcedMinimum(p.r.ammo))
              : this.kind === 'bow' && d.twoArrows
                ? 2
                : 1
            : 0;
          const effect = result.critical ? this.makeEffect(this.status) : null;
          const changes = await this.spend(p.r.ammo, amount, dropped, effect);
          await this.receipt(step.label, this.status, changes);
          this.session = null;
          return;
        }
        this.status = step.automatic
          ? 'Fast-Draw waived by Heroic Thrower (skill 16+).'
          : `${step.label} ${result.criticalSuccess ? 'critically succeeded' : 'succeeded'}.`;
      } else {
        if (p.r.ammo && trackerValue(this.actor, p.r.ammo.path) - enforcedMinimum(p.r.ammo) < 1)
          throw new Error(
            'No projectile remains in the selected tracker. End the sequence or replenish it.',
          );
        if (step.type === 'object') {
          const skill = this.skills.find((s) => s.path === d.methodPath),
            dx = number(this.actor.system?.attributes?.DX?.value);
          const base = d.method === 'dx' ? dx : skill?.level;
          const otf = skill && d.method !== 'dx' ? `[S:${quoteForOtf(skill.name)}]` : '[DX]';
          if (!Number.isFinite(base ?? dx)) throw new Error('Actor DX/skill is unavailable.');
          result = await rollActionCheck(
            this.actor,
            otf,
            [{ value: p.calc.level - (base ?? dx) + d.attackMod, label: 'Object throw' }],
            { preparation: false },
          );
        } else {
          const mods = [
            { value: step.mod + d.attackMod, label: step.label },
            { value: step.acc, label: 'Heroic Accuracy' },
          ];
          // Each attack consumes its own bucket; the user can retarget between stages.
          result = await withActionModifiers(mods, () =>
            rollRangedAttack(this.actor, p.r.attack, 1),
          );
        }
        if (!result.rolled) {
          this.status = 'Attack cancelled. Nothing spent; retry this attack or end the sequence.';
          return;
        }
        completedRoll = true;
        await this.noteRuleWarnings(p.access.failed, result.visibility);
        if (result.promptExpected && !result.promptSeen)
          throw new Error(
            'GGA did not confirm the shot count. Attack rolled; adjust ammunition manually.',
          );
        const malfunction =
          step.type === 'object'
            ? null
            : await resolveMalfunction(this.actor, p.r.attack, d.malfunction, result);
        if (malfunction?.triggered) result.critical = false;
        const criticalEffect = result.critical
          ? this.makeEffect(
              'Critical attack failure. Resolve the GGA critical result and any weapon, injury, or readiness consequences with the GM.',
            )
          : null;
        const changes = await this.spend(
          p.r.ammo,
          malfunction?.triggered ? malfunction.state.spent : 1,
          this.kind === 'throw' && !malfunction?.triggered,
          criticalEffect,
          malfunction?.change,
        );
        markApplied(this.actor, malfunction?.change);
        if (malfunction)
          await reportMalfunction(
            this.actor,
            malfunction,
            VISIBILITY.INHERIT,
            result.visibility,
            malfunction.triggered ? changes : [],
          );
        if (malfunction?.triggered) {
          this.status = malfunction.detail;
          this.lastDamage = null;
          this.session = null;
          if (this.kind === 'bow') d.start = 'stowed';
          return;
        }
        this.lastDamage =
          step.type === 'object'
            ? `${p.calc.damage} ${d.profile === 'ordinary' ? d.damageType : p.calc.type}`
            : null;
        this.status = `${step.label} rolled.${p.r.ammo ? ' One projectile spent.' : ' Quantity untracked.'} Resolve defences before damage.`;
        await this.receipt(
          step.label,
          step.type === 'object'
            ? `${d.objectName}: maximum ${fmt(p.calc.distance)} yards; ${this.lastDamage}. ${this.status}`
            : this.status,
          changes,
          result.visibility,
        );
        if (result.critical) {
          this.status += ' Critical failure: resolve its effects before starting another sequence.';
          this.session = null;
          return;
        }
      }
      this.session.index++;
      if (this.session.index >= this.session.steps.length) {
        this.session = null;
        this.status += ' Sequence complete.';
        if (this.kind === 'bow') d.start = 'stowed';
      }
      return true;
    } catch (error) {
      if (completedRoll) {
        this.session = null;
        this.status =
          'A roll occurred, but the following operation failed. Sequence stopped to prevent a duplicate roll. Check the tracker and chat before continuing.';
      }
      throw error;
    }
  }
  get effectPath() {
    return `flags.${MODULE_ID}.pendingEffects.${this.kind}`;
  }
  pendingEffect() {
    return foundry.utils.getProperty(this.actor, this.effectPath) || this.unrecordedEffect || null;
  }
  makeEffect(message) {
    return { id: foundry.utils.randomID(), message };
  }
  async resolveEffect() {
    if (this.busy || !this.pendingEffect()) return;
    if (!this.actor.isOwner && !game.user.isGM) throw new Error('You do not own this actor.');
    this.busy = true;
    const effect = this.pendingEffect();
    try {
      const response = await foundry.applications.api.DialogV2.input({
        window: { title: 'Resolve critical effects' },
        content: `<p>${esc(effect.message)}</p><p>Handle any injury, equipment recovery, and required Ready manoeuvres at the table. This does not restore ammunition or advance the turn.</p><label><input type="checkbox" name="resolved"> Effects resolved; ready to configure a later action</label>`,
        ok: { label: 'Record resolution' },
        rejectClose: false,
      });
      if (!response?.resolved) return;
      if (this.pendingEffect()?.id !== effect.id)
        throw new Error('The recorded effect changed. Review it again.');
      await this.actor.update({ [this.effectPath]: null });
      this.unrecordedEffect = null;
      this.data.start = this.kind === 'object' ? 'ready' : 'stowed';
      this.status = 'Critical effects resolved. Check the starting state for your next action.';
      await this.receipt('Critical effects resolved', effect.message + ' ' + this.status);
    } finally {
      this.busy = false;
    }
  }
  async spend(ammo, amount, recoverable = false, effect = null, condition = null) {
    if (effect) this.unrecordedEffect = effect;
    if (!ammo || !amount) {
      if (condition) await this.actor.update({ [condition.path]: condition.after });
      if (effect) {
        await this.actor.update({ [this.effectPath]: effect });
        this.unrecordedEffect = null;
      }
      return condition ? [condition] : [];
    }
    const before = trackerValue(this.actor, ammo.path);
    if (before - enforcedMinimum(ammo) < amount)
      throw new Error('The tracker changed during the roll. Adjust ammunition manually.');
    const after = before - amount,
      path = `system.${ammo.path}.value`;
    const changes = [{ path, before, after }, ...(condition ? [condition] : [])];
    if (recoverable) {
      const path = `flags.${MODULE_ID}.recoverable.${ammo.key}`;
      const before = number(foundry.utils.getProperty(this.actor, path)) ?? 0;
      changes.push({ path, before, after: before + amount });
    }
    await this.actor.update({
      ...Object.fromEntries(changes.map((c) => [c.path, c.after])),
      ...(effect ? { [this.effectPath]: effect } : {}),
    });
    if (effect) this.unrecordedEffect = null;
    return changes;
  }
  async recover() {
    if (this.busy || this.session) return;
    if (!this.actor.isOwner && !game.user.isGM) throw new Error('You do not own this actor.');
    const ammo = this.records().ammo;
    if (!ammo) return;
    const path = `flags.${MODULE_ID}.recoverable.${ammo.key}`;
    const outstanding = number(foundry.utils.getProperty(this.actor, path)) ?? 0;
    const response = await foundry.applications.api.DialogV2.input({
      window: { title: 'Recover thrown or dropped items' },
      content: `<p>Return only items actually recovered and usable. ${outstanding} recorded.</p><label>Quantity<input name="amount" type="number" min="1" max="${outstanding}" step="1" value="1"></label>`,
      ok: { label: 'Recover' },
      rejectClose: false,
    });
    if (!response) return;
    const amount = number(response.amount),
      current = trackerValue(this.actor, ammo.path),
      before = number(foundry.utils.getProperty(this.actor, path)) ?? 0;
    if (!Number.isInteger(amount) || amount < 1 || amount > before)
      throw new Error('Choose a whole quantity within the recorded total.');
    if (ammo.isMaximumEnforced && current + amount > ammo.max)
      throw new Error('The tracker lacks capacity for that quantity.');
    const changes = [
      { path, before, after: before - amount },
      { path: `system.${ammo.path}.value`, before: current, after: current + amount },
    ];
    await this.actor.update(Object.fromEntries(changes.map((c) => [c.path, c.after])));
    await this.receipt('Items recovered', `${amount} returned to ${ammo.name}.`, changes);
  }
  async damage() {
    if (!this.lastDamage || this.busy) return;
    // Damage remains a deliberate separate action after defence resolution.
    return rollDamage(this.actor, this.lastDamage);
  }
}

async function rollDamage(actor, formula) {
  if (!actor.isOwner && !game.user.isGM) throw new Error('You do not own this actor.');
  const old = GURPS.LastActor,
    oldToken = GURPS.LastTokenDocument;
  try {
    GURPS.SetLastActor?.(actor, actor.token);
    return await GURPS.executeOTF(`[${formula}]`, false, { data: {} }, actor);
  } finally {
    GURPS.SetLastActor?.(old, oldToken);
  }
}
