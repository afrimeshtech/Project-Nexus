#!/usr/bin/env bash
# Proves the newest backup restores (Security & Trust Framework, acceptance
# test 9). Run it from the machine that holds the backup PRIVATE key - never
# on the server, which only ever has the public half.
#
#   GNUPGHOME=~/.afrimesh-backup-key deploy/restore-test.sh
#
# What it does:
#   1. copies the newest encrypted backup down from the server
#   2. decrypts it here
#   3. streams it over SSH into a throwaway Postgres container on the server -
#      a separate container on no network, not the live database; the
#      decrypted dump is never written to the server's disk
#   4. compares row counts of the key tables with the live database
#   5. removes the throwaway container
#
# A count can legitimately be a little behind the live one: the backup is a
# snapshot, and the site keeps working after it is taken. A big gap, or a
# table missing, is the failure this exists to catch.
set -euo pipefail

host="${BACKUP_HOST:-ubuntu@130.162.168.200}"
key="${SSH_KEY:-$HOME/.ssh/afrimesh.key}"
ssh_() { ssh -i "$key" -o BatchMode=yes "$host" "$@"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"; ssh_ "docker rm -f afrimesh-restore-test >/dev/null 2>&1 || true"' EXIT

latest="$(ssh_ "ls -t ~/backups/afrimesh-*.sql.gz.gpg 2>/dev/null | head -1")"
[ -n "$latest" ] || { echo "No encrypted backup on the server yet."; exit 1; }
echo "Backup:    $latest"
scp -q -i "$key" -o BatchMode=yes "$host:$latest" "$work/backup.gpg"

echo "Decrypting here, restoring into a throwaway container on the server..."
ssh_ "docker rm -f afrimesh-restore-test >/dev/null 2>&1 || true
      docker run -d --name afrimesh-restore-test --network none \
        -e POSTGRES_USER=afrimesh -e POSTGRES_DB=afrimesh -e POSTGRES_PASSWORD=restore-test \
        postgres:16-alpine >/dev/null
      for i in \$(seq 1 30); do docker exec afrimesh-restore-test pg_isready -U afrimesh -q && break; sleep 1; done"
gpg --batch --quiet --decrypt "$work/backup.gpg" \
  | ssh_ "gunzip | docker exec -i afrimesh-restore-test psql -q -v ON_ERROR_STOP=1 -U afrimesh afrimesh >/dev/null"

tables="users organisations products inventory_items orders payments ledger_transactions ledger_entries event_log"
query="SELECT string_agg(t || '=' || n, ' ') FROM ($(
  first=1
  for t in $tables; do
    [ $first = 1 ] || printf ' UNION ALL '
    printf "SELECT '%s' AS t, (SELECT COUNT(*) FROM %s) AS n" "$t" "$t"
    first=0
  done
)) c"
restored="$(ssh_ "docker exec afrimesh-restore-test psql -tA -U afrimesh afrimesh -c \"$query\"")"
live="$(ssh_ "cd ~/afrimesh/deploy && docker compose exec -T db psql -tA -U afrimesh afrimesh -c \"$query\"")"

printf '\n%-22s %10s %10s\n' table restored live
ok=1
for t in $tables; do
  r="$(tr ' ' '\n' <<<"$restored" | awk -F= -v t="$t" '$1==t {print $2}')"
  l="$(tr ' ' '\n' <<<"$live" | awk -F= -v t="$t" '$1==t {print $2}')"
  printf '%-22s %10s %10s\n' "$t" "${r:-MISSING}" "${l:-?}"
  [ -n "$r" ] || ok=0
done

if [ $ok = 1 ]; then
  echo; echo "RESTORE OK: every table restored from $latest"
else
  echo; echo "RESTORE FAILED: a table is missing from the restored copy"; exit 1
fi
