# NiX invite landing — SEOHOST/LiteSpeed

Host this directory at `https://nix.damianmotylinski.pl`.

- Create the `nix` DNS record and point it at the existing hosting account.
- Set the subdomain document root to this directory.
- Keep `.htaccess`; it supplies the AASA content type, security headers and `/invite/*` rewrite.
- Confirm `/.well-known/apple-app-site-association` returns `200 application/json`
  directly, without a redirect.
- Disable access logging for `/invite/*` in the hosting panel. `.htaccess`
  cannot guarantee redaction of the token-bearing request path.
- The App Store URL is `https://apps.apple.com/app/id6791332379`. Until the
  public App Store release, internal testers install NiX from TestFlight.

Run `npm run check:invite-hosting` before upload and
`npm run check:invite-hosting -- https://nix.damianmotylinski.pl` after DNS and
TLS are active.
