#!/bin/sh
set -eu

backup_dir=${1:?Usage: scripts/offsite-backup.sh VERIFIED_BACKUP_DIR}
config_file=${OFFSITE_BACKUP_ENV:-/etc/classifiedstg/offsite-backup.env}

if [ -r "$config_file" ]; then
  set -a
  # This root-owned file contains RESTIC_REPOSITORY, RESTIC_PASSWORD_FILE and
  # provider credentials. It must contain shell-compatible KEY=value lines.
  . "$config_file"
  set +a
fi

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
[ -r "$RESTIC_PASSWORD_FILE" ] || { printf '%s\n' 'RESTIC_PASSWORD_FILE is not readable'; exit 2; }
[ -d "$backup_dir" ] || { printf '%s\n' 'Verified backup directory does not exist'; exit 2; }
backup_dir=$(cd "$backup_dir" && pwd)

for required in postgres.dump uploads.tar.gz SHA256SUMS manifest.txt; do
  [ -f "$backup_dir/$required" ] || { printf 'Missing %s\n' "$required"; exit 2; }
done
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
tar tzf "$backup_dir/uploads.tar.gz" >/dev/null
restic snapshots --tag classifiedstg-backup >/dev/null 2>&1 || {
  [ "${RESTIC_AUTO_INIT:-0}" = 1 ] || {
    printf '%s\n' 'Restic repository unavailable or uninitialized; set RESTIC_AUTO_INIT=1 only for the first controlled run'
    exit 3
  }
  restic init
}

restic backup \
  --host classifiedstg-production \
  --tag classifiedstg-backup \
  "$backup_dir"

restic forget \
  --host classifiedstg-production \
  --tag classifiedstg-backup \
  --keep-daily "${RESTIC_KEEP_DAILY:-7}" \
  --keep-weekly "${RESTIC_KEEP_WEEKLY:-5}" \
  --keep-monthly "${RESTIC_KEEP_MONTHLY:-12}" \
  --prune

if [ "${RESTIC_CHECK_AFTER_BACKUP:-0}" = 1 ]; then
  restic check --read-data-subset="${RESTIC_CHECK_SUBSET:-1/20}"
fi

printf 'Encrypted off-site backup completed: %s\n' "$backup_dir"
