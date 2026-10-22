import test from "node:test";
import assert from "node:assert/strict";
import { deliverMail, mailClient, MailServiceError } from "./src/client.mjs";
import { runMailer } from "./worker.mjs";
const ticket = {
  tenant_id: "10000000-0000-4000-8000-000000000001",
  id: "20000000-0000-4000-8000-000000000001",
  lease_token: "30000000-0000-4000-8000-000000000001",
};
test("lost canonical accepted report retries the receipt, not SMTP", async () => {
  let sends = 0, reports = 0;
  const result = await deliverMail(ticket, {
    begin: () => Promise.resolve({ id: ticket.id, send: true, message: {} }),
    report: async (_ticket, outcome) => {
      assert.equal(outcome.outcome, "accepted");
      reports++;
      if (reports === 1) throw new Error("Committed receipt lost");
      return { id: ticket.id, state: "accepted" };
    },
  }, async () => {
    sends++;
    return { outcome: "accepted", code: "smtp_accepted" };
  });
  assert.equal(result.state, "accepted");
  assert.equal(sends, 1);
  assert.equal(reports, 2);
});
test("lost begin and repeated begin never send another SMTP transaction", async () => {
  let sends = 0, reported;
  const send = () => {
    sends++;
    return Promise.resolve({ outcome: "accepted", code: "smtp_accepted" });
  };
  const ports = {
    begin: () => Promise.reject(new Error("Begin reply lost")),
    report: (_ticket, value) => {
      reported = value;
      return Promise.resolve({ id: ticket.id, state: "queued" });
    },
  };
  await deliverMail(ticket, ports, send);
  assert.deepEqual(reported, { outcome: "retry", code: "begin_unavailable" });
  await deliverMail(ticket, {
    ...ports,
    begin: () =>
      Promise.resolve({ id: ticket.id, send: false, state: "sending" }),
  }, send);
  assert.equal(sends, 0);
});
test("mail control forbids insecure roots/redirects and strips noncanonical ticket fields", async () => {
  assert.throws(() =>
    mailClient({
      apiURL:
        "http://unsafe.invalid/assessment-cloud/invitations/mail/internal",
      anonKey: "a",
      workerSecret: "s".repeat(32),
    })
  );
  let body;
  const ports = mailClient({
    apiURL:
      "https://service.invalid/assessment-cloud/invitations/mail/internal",
    anonKey: "a",
    workerSecret: "s".repeat(32),
    fetcher: async (url, init) => {
      assert.equal(init.redirect, "error");
      assert.equal(
        new Headers(init.headers).get("x-assessment-mail-key"),
        "s".repeat(32),
      );
      body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          data: { id: ticket.id, send: false, state: "accepted" },
        }),
      );
    },
  });
  await ports.begin({ ...ticket, email: "forged", body: "forged" });
  assert.deepEqual(body.data, ticket);
});
test("mail report conflicts are not reclassified or repeatedly transported", async () => {
  let reports = 0;
  await assert.rejects(
    deliverMail(ticket, {
      begin: () => Promise.resolve({ id: ticket.id, send: true, message: {} }),
      report: () => {
        reports++;
        throw new MailServiceError("invalid_mail_lease", 409);
      },
    }, () => Promise.resolve({ outcome: "accepted", code: "smtp_accepted" })),
  );
  assert.equal(reports, 1);
});
test("graceful shutdown completes bounded in-flight delivery before claiming again", async () => {
  const shutdown = new AbortController();
  let sends = 0, claims = 0, reports = 0;
  await runMailer({
    ports: {
      claim: async () => {
        claims++;
        return [ticket];
      },
      begin: async () => ({ id: ticket.id, send: true, message: {} }),
      report: async () => {
        reports++;
        return { id: ticket.id, state: "accepted" };
      },
    },
    send: async () => {
      shutdown.abort();
      sends++;
      return { outcome: "accepted", code: "smtp_accepted" };
    },
    signal: shutdown.signal,
    publish: () => {},
  });
  assert.equal(claims, 1);
  assert.equal(sends, 1);
  assert.equal(reports, 1);
});
