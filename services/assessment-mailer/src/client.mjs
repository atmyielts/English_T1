export class MailServiceError extends Error {
  constructor(code, status = 503) {
    super("Mail control request failed");
    this.code = code;
    this.status = status;
  }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function mailTicket(value) {
  if (
    !value ||
    !["tenant_id", "id", "lease_token"].every((key) =>
      typeof value[key] === "string" && uuid.test(value[key])
    )
  ) throw new MailServiceError("invalid_mail_ticket");
  return {
    tenant_id: value.tenant_id,
    id: value.id,
    lease_token: value.lease_token,
  };
}
export function mailClient(
  {
    apiURL,
    anonKey,
    workerSecret,
    fetcher = fetch,
    allowLocalhost = false,
    timeoutMs = 12000,
  },
) {
  const url = new URL(apiURL),
    local = allowLocalhost && url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !local) || url.username || url.password ||
    url.search || url.hash ||
    !url.pathname.endsWith("/assessment-cloud/invitations/mail/internal") ||
    !anonKey || typeof workerSecret !== "string" || workerSecret.length < 32 ||
    !Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 20000
  ) throw new Error("Invalid mail control configuration");
  async function call(action, data) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeoutMs);
    let reader;
    try {
      const response = await fetcher(url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          apikey: anonKey,
          "x-assessment-mail-key": workerSecret,
        },
        body: JSON.stringify({ action, data }),
      });
      reader = response.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 100000) {
            await reader.cancel();
            throw new MailServiceError("oversized_mail_receipt");
          }
          chunks.push(value);
        }
      }
      const bytes = Buffer.concat(chunks),
        payload = JSON.parse(bytes.toString("utf8"));
      if (!response.ok) {
        throw new MailServiceError(
          typeof payload.code === "string" &&
            /^[a-z0-9_]{1,80}$/.test(payload.code)
            ? payload.code
            : "mail_unavailable",
          response.status,
        );
      }
      return payload.data;
    } finally {
      reader?.releaseLock();
      clearTimeout(timer);
    }
  }
  return {
    async claim(limit) {
      const rows = await call("mail.claim", { limit });
      if (!Array.isArray(rows) || rows.length > limit) {
        throw new MailServiceError("invalid_mail_claim");
      }
      return rows.map(mailTicket);
    },
    begin: (ticket) => call("mail.begin", mailTicket(ticket)),
    report: (ticket, result) =>
      call("mail.report", {
        ...mailTicket(ticket),
        outcome: result.outcome,
        code: result.code,
      }),
  };
}
export async function deliverMail(
  ticket,
  ports,
  send,
  { reportAttempts = 3 } = {},
) {
  ticket = mailTicket(ticket);
  let handoff, result;
  try {
    handoff = await ports.begin(ticket);
    if (handoff?.id !== ticket.id || typeof handoff.send !== "boolean") {
      throw new Error("Invalid canonical handoff");
    }
  } catch {
    result = { outcome: "retry", code: "begin_unavailable" };
  }
  if (handoff?.send === false) return { id: ticket.id, state: handoff.state };
  if (!result) {
    try {
      result = await send(handoff.message);
    } catch {
      result = { outcome: "uncertain", code: "smtp_unknown" };
    }
  }
  // Retry the report, never the SMTP transaction, after a lost canonical reply.
  for (let attempt = 0; attempt < reportAttempts; attempt++) {
    try {
      const receipt = await ports.report(ticket, result);
      if (
        receipt?.id !== ticket.id ||
        !["accepted", "queued", "failed", "uncertain"].includes(receipt.state)
      ) throw new Error("Invalid mail outcome receipt");
      return receipt;
    } catch (error) {
      if (
        error instanceof MailServiceError && error.status >= 400 &&
        error.status < 500 && error.status !== 408 && error.status !== 429
      ) throw error;
      if (attempt + 1 === reportAttempts) {
        throw new MailServiceError("mail_report_unconfirmed");
      }
    }
  }
  throw new MailServiceError("mail_report_unconfirmed");
}
