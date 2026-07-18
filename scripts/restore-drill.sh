#!/bin/sh
set -eu
backup_dir=${1:?Usage: scripts/restore-drill.sh BACKUP_DIR}
backup_dir=$(cd "$backup_dir" && pwd)
[ -f "$backup_dir/postgres.dump" ] && [ -f "$backup_dir/uploads.tar.gz" ] && [ -f "$backup_dir/SHA256SUMS" ] || { printf '%s\n' 'Incomplete backup'; exit 2; }
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
tar tzf "$backup_dir/uploads.tar.gz" >/dev/null
drill_id="classifiedstg-restore-drill-$$"
cleanup() { docker rm -f "$drill_id" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run -d --name "$drill_id" -e POSTGRES_PASSWORD=restore_drill -e POSTGRES_DB=restore_drill postgres:17-alpine >/dev/null
attempt=0
until docker exec "$drill_id" pg_isready -U postgres -d restore_drill >/dev/null 2>&1; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 30 ] || { printf '%s\n' 'Restore database did not start'; exit 3; }
  sleep 1
done
docker exec -i "$drill_id" pg_restore -U postgres -d restore_drill --no-owner --no-privileges < "$backup_dir/postgres.dump"
migrations=$(docker exec "$drill_id" psql -U postgres -d restore_drill -Atc 'select count(*) from "_prisma_migrations" where finished_at is not null')
communities=$(docker exec "$drill_id" psql -U postgres -d restore_drill -Atc 'select count(*) from "Community"')
users=$(docker exec "$drill_id" psql -U postgres -d restore_drill -Atc 'select count(*) from "User"')
[ "$migrations" -gt 0 ] || { printf '%s\n' 'No completed migrations in restored database'; exit 4; }
printf 'Restore drill passed: migrations=%s communities=%s users=%s\n' "$migrations" "$communities" "$users"
