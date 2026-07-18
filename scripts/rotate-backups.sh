#!/bin/sh
set -eu
root=${1:-./backups}
retention_days=${BACKUP_RETENTION_DAYS:-14}
[ -d "$root" ] || exit 0
find "$root" -mindepth 1 -maxdepth 1 -type d -mtime "+$retention_days" -exec rm -rf -- {} +
