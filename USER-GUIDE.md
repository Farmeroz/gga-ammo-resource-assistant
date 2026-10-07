# GGA Ammunition & Resource Assistant – User Guide

## What the module does

The Ammunition & Resource Assistant gives players and GMs one place to:

- roll a GGA ranged attack and deduct the ammunition actually fired
- reload a magazine or other resource from a reserve tracker
- adjust any GGA Resource Tracker
- save weapon and tracker combinations as loadouts
- place saved Fire and Reload configurations on the macro hotbar

The assistant uses the ranged attacks present on the actor. It does not add weapon statistics or infer ammunition values; you enter the capacity and current quantity when creating a tracker.

## Opening the assistant

Select one token and use the bullseye button under **Token Controls**.

You can also enter:

```text
/ammo
```

If no token is selected, the assistant uses your assigned character where possible.

Use the people button beside the current actor to search all actors you own. GMs can search all world actors, including actors that do not currently have a token on the scene.

## Choose an action

The **Choose action** screen offers six starting points. Use **Fire** for an ordinary sheet attack, **Bow sequence** for bow preparation and shots, **Throw a weapon** for weapons with a sheet attack, and **Throw an object** for improvised objects. **Reload** and **Adjust** retain the existing tracker tools.

The specialised views show relevant fields and a preview of the rolls or calculated result. Optional skill links, prerequisite checks, and overrides sit under **Skills and rule checks**. **Run sequence** executes all remaining preparation and attack rolls automatically. It stops on failed preparation, cancellation, or an error. Ordinary missed attacks still spend ammunition and do not stop the remaining attacks. Same-target attacks reuse the initial GGA bucket modifiers. Enable different targets to pause between attacks for retargeting, then use **Continue sequence**. **One step** remains available for manual control.

### Bow sequences

1. Choose the exact attack/usage and an arrow tracker, or explicitly choose untracked quantity.
2. Declare whether the arrows are in the quiver, in hand, or the bow is already readied.
3. Choose one or two arrows and match the manoeuvre to the actor's current GGA manoeuvre.
4. Review the skills and preview, then select **Run sequence** for Fast-Draw, quick-readying, and each attack as applicable.

Heroic Archer is detected by name when unique. Select the applicable Weapon Master specialisation explicitly. Renamed traits and techniques can be linked manually. Quick-shooting penalties are -6 normally, -3 with either advantage, or -1 with both; linked techniques can reduce the appropriate penalty to zero. An already readied shot has no quick-shooting penalty. Two-arrow attacks use two separate one-arrow attack rolls, including their Dual-Weapon Attack penalty. They do not use ordinary rapid-fire hit calculation.

Preparation rolls temporarily set aside the GGA Modifier Bucket and restore it afterwards. Attack rolls consume the bucket normally. The manoeuvre selector affects preparation and Heroic Accuracy eligibility; it does not set the actor's manoeuvre or supply GGA's normal attack modifiers. Apply normal range, visibility, manoeuvre, off-hand, and other attack modifiers in GGA. Leave **Apply Heroic Acc here** unchecked if it is already included elsewhere.

A cancelled roll leaves the current step pending and spends nothing. Failed quick-readying ends the sequence with the bow ready for a later turn. Critical readying failure drops the bow, without spending an arrow as a shot (MA119). Failed arrow Fast-Draw ends the sequence and records dropped arrows. A critical arrow draw drops the quiver and scatters its contents (B195; MA120): the selected quiver tracker is emptied into its recoverable count. Use a tracker for one quiver, not combined reserves. Critical Fast-Draw of a thrown weapon records that weapon as dropped (B194). These are specific preparation consequences, not rolls on the critical attack table.

