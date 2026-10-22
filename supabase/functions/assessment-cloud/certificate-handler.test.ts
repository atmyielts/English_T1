import {
  type CertificateRepository,
  createCertificateHandler,
} from "./certificate-handler.ts";
import { CertificateSigner } from "./certificate-signer.ts";
import { createCertificateRepository } from "./certificate-repository.ts";
import {
  base64url,
  CERTIFICATE_FORMAT,
  certificateClaims,
  certificateEnvelope,
  certificatePayloadHash as hash,
  certificateProgram,
} from "../../../packages/assessment-core/src/certificates.ts";
import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001";
Deno.test("certificate receipt digest is SHA-256 of exact UTF-8 bytes", async () => {
  equal(
    await hash("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
const claims = {
  schema_version: CERTIFICATE_FORMAT,
  certificate_id: id,
  program_id: id,
  issuer: "Assessment test center",
  recipient: "Dilshod Karimov",
  achievement: "Mathematics placement",
  criteria: "Released score meets the approved 70% threshold.",
  minimum_percent: 70,
  exam: "Placement sitting",
  grading_generation: 2,
  score_revision_id: id,
  score: 8,
  maximum_score: 10,
  issued_at: "2026-10-14T12:00:00Z",
  expires_at: null,
};
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};
async function key() {
  const generated = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  return await crypto.subtle.exportKey("jwk", generated.privateKey);
}
const req = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(
    `https://fixture/functions/v1/assessment-cloud/certificates/${path}${
      path.includes("?") ? "&" : "?"
    }tenant_id=${tenant}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer current",
        "idempotency-key": "certificate-request-0001",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
async function fixture() {
  const jwk = await key(),
    signer = await CertificateSigner.create("key-a", [{ id: "key-a", jwk }]),
    calls: unknown[][] = [],
    payload = JSON.stringify(claims);
  const repository: CertificateRepository = {
    user: async (token) => token === "current" ? actor : null,
    read: async (...args) => {
      calls.push(["read", ...args]);
      return {
        id,
        key_id: "key-a",
        payload_text: payload,
        payload_hash: await hash(payload),
      };
    },
    command: async (...args) => {
      calls.push(["command", ...args]);
      return { id };
    },
    seal: async (...args) => {
      calls.push(["seal", ...args]);
      return { id, state: "issued" };
    },
    status: async (...args) => {
      calls.push(["status", ...args]);
      return { status: "valid", checked_at: "2026-10-14T12:00:00Z" };
    },
  };
  return {
    signer,
    repository,
    calls,
    handle: createCertificateHandler(repository, ["https://exam.test"], {
      enabled: true,
      signer,
    }),
  };
}
Deno.test("certificate issuance signs only canonical DB-held material and strips forged authority", async () => {
  const { handle, calls, signer } = await fixture();
  const response = await handle(req("commands", {
    action: "certificate.issue",
    data: {
      attempt_id: id,
      program_id: id,
      score_revision_id: id,
      candidate_id: id,
      key_id: "attacker",
      score: 100,
      state: "issued",
      signature: "forged",
    },
  }));
  equal(response.status, 200);
  equal(calls[0], [
    "command",
    actor,
    tenant,
    "certificate-request-0001",
    "certificate.prepare",
    { attempt_id: id, program_id: id, score_revision_id: id, key_id: "key-a" },
  ]);
  equal(calls[1], ["read", actor, tenant, "signing", id, null, 1]);
  const signed = await signer.sign(JSON.stringify(claims));
  equal(calls[2], [
    "seal",
    actor,
    tenant,
    id,
    "key-a",
    await hash(JSON.stringify(claims)),
    signed.signature,
  ]);
});
Deno.test("reviewed replacement strips forged claims and uses canonical prepare/sign/seal with the issuance gate", async () => {
  const f = await fixture(),
    data = {
      id,
      expected_revision: 2,
      attempt_id: id,
      program_id: id,
      score_revision_id: id,
      reason: "Institution reviewed a corrected recorded name.",
      candidate_id: actor,
      payload: "forged",
      key_id: "forged",
      signature: "forged",
    };
  equal(
    (await f.handle(req("commands", { action: "certificate.replace", data })))
      .status,
    200,
  );
  equal(f.calls[0], [
    "command",
    actor,
    tenant,
    "certificate-request-0001",
    "certificate.replace.prepare",
    {
      attempt_id: id,
      program_id: id,
      score_revision_id: id,
      id,
      expected_revision: 2,
      reason: data.reason,
      key_id: "key-a",
    },
  ]);
  equal(f.calls.map((call) => call[0]), ["command", "read", "seal"]);
  const disabled = createCertificateHandler(f.repository, [], {
    enabled: false,
    signer: f.signer,
  });
  equal(
    (await disabled(req("commands", { action: "certificate.replace", data })))
      .status,
    503,
  );
  for (const expected_revision of [0, 1.5, "2", 4]) {
    equal(
      (await f.handle(
        req("commands", {
          action: "certificate.replace",
          data: { ...data, expected_revision },
        }),
      )).status,
      422,
    );
  }
  equal(
    (await f.handle(
      req("commands", {
        action: "certificate.replace",
        data: { ...data, reason: "" },
      }),
    )).status,
    422,
  );
});
Deno.test("program retirement is reviewed and reasoned but does not require new issuance or signing", async () => {
  const f = await fixture(),
    handler = createCertificateHandler(f.repository, [], {
      enabled: false,
      signer: null,
    }),
    data = {
      id,
      review_hash: "a".repeat(64),
      reason: "Close obsolete award policy.",
      retired_by: "forged",
    };
  equal(
    (await handler(req("commands", { action: "program.retire", data }))).status,
    200,
  );
  equal(f.calls[0], [
    "command",
    actor,
    tenant,
    "certificate-request-0001",
    "program.retire",
    { id, review_hash: data.review_hash, reason: data.reason },
  ]);
  equal(f.calls.length, 1);
  equal(
    (await handler(
      req("commands", {
        action: "program.retire",
        data: { ...data, review_hash: "bad" },
      }),
    )).status,
    422,
  );
  equal(
    (await handler(
      req("commands", {
        action: "program.retire",
        data: { ...data, reason: "" },
      }),
    )).status,
    422,
  );
});
Deno.test("replacement predecessor is a signed optional claim with strict identifier and self-link rejection", async () => {
  const predecessor = "30000000-0000-4000-8000-000000000001",
    f = await fixture(),
    payload = JSON.stringify({
      ...claims,
      replaces_certificate_id: predecessor,
    }),
    signed = await f.signer.sign(payload);
  equal(
    (await f.signer.verify(signed)).claims.replaces_certificate_id,
    predecessor,
  );
  for (const value of [id, "not-an-id", null]) {
    let rejected = false;
    try {
      certificateClaims(
        base64url(
          new TextEncoder().encode(
            JSON.stringify({ ...claims, replaces_certificate_id: value }),
          ),
        ),
      );
    } catch {
      rejected = true;
    }
    equal(rejected, true);
  }
  equal(
    certificateClaims(
      base64url(new TextEncoder().encode(JSON.stringify(claims))),
    ).replaces_certificate_id,
    undefined,
  );
});
Deno.test("certificate origin/auth/release flag guards stop writes", async () => {
  const { repository, calls, signer } = await fixture(),
    disabled = createCertificateHandler(repository, [], {
      enabled: false,
      signer,
    });
  equal(
    (await disabled(
      req("commands", {
        action: "certificate.issue",
        data: { attempt_id: id, program_id: id, score_revision_id: id },
      }),
    )).status,
    503,
  );
  equal(calls.length, 0);
  equal(
    (await disabled(
      req("institution", undefined, { authorization: "Bearer expired" }),
    )).status,
    401,
  );
  equal(
    (await disabled(
      req("institution", undefined, { origin: "https://evil.test" }),
    )).status,
    403,
  );
});
Deno.test("public verification validates signature before private status lookup and returns no stored identity projection", async () => {
  const { handle, calls, signer } = await fixture(),
    signed = await signer.sign(JSON.stringify(claims));
  const response = await handle(
    req("verify", { certificate: signed }, {
      authorization: "",
      origin: "https://third-party.test",
    }),
  );
  equal(response.status, 200);
  equal(response.headers.get("access-control-allow-origin"), "*");
  equal(calls[0], [
    "status",
    id,
    "key-a",
    await hash(JSON.stringify(claims)),
    signed.signature,
  ]);
  const body = await response.json();
  equal(body.data.claims.recipient, "Dilshod Karimov");
  equal(body.data.signature_verified, true);
  signed.payload = base64url(
    new TextEncoder().encode(JSON.stringify({ ...claims, score: 10 })),
  );
  equal(
    (await handle(
      req("verify", { certificate: signed }, { authorization: "" }),
    )).status,
    422,
  );
  equal(calls.length, 1);
});
Deno.test("certificate key rotation retains old verification-only keys without publishing private material", async () => {
  const old = await key(),
    next = await key(),
    before = await CertificateSigner.create("old", [{ id: "old", jwk: old }]),
    signed = await before.sign(JSON.stringify(claims));
  const { d: _private, ...publicOld } = old;
  const after = await CertificateSigner.create("next", [{
    id: "old",
    jwk: publicOld,
  }, { id: "next", jwk: next }]);
  equal((await after.verify(signed)).claims.certificate_id, id);
  if (JSON.stringify(after.publicKeys()).includes('"d"')) {
    throw new Error("Private key leaked");
  }
  try {
    await after.sign(JSON.stringify(claims), "old");
    throw new Error("Public-only key signed");
  } catch (cause) {
    if (!(cause instanceof ContractError)) throw cause;
    equal(cause.code, "certificate_signing_key_unavailable");
  }
});
Deno.test("certificate signatures are deterministic and bind the key identity and unchanged payload", async () => {
  const { signer } = await fixture(),
    first = await signer.sign(JSON.stringify(claims)),
    second = await signer.sign(JSON.stringify(claims));
  equal(first, second);
  first.key_id = "key-b";
  try {
    await signer.verify(first);
    throw new Error("Unknown key trusted");
  } catch (cause) {
    if (!(cause instanceof ContractError)) throw cause;
    equal(cause.code, "certificate_key_untrusted");
  }
});
Deno.test("revoked signing keys cannot verify or issue credentials", async () => {
  const old = await key(),
    next = await key(),
    issuer = await CertificateSigner.create("old", [{ id: "old", jwk: old }]),
    signed = await issuer.sign(JSON.stringify(claims)),
    revoked = await CertificateSigner.create("next", [{
      id: "old",
      jwk: old,
      revoked: true,
    }, { id: "next", jwk: next }]);
  try {
    await revoked.verify(signed);
    throw new Error("Revoked key accepted");
  } catch (cause) {
    if (!(cause instanceof ContractError)) throw cause;
    equal(cause.code, "certificate_key_untrusted");
  }
});
Deno.test("certificate program and envelope validation reject fractional expiry, precision loss and embedded trust keys", () => {
  for (
    const data of [{ minimum_percent: 70.0000001, valid_days: 1 }, {
      minimum_percent: 70,
      valid_days: 1.1,
    }]
  ) {
    try {
      certificateProgram({
        title: "Achievement",
        description: "Criteria",
        ...data,
      });
      throw new Error("Invalid program accepted");
    } catch (cause) {
      if (!(cause instanceof ContractError)) throw cause;
    }
  }
  try {
    certificateEnvelope({
      format: CERTIFICATE_FORMAT,
      key_id: "old",
      payload: "AA",
      signature: "A".repeat(86),
      jwk: {},
    });
    throw new Error("Embedded trust accepted");
  } catch (cause) {
    if (!(cause instanceof ContractError)) throw cause;
  }
});
Deno.test("certificate production repository maps canonical RPCs and bounded error statuses", async () => {
  const calls: unknown[][] = [];
  let failure: { code: string; message: string } | null = null;
  const repository = createCertificateRepository({
    auth: {
      getUser: async () => ({ data: { user: { id: actor } }, error: null }),
    },
  }, {
    rpc: async (...args) => {
      calls.push(args);
      return { data: { id }, error: failure };
    },
  });
  await repository.seal(
    actor,
    tenant,
    id,
    "old",
    "a".repeat(64),
    "A".repeat(86),
  );
  equal(calls[0], ["assessment_certificate_seal", {
    p_actor: actor,
    p_tenant: tenant,
    p_id: id,
    p_key_id: "old",
    p_payload_hash: "a".repeat(64),
    p_signature: "A".repeat(86),
  }]);
  await repository.status(id, "old", "a".repeat(64), "A".repeat(86));
  equal(calls[1], ["assessment_certificate_status", {
    p_id: id,
    p_key_id: "old",
    p_payload_hash: "a".repeat(64),
    p_signature: "A".repeat(86),
  }]);
  failure = { code: "42501", message: "forbidden" };
  try {
    await repository.read(actor, tenant, "programs", null, null, 50);
    throw new Error("Denial hidden");
  } catch (cause) {
    if (!(cause instanceof ContractError)) throw cause;
    equal(cause.status, 403);
  }
});
Deno.test("corrupt canonical signing material cannot commit a signing receipt", async () => {
  const { handle, repository, calls } = await fixture();
  repository.read = async () => ({
    id,
    key_id: "key-a",
    payload_text: JSON.stringify(claims),
    payload_hash: "0".repeat(64),
  });
  equal(
    (await handle(
      req("commands", {
        action: "certificate.issue",
        data: { attempt_id: id, program_id: id, score_revision_id: id },
      }),
    )).status,
    503,
  );
  equal(calls.length, 1);
});
Deno.test("a sealed issuance receipt replays with only the retired public key", async () => {
  const { repository, signer, calls } = await fixture(),
    payload = JSON.stringify(claims),
    signed = await signer.sign(payload),
    next = await key(),
    old = signer.publicKeys()[0].jwk;
  const rotated = await CertificateSigner.create("next", [{
    id: "key-a",
    jwk: old,
  }, { id: "next", jwk: next }]);
  repository.read = async () => ({
    id,
    key_id: "key-a",
    payload_text: payload,
    payload_hash: await hash(payload),
    signature: signed.signature,
  });
  const handle = createCertificateHandler(repository, [], {
    enabled: true,
    signer: rotated,
  });
  equal(
    (await handle(
      req("commands", {
        action: "certificate.issue",
        data: { attempt_id: id, program_id: id, score_revision_id: id },
      }),
    )).status,
    200,
  );
  equal(calls.at(-1), [
    "seal",
    actor,
    tenant,
    id,
    "key-a",
    await hash(payload),
    signed.signature,
  ]);
});
Deno.test("certificate readiness is authenticated and reflects the release gate without exposing keys", async () => {
  const { repository, calls, signer } = await fixture();
  repository.read = async (...args) => {
    calls.push(["read", ...args]);
    return { can_manage: true };
  };
  const handle = createCertificateHandler(repository, [], {
    enabled: false,
    signer,
  });
  const response = await handle(req("access"));
  equal(response.status, 200);
  equal((await response.json()).data, {
    can_manage: true,
    issuance_enabled: false,
  });
  equal(calls[0], ["read", actor, tenant, "access", null, null, 50]);
  equal(
    (await handle(
      req("access", undefined, { authorization: "Bearer expired" }),
    )).status,
    401,
  );
});
