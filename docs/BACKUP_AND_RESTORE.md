# Backup and restore

`scripts/backup.sh [directory]` creates a PostgreSQL custom dump and local upload archive. `scripts/offsite-backup.sh VERIFIED_BACKUP_DIR` validates that set again and sends it to an encrypted Restic repository. `scripts/restore.sh DIR --confirm-empty-database` refuses a non-empty target. Always test restore on an isolated stack after upgrades.

## Encrypted S3-compatible replication

Install `restic` and create `/etc/classifiedstg/offsite-backup.env` as a
root-owned `0600` file. Do not store these values in Git:

```sh
RESTIC_REPOSITORY=s3:https://S3-ENDPOINT/BUCKET/classifiedstg
RESTIC_PASSWORD_FILE=/etc/classifiedstg/restic-password
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
RESTIC_KEEP_DAILY=7
RESTIC_KEEP_WEEKLY=5
RESTIC_KEEP_MONTHLY=12
RESTIC_CHECK_AFTER_BACKUP=1
```

The separate password file must contain a high-entropy repository password and
must also be stored in the approved offline recovery vault. Losing it makes the
off-site snapshots unrecoverable. Use an S3 credential restricted to the one
backup prefix; enable provider-side object versioning/immutability when
available.

For the first controlled run only, set `RESTIC_AUTO_INIT=1`. Remove it after
initialization. Run `scripts/scheduled-ops.sh offsite`; failures create the same
critical platform alert as the local backup and restore jobs. Accept the
off-site gate only after restoring the newest snapshot into a temporary
directory, validating `SHA256SUMS`, and passing `scripts/restore-drill.sh` on
the restored backup.
