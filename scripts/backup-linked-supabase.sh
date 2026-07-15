#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_DIR:?Set BACKUP_DIR to a directory outside the repository}"
: "${BACKUP_PASSPHRASE_FILE:?Set BACKUP_PASSPHRASE_FILE to a protected passphrase file}"

repo_root="$(git rev-parse --show-toplevel)"
mkdir -p "$BACKUP_DIR"
backup_root="$(cd "$BACKUP_DIR" && pwd -P)"
case "$backup_root/" in
  "$repo_root"/*) echo "BACKUP_DIR must be outside the repository" >&2; exit 1 ;;
esac
if [[ ! -f "$BACKUP_PASSPHRASE_FILE" ]]; then
  echo "Passphrase file does not exist" >&2
  exit 1
fi

umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_dir="$(mktemp -d "$backup_root/.nix-supabase-${stamp}.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

npx supabase db dump --linked --schema public,auth,storage --file "$tmp_dir/schema.sql"
npx supabase db dump --linked --data-only --use-copy --schema public,auth,storage --file "$tmp_dir/data.sql"
npx supabase db query --linked "
select json_build_object(
  'captured_at', now(),
  'auth_users', (select count(*) from auth.users),
  'profiles', (select count(*) from public.profiles),
  'friendships', (select count(*) from public.friendships),
  'nixes', (select count(*) from public.nixes),
  'storage_objects', (select count(*) from storage.objects),
  'storage_by_bucket', (select coalesce(json_object_agg(bucket_id, object_count), '{}'::json) from (
    select bucket_id, count(*) object_count from storage.objects group by bucket_id
  ) counts)
);" > "$tmp_dir/counts.json"

archive="$backup_root/nix-supabase-${stamp}.tar.enc"
tar -C "$tmp_dir" -cf - . | openssl enc -aes-256-cbc -salt -pbkdf2 \
  -pass "file:$BACKUP_PASSPHRASE_FILE" -out "$archive"

openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$BACKUP_PASSPHRASE_FILE" \
  -in "$archive" | tar -tf - >/dev/null

echo "Encrypted backup verified: $archive"
