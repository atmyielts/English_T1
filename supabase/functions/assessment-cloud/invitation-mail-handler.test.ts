import {
  createInvitationMailHandler,
  type InvitationMailRepository,
} from "./invitation-mail-handler.ts";
import { InvitationSigner } from "./invitation-signer.ts";
import { invitationMailTemplate } from "./invitation-mail-template.ts";
import type { InvitationView } from "./invitation-handler.ts";
import { canonicalJson } from "../../../packages/assessment-core/src/mod.ts";
const t = "10000000-0000-4000-8000-000000000001",
  a = "00000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001",
  inv = "30000000-0000-4000-8000-000000000001",
  token = "40000000-0000-4000-8000-000000000001";
const eq = (x: unknown, y: unknown) => {
  if (canonicalJson(x) !== canonicalJson(y)) {
    throw new Error(`Expected ${JSON.stringify(y)}, got ${JSON.stringify(x)}`);
  }
};
const signer = await InvitationSigner.create("key", {
    key: btoa(String.fromCharCode(...new Uint8Array(32).fill(1))).replaceAll(
      "=",
      "",
    ),
  }),
  config = {
    enabled: true,
    signer,
    appUrl: "https://assessment.schood.online/",
    workerSecret: "synthetic-mail-control-secret-32-plus",
  };
const view: InvitationView = {
  id: inv,
  tenant_id: t,
  key_id: "key",
  state: "pending",
  recipient_email: "recipient@example.test",
  role_title: "Author <script>not executable</script>",
  role_version: 1,
  capabilities: ["banks.read", "items.write"],
  expires_at: "2026-11-01T00:00:00Z",
  permission_expires_at: null,
};
const repo: InvitationMailRepository = {
  user: (bearer) =>
    Promise.resolve(
      bearer === "valid"
        ? { id: a, email: "sender@example.test", verified: true }
        : null,
    ),
  read: () => Promise.resolve([]),
  command: () => Promise.resolve({ id }),
  claim: () => Promise.resolve([]),
  begin: () =>
    Promise.resolve({
      id,
      send: true,
      locale: "uz",
      kind: "invitation",
      invitation: view,
      institution_name: "<img src=x onerror=alert(1)>",
    }),
  report: () => Promise.resolve({ id, state: "failed" }),
};
const req = (
  route: string,
  data?: unknown,
  action = "mail.queue",
  headers: Record<string, string> = {},
) =>
  new Request(
    `https://service.invalid/assessment-cloud/invitations/mail/${route}?tenant_id=${t}&invitation_id=${inv}`,
    {
      method: data ? "POST" : "GET",
      headers: {
        authorization: "Bearer valid",
        "idempotency-key": "mail-test-key-001",
        ...headers,
      },
      ...(data ? { body: JSON.stringify({ action, data }) } : {}),
    },
  );
