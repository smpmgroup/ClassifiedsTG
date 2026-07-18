#!/bin/sh
set -eu
backup_dir=${1:-./backups/$(date +%Y%m%d-%H%M%S)}
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-board}" -d "${POSTGRES_DB:-board}" -Fc > "$backup_dir/postgres.dump"
docker compose exec -T backend tar czf - -C /app/uploads . > "$backup_dir/uploads.tar.gz"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-board}" -d "${POSTGRES_DB:-board}" -Atc 'select migration_name from "_prisma_migrations" where finished_at is not null order by finished_at desc limit 1' > "$backup_dir/latest-migration.txt"
{
  printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'git_commit=%s\n' "$(git rev-parse HEAD 2>/dev/null || printf unknown)"
  printf 'database_bytes=%s\n' "$(wc -c < "$backup_dir/postgres.dump")"
  printf 'uploads_bytes=%s\n' "$(wc -c < "$backup_dir/uploads.tar.gz")"
} > "$backup_dir/manifest.txt"
(cd "$backup_dir" && sha256sum postgres.dump uploads.tar.gz latest-migration.txt manifest.txt > SHA256SUMS)
docker compose exec -T postgres pg_restore -l < "$backup_dir/postgres.dump" >/dev/null
tar tzf "$backup_dir/uploads.tar.gz" >/dev/null
printf '%s\n' "Backup created: $backup_dir"
