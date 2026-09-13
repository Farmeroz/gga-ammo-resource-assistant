# GGA Ammunition & Resource Assistant – User Guide

## What the module does

The Ammunition & Resource Assistant gives players and GMs one place to:

- roll a GGA ranged attack and deduct the ammunition actually fired
- reload a magazine or other resource from a reserve tracker
- adjust any GGA Resource Tracker
- save weapon and tracker combinations as loadouts
- place saved Fire and Reload configurations on the macro hotbar

The assistant uses the ranged attacks present on the actor.  It does not add weapon statistics or infer ammunition values; you enter the capacity and current quantity when creating a tracker.

## Opening the assistant

Select one token and use the bullseye button under **Token Controls**.

You can also enter:

```text
/ammo
```

If no token is selected, the assistant uses your assigned character where possible.

Use the people button beside the current actor to search all actors you own.  GMs can search all world actors, including actors that do not currently have a token on the scene.

## First-time ammunition setup

If an actor has a ranged attack but no suitable Resource Trackers, the Fire view offers **Set up ammunition**.

The short setup process lets you:

- choose the ranged attack
- name the loadout
- create a magazine or power-source tracker with its capacity and current value
- optionally create a reserve tracker
- choose fixed or prompted hotbar shooting
- optionally place the new Fire action on your hotbar

The trackers are normal GGA Resource Trackers.  Their minimum is enforced at zero and their maximum is enforced at the capacity you enter.

Use **Create tracker** beside the magazine or reserve selector whenever you need another tracker without using the complete setup process.

## Fire

The Fire view shows only the choices needed for an attack:

1. Select the ranged attack and its usage or mode.
2. Select the magazine or resource tracker.
3. Enter the number of shots.
4. Review the predicted tracker change.
5. Select **Roll & spend**.

The normal GGA attack is then rolled.  Ammunition is deducted only after the attack roll actually occurs.  A failed attack still expends ammunition; a cancelled attack or an attack that cannot be launched does not.

For weapons with RoF greater than 1, the assistant passes the chosen number of shots into GGA so GGA can apply its normal Rapid Fire calculation.

Tracker choices show their current and maximum values.  If two trackers have the same name, their internal paths are displayed so you can select the intended one safely.

If the configured burst exceeds the available ammunition, the module offers to fire only the shots that can be supplied or cancel.  Players cannot create negative ammunition.  A GM may enable a deliberate override in Module Settings.

### Advanced Fire options

Open **Loadout and advanced options** to set:

- loadout name
- fixed or prompted hotbar shooting
- resource units consumed per shot
- an additional flat resource cost per attack
- low-ammunition warning threshold
- receipt visibility

A low warning value of `0` automatically uses the resource cost of one full-RoF attack.

## Reload

The Reload view transfers ammunition from a reserve tracker to the selected magazine or resource.

1. Select the ranged attack.
2. Select the magazine or destination tracker.
3. Select a reserve tracker, or choose **Untracked replenishment**.
4. Choose **Fill to capacity** or a fixed amount.
5. Select **Reload**.

The module never overfills the destination.  If the reserve does not contain enough ammunition, it transfers what is available and reports the shortfall.

Magazine and reserve changes are committed together.  They cannot become separated by a partially completed reload.

The GGA Shots value is displayed as a reminder.  The module records the ammunition change but does not automatically spend combat turns or Ready manoeuvres.

## Adjust

Use Adjust for an expendable resource that is not part of a normal Fire or Reload action.

Choose the Resource Tracker, then select:

- **Spend** to subtract an amount
- **Add** to restore or add an amount
- **Set value** to enter an exact value

The tracker’s own enforced minimum and maximum are respected.

## Saved loadouts

A loadout connects one ranged attack and mode with:

- its magazine or resource tracker
- an optional reserve tracker
- default shots
- hotbar behaviour
- resource cost and warning settings
- receipt visibility

Select **Save loadout** from Fire or Reload.  Loadouts are stored on the actor and are not part of the imported GGA character data.

For an unlinked token, loadouts are stored on that token’s ActorDelta and remain specific to that token.  A linked hotbar action therefore stops safely if the token is later deleted; it does not fall back to the base actor and risk changing the wrong ammunition tracker.

