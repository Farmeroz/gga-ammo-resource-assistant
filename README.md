# GGA Ammunition & Resource Assistant

A Foundry VTT module for GURPS Game Aid that manages ammunition, reloads, and other expendable Resource Trackers. Saved loadouts can be placed on the macro hotbar for instant shooting or reloading.

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

This module records changes to user-created GGA Resource Trackers. It does not include weapon statistics, equipment tables, or rules text from GURPS publications.

Report problems through [GitHub Issues](https://github.com/Farmeroz/gga-ammo-resource-assistant/issues).

GURPS is a trademark of Steve Jackson Games. This unofficial module is not affiliated with or endorsed by Steve Jackson Games, Foundry Gaming LLC, or the GURPS Game Aid maintainers.

## Licence

Copyright © 2026 Phil Brown. Released under the [MIT License](LICENSE).

## Help tooltips

Hover over a control or focus it with the keyboard for a short explanation. Press Escape to dismiss the help. Under **Configure Settings → Module Settings → GGA Ammunition & Resource Assistant**, turn off **Show help tooltips** to hide optional help on your client. Labels, settings descriptions, and important notices remain visible. Other users keep their own preference.
