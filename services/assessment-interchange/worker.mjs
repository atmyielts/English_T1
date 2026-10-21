import { processingClient, processTicket } from "./process.mjs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
/** PostgreSQL owns durable jobs/leases. Each host claims at most one active
 * package at a time; more hosts compete through SKIP LOCKED, not local ownership. */
export async function runProcessor(
  {
    ports,
    signal,
    once = false,
    pollMs = 5000,
    process = processTicket,
    publish = (value) => console.log(JSON.stringify(value)),
  },
) {
  if (
    !signal || !Number.isSafeInteger(pollMs) || pollMs < 1000 || pollMs > 60000
  ) throw new Error("Invalid processor shutdown/poll policy.");
  do {
    let worked = false;
    for (const stage of ["scan", "parse"]) {
      if (signal.aborted) return;
      let claims;
      try {
        claims = await ports.claim(stage, 1);
        if (
          !Array.isArray(claims) || claims.length > 1 ||
          claims.some((ticket) => ticket.stage !== stage)
        ) throw new Error("Invalid bounded claims.");
      } catch {
        publish({ event: "qti.claim.failed", stage });
        continue;
      }
      for (const ticket of claims) {
        if (signal.aborted) return; // An unstarted lease expires canonically.
        worked = true;
        try {
          const receipt = await process(ticket, ports, { signal });
          publish({
            event: "qti.processing.committed",
            stage,
            id: receipt.id,
            report_hash: receipt.report_hash,
          });
        } catch {
          // No fabricated rejection/clean report, no deletion or blind lease reset.
          // A committed uncertain report remains canonical; an unfinished lease expires.
          publish({
            event: signal.aborted
              ? "qti.processing.interrupted"
              : "qti.processing.failed",
            stage,
          });
        }
      }
    }
    if (once || signal.aborted) return;
    // Even a saturated host yields between rounds; zero-work rounds back off.
    try {
      await delay(worked ? 1000 : pollMs, undefined, { signal });
    } catch {
      if (!signal.aborted) throw new Error("Processor wait failed.");
    }
  } while (!signal.aborted);
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    if (process.env.ASSESSMENT_QTI_PROCESSOR_ENABLED !== "true") {
      throw new Error("QTI processor is disabled.");
    }
    const ports = processingClient({
      apiURL: process.env.ASSESSMENT_QTI_API_URL,
      sourceURL: process.env.ASSESSMENT_QTI_SOURCE_URL,
      scannerKey: process.env.ASSESSMENT_QTI_SCANNER_SECRET,
      parserKey: process.env.ASSESSMENT_QTI_PARSER_SECRET,
      anonKey: process.env.SUPABASE_ANON_KEY,
    });
    await runProcessor({
      ports,
      signal: shutdown.signal,
      once: process.argv.includes("--once"),
    });
  } catch {
    console.error(JSON.stringify({ event: "qti.processor.unavailable" }));
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