Critical failures stop all remaining steps and create a persistent **Critical effects to resolve** panel for that actor's action type. Recover items and handle required Ready manoeuvres or other consequences at the table, then use **Resolve effects** to acknowledge resolution before a later sequence. This does not refill trackers, heal injury, move equipment, or advance a turn. Resource undo does not clear a critical-effect record. Critical attack failures also stop for the GGA critical result to be resolved; the assistant does not roll a second critical table. Critical preparation successes allow the sequence to continue normally, without making the subsequent attack automatically succeed.

**End sequence** preserves completed rolls and costs. Review readiness before starting again; combat turns and equipment readiness are not advanced automatically.

### Throw a weapon

Use the exact thrown-weapon attack on the sheet. Choose a supply tracker and the number of primary-hand throws. With Heroic Thrower, declare that the weapon is eligible and choose any off-hand throws. Spears and javelins are outside that advantage's small-weapon benefit.

The preview lists each draw and attack separately. Heroic Thrower waives ordinary Fast-Draw rolls at skill 16+, and multiple-throw penalties are calculated separately for each hand. An applicable Weapon Master reduces the supported penalties. Weapon damage remains the sheet's damage; the assistant does not add Weapon Master or Throwing Art damage to sheet attacks.

Thrown and dropped tracked items enter a recovery count. **Recover items** asks how many usable items were actually recovered, returns those to the tracker, and reduces the recovery count. Recovery and spending receipts support the existing guarded resource undo. Undo does not undo dice rolls, damage, or combat manoeuvres.

### Throw an object

Enter the object and its weight in pounds or kilograms. Choose **Basic DX**, **Throwing**, or **Throwing Art**, and a specific target or general area. Ordinary Throwing requires a suitable small, relatively smooth, palm-sized object. Throwing Art exposes its special improvised-weapon damage profiles.

The preview shows maximum distance, damage, base target, and one- or two-handed handling. Expand the rules section to correct ST, DX, actual Basic Lift, damage, or skill links. Ready the object before rolling. The separate **Roll damage** button is available after the attack so defences can be resolved first. Object throws do not change equipment or resource quantities.

The calculation uses actual Basic Lift for the weight ratio and weight limits. Throwing skill bonuses modify the final ST distance multiplier only. Trained area throws do not receive an automatic +3. Untrained throws use DX-3 against a specific target and DX for a general area. Throwing Art damage bonuses apply per die after the relevant weight adjustment or improvised profile.

### Campaign rules, prerequisites, and saved actions

The GM records the campaign’s quick-shooting, two-arrow, Dungeon Fantasy archery, rapid throwing, Heroic Thrower, and Throwing Art options in Module Settings. These switches default off and inform advisory checks. Unmet RAW or campaign checks are listed in the view, but do not disable Run sequence. The player can proceed without an override checkbox, special override permission, or written reason. The assistant automatically lists unmet checks in chat once a roll occurs, respecting roll visibility even if resource receipts are disabled. A cancelled roll posts no rule-check note. Manual skill levels are also reported rather than blocked. Actor ownership, valid roll inputs, available ammunition, and unresolved critical effects remain separate operational requirements.

Save a configuration as a loadout or add it directly to the hotbar. Specialised hotbar actions open the configured workflow rather than immediately rolling its entire sequence. Saved attack, resource, and explicit skill/advantage links are checked by identity; missing links require replacement. Cinematic settings are checked again for advisory notes when the action is used.

This first implementation supports the listed bow and throwing sequences. It does not automate additional bow volleys from Extra Attack, the Heroic Thrower alternative rapid-fire option, firearm Fast-Draw (Ammo)/Quick Reload, target distance measurement, hit locations, defence penalties, or ammunition recovery on the scene. GGA action-economy enforcement remains in force and must be configured consistently with the campaign's permitted attacks.

### GURPS Fourth Edition references