const queue = {
  id,
  invitation_id: inv,
  expected_invitation_revision: 1,
  send_after: "2026-10-21T00:00:00Z",
  kind: "invitation",
  locale: "uz",
  reason: "Reviewed delivery",
  acknowledged: true,
};
Deno.test("mail defaults and internal secret fail closed without invoking provider authority", async () => {
  let claims = 0;
  const handle = createInvitationMailHandler(
    {
      ...repo,
      claim: () => {
        claims++;
        return Promise.resolve([]);
      },
    },
    ["https://assessment.schood.online"],
    config,
  );
  eq((await handle(req("internal", { limit: 3 }, "mail.claim"))).status, 403);
  eq(
    (await handle(
      req("internal", { limit: 3 }, "mail.claim", {
        "x-assessment-mail-key": config.workerSecret,
      }),
    )).status,
    200,
  );
  eq(
    (await handle(req("list", undefined, "", { authorization: "Bearer bad" })))
      .status,
    401,
  );
  eq(
    (await handle(
      req("list", undefined, "", { origin: "https://foreign.invalid" }),
    )).status,
    403,
  );
  eq(
    (await createInvitationMailHandler(repo, [], { ...config, enabled: false })(
      req("list"),
    )).status,
    503,
  );
  eq(claims, 1);
});
Deno.test("manager mail command pins canonical fields and strips supplied recipient, body, actor and SMTP claims", async () => {
  let writes = 0;
  const handle = createInvitationMailHandler(
    {
      ...repo,
      command: (actor, tenant, key, action, data) => {
        writes++;
        eq([actor, tenant, key, action], [
          a,
          t,
          "mail-test-key-001",
          "mail.queue",
        ]);
        eq(data, {
          ...queue,
          send_after: "2026-10-21T00:00:00.000Z",
          retry_of: null,
          expected_source_revision: null,
          possible_duplicate_ack: false,
        });
        return Promise.resolve({ id });
      },
    },
    [],
    config,
  );
  eq(
    (await handle(
      req("commands", {
        ...queue,
        email: "attacker@example.test",
        body: "Arbitrary message",
        actor: inv,
        tenant_id: inv,
        from: "forged@example.test",
        smtp_secret: "forged",
      }),
    )).status,
    200,
  );
  eq(
    (await handle(req("commands", { ...queue, acknowledged: false }))).status,
    422,
  );
  eq(
    (await handle(req("commands", { ...queue, send_after: "2026-10-21" })))
      .status,
    422,
  );
  eq(writes, 1);
});
Deno.test("trusted mail handoff renders the pinned invitation, escapes HTML and keeps bearer secret in the fragment", async () => {
  const response = await createInvitationMailHandler(repo, [], config)(
      req("internal", { tenant_id: t, id, lease_token: token }, "mail.begin", {
        "x-assessment-mail-key": config.workerSecret,
      }),
    ),
    body = (await response.json()).data;
  eq(response.status, 200);
  eq(response.headers.get("cache-control"), "no-store");
  eq(body.message.to, "recipient@example.test");
  if (
    body.message.html.includes("<script>") ||
    body.message.html.includes("<img src=x")
  ) throw new Error("Mail template injected HTML");
  if (!body.message.html.includes("&lt;script&gt;")) {
    throw new Error("Role snapshot was not escaped");
  }
  const link = /https:\/\/assessment\.schood\.online\/#[^\s]+/.exec(
    body.message.text,
  )?.[0];
  if (!link) throw new Error("Missing recipient link");
  eq(new URL(link).search, "");
  eq(
    JSON.parse(
      new URLSearchParams(new URL(link).hash.slice(1)).get(
        "assessment_invite",
      )!,
    ).id,
    inv,
  );
});
Deno.test("replayed begin returns no message; missing old key records a safe rendering failure", async () => {
  const request = req(
    "internal",
    { tenant_id: t, id, lease_token: token },
    "mail.begin",
    { "x-assessment-mail-key": config.workerSecret },
  );
  const duplicate = await createInvitationMailHandler(
    {
      ...repo,
      begin: () => Promise.resolve({ id, send: false, state: "sending" }),
    },
    [],
    config,
  )(request);
  eq((await duplicate.json()).data, { id, send: false, state: "sending" });
  let reports = 0;
  const failed = await createInvitationMailHandler(
    {
      ...repo,
      begin: () =>
        Promise.resolve({
          id,
          send: true,
          locale: "uz",
          kind: "invitation",
          invitation: { ...view, key_id: "missing" },
          institution_name: "Center",
        }),
      report: (_tenant, _id, _token, outcome, code) => {
        eq([outcome, code], ["failed", "render_unavailable"]);
        reports++;
        return Promise.resolve({ id, state: "failed" });
      },
    },
    [],
    config,
  )(req("internal", { tenant_id: t, id, lease_token: token }, "mail.begin", {
    "x-assessment-mail-key": config.workerSecret,
  }));
  eq(failed.status, 503);
  eq(reports, 1);
});
Deno.test("all three mail languages retain exact role rights and explicit product boundary", () => {
  for (const locale of ["uz", "ru", "en"] as const) {
    const message = invitationMailTemplate(
      id,
      locale,
      "reminder",
      view,
      "Center",
      "https://assessment.schood.online/#synthetic",
    );
    eq(message.to, "recipient@example.test");
    if (
      !message.text.includes("Academy") || !message.text.includes("Proctor") ||
      !message.text.includes("UTC") || message.html.length > 40000
    ) throw new Error("Incomplete mail language/boundary");
  }
});
