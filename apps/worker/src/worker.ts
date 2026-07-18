import { createServer } from "node:http";
import { hostname } from "node:os";
import { Redis } from "ioredis";
import { prisma, settlePaidPublicationLedger } from "@board/core";

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", { maxRetriesPerRequest: 2 });
const instanceId = `${hostname()}:${process.pid}`;
const intervals = new Map<string, NodeJS.Timeout>();
let stopping = false;
let lastSuccessAt: Date | null = null;

async function alert(fingerprint: string, title: string, message: string, metadata: object = {}) {
  await prisma.systemAlert.upsert({
    where: { fingerprint_status: { fingerprint, status: "open" } },
    update: { occurrences: { increment: 1 }, lastSeenAt: new Date(), message, metadata },
    create: { fingerprint, source: "worker", title, message, metadata },
  });
}

async function withLock(name: string, ttlMs: number, work: () => Promise<{ processed: number; details?: object }>) {
  const token = `${instanceId}:${Date.now()}`;
  const key = `board:job-lock:${name}`;
  if ((await redis.set(key, token, "PX", ttlMs, "NX")) !== "OK") return;
  const started = Date.now();
  const run = await prisma.jobRun.create({ data: { jobName: name, instanceId } });
  try {
    const result = await work();
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "succeeded", finishedAt: new Date(), durationMs: Date.now() - started, processedCount: result.processed, details: result.details || {} } });
    lastSuccessAt = new Date();
  } catch (error) {
    const message = String((error as Error).message).slice(0, 1500);
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), durationMs: Date.now() - started, error: message } });
    await alert(`job:${name}`, `Background job failed: ${name}`, message);
  } finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token);
  }
}

async function expireListings() {
  const result = await prisma.listing.updateMany({ where: { status: "published", expiresAt: { lte: new Date() } }, data: { status: "expired" } });
  return { processed: result.count };
}

async function settleStars() {
  const settings = await prisma.platformSetting.findUnique({ where: { id: "global" } });
  const cutoff = new Date(Date.now() - (settings?.starsHoldDays || 21) * 86_400_000);
  const candidates = await prisma.ledgerTransaction.findMany({ where: { type: "stars_publication_paid", status: "pending_settlement", occurredAt: { lte: cutoff } }, select: { id: true }, take: 200 });
  let settled = 0;
  for (const candidate of candidates) {
    await prisma.$transaction(async (tx) => {
      await settlePaidPublicationLedger(tx, candidate.id);
      await tx.ledgerTransaction.update({ where: { id: candidate.id }, data: { status: "settled" } });
    });
    settled++;
  }
  return { processed: settled, details: { eligible: candidates.length, cutoff } };
}

async function retryNotifications() {
  const stale = new Date(Date.now() - 5 * 60_000);
  await prisma.notification.updateMany({ where: { status: "processing", updatedAt: { lte: stale } }, data: { status: "pending", lastError: "Recovered stale processing lease" } });
  const retry = await prisma.notification.updateMany({ where: { status: "failed", attempts: { lt: 5 }, updatedAt: { lte: stale } }, data: { status: "pending" } });
  const abandoned = await prisma.notification.count({ where: { status: "failed", attempts: { gte: 5 } } });
  if (abandoned) await alert("notifications:dead-letter", "Notifications require attention", `${abandoned} notifications exhausted all retries`, { abandoned });
  return { processed: retry.count, details: { deadLetter: abandoned } };
}

function schedule(name: string, everyMs: number, ttlMs: number, work: () => Promise<{ processed: number; details?: object }>) {
  const run = () => !stopping && void withLock(name, ttlMs, work);
  run();
  intervals.set(name, setInterval(run, everyMs));
}

schedule("expire-listings", 5 * 60_000, 4 * 60_000, expireListings);
schedule("settle-stars", 60 * 60_000, 50 * 60_000, settleStars);
schedule("retry-notifications", 60_000, 50_000, retryNotifications);

const health = createServer((_req, res) => {
  const stale = !lastSuccessAt || Date.now() - lastSuccessAt.getTime() > 10 * 60_000;
  res.writeHead(stale ? 503 : 200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: stale ? "starting" : "ok", instanceId, lastSuccessAt }));
}).listen(3002, "0.0.0.0");

async function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const timer of intervals.values()) clearInterval(timer);
  health.close();
  await redis.quit();
  await prisma.$disconnect();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