- **Basic Set**, pp. 194-195: Fast-Draw; p. 226: Throwing and Throwing Art; pp. 355-356: throwing distance, weight, handling, and damage.
- **Martial Arts**, p. 45: Heroic Archer; p. 83: Dual-Weapon Attack; p. 103: multiple Fast-Draw; pp. 119-121: quick-shooting bows and multiple thrown attacks.
- **Dungeon Fantasy 11: Power-Ups**, pp. 32-33: Double-Shot and Quick-Shot.
- **Dungeon Fantasy Denizens: Thieves**, pp. 22-23: Heroic Thrower.

These are calculation references, not substitutes for the publications. Confirm unusual builds and interacting optional rules with the GM.

## First-time ammunition setup

If an actor has a ranged attack but no suitable Resource Trackers, the Fire view offers **Set up ammunition**.

The short setup process lets you:

- choose the ranged attack
- name the loadout
- create a magazine or power-source tracker with its capacity and current value
- optionally create a reserve tracker
- choose fixed or prompted hotbar shooting
- optionally place the new Fire action on your hotbar

The trackers are normal GGA Resource Trackers. Their minimum is enforced at zero and their maximum is enforced at the capacity you enter.

Use **Create tracker** beside the magazine or reserve selector whenever you need another tracker without using the complete setup process.

## Fire

The Fire view shows only the choices needed for an attack:

1. Select the ranged attack and its usage or mode.
2. Select the magazine or resource tracker.
3. Enter the number of shots.
4. Review the predicted tracker change.
5. Select **Roll & spend**.

The normal GGA attack is then rolled. Ammunition is deducted only after the attack roll actually occurs. An ordinary failed attack still expends ammunition; a cancelled attack or an attack that cannot be launched does not. With optional malfunction support enabled, expenditure follows the malfunction outcome instead.

For weapons with RoF greater than 1, the assistant passes the chosen number of shots into GGA so GGA can apply its normal Rapid Fire calculation.

Tracker choices show their current and maximum values. If two trackers have the same name, their internal paths are displayed so you can select the intended one safely.

If the configured burst exceeds the available ammunition, the module offers to fire only the shots that can be supplied or cancel. Players cannot create negative ammunition. A GM may enable a deliberate override in Module Settings.

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

The module never overfills the destination. If the reserve does not contain enough ammunition, it transfers what is available and reports the shortfall.

Magazine and reserve changes are committed together. They cannot become separated by a partially completed reload.

The GGA Shots value is displayed as a reminder. The module records the ammunition change but does not automatically spend combat turns or Ready manoeuvres.

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

Select **Save loadout** from Fire or Reload. Loadouts are stored on the actor and are not part of the imported GGA character data.

For an unlinked token, loadouts are stored on that token’s ActorDelta and remain specific to that token. A linked hotbar action therefore stops safely if the token is later deleted; it does not fall back to the base actor and risk changing the wrong ammunition tracker.

If a GGA import changes an internal attack or tracker path, the module attempts to relink the loadout by its stable attack identity and exact names. It stops and asks for manual relinking rather than guessing between ambiguous matches.

### Import and export

Open **Loadouts** and use **Export** to save all loadouts for the current actor as JSON. Use **Import** to add loadouts from a previously exported file.

Imported loadouts retain their names and settings. Open each one once to confirm that its ranged attack and trackers match the receiving actor.

## Instant hotbar shooting

There are two ways to put a saved configuration on the hotbar:

- Select **Add to hotbar** in Fire or **Add reload to hotbar** in Reload.
- Open Loadouts and drag a saved loadout onto a specific hotbar slot.

The button method uses the first empty slot on the displayed hotbar page, then the first empty slot on another page. It never overwrites an occupied slot.

### Fixed burst

Choose **Fire this fixed burst** in the loadout options for true one-click shooting. Clicking the hotbar macro immediately validates the actor and current ammunition, launches the normal GGA attack, and deducts the saved number of shots unless an enabled malfunction changes the expenditure.

Normal GGA prompts, such as an optional roll-confirmation window, continue to appear when enabled in GGA.

### Ask each time

