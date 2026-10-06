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
