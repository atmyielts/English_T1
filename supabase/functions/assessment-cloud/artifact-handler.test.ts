import {
  createArtifactHandler,
  type ArtifactRepository,
} from "./artifact-handler.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001",
  transport = "transport-secret-" + "a".repeat(32),
  scanner = "scanner-secret-" + "b".repeat(32),
  secrets = { transport, scanner, scannerId: "approved-scanner" };
const repository: ArtifactRepository = {
  user: (token) => Promise.resolve(token === "valid" ? actor : null),
  read: () => Promise.resolve([]),
  command: () => Promise.resolve({ id: actor }),
  transport: () => Promise.resolve({ id: actor }),
  claim: () => Promise.resolve([]),
  scanBundle: () => Promise.resolve({}),
  report: () => Promise.resolve({ state: "ready" }),
};
function request(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(
    `https://test.invalid/assessment-cloud/artifacts/${path}?tenant_id=${tenant}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer valid",
        "content-type": "application/json",
        "idempotency-key": "artifact-command-001",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
function equal(a: unknown, b: unknown) {
  if (a !== b) throw new Error(`Expected ${b}, received ${a}`);
}
Deno.test("marker artifact transport forwards only task scope and rejects ambiguous candidate scope", async () => {
  let stored: Record<string, unknown> = {};
  const handle = createArtifactHandler({ ...repository, transport: (_actor, _tenant, _action, data) => { stored = data; return Promise.resolve({}); } }, [], secrets);
  equal((await handle(request("transport", { action: "read.authorize", data: { artifact_id: actor, task_id: tenant, filename: "private", candidate_id: actor, approved: true } }, { "x-assessment-media-key": transport }))).status, 200);
  equal(JSON.stringify(stored), JSON.stringify({ artifact_id: actor, task_id: tenant }));
  equal((await handle(request("transport", { action: "read.authorize", data: { artifact_id: actor, task_id: tenant, attempt_id: actor } }, { "x-assessment-media-key": transport }))).status, 422);
});
Deno.test(
  "artifact handler strips supplied actor/state/storage and uses the authenticated tenant command",
  async () => {
    let stored: Record<string, unknown> = {};
    const handle = createArtifactHandler(
      {
        ...repository,
        command: (who, scope, key, action, data) => {
          equal(who, actor);
          equal(scope, tenant);
          equal(action, "upload.begin");
          stored = data;
          return Promise.resolve({ id: actor });
        },
      },
      [],
      secrets,
    );
    equal(
      (
        await handle(
          request("commands", {
            action: "upload.begin",
            data: {
              filename: " Image.png ",
              mime: "image/png",
              byte_length: 3,
              parts: [{ sha256: "a".repeat(64), byte_length: 3 }],
              actor: tenant,
              state: "ready",
              object_key: "foreign",
            },
          }),
        )
      ).status,
      200,
    );
    equal(stored.filename, "Image.png");
    equal("state" in stored, false);
    equal("actor" in stored, false);
  },
);
Deno.test(
  "browser JWTs and transport credentials cannot forge scanner verdicts or storage receipts",
  async () => {
    const handle = createArtifactHandler(repository, [], secrets);
    equal(
      (
        await handle(
          request("transport", {
            action: "upload.complete",
            data: { artifact_id: actor },
          }),
        )
      ).status,
      403,
    );
    equal(
      (
        await handle(
          request(
            "scan/claim",
            { limit: 1 },
            { "x-assessment-scanner-key": transport },
          ),
        )
      ).status,
      403,
    );
    equal(
      (
        await handle(
          request(
            "transport",
            { action: "upload.complete", data: { artifact_id: actor } },
            {
              "x-assessment-media-key": transport,
              authorization: "Bearer invalid",
            },
          ),
        )
      ).status,
      401,
    );
    equal(
      (
        await handle(
          request(
            "transport",
            { action: "upload.complete", data: { artifact_id: actor } },
            { "x-assessment-media-key": transport },
          ),
        )
      ).status,
      200,
    );
  },
);
Deno.test(
  "scanner identity is pinned, unknown paths and oversized page/claim limits fail closed",
  async () => {
    const handle = createArtifactHandler(repository, [], secrets),
      report = {
        job_id: actor,
        lease_token: actor,
        manifest_hash: "a".repeat(64),
        verdict: "clean",
        detected_mime: "image/png",
        decoder_checked: true,
        scanner_id: "foreign-scanner",
        scanner_version: "1",
        signature_version: "today",
        report_hash: "b".repeat(64),
      };
    equal(
      (
        await handle(
          request("scan/report", report, {
            "x-assessment-scanner-key": scanner,
          }),
        )
      ).status,
      403,
    );
    equal(
      (
        await handle(
          request(
            "scan/claim",
            { limit: 21 },
            { "x-assessment-scanner-key": scanner },
          ),
        )
      ).status,
      422,
    );
    equal(
      (await handle(request("missing", { action: "upload.begin", data: {} })))
        .status,
      404,
    );
  },
);
Deno.test(
  "artifact CORS, missing configuration and distinct secret boundaries are enforced",
  async () => {
    const handle = createArtifactHandler(
      repository,
      ["https://institution.invalid"],
      secrets,
    );
    equal(
      (
        await handle(
          request("library", undefined, { origin: "https://foreign.invalid" }),
        )
      ).status,
      403,
    );
    equal(
      (
        await createArtifactHandler(repository, [], {
          transport: "",
          scanner: "",
          scannerId: "",
        })(
          request(
            "scan/claim",
            { limit: 1 },
            { "x-assessment-scanner-key": scanner },
          ),
        )
      ).status,
      403,
    );
    try {
      createArtifactHandler(repository, [], {
        transport,
        scanner: transport,
        scannerId: "scanner",
      });
    } catch {
      return;
    }
    throw new Error("Reused scanner/transport secret accepted");
  },
);
