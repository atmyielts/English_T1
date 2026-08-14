const readArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const boundedInteger = (raw, fallback, min, max) => {
  if (raw == null || String(raw).trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
};

const baseUrl = String(process.env.ENGLISH_LOAD_BASE_URL ?? readArg('base-url', '')).replace(/\/+$/, '');
const anonKey = String(process.env.ENGLISH_LOAD_ANON_KEY ?? '');
const accessToken = String(process.env.ENGLISH_LOAD_ACCESS_TOKEN ?? '');
const total = boundedInteger(readArg('requests'), 120, 1, 2_000);
const concurrency = boundedInteger(readArg('concurrency'), 20, 1, 100);
const timeoutMs = boundedInteger(readArg('timeout-ms'), 10_000, 500, 60_000);
const p95LimitMs = boundedInteger(readArg('p95-limit-ms'), 2_500, 100, 60_000);
const allowRemote = process.argv.includes('--allow-remote');

if (!baseUrl || !anonKey || !accessToken) {
  throw new Error('ENGLISH_LOAD_BASE_URL, ENGLISH_LOAD_ANON_KEY, and ENGLISH_LOAD_ACCESS_TOKEN are required');
}

const parsedBaseUrl = new URL(baseUrl);
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!loopbackHosts.has(parsedBaseUrl.hostname) && !allowRemote) {
  throw new Error('Remote load checks are disabled. Use --allow-remote only during an approved controlled canary.');
}

const endpoint = `${baseUrl}/functions/v1/hub/plan?language_code=en`;
const requestPlan = async () => {
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    if (!response.ok) return { ok: false, status: response.status, durationMs: performance.now() - startedAt, body: body.slice(0, 240) };
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return { ok: false, status: response.status, durationMs: performance.now() - startedAt, body: 'non-JSON response' };
    }
    if (!payload || typeof payload !== 'object' || !('today_plan' in payload)) {
      return { ok: false, status: response.status, durationMs: performance.now() - startedAt, body: 'missing today_plan' };
    }
    return { ok: true, status: response.status, durationMs: performance.now() - startedAt };
  } catch (error) {
    return { ok: false, status: 0, durationMs: performance.now() - startedAt, body: error instanceof Error ? error.message : String(error) };
  }
};

const warmup = await requestPlan();
if (!warmup.ok) throw new Error(`English load warmup failed: ${JSON.stringify(warmup)}`);

const results = new Array(total);
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;
      results[index] = await requestPlan();
    }
  }),
);

const failures = results.filter((result) => !result?.ok);
const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
const percentile = (fraction) => durations[Math.max(0, Math.ceil(durations.length * fraction) - 1)] ?? 0;
const summary = {
  endpoint,
  requests: total,
  concurrency: Math.min(concurrency, total),
  failures: failures.length,
  p50_ms: Math.round(percentile(0.5)),
  p95_ms: Math.round(percentile(0.95)),
  max_ms: Math.round(durations.at(-1) ?? 0),
  threshold_p95_ms: p95LimitMs,
};

console.log(`ENGLISH_LOAD_RESULT ${JSON.stringify(summary)}`);
if (failures.length > 0) {
  console.error(`ENGLISH_LOAD_FAILURES ${JSON.stringify(failures.slice(0, 5))}`);
  process.exitCode = 1;
} else if (summary.p95_ms > p95LimitMs) {
  throw new Error(`English load p95 ${summary.p95_ms}ms exceeded ${p95LimitMs}ms`);
}
