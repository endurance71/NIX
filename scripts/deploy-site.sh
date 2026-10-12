#!/bin/bash
# Deploys web/site to nix.shipapp.pl: the files go to /srv/nix-site on the ShipApp VPS, which Caddy
# serves read-only (see docs/website.md). The host has no rsync, so the files travel as a tar stream.
# The directory is refreshed in place (not swapped): Caddy's bind mount follows the directory inode.
# Run: npm run deploy:site   (needs the `contabo-mtle` SSH host)
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${NIX_SITE_HOST:-contabo-mtle}"
TARGET=/srv/nix-site

npm run -s check:site
npm run -s check:legal-pages

COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -C web/site --exclude '.DS_Store' -czf - . |
  ssh -o BatchMode=yes "$HOST" "set -e; mkdir -p $TARGET; find $TARGET -mindepth 1 -delete; tar --no-same-owner -C $TARGET -xzf -; find $TARGET -type f | wc -l"
echo "Deployed web/site to $HOST:$TARGET"
