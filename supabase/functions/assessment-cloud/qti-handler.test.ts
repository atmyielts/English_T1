import {
  createQtiHandler,
  type QtiConfiguration,
  type QtiRepository,
} from "./qti-handler.ts";
import { createQtiRepository } from "./qti-repository.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001",
  token = "30000000-0000-4000-8000-000000000001",
  digest = "a".repeat(64);
const config: QtiConfiguration = {
  enabled: true,
  transportKey: "transport".repeat(8),
  scannerKey: "scanner".repeat(8),
  parserKey: "parser".repeat(8),
  processorId: "f".repeat(64),
  scannerId: "trusted-scanner",
};
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(JSON.stringify({ a, b }));
  }
};
function fixture(cfg: Partial<QtiConfiguration> = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
    return Promise.resolve({ id });
  };
  const repository: QtiRepository = {
    user: (value) => Promise.resolve(value === "member" ? actor : null),
    read: (...args) => record("read", ...args),
    command: (...args) => record("command", ...args),
    transport: (...args) => record("transport", ...args),
    claim: (...args) => record("claim", ...args),
    bundle: (...args) => record("bundle", ...args),
    report: (...args) => record("report", ...args),
  };
  return {
    calls,
    handler: createQtiHandler(repository, ["https://assessment.schood.test"], {
      ...config,
      ...cfg,
    }),
  };
}
const request = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(
    `https://api.test/assessment-cloud/qti/${path}?tenant_id=${tenant}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: "Bearer member",
        "content-type": "application/json",
        "idempotency-key": "qti-request-001",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
const source = {
  bank_id: id,
  filename: "bank.zip",
  source_hash: digest,
  byte_length: 22,
  parts: [{ sha256: digest, byte_length: 22 }],
};
Deno.test("QTI admission derives actor and pins configured processor instead of browser authority", async () => {
  const { handler, calls } = fixture(),
    response = await handler(
      request("commands", {
        action: "source.begin",
        data: {
          ...source,
          actor_id: id,
          processor_id: "evil",
          rows: [{ approved: true }],
        },
      }),
    );
  equal(response.status, 200);
  equal(calls, [{
    name: "command",
    args: [actor, tenant, "qti-request-001", "source.begin", {
      ...source,
      processor_id: config.processorId,
    }],
  }]);
  equal(response.headers.get("cache-control"), "no-store");
});
Deno.test("QTI remains disabled or unavailable without distinct processing identities, without crashing sibling APIs", async () => {
  for (
    const cfg of [{ enabled: false }, { parserKey: config.scannerKey }, {
      processorId: "",
    }]
  ) {
    const { handler, calls } = fixture(cfg);
    equal((await handler(request("jobs"))).status, 503);
    equal(calls.length, 0);
  }
});
Deno.test("QTI denies untrusted origins, missing identity, unknown actions and unsafe pagination", async () => {
  const { handler, calls } = fixture();
  equal(
    (await handler(request("jobs", undefined, { origin: "https://evil.test" })))
      .status,
    403,
  );
  equal(
    (await handler(
      request("jobs", undefined, { authorization: "Bearer unknown" }),
    )).status,
    401,
  );
  equal(
    (await handler(request("commands", { action: "publish", data: {} })))
      .status,
    422,
  );
  equal(
    (await handler(
      new Request(
        `https://api.test/assessment-cloud/qti/jobs?tenant_id=${tenant}&limit=101`,
        { headers: { authorization: "Bearer member" } },
      ),
    )).status,
    422,
  );
  equal(calls.length, 0);
});
Deno.test("QTI worker stages require different service keys and never accept a browser origin or user token fallback", async () => {
  const { handler, calls } = fixture();
  equal((await handler(request("internal/scan/claim", {}))).status, 403);
  equal(
    (await handler(
      request("internal/parse/claim", {}, {
        "x-assessment-qti-worker-key": config.scannerKey,
      }),
    )).status,
    403,
  );
  equal(
    (await handler(
      request("internal/scan/claim", {}, {
        "x-assessment-qti-worker-key": config.scannerKey,
        origin: "https://assessment.schood.test",
      }),
    )).status,
    403,
  );
  equal(calls.length, 0);
  equal(
    (await handler(
      request("internal/parse/claim", { limit: 3, processor_id: "forged" }, {
        "x-assessment-qti-worker-key": config.parserKey,
      }),
    )).status,
    200,
  );
  equal(calls[0], { name: "claim", args: ["parse", config.processorId, 3] });
});
Deno.test("QTI bundle renewal carries exact source task, role and configured release identity", async () => {
  const { handler, calls } = fixture();
  equal(
    (await handler(
      request("internal/parse/renew", { job_id: id, lease_token: token }, {
        "x-assessment-qti-worker-key": config.parserKey,
      }),
    )).status,
    200,
  );
  equal(calls[0], {
    name: "bundle",
    args: [id, "parse", token, config.processorId, true],
  });
});
Deno.test("only trusted transport plus current user identity can submit reconstructed byte receipts", async () => {
  const { handler, calls } = fixture(),
    body = {
      action: "part.authorize",
      data: { job_id: id, index: 0, receipt: { forged: true } },
    };
  equal((await handler(request("transport", body))).status, 403);
  equal(
    (await handler(
      request("transport", body, {
        "x-assessment-qti-transport-key": config.transportKey,
        authorization: "Bearer revoked",
      }),
    )).status,
    401,
  );
  equal(
    (await handler(
      request("transport", body, {
        "x-assessment-qti-transport-key": config.transportKey,
      }),
    )).status,
    200,
  );
  equal(calls, [{
    name: "transport",
    args: [actor, tenant, "part.authorize", { job_id: id, index: 0 }],
  }]);
});
Deno.test("scan report pins configured scanner identity and strips proposed approvals", async () => {
  const { handler, calls } = fixture(),
    result = {
      schema_version: "assessment.qti-scan.v2",
      observed_source_hash: digest,
      scan_performed: true,
      reason: "clean",
      source_hash: digest,
      byte_length: 22,
      verdict: "clean",
      engine_version: "engine",
      signature_version: digest,
      report_hash: digest,
      scanner_id: "forged",
      approved: true,
    };
  equal(
    (await handler(
      request("internal/scan/report", {
        job_id: id,
        lease_token: token,
        result,
      }, { "x-assessment-qti-worker-key": config.scannerKey }),
    )).status,
    200,
  );
  const report = calls[0].args[4] as Record<string, unknown>;
  equal(report.scanner_id, "trusted-scanner");
  equal("approved" in report, false);
});
Deno.test("QTI adoption pins revision/review, requires explicit acknowledgement and never accepts browser rows", async () => {
  const { handler, calls } = fixture(),
    data = {
      id,
      expected_revision: 6,
      review_hash: digest,
      reason: "Reviewed source, licensing, diagnostics and proposals.",
      acknowledged: true,
      rows: [{ approved: true }],
      source_hash: "forged",
    };
  equal(
    (await handler(
      request("commands", {
        action: "adopt",
        data: { ...data, acknowledged: false },
      }),
    )).status,
    422,
  );
  equal(
    (await handler(request("commands", { action: "adopt", data }))).status,
    200,
  );
  equal(calls, [{
    name: "command",
    args: [actor, tenant, "qti-request-001", "adopt", {
      id,
      expected_revision: 6,
      reason: data.reason,
      review_hash: digest,
      acknowledged: true,
    }],
  }]);
});
Deno.test("private QTI repository maps explicit RPCs, processor fences and non-leaking database failures", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let failure: { code: string; message: string } | null = null;
  const repository = createQtiRepository({
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: actor } }, error: null }),
    },
  }, {
    rpc: (name, args) => {
      calls.push({ name, args });
      return Promise.resolve({ data: { id }, error: failure });
    },
  });
  await repository.bundle(id, "parse", token, config.processorId, false);
  equal(calls[0], {
    name: "assessment_qti_bundle",
    args: {
      p_job: id,
      p_stage: "parse",
      p_token: token,
      p_processor: config.processorId,
      p_renew: false,
    },
  });
  failure = { code: "XX000", message: "private SQL secret" };
  let failed = false;
  try {
    await repository.read(actor, tenant, id, 0, 50);
  } catch (cause) {
    failed = true;
    if (String(cause).includes("private SQL secret")) {
      throw new Error("Database detail leaked");
    }
  }
  equal(failed, true);
});
Deno.test("QTI metadata rejects malformed and oversized bodies before any write or processing command", async () => {
  const { handler, calls } = fixture();
  for (
    const [body, status] of [["null", 400], ["{", 400], [
      "x".repeat(6 * 1048576 + 1),
      413,
    ]] as const
  ) {
    const response = await handler(
      new Request(
        `https://api.test/assessment-cloud/qti/commands?tenant_id=${tenant}`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer member",
            "idempotency-key": "qti-invalid-body",
            "content-type": "application/json",
          },
          body,
        },
      ),
    );
    equal(response.status, status);
  }
  equal(calls.length, 0);
});
