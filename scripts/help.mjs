import { createHelpController, helpResolver } from './tooltip-engine.mjs';
export const helpConfig = {
  id: 'gga-ammo-resource-assistant',
  scope:
    '.gga-ara-help-dialog, .gga-ara, .gga-ara-quick-prompt, .gga-ara-receipt, [name^="gga-ammo-resource-assistant."], [data-key^="gga-ammo-resource-assistant."], [data-tool="gga-ammo-resource-assistant"], [data-control="gga-ammo-resource-assistant"]',
  actions: {
    'use-selected': 'Use the currently selected token as the actor for this assistant.',
    'toggle-actor-picker': 'Show or hide the list of actors you can use.',
    'select-actor': 'Switch the assistant to this actor.',
    mode: 'Switch between shooting, reloading, tracker adjustment, and saved loadouts.',
    'new-loadout': 'Start a new loadout configuration. Save it to keep it on the actor.',
    'save-loadout': 'Save this configuration on the current actor for later use.',
    'load-loadout': 'Load this saved configuration into the assistant without firing or reloading.',
    'duplicate-loadout': 'Create a separate saved copy of this loadout.',
    'delete-loadout': 'Delete this saved loadout. This does not delete the resource tracker.',
    'hotbar-fire':
      'Create a shooting macro from this loadout. Running it can roll an attack and spend ammunition.',
    'hotbar-reload':
      'Create a reload macro from this loadout. Running it updates the ammunition trackers.',
    'setup-ammunition': 'Set up ammunition trackers and a loadout for the selected attack.',
    'create-magazine': 'Create a GGA Resource Tracker to hold the magazine or expendable resource.',
    'create-reserve': 'Create a separate tracker from which reloads can draw supplies.',
    fire: 'Roll the selected GGA attack and spend the configured ammunition. Check the shots and resource preview first.',
    reload:
      'Transfer supplies into the magazine, using the selected reserve if tracked. Record Ready manoeuvres separately.',
    adjust: 'Apply the selected operation and amount to this actor’s resource tracker.',
    'import-loadouts':
      'Import saved loadout configurations from a JSON file; review their links to this actor.',
    'export-loadouts': 'Download the actor’s saved loadouts for reuse or backup.',
  },
  fields: {
    actorSearch: 'Filter the actor picker by name.',
    selectedLoadoutId: 'Load a saved shooting and reload configuration for this actor.',
    attackPath: 'Choose the GGA ranged attack whose skill and rate of fire will be used.',
    ammoPath: 'Choose the resource tracker spent when firing and refilled when reloading.',
    shots:
      'Number of shots for this attack. This drives GGA’s rapid-fire calculation and the resource cost.',
    name: 'Name used to identify this loadout or resource tracker.',
    hotbarShotMode:
      'Choose whether the shooting macro uses this burst or asks for a shot count each time.',
    unitsPerShot: 'Resource units spent for each shot, before adding the flat cost.',
    flatCost: 'Extra resource units spent once per attack, regardless of shot count.',
    lowWarningAt:
      'Warn at this remaining quantity. Zero uses the cost of one full-rate-of-fire attack.',
    visibility:
      'Choose who receives the resource receipt. This does not change who can see the attack roll.',
    reservePath:
      'Supply tracker deducted by reloads. Untracked replenishment does not deduct a reserve.',
    reloadMode: 'Fill the magazine to capacity or add a fixed quantity.',
    reloadAmount: 'Quantity to transfer when Fixed amount is selected.',
    adjustTrackerPath: 'Select the actor resource tracker to change.',
    adjustOperation:
      'Spend subtracts, Add increases, and Set value replaces the tracker’s current amount.',
    adjustAmount: 'Quantity used by the selected tracker operation.',
    capacity: 'Maximum quantity the new tracker can hold.',
    current: 'Initial quantity in the new tracker.',
  },
  rules: [
    [
      '.gga-ara-receipt [data-action="undo"]',
      'Undo this resource operation if its recorded state still permits it.',
    ],
  ],
  actionAttributes: ['data-action'],
};
let resolve = helpResolver(helpConfig);

export const helpController = createHelpController({ ...helpConfig, resolve });
if (globalThis.Hooks) {
  Hooks.once('init', () => helpController.register());
  Hooks.once('ready', () => helpController.start());
}
