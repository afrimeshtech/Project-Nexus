#!/bin/sh
# Nightly database backup. Keeps the last 14 days in ~/backups.
#
#   crontab -e
#   30 2 * * * /home/ubuntu/afrimesh/deploy/backup.sh >> /home/ubuntu/backups/backup.log 2>&1
set -eu

cd "$(dirname "$0")"
mkdir -p "$HOME/backups"
file="$HOME/backups/afrimesh-$(date +%F).sql.gz"

docker compose exec -T db pg_dump -U afrimesh afrimesh | gzip > "$file"
find "$HOME/backups" -name 'afrimesh-*.sql.gz' -mtime +14 -delete

echo "$(date -Is) backup written: $file ($(du -h "$file" | cut -f1))"
