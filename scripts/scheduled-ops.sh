#!/bin/sh
set -u
task=${1:-}
root=${BACKUP_ROOT:-/opt/classifiedstg/backups}
case "$task" in
  daily|retention|restore) ;;
  *) printf '%s\n' 'Usage: scripts/scheduled-ops.sh daily|retention|restore'; exit 2 ;;
esac
cd /opt/classifiedstg || exit 2

record_failure() {
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-board}" -d "${POSTGRES_DB:-board}" -v ON_ERROR_STOP=1 -v fingerprint="ops:$task" -v title="Scheduled $task failed" <<'SQL' >/dev/null 2>&1 || true
INSERT INTO "SystemAlert" ("id", "severity", "source", "fingerprint", "title", "message", "status", "occurrences", "firstSeenAt", "lastSeenAt", "metadata")
VALUES (md5(random()::text || clock_timestamp()::text), 'critical', 'scheduled-ops', :'fingerprint', :'title', 'Inspect /var/log/classifiedstg-ops.log', 'open', 1, now(), now(), '{}')
ON CONFLICT ("fingerprint", "status") DO UPDATE SET "occurrences" = "SystemAlert"."occurrences" + 1, "lastSeenAt" = now();
SQL
}

resolve_failure() {
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-board}" -d "${POSTGRES_DB:-board}" -v fingerprint="ops:$task" <<'SQL' >/dev/null 2>&1 || true
UPDATE "SystemAlert" SET status='resolved', "resolvedAt"=now(), "lastSeenAt"=now()
WHERE fingerprint=:'fingerprint' AND status='open';
SQL
}

run_task() {
  case "$task" in
    daily) ./scripts/backup.sh "$root/daily-$(date +%Y%m%d-%H%M%S)" ;;
    retention) BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14} ./scripts/rotate-backups.sh "$root" ;;
    restore)
      latest=$(find "$root" -mindepth 1 -maxdepth 1 -type d -name 'daily-*' -printf '%T@ %p\n' | sort -nr | sed -n '1s/^[^ ]* //p')
      [ -n "$latest" ] || { printf '%s\n' 'No daily backup available for restore drill'; return 1; }
      ./scripts/restore-drill.sh "$latest"
      ;;
  esac
}

if run_task; then
  resolve_failure
else
  status=$?
  record_failure
  exit "$status"
fi
