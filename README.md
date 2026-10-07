# GGA Ammunition & Resource Assistant

A Foundry VTT module for GURPS Game Aid that manages ammunition, reloads, and other expendable Resource Trackers. Saved loadouts can be placed on the macro hotbar for instant shooting or reloading.

Choose an action first: **Fire**, **Bow sequence**, **Throw a weapon**, **Throw an object**, **Reload**, or **Adjust**. The guided GURPS Fourth Edition workflows show only the relevant controls, preview preparation and attacks, and show cinematic rule checks as advisories, with automatic chat notes when a player proceeds.

Bow sequences support Fast-Draw, quick-shooting, Heroic Archer, applicable Weapon Master, and two-arrow attacks. Weapon throws support multiple throws and Heroic Thrower. Object throws calculate range, handling, and damage using DX, Throwing, or Throwing Art. Saved action shortcuts reopen the guided workflow.

## Prerelease 1.2.0-beta.1

Optional GURPS Fourth Edition malfunction settings now accompany Fire and bow/throw loadouts. Actual attack dice determine malfunctions; weapon condition persists, and ammunition follows the outcome. Use Weapon condition to record completed clearing and repairs. Existing loadouts default off.

Install this testing build with its [prerelease manifest](https://github.com/Farmeroz/gga-ammo-resource-assistant/releases/download/v1.2.0-beta.1/module.json). The stable release and stable manifest remain v1.1.2. Save any configuration changes as a loadout to retain them.

## What's new in 1.1.2

- **Run sequence** handles preparation and attacks in one click. **One step** remains available, and different-target sequences pause for retargeting.
- Unmet RAW and campaign checks are advisory. Players can proceed without an override checkbox or written reason; the assistant records the unmet checks in chat.
- Preparation failures stop firing. Critical effects record dropped weapons or spilled quiver contents and remain visible until resolved. Recoverable items are tracked separately from ammunition fired.
- Cancelled rolls spend nothing. Same-target attacks retain their target modifiers, while each completed attack spends its own projectile.

After updating, refresh connected Foundry clients. Existing loadouts remain usable; their old override/reason fields no longer control execution. Campaign switches now inform rule advisories. See the user guide for supported rules, references, and recovery behaviour.

## Requirements

- Foundry VTT 13 or 14
- GURPS Game Aid 0.18.x
- libWrapper

## Compatibility matrix

| Component      | Supported         | Verified against | Compatibility notes                                                                               |
| -------------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| Foundry VTT    | 13–14             | 14.367           | Handles the v13 `rollMode` and v14 `messageMode` settings when inheriting chat visibility.        |
| GURPS Game Aid | 0.18.x            | 0.18.23          | Uses GGA ranged attacks, its number-of-shots DialogV2 prompt, and standard Resource Tracker data. |
| libWrapper     | 1.13.0.0 or newer | 1.13.5.1         | Wraps only GGA’s number-of-shots prompt while an assisted attack is active.                       |

## Installation

From Foundry's **Setup** screen, open **Add-on Modules**, paste this address into **Manifest URL**, and select **Install**:

```text
https://github.com/Farmeroz/gga-ammo-resource-assistant/releases/latest/download/module.json
```

Enable **GGA Ammunition & Resource Assistant** and **libWrapper** in the world’s Manage Modules window, then refresh Foundry.

For a manual installation, download the versioned ZIP from [GitHub Releases](https://github.com/Farmeroz/gga-ammo-resource-assistant/releases) and extract its `gga-ammo-resource-assistant` folder into `Data/modules/`.

Open the assistant from Token Controls or enter `/ammo` in chat.

The assistant can create ammunition trackers and initial loadouts directly. Saved Fire and Reload actions can be added to the hotbar without writing or editing macros.

See [USER-GUIDE.md](USER-GUIDE.md) for complete instructions.

## Scope

This module records changes to user-created GGA Resource Trackers and calculates selected GURPS Fourth Edition throwing and cinematic preparation rules. Weapon attacks come from the actor's sheet. It does not include equipment tables or reproduce rulebook prose. See the user guide for rule references, supported options, and the division of work with GGA.

Report problems through [GitHub Issues](https://github.com/Farmeroz/gga-ammo-resource-assistant/issues).

GURPS is a trademark of Steve Jackson Games. This unofficial module is not affiliated with or endorsed by Steve Jackson Games, Foundry Gaming LLC, or the GURPS Game Aid maintainers.

## Licence

Copyright © 2026 Phil Brown. Released under the [MIT License](LICENSE).

## Help tooltips

Hover over a control or focus it with the keyboard for a short explanation. Press Escape to dismiss the help. Under **Configure Settings → Module Settings → GGA Ammunition & Resource Assistant**, turn off **Show help tooltips** to hide optional help on your client. Labels, settings descriptions, and important notices remain visible. Other users keep their own preference.
