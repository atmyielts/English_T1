import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("English load verifier is bounded and refuses remote targets by default", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../scripts/verify-english-load.mjs", import.meta.url),
  );
  assertStringIncludes(source, "Math.min(max, Math.max(min");
  assertStringIncludes(source, "raw == null || String(raw).trim() === ''");
  assertStringIncludes(source, "Remote load checks are disabled");
  assertStringIncludes(source, "AbortSignal.timeout(timeoutMs)");
  assertStringIncludes(source, "summary.p95_ms > p95LimitMs");
});
