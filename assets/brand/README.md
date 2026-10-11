# NiX brand assets

**Source of truth:** the logo the app draws (`src/components/brand/DrawnLogo.tsx`): an N whose
right leg is an X, on a 1024 grid, one 100 px stroke with round caps, flat ink, no shadows. The
rising stroke is glass — the same ink at 55 → 92 % opacity, under the other two. The wordmark
„NiX” is set in the system rounded face (SF Pro Rounded), weight 800.

Every logo in the app, the icon set, the launch screen, the widget and the web favicons is that
mark. Variants change only the backdrop, never the mark:

| Master (`master/`) | Look | Used for |
| --- | --- | --- |
| `nix-mark.svg` | white mark, transparent | tinted icon, launch screen (on `#4B4DF0`) |
| `nix-mark-ink.svg` | black mark, transparent | light backgrounds (docs, press) |
| `nix-icon.svg` | white mark on the indigo tile, soft light behind it | app icon, App Store, widget, favicons |
| `nix-icon-dark.svg` | white mark with an indigo glow, transparent | dark app icon (iOS draws the backdrop) |

In the app the mark is drawn live in the label colour with an accent-colour glow (welcome tour,
login), so it follows light / dark mode and the user's accent.

## Exports

Never edit a PNG by hand. Change a master and run:

```bash
npm run brand:generate
```

It renders (macOS, `scripts/brand/render-svg.swift`) and copies:

- `app/ios-light.png`, `app/app-store-1024.png` — opaque icon (no alpha, required by the App Store);
  `app/ios-dark.png`, `app/ios-tinted.png` — the iOS 18+ appearances.
- `splash/splash-mark.png` — launch screen mark.
- `widget/NixWidgetLogo*.png` — widget header (34 pt).
- `web/favicon-*.png`, `web/favicon.ico`.
- The native copies in `ios/NiX/Images.xcassets` (AppIcon, SplashScreenLogo) and
  `ios/ExpoWidgetsTarget/Assets.xcassets/NixWidgetLogo.imageset`.

The icon, launch screen and widget ship in the binary: a change needs a new build (Xcode Archive),
an OTA update does not carry them.