Choose **Ask for shots each time** when the burst varies. The hotbar macro opens one small shot-count prompt limited by both weapon RoF and the available ammunition. It does not open the full assistant.

Hotbar macros contain only the actor and loadout identifiers. Editing and saving the loadout automatically changes the behaviour of its existing hotbar macros.

The names and icons of linked macros you own are also updated when you save the loadout. Hold **Shift** while selecting a generated hotbar macro to open that loadout for review or editing without firing or reloading.

When deleting a loadout, the assistant can also remove its linked macros that you own and clear their hotbar slots. If you keep the macros, they stop safely and explain that the loadout is no longer available.

## Chat receipts and Undo

Resource changes can post a compact chat receipt showing the before and after values. Attack receipts inherit the attack roll’s visibility by default, so a private or blind attack is not exposed by its ammunition message.

Select **Undo** on a receipt to reverse its resource change. Undo works only while every affected tracker still has the value produced by that receipt. If something else has changed the tracker since then, the module refuses to overwrite the newer value.

Ordinary resource receipts can be disabled in Module Settings. Malfunction and weapon-condition receipts remain available.

## GURPS 4e rules boundary

Under GURPS Fourth Edition, a weapon with RoF 2 or more allows the attacker to choose how many shots to fire, up to its RoF. See _GURPS Basic Set: Campaigns_, p. B373.

The Shots statistic, including its parenthetical reload-time notation, is defined in _GURPS Basic Set: Characters_, p. B270. Combat use of RoF, Shots, and reloading is covered in _GURPS Basic Set: Campaigns_, p. B373; Ready manoeuvres for reloading are covered on p. B382.

The assistant tracks the chosen ammunition and displays reload information. Optional malfunction support records stoppages and other weapon conditions. Combat timing, completed clearing/repair rolls, unusual reloads, and situational ammunition corrections remain with the players and GM.

## Troubleshooting

### No actor selected

Select exactly one token and use the crosshairs button in the actor header. Alternatively, use **Choose actor** or assign a character to your Foundry user.

### No ammunition trackers appear

Use **Set up ammunition** or **Create tracker** in the assistant. You can also create and name a Resource Tracker on the GGA actor sheet. Damage-style trackers are deliberately excluded from Fire and Reload but remain available under Adjust.

### Two trackers have the same name

The selector adds each duplicate tracker’s internal path after its current and maximum values. Choose the required one, then consider giving the trackers distinct names to make future relinking safer.

### The wrong weapon usage is selected

Open the saved loadout and select the full weapon and usage combination. If the actor contains duplicate ranged attacks with the same name and mode, give the modes distinct names in GGA.

### An attack rolled but ammunition was not deducted

The module could not safely capture GGA’s selected shot count. It leaves the tracker untouched and posts a private warning instead of guessing. Confirm that GGA 0.18.x and libWrapper are active.

### A hotbar button says the loadout is missing

The loadout was deleted or belongs to an actor that is no longer available. Save the current configuration as a new loadout and add it to the hotbar again.

### Undo was refused

The resource has changed since the receipt was created. Adjust it manually if correction is still required.

### A resource changed but no receipt appeared

If Foundry cannot create the chat message, the resource change still succeeds and the module warns that receipt-based Undo is unavailable for that change. Use Adjust if a manual correction is needed.

## Optional malfunctions (1.2.0)

Choose **Malfunction settings** in Fire, Bow, or Throw weapon. Enable the option, choose the weapon category, and enter its effective Malf. Save the loadout afterwards. Old loadouts default off. Changing category does not replace your entered value. Object throws have no malfunction option.

