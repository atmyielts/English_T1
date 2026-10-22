import test from "node:test";
import assert from "node:assert/strict";
import { smtpConfiguration, smtpOutcome, smtpSender } from "./src/smtp.mjs";
import {
  smtpFixture,
  smtpFixtureText,
} from "../../scripts/assessment-smtp-fixture.mjs";
const id = "10000000-0000-4000-8000-000000000001",
  message = {
    id,
    to: "recipient@example.test",
    subject: "Your Assessment invitation",
    text:
      "Synthetic invitation\nhttps://assessment.example.test/#assessment_invite=synthetic",
    html: "<p>Synthetic invitation</p>",
  };
test("real local SMTP handoff submits exactly one canonical envelope/message and preserves the fragment link", async () => {
  const fixture = await smtpFixture();
  try {
    const send = smtpSender({
      host: "127.0.0.1",
      port: fixture.port,
      from: "assessment@example.test",
    }, { testLoopback: true });
    assert.deepEqual(await send(message), {
      outcome: "accepted",
      code: "smtp_accepted",
    });
    assert.equal(fixture.messages.length, 1);
    assert.match(fixture.messages[0].from, /<assessment@example.test>/);
    assert.match(fixture.messages[0].to, /<recipient@example.test>/);
    assert.match(
      fixture.messages[0].raw.replace(/\r\n[ \t]+/g, " "),
      new RegExp(
        "Message-ID: <assessment-invitation-" + id + "@example.test>",
        "i",
      ),
    );
    assert.match(
      smtpFixtureText(fixture.messages[0].raw),
      /#assessment_invite=synthetic/,
    );
  } finally {
    await fixture.close();
  }
});
test("real SMTP refusal, temporary rejection and post-DATA lost receipt remain distinct", async () => {
  const fixture = await smtpFixture();
  try {
    const send = smtpSender({
      host: "127.0.0.1",
      port: fixture.port,
      from: "assessment@example.test",
    }, { testLoopback: true });
    for (
      const [mode, outcome] of [["reject", "failed"], ["temporary", "retry"], [
        "uncertain",
        "uncertain",
      ]]
    ) {
      fixture.setMode(mode);
      assert.equal((await send(message)).outcome, outcome);
    }
    assert.equal(fixture.messages.length, 1);
  } finally {
    await fixture.close();
  }
});
test("bounded SMTP timeout after DATA is uncertain, never a blind retry", async () => {
  const fixture = await smtpFixture({ mode: "stall" });
  try {
    const send = smtpSender({
      host: "127.0.0.1",
      port: fixture.port,
      from: "assessment@example.test",
    }, { testLoopback: true, timeoutMs: 250 });
    assert.deepEqual(await send(message), {
      outcome: "uncertain",
      code: "smtp_timeout",
    });
    assert.equal(fixture.messages.length, 1);
  } finally {
    await fixture.close();
  }
});
test("production transport requires TLS submission, approved identity and safe content sources", async () => {
  assert.throws(() =>
    smtpConfiguration({
      host: "smtp.example.test",
      port: 25,
      from: "assessment@example.test",
      user: "u",
      password: "p",
    })
  );
  assert.throws(() =>
    smtpConfiguration({
      host: "smtp.example.test",
      port: 587,
      from: "bad\r\nBcc:other@example.test",
      user: "u",
      password: "p",
    })
  );
  let options, payload, closed = 0;
  const send = smtpSender({
    host: "smtp.example.test",
    port: 587,
    from: "assessment@example.test",
    user: "u",
    password: "p",
  }, {
    transportFactory(value) {
      options = value;
      return {
        async sendMail(value) {
          payload = value;
          return { accepted: ["recipient@example.test"], rejected: [] };
        },
        close() {
          closed++;
        },
      };
    },
  });
  assert.equal(
    (await send({
      ...message,
      attachments: [{ path: "sensitive" }],
      bcc: "other@example.test",
    })).outcome,
    "accepted",
  );
  assert.equal(options.requireTLS, true);
  assert.equal(options.tls.rejectUnauthorized, true);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.disableUrlAccess, true);
  assert.equal(options.maxRequeues, 0);
  assert.equal(payload.attachments, undefined);
  assert.equal(payload.bcc, undefined);
  assert.equal(closed, 1);
  assert.deepEqual(smtpOutcome({ command: "DATA" }), {
    outcome: "uncertain",
    code: "smtp_unknown",
  });
  assert.equal(
    smtpOutcome({ command: "CONN", code: "ETIMEDOUT" }).outcome,
    "uncertain",
  );
  assert.equal(
    smtpOutcome({
      command: "CONN",
      code: "ETIMEDOUT",
      timeoutType: "CONNECT_TIMEOUT",
    }).outcome,
    "retry",
  );
  assert.equal(smtpOutcome({ code: "EAUTH" }).outcome, "failed");
});
