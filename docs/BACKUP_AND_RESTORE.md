# Backup and restore

`scripts/backup.sh [directory]` creates a PostgreSQL custom dump and local upload archive. Copy backups off-host and encrypt them. Example rotation: retain seven daily, four weekly and twelve monthly sets. `scripts/restore.sh DIR --confirm-empty-database` refuses a non-empty target. Always test restore on an isolated stack after upgrades.
