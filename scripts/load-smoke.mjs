const target = process.argv[2] || "http://127.0.0.1:8080/health";
const total = Number(process.argv[3] || 200);
const concurrency = Number(process.argv[4] || 20);
const times = [];
let next = 0;
let failures = 0;
async function runner() {
  while (next < total) {
    next++;
    const started = performance.now();
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) failures++;
      await response.arrayBuffer();
    } catch { failures++; }
    times.push(performance.now() - started);
  }
}
await Promise.all(Array.from({ length: concurrency }, runner));
times.sort((a, b) => a - b);
const p95 = times[Math.max(0, Math.ceil(times.length * 0.95) - 1)];
console.log(JSON.stringify({ target, total, concurrency, failures, p95Ms: Math.round(p95), averageMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length) }));
if (failures || p95 > 2000) process.exitCode = 1;
