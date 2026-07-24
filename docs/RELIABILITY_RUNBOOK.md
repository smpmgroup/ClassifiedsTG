# Reliability runbook

## Background jobs

`worker` runs listing expiration, Stars settlement and notification recovery. Every job uses a Redis lease and records its result in `JobRun`. The platform owner panel shows the latest run, queue depth and open `SystemAlert` records.

- A healthy deployment has `backend`, `bot`, `worker`, `frontend`, `postgres`, `redis`, `nginx` and `caddy` running. Caddy is part of Compose and its certificate state lives in the named `caddy_data` and `caddy_config` volumes.
- A failed job opens or increments a deduplicated alert. Notification delivery is retried up to five times; exhausted items form the dead-letter queue.
- Automatic Stars settlement uses idempotent ledger references and a distributed lock.

## Backup and restore

Run `scripts/backup.sh /absolute/backup/path`, copy the completed directory to encrypted off-host storage, then execute `scripts/restore-drill.sh /absolute/backup/path`. A backup is accepted only after checksum, archive, database restore and migration checks pass.

Production invokes `scripts/scheduled-ops.sh`: daily backup at 03:15 UTC, retention rotation at 04:45 UTC and an isolated restore drill every Sunday at 05:15 UTC. Failures create a deduplicated critical `SystemAlert` visible in the platform console; a later successful run resolves it. Local retention is 14 days. Never restore over a non-empty production database.

After S3 credentials are provisioned, schedule `scripts/scheduled-ops.sh
offsite` after the daily local backup. Restic encrypts before upload and keeps
7 daily, 5 weekly and 12 monthly snapshots by default. The Restic password is a
separate recovery secret. Quarterly, restore the newest off-site snapshot to a
temporary directory and run both checksum validation and the isolated database
restore drill.

## Incident triage

1. Record time, affected tenant and request ID; do not delete logs or financial rows.
2. Check `/health`, container health, platform reliability panel and recent backend errors.
3. For payment incidents, disable new payouts, preserve Telegram/Stripe event IDs, and reconcile before changing ledger state.
4. For tenant-only incidents, suspend that tenant instead of stopping the whole platform.
5. Restore only into an isolated database first; production restore requires a maintenance window and a second verified backup.

## Load smoke

`node scripts/load-smoke.mjs https://HOST/health 200 20` fails on any HTTP error or p95 above two seconds.
