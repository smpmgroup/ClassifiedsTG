#!/bin/sh
set -eu
backup_dir=${1:?Usage: scripts/restore.sh BACKUP_DIR --confirm-empty-database}
[ "${2:-}" = "--confirm-empty-database" ] || { printf '%s\n' 'Refusing restore without --confirm-empty-database'; exit 2; }
count=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-board}" -d "${POSTGRES_DB:-board}" -Atc "select count(*) from \"Community\"" 2>/dev/null || printf 0)
[ "$count" = 0 ] || { printf '%s\n' 'Refusing to overwrite a non-empty database'; exit 3; }
docker compose exec -T postgres pg_restore -U "${POSTGRES_USER:-board}" -d "${POSTGRES_DB:-board}" --clean --if-exists < "$backup_dir/postgres.dump"
docker run --rm -v classifiedstg_uploads:/target -v "$(cd "$backup_dir" && pwd):/backup:ro" alpine tar xzf /backup/uploads.tar.gz -C /target
