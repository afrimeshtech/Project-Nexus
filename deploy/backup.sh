#!/usr/bin/env bash
# Nightly database backup: dump, compress, encrypt, keep 14 days locally and
# send a copy off the server.
#
#   crontab -e
#   30 2 * * * /home/ubuntu/afrimesh/deploy/backup.sh >> /home/ubuntu/backups/backup.log 2>&1
#
# Settings, in deploy/.env (see "Backups" in deploy/README.md):
#   BACKUP_GPG_RECIPIENT  fingerprint of the backup public key. The server
#                         holds only the public half: it can encrypt a backup
#                         and never read one. The private key lives off the
#                         server, with whoever is responsible for restores.
#   BACKUP_REMOTE         rclone destination, e.g. oos:afrimesh-backups. Unset
#                         or rclone missing: the off-site copy is skipped, said
#                         so in the log, and the run counts as failed.
#
# pipefail matters: under plain sh a failed pg_dump was hidden by gzip
# succeeding after it, which writes a truncated backup that looks fine.
set -euo pipefail
umask 077

cd "$(dirname "$0")"
dir="$HOME/backups"
mkdir -p "$dir"

setting() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }
recipient="$(setting BACKUP_GPG_RECIPIENT)"
remote="$(setting BACKUP_REMOTE)"

log() { echo "$(date -Is) $*"; }
fail() { log "FAILED: $*"; exit 1; }

[ -n "$recipient" ] || fail "BACKUP_GPG_RECIPIENT is not set in deploy/.env - refusing to write an unencrypted backup"

# Time in the name, not just the date: a second run the same day writes a new
# object rather than overwriting, which the off-site bucket does not allow.
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
file="$dir/afrimesh-$stamp.sql.gz.gpg"
partial="$file.partial"

docker compose exec -T db pg_dump -U afrimesh afrimesh \
  | gzip \
  | gpg --batch --yes --quiet --trust-model always --encrypt --recipient "$recipient" \
  > "$partial" || { rm -f "$partial"; fail "dump or encryption failed"; }
mv "$partial" "$file"
log "backup written: $file ($(du -h "$file" | cut -f1))"

# Local copies: 14 days. Plain .sql.gz files from before encryption are
# removed on the same schedule, so none outlives it.
find "$dir" \( -name 'afrimesh-*.sql.gz.gpg' -o -name 'afrimesh-*.sql.gz' \) -mtime +14 -delete

if [ -z "$remote" ] || ! command -v rclone >/dev/null; then
  fail "off-site copy skipped: BACKUP_REMOTE unset or rclone not installed (local copy kept)"
fi
# --oos-no-check-bucket: the server may create objects but not inspect or
# create buckets, so do not ask.
rclone copyto --oos-no-check-bucket "$file" "$remote/$(basename "$file")" \
  || fail "off-site upload to $remote failed (local copy kept)"
log "off-site copy: $remote/$(basename "$file")"
