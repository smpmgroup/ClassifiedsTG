CREATE TABLE "JobRun" (
  "id" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "details" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT,
  "instanceId" TEXT,
  CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JobRun_jobName_startedAt_idx" ON "JobRun"("jobName", "startedAt");
CREATE INDEX "JobRun_status_startedAt_idx" ON "JobRun"("status", "startedAt");

CREATE TABLE "SystemAlert" (
  "id" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'warning',
  "source" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "occurrences" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SystemAlert_fingerprint_status_key" ON "SystemAlert"("fingerprint", "status");
CREATE INDEX "SystemAlert_status_severity_lastSeenAt_idx" ON "SystemAlert"("status", "severity", "lastSeenAt");

ALTER TABLE "Notification" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
