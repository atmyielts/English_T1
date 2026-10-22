import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { deliverMail, mailClient } from "./src/client.mjs";
import { smtpSender } from "./src/smtp.mjs";
export async function runMailer(
  {
    ports,
    send,
    signal,
    once = false,
    concurrency = 3,
    pollMs = 5000,
    publish = (value) => console.log(JSON.stringify(value)),
  },
) {
  if (
    !signal || !Number.isInteger(concurrency) || concurrency < 1 ||
    concurrency > 5 || !Number.isInteger(pollMs) || pollMs < 1000 ||
    pollMs > 60000
  ) throw new Error("Invalid mailer processing policy");
  do {
    if (signal.aborted) return;
    let tickets = [];
    try {
      tickets = await ports.claim(concurrency);
      if (!Array.isArray(tickets) || tickets.length > concurrency) {
        throw new Error("Invalid mail batch");
      }
    } catch {
      publish({ event: "assessment.mail.claim.failed" });
    }
    await Promise.all(tickets.map(async (ticket) => {
      if (signal.aborted) return;
      try {
        const receipt = await deliverMail(ticket, ports, send);
        publish({ event: "assessment.mail.finished", state: receipt.state });
      } catch {
        publish({ event: "assessment.mail.receipt.unconfirmed" });
      }
    }));
    // Graceful stop waits for bounded in-flight sends and their receipts. It does
    // not interrupt DATA midway or claim more work during shutdown.
    if (once || signal.aborted) return;
    try {
      await delay(tickets.length ? 1000 : pollMs, undefined, { signal });
    } catch {
      if (!signal.aborted) throw new Error("Mail poll interrupted");
    }
  } while (!signal.aborted);
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const shutdown = new AbortController(), stop = () => shutdown.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    if (process.env.ASSESSMENT_MAILER_ENABLED !== "true") {
      throw new Error("Mailer disabled");
    }
    const ports = mailClient({
        apiURL: process.env.ASSESSMENT_MAIL_API_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
        workerSecret: process.env.ASSESSMENT_MAIL_WORKER_SECRET,
      }),
      send = smtpSender({
        host: process.env.ASSESSMENT_SMTP_HOST,
        port: process.env.ASSESSMENT_SMTP_PORT,
        user: process.env.ASSESSMENT_SMTP_USER,
        password: process.env.ASSESSMENT_SMTP_PASSWORD,
        from: process.env.ASSESSMENT_MAIL_FROM,
      });
    await runMailer({
      ports,
      send,
      signal: shutdown.signal,
      once: process.argv.includes("--once"),
      concurrency: Number(process.env.ASSESSMENT_MAIL_CONCURRENCY ?? 3),
    });
  } catch {
    console.error(JSON.stringify({ event: "assessment.mail.unavailable" }));
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
