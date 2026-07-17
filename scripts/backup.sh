#!/bin/sh
set -eu
backup_dir=${1:-./backups/$(date +%Y%m%d-%H%M%S)}
mkdir -p "$backup_dir"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-board}" -d "${POSTGRES_DB:-board}" -Fc > "$backup_dir/postgres.dump"
docker run --rm -v classifiedstg_uploads:/source:ro -v "$(cd "$backup_dir" && pwd):/backup" alpine tar czf /backup/uploads.tar.gz -C /source .
printf '%s\n' "Backup created: $backup_dir"
