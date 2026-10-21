import {
  createInvitationHandler,
  type InvitationRepository,
  type InvitationView,
} from "./invitation-handler.ts";
import { createInvitationRepository } from "./invitation-repository.ts";
import { InvitationSigner } from "./invitation-signer.ts";
import { hash } from "../../../packages/assessment-core/src/mod.ts";
const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001",
  role = "30000000-0000-4000-8000-000000000001";
const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
const keyA = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)))
    .replaceAll("=", ""),
  keyB = btoa(String.fromCharCode(...new Uint8Array(32).fill(2))).replaceAll(
    "=",
    "",
  );
const signer = await InvitationSigner.create("one", { one: keyA, two: keyB }),
  origin = "https://assessment.schood.online";
const config = { enabled: true, signer, appUrl: origin + "/" },
  view: InvitationView = {
    id,
    tenant_id: tenant,
    state: "pending",
    key_id: "one",
  };
const repo: InvitationRepository = {
  user: (token) =>
    Promise.resolve(
      token === "valid"
        ? { id: actor, email: "recipient@example.test", verified: true }
        : null,
    ),
  read: () => Promise.resolve(null),
  command: () => Promise.resolve({ id, state: "pending" }),
  preview: () => Promise.resolve({ id }),
  accept: () => Promise.resolve({ id, state: "accepted" }),
};
const createData = {
  id,
  recipient_email: " Recipient@Example.Test ",
  role_version_id: role,
  expires_at: "2026-11-01T00:00:00Z",
  permission_expires_at: null,
  reason: "Reviewed author role",
  acknowledged: true,
};
const req = (
  route: string,
  data?: unknown,
  headers: Record<string, string> = {},
  action = "invite.create",
) =>
  new Request(
    `https://service.invalid/assessment-cloud/invitations/${route}?tenant_id=${tenant}`,
    {
      method: data ? "POST" : "GET",
      headers: {
        authorization: "Bearer valid",
        origin,
        "idempotency-key": "invitation-test-001",
        ...headers,
      },
      ...(data ? { body: JSON.stringify({ action, data }) } : {}),
    },
  );