References: GURPS Fourth Edition **Basic Set: Characters**, pp. B279–280; **Basic Set: Campaigns**, p. B407; **Low-Tech**, p. 75; **High-Tech**, p. 79; [official FAQ 3.4.2.4](https://www.sjgames.com/gurps/faq/FAQ4-3.html). Low-Tech's optional cheap-weapon rules do not apply to ordinary thrown weapons.

Use the effective value after quality, maintenance, and weapon-specific modifiers. Numeric 18 differs from 19+ or Ver. The latter cannot trigger on 3d. **17R** is this module's explicit notation for the High-Tech p. 79 second-roll reliability confirmation at Malf.17; it is not an alternative spelling of Ver. The module does not infer reliability or weapon type from a name.

B407 explosion eligibility is a separate explicit selection: TL3 firearms or TL4 grenades, breechloaders, and repeating firearms. Choose no explosion for TL5+ under this rule. Warhead damage replaces the listed explosion damage only for an eligible explosive-warhead weapon. Resolve injury, scatter, delayed detonation, and any special weapon description at the table.

The malfunction result supersedes a critical miss. GGA v0.18.23's attack routine and chat template were inspected: it supplies the raw `rtotal` and critical status but does not implement malfunction detection or resolution. The assistant does not roll a second critical-miss table. GGA's original attack card still shows its original attack classification; the malfunction receipt explains which result controls. Do not resolve that card's critical classification again. Third-party automatic critical-table modules are not intercepted. Disable overlapping automatic resolution for these attacks. If a future GGA roll explicitly reports a malfunction, the assistant records a review condition instead of rolling another outcome.

A stoppage fires one shot; use that shot's normal attack calculation, without the selected burst's extra-shot bonus or extra hits. The assistant does not rewrite GGA's hit calculation. Beam stoppages become mechanical trouble. Grenades can become duds or delayed detonations; revolver misfires permit the next shot normally. Cheap mechanical missile weapons jam; cheap bows and slings break.

### Ammunition and undo

Ammunition trackers represent **usable rounds or devices**. A stoppage spends one shot's resource cost, a misfire removes one unusable round, and an expended single-use device removes one device. Mechanical failures and Low-Tech jams/breakages default to zero spent; no entire burst is deducted. Explosion expenditure defaults to one round/device. These are bookkeeping conventions where the rule does not prescribe every ejected or damaged round. Use **Adjust** for discarded rounds, retained beam charges, additional damaged ammunition, and weapon-specific exceptions. Flat resource cost applies only when at least one unit is spent.

Condition and ammunition update together. The malfunction receipt appears even when ordinary resource receipts are disabled; secondary dice follow its visibility. Undo restores both together only if neither has changed. Clearing/repair receipts have their own guarded undo. Undo never removes dice, injury, or elapsed manoeuvres.

Condition follows the attack UUID, or name and usage when no UUID exists. Set the same **Shared weapon identifier** on all loadouts/usages of the same physical weapon; use distinct identifiers for separate weapons. Disabling detection does not clear an existing condition. Changing identifiers selects a different weapon record; it is not a repair.

### Clearing and repairs

**Weapon condition** records results already resolved at the table. It does not roll skills or advance time. Follow the displayed procedure, select the completed action and result, and confirm the required time, hands, and skills were handled. Misfires require diagnosis before clearing; mechanical trouble requires diagnosis before a repair attempt. Failure preserves the problem; critical clearing failure escalates to mechanical trouble, and critical mechanical repair failure breaks the weapon. GM-resolved consequences/replacement is an explicit manual resolution option.

Low-Tech gives the jam/breakage outcome without a universal clearing procedure; use the appropriate weapon rule or GM ruling. Recovering arrows or reloading does not repair the weapon. Single-use duds and delayed grenades do not disable the remaining supply; their latest result remains visible until acknowledged.

If the attack total cannot be captured, the module leaves ammunition unchanged and records a blocking review condition. Review the original roll, correct the tracker, and record the resolution. If saving fails after a roll, the current client retains a temporary blocking condition to prevent an accidental repeat; check the actor before reloading the client. Cross-client concurrent edits are not a distributed transaction; one person should operate a weapon at a time.