If a GGA import changes an internal attack or tracker path, the module attempts to relink the loadout by its stable attack identity and exact names.  It stops and asks for manual relinking rather than guessing between ambiguous matches.

### Import and export

Open **Loadouts** and use **Export** to save all loadouts for the current actor as JSON.  Use **Import** to add loadouts from a previously exported file.

Imported loadouts retain their names and settings.  Open each one once to confirm that its ranged attack and trackers match the receiving actor.

## Instant hotbar shooting

There are two ways to put a saved configuration on the hotbar:

- Select **Add to hotbar** in Fire or **Add reload to hotbar** in Reload.
- Open Loadouts and drag a saved loadout onto a specific hotbar slot.

The button method uses the first empty slot on the displayed hotbar page, then the first empty slot on another page.  It never overwrites an occupied slot.

### Fixed burst

Choose **Fire this fixed burst** in the loadout options for true one-click shooting.  Clicking the hotbar macro immediately validates the actor and current ammunition, launches the normal GGA attack, and deducts the saved number of shots.

Normal GGA prompts, such as an optional roll-confirmation window, continue to appear when enabled in GGA.

### Ask each time

Choose **Ask for shots each time** when the burst varies.  The hotbar macro opens one small shot-count prompt limited by both weapon RoF and the available ammunition.  It does not open the full assistant.

Hotbar macros contain only the actor and loadout identifiers.  Editing and saving the loadout automatically changes the behaviour of its existing hotbar macros.

The names and icons of linked macros you own are also updated when you save the loadout.  Hold **Shift** while selecting a generated hotbar macro to open that loadout for review or editing without firing or reloading.

When deleting a loadout, the assistant can also remove its linked macros that you own and clear their hotbar slots.  If you keep the macros, they stop safely and explain that the loadout is no longer available.

## Chat receipts and Undo

Resource changes can post a compact chat receipt showing the before and after values.  Attack receipts inherit the attack roll’s visibility by default, so a private or blind attack is not exposed by its ammunition message.

Select **Undo** on a receipt to reverse its resource change.  Undo works only while every affected tracker still has the value produced by that receipt.  If something else has changed the tracker since then, the module refuses to overwrite the newer value.

Receipts can be disabled in Module Settings.

## GURPS 4e rules boundary

Under GURPS Fourth Edition, a weapon with RoF 2 or more allows the attacker to choose how many shots to fire, up to its RoF.  See *GURPS Basic Set: Campaigns*, p. B373.

The Shots statistic, including its parenthetical reload-time notation, is defined in *GURPS Basic Set: Characters*, p. B270.  Combat use of RoF, Shots, and reloading is covered in *GURPS Basic Set: Campaigns*, p. B373; Ready manoeuvres for reloading are covered on p. B382.

The assistant tracks the chosen ammunition and displays reload information.  It leaves combat timing, unusual reloads, stoppages, ammunition changes, and other situational rulings to the players and GM.

## Troubleshooting

### No actor selected

Select exactly one token and use the crosshairs button in the actor header.  Alternatively, use **Choose actor** or assign a character to your Foundry user.

### No ammunition trackers appear

Use **Set up ammunition** or **Create tracker** in the assistant.  You can also create and name a Resource Tracker on the GGA actor sheet.  Damage-style trackers are deliberately excluded from Fire and Reload but remain available under Adjust.

### Two trackers have the same name

The selector adds each duplicate tracker’s internal path after its current and maximum values.  Choose the required one, then consider giving the trackers distinct names to make future relinking safer.

### The wrong weapon usage is selected

Open the saved loadout and select the full weapon and usage combination.  If the actor contains duplicate ranged attacks with the same name and mode, give the modes distinct names in GGA.

### An attack rolled but ammunition was not deducted

The module could not safely capture GGA’s selected shot count.  It leaves the tracker untouched and posts a private warning instead of guessing.  Confirm that GGA 0.18.x and libWrapper are active.

### A hotbar button says the loadout is missing

The loadout was deleted or belongs to an actor that is no longer available.  Save the current configuration as a new loadout and add it to the hotbar again.

### Undo was refused

The resource has changed since the receipt was created.  Adjust it manually if correction is still required.

### A resource changed but no receipt appeared

If Foundry cannot create the chat message, the resource change still succeeds and the module warns that receipt-based Undo is unavailable for that change.  Use Adjust if a manual correction is needed.
