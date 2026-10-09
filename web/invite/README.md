# NiX invite landing — SEOHOST/LiteSpeed

Host this directory at `https://nix.damianmotylinski.pl`.

- Create the `nix` DNS record and point it at the existing hosting account.
- The live subdomain document root is `/domains/nix.damianmotylinski.pl/public_html` in the existing FTP account. It also contains an unrelated homepage; do not overwrite that `index.html`.
- Upload this directory's `index.html` as **`nix-invite.html`**. Upload `.htaccess`, `.well-known/`, `legal.css`, `privacy/`, `terms/` and `support/` at their existing relative paths. `/invite/*` rewrites to the dedicated NiX landing file.
- Keep `.htaccess`; it supplies the AASA content type, security headers and `/invite/*` rewrite.
- Confirm `/.well-known/apple-app-site-association` returns `200 application/json`
  directly, without a redirect.
- Disable access logging for `/invite/*` in the hosting panel. `.htaccess`
  cannot guarantee redaction of the token-bearing request path.
- The App Store URL is `https://apps.apple.com/app/id6791332379`. Until the
  public App Store release, internal testers install NiX from TestFlight.

Run `npm run generate:legal-pages`, `npm run check:legal-pages` and `npm run check:invite-hosting` before upload and
`npm run check:invite-hosting -- https://nix.damianmotylinski.pl` after DNS and
TLS are active.

Legal HTML is generated from the versioned in-app documents. Support pages are generated from the PL/EN instructions in the same generator. FTPS requires TLS session reuse for data connections; verify the server chain against trusted roots and include its missing intermediate certificates without disabling certificate checks. Back up each changed remote file outside Git before uploading and renaming its replacement.