Deno.test("invitation signer separates tenant, id and key; original key survives rotation", async () => {
  const original = await signer.token(tenant, id);
  eq(original.length, 43);
  eq(await signer.token(tenant, id), original);
  const rotated = await InvitationSigner.create("two", {
    one: keyA,
    two: keyB,
  });
  eq(await rotated.token(tenant, id, "one"), original);
  if (
    await rotated.token(tenant, id) === original ||
    await signer.token(tenant, role) === original ||
    await signer.token(role, id) === original
  ) throw new Error("Invitation secret is not bound to its context");
  try {
    await InvitationSigner.create("bad", { bad: "short" });
    throw new Error("Weak key accepted");
  } catch (cause) {
    if ((cause as Error).message === "Weak key accepted") throw cause;
  }
});
Deno.test("invitation API fails isolated, exact-origin, unauthenticated and bounded page requests closed", async () => {
  const handle = createInvitationHandler(repo, [origin], config);
  eq(
    (await handle(
      req("list", undefined, { origin: "https://foreign.invalid" }),
    )).status,
    403,
  );
  eq(
    (await handle(req("list", undefined, { authorization: "Bearer bad" })))
      .status,
    401,
  );
  eq(
    (await handle(
      new Request(
        `https://service.invalid/assessment-cloud/invitations/list?tenant_id=${tenant}&limit=101`,
        { headers: { authorization: "Bearer valid" } },
      ),
    )).status,
    422,
  );
  eq(
    (await createInvitationHandler(repo, [origin], {
      ...config,
      enabled: false,
    })(req("list"))).status,
    503,
  );
  eq(
    (await createInvitationHandler(repo, [origin], {
      ...config,
      appUrl: "http://insecure.invalid",
    })(req("list"))).status,
    503,
  );
  const response = await handle(req("list"));
  eq(response.headers.get("cache-control"), "no-store");
  eq(response.headers.get("referrer-policy"), "no-referrer");
});
Deno.test("invitation create strips supplied authority and recovers stored key identity on retry", async () => {
  const rotated = await InvitationSigner.create("two", {
    one: keyA,
    two: keyB,
  });
  let writes = 0;
  const handle = createInvitationHandler(
    {
      ...repo,
      read: () => Promise.resolve(view),
      command: async (who, scope, key, action, data) => {
        writes++;
        eq(who, actor);
        eq(scope, tenant);
        eq(key, "invitation-test-001");
        eq(action, "invite.create");
        eq(data, {
          ...createData,
          recipient_email: "recipient@example.test",
          expires_at: "2026-11-01T00:00:00.000Z",
          key_id: "one",
          token_hash: await hash(await signer.token(tenant, id)),
        });
        return { id };
      },
    },
    [origin],
    { ...config, signer: rotated },
  );
  eq(
    (await handle(
      req("commands", {
        ...createData,
        actor: role,
        tenant_id: role,
        key_id: "two",
        token_hash: "forged",
        capabilities: ["proctor.manage"],
      }),
    )).status,
    200,
  );
  eq(writes, 1);
  for (
    const invalid of [{ ...createData, acknowledged: false }, {
      ...createData,
      recipient_email: "invalid",
    }, { ...createData, expires_at: "2026-11-01" }]
  ) eq((await handle(req("commands", invalid))).status, 422);
  eq(writes, 1);
});
Deno.test("protected share links use fragment, current creator-authorized read and no database bearer secret", async () => {
  let reads = 0;
  const handle = createInvitationHandler(
    {
      ...repo,
      read: (who, scope, target, after, limit, link) => {
        eq([who, scope, target, after, limit, link], [
          actor,
          tenant,
          id,
          null,
          1,
          true,
        ]);
        reads++;
        return Promise.resolve(view);
      },
    },
    [origin],
    config,
  );
  const response = await handle(req("link", { id })),
    data = (await response.json()).data,
    url = new URL(data.url),
    payload = JSON.parse(
      new URLSearchParams(url.hash.slice(1)).get("assessment_invite")!,
    );
  eq(url.search, "");
  eq(payload, { tenant, id, token: await signer.token(tenant, id) });
  eq(data.delivery, "share_link");
  eq(reads, 1);
});
Deno.test("preview and acceptance derive verified email and never trust body identity", async () => {
  const token = await signer.token(tenant, id);
  let previews = 0, accepts = 0;
  const handle = createInvitationHandler(
    {
      ...repo,
      preview: async (...args) => {
        eq(args, [
          actor,
          tenant,
          id,
          await hash(token),
          "recipient@example.test",
        ]);
        previews++;
        return { id };
      },
      accept: async (...args) => {
        eq(args, [
          actor,
          tenant,
          "invitation-test-001",
          id,
          await hash(token),
          "recipient@example.test",
          "a".repeat(64),
        ]);
        accepts++;
        return { id };
      },
    },
    [origin],
    config,
  );
  eq(
    (await handle(
      req("preview", { id, token, email: "forged@example.test", actor: role }),
    )).status,
    200,
  );
  eq(
    (await handle(
      req("accept", {
        id,
        token,
        review_hash: "a".repeat(64),
        acknowledged: true,
        verified_email: "forged@example.test",
      }),
    )).status,
    200,
  );
  eq(
    (await handle(
      req("accept", {
        id,
        token,
        review_hash: "a".repeat(64),
        acknowledged: false,
      }),
    )).status,
    422,
  );
  eq([previews, accepts], [1, 1]);
  const unverified = createInvitationHandler(
    {
      ...repo,
      user: () =>
        Promise.resolve({
          id: actor,
          email: "recipient@example.test",
          verified: false,
        }),
      preview: () => {
        throw new Error("Unverified identity reached database");
      },
    },
    [origin],
    config,
  );
  eq(
    (await unverified(req("preview", { id, token, verified: true }))).status,
    403,
  );
});
Deno.test("repository requires Auth confirmed email timestamp, not user metadata claims", async () => {
  const rpc = () => Promise.resolve({ data: null, error: null });
  for (const confirmed of [undefined, "invalid", "2026-10-20T00:00:00Z"]) {
    const repository = createInvitationRepository({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: {
              user: {
                id: actor,
                email: " RECIPIENT@EXAMPLE.TEST ",
                email_confirmed_at: confirmed,
                user_metadata: { email_verified: true },
              },
            },
            error: null,
          }),
      },
    }, { rpc });
    eq(await repository.user("test"), {
      id: actor,
      email: "recipient@example.test",
      verified: confirmed === "2026-10-20T00:00:00Z",
    });
  }
});
Deno.test("streamed oversized invitation body is cancelled before any write", async () => {
  let cancelled = false, writes = 0;
  const handle = createInvitationHandler(
    {
      ...repo,
      command: () => {
        writes++;
        return Promise.resolve(null);
      },
    },
    [origin],
    config,
  );
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(20001));
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = await handle(
    new Request(
      `https://service.invalid/assessment-cloud/invitations/commands?tenant_id=${tenant}`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: stream,
      },
    ),
  );
  eq(response.status, 413);
  eq(cancelled, true);
  eq(writes, 0);
});
