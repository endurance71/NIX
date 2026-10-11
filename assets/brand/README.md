# NiX brand assets

The mark is "Szkło" (2026-10-10): an N whose right leg is an X, drawn with one 100 px stroke
and round caps on a 1024 grid, white on a vivid indigo gradient tile. The vector sources are
`master/nix-icon-glass.svg` (full icon) and `master/nix-mark-glass.svg` (mark only). The
previous gradient mark is kept as `master/nix-mark.svg` for reference.

- `app/ios-light.png`, `app/app-store-1024.png` — the opaque icon (no alpha channel).
- `app/ios-dark.png`, `app/ios-tinted.png` — the white mark on a transparent background; iOS
  draws the dark backdrop or applies the tint.
- `splash/splash-mark.png` — the same transparent mark for the launch screen.
- `web/` — favicons rendered from the icon.

Regenerate every PNG from the same geometry; never edit one export by hand.
