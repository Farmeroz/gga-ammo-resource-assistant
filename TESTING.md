# Testing

Start with the setup commands in [CONTRIBUTING.md](CONTRIBUTING.md).

## Automated coverage

Automated tests cover ammunition and resource arithmetic, tracker creation, weapon references, the shot-prompt adapter, hotbar actions, completed/cancelled attacks, chat failures, and the clean package. GGA and Foundry services are mocked.

The suite exercises these behaviours but does not claim complete coverage or reproduce a connected Foundry world. All automated cases should run; the standard test command treats skipped Node tests as a failure. Test output is saved under `test-output/`.

Action-workflow tests cover GURPS Fourth Edition throwing boundaries and distance bonuses, cinematic penalties, advisory prerequisites and automatic chat notes, preparation/attack modifier isolation, cancelled rolls, failed preparation, separate arrow costs, recovery, stale saved references, conditional controls, and duplicate-click protection.

## Source fixtures

No external source download is needed. Setup confirms that the suite uses its local fixtures or mocks.

## Live check

Fire once and in a burst; cancel a roll; reload; adjust and undo a resource; use a saved hotbar action. Check both a linked PC and an unlinked NPC token.

Use your normal Foundry/GGA versions and module combination, and refresh connected clients after updating. Record unexpected notifications, visibility changes, or changed resource totals, together with the module versions and steps to reproduce them.

Phil tested the action workflow in Foundry and accepted v1.1.2 on 7 October 2026, following fixes to automatic sequence execution, critical effects, and advisory prerequisites. The automated release check passes 91 tests, plus formatting, syntax, and package verification.

Use the following scenarios for future regression checks:

- Open Choose action, then each action at the default window size and in both themes. Expand rules, resize the window, and reach Run sequence using the keyboard.
- Test a bow with no cinematic advantages, Heroic Archer, Weapon Master, and both. Test a cancelled draw, failed quick-readying, a readied shot, and two arrows against separate targets. Compare Run sequence with One step.
- Leave a campaign switch off and run as a player. Confirm the advisory does not block execution, no written reason is requested, and the unmet checks appear once in chat after a roll. Check inherited private/blind visibility and disabled resource receipts.
- Critically fail an arrow draw, weapon draw, and bow-readying roll. Confirm the appropriate resource consequences, no subsequent attack, and a critical-effect record that survives reopening. Resolving effects must not refill ammunition.
- Verify GGA's current combat/action-economy settings permit the selected cinematic attacks. Confirm the intended manoeuvre, Acc, and per-target modifiers are applied once.
- Throw two tracked weapons, cancel a later attack, recover one item, and undo that recovery. Confirm both the tracker and outstanding count.
- Throw an object using DX, Throwing, and Throwing Art. Confirm the separate damage button and current chat visibility.
- Save and reopen each specialised action through a hotbar shortcut, including an unlinked NPC token. Re-import skills and verify links still identify the right records.

## Package verification

The build checks module/package versions, install URLs, declared assets, local imports, the allowed archive file list, and every archived file's bytes. The release ZIP contains only runtime files, the licence, and user documentation.

## Malfunction live acceptance and regression checks

On 7 October 2026, Phil confirmed live malfunction triggering by testing a deliberately low Malf. value, then authorised stable publication. Version 1.2.0 retains the tested runtime from v1.2.0-beta.2. All 110 automated tests pass, including the 91 existing tests; formatting, syntax, and package verification also pass.

Use the following scenarios for future regression checks:

- Confirm old loadouts still fire normally with malfunctions off. Save/reopen settings and use the hotbar.
- Use controlled GGA attack dice to test totals below, equal to, and above Malf.; a critical miss below Malf. must not malfunction.
- Fire a burst and resolve a stoppage: only one shot's cost should be spent. Check the receipt's instruction to resolve one shot without the burst bonus.
- Test mechanical trouble, revolver misfire, beam stoppage, grenade dud/delay, and an eligible low-TL explosion. Resolve damage at the table.
- Test a cheap bow two-arrow sequence: a malfunction stops it, records breakage, and does not create a second critical-effect record.
- Reopen the assistant, use a shared identifier from another loadout, disable detection, and reload ammunition. Existing blocking condition should remain.
- Record diagnosis, failed clearing, critical clearing, successful repair, and critical repair. Ammunition should not refill.
- Test public, GM, self, and blind rolls with ordinary receipts off. Malfunction dice/results should retain the selected visibility.
- Undo ammunition/condition together, then test that a later adjustment or repair prevents stale undo.
- Keep any other automatic critical-table resolver disabled for malfunction-assisted attacks; GGA's original critical label is superseded by the malfunction receipt.

Automated tests cover threshold/table boundaries, special reliability, weapon categories, actual dice capture, partial expenditure, state persistence, visibility, guarded undo, clearing/repair transitions, and bow/throw integration.
