# NiX launch assets

The canonical artwork lives in `master/`. Generated PNG files must not be edited by hand.

- `nix-mark.svg` — primary white mark with the `#0A84FF` disappearing terminal.
- `nix-mark-monochrome.svg` — single-color source for iOS tinted and Android themed icons.
- `app/` — opaque app, store, and legacy launcher icons.
- `android/` — transparent adaptive foreground and monochrome layers.
- `splash/` — transparent native splash-screen mark.
- `web/` — favicon exports.

The artwork is intentionally geometric, flat, and free of effects so it remains legible at favicon scale. App icon files fill the entire square; platform launchers apply their own masks.
