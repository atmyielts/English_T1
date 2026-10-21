import {
  type CertificateDocumentRepository,
  createCertificateDocumentHandler,
} from "./certificate-document-handler.ts";
import { CertificateSigner } from "./certificate-signer.ts";
import {
  certificateClaims,
  certificatePayloadHash,
} from "../../../packages/assessment-core/src/certificates.ts";
import {
  certificateReference,
  certificateVerificationUrl,
  decodeCertificateReference,
  encodeCertificateReference,
  referenceForCertificate,
} from "../../../packages/assessment-core/src/certificate-document.ts";
import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import {
  createCertificateDocumentTransport,
  documentDigest,
  documentMac,
} from "./certificate-document-transport.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}
async function fixture() {
  const pair = await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]) as CryptoKeyPair,
    signer = await CertificateSigner.create("key-a", [{
      id: "key-a",
      jwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    }]),
    payload = JSON.stringify({
      schema_version: "schood.certificate.v1",
      certificate_id: id,
      program_id: id,
      score_revision_id: id,
      issuer: "Test institution",
      recipient: "Recipient",
      achievement: "Placement",
      criteria: "Released score meets independently approved criteria.",
      exam: "Entrance",
      score: 8,
      maximum_score: 10,
      minimum_percent: 70,
      grading_generation: 1,
      issued_at: "2026-10-20T12:00:00Z",
      expires_at: null,
    }),
    signed = await signer.sign(payload),
    reference = await referenceForCertificate(signed),
    calls: string[] = [],
    record = {
      id,
      key_id: signed.key_id,
      payload_text: payload,
      payload_hash: await certificatePayloadHash(payload),
      signature: signed.signature,
    },
    pdf = new TextEncoder().encode("%PDF-" + ".".repeat(100)),
    document = {
      bytes: pdf,
      renderer_id: "d".repeat(64),
      sha256: await documentDigest(pdf),
      payload_hash: record.payload_hash,
      locale: "en" as const,
    };
  const repository: CertificateDocumentRepository = {
    user: async () => actor,
    read: async () => {
      calls.push("read");
      return record;
    },
    resolve: async () => {
      calls.push("resolve");
      return { record, documents: [] };
    },
    status: async () => ({
      status: "valid",
      checked_at: "2026-10-20T12:00:00Z",
    }),
    report: async () => {
      calls.push("report");
      return {};
    },
  };
  const renderer = {
      render: async () => {
        calls.push("render");
        return document;
      },
    },
    options = {
      enabled: true,
      signer,
      renderer,
      verificationUrl: "https://exam.example.test/",
    };
  return { signed, reference, repository, options, record, calls, document };
}
const pdfRequest = (headers: Record<string, string> = {}) =>
  new Request(
    `https://service.test/assessment-cloud/certificates/${id}/pdf?tenant_id=${tenant}`,
    {
      headers: {
        authorization: "Bearer token",
        origin: "https://allowed.test",
        ...headers,
      },
    },
  );
Deno.test("certificate PDF independently gates private download and rechecks identity/access after rendering before immutable reporting", async () => {
  const f = await fixture(),
    handler = createCertificateDocumentHandler(f.repository, [
      "https://allowed.test",
    ], f.options),
    response = await handler(pdfRequest());
  equal(response.status, 200);
  equal(response.headers.get("content-type"), "application/pdf");
  equal(response.headers.get("cache-control"), "no-store");
  equal(response.headers.get("x-certificate-sha256"), f.document.sha256);
  equal(f.calls, ["read", "render", "read", "report"]);
  const disabled = createCertificateDocumentHandler(f.repository, [], {
    ...f.options,
    enabled: false,
  });
  equal((await disabled(pdfRequest({ origin: "" }))).status, 503);
  equal(
    (await handler(pdfRequest({ origin: "https://foreign.test" }))).status,
    403,
  );
});
Deno.test("certificate PDF withheld on post-render authority withdrawal, changed identity, digest mismatch or missing signer", async () => {
  for (const failure of ["authority", "identity", "digest", "signer"]) {
    const f = await fixture();
    if (failure === "authority") {
      let reads = 0;
      f.repository.read = async () => {
        if (++reads > 1) {
          throw new ContractError("forbidden", "Access withdrawn.", 403);
        }
        return f.record;
      };
    }
    if (failure === "identity") {
      let users = 0;
      f.repository.user = async () => ++users > 1 ? null : actor;
    }
    if (failure === "digest") f.document.payload_hash = "f".repeat(64);
    const options = {
        ...f.options,
        signer: failure === "signer" ? null : f.options.signer,
      },
      response = await createCertificateDocumentHandler(f.repository, [
        "https://allowed.test",
      ], options)(pdfRequest());
    equal(
      response.status,
      failure === "authority" ? 403 : failure === "identity" ? 401 : 503,
    );
    equal(f.calls.includes("report"), false);
  }
});
Deno.test("QR resolution needs exact holder proof and a trusted cryptographic signature, not an anonymous certificate identifier", async () => {
  const f = await fixture(),
    handler = createCertificateDocumentHandler(f.repository, [], {
      ...f.options,
      enabled: false,
      renderer: null,
    });
  const request = (reference: unknown) =>
    new Request(
      "https://service.test/assessment-cloud/certificates/reference/resolve",
      {
        method: "POST",
        headers: { origin: "https://any-holder.test" },
        body: JSON.stringify({ reference }),
      },
    );
  let response = await handler(request(f.reference));
  equal(response.status, 200);
  const data = (await response.json()).data;
  equal(data.certificate, f.signed);
  equal(certificateClaims(data.certificate.payload).recipient, "Recipient");
  equal(response.headers.get("access-control-allow-origin"), "*");
  response = await handler(request({ id }));
  equal(response.status, 422);
  f.record.signature = "A".repeat(86);
  response = await handler(request(f.reference));
  equal(response.status, 422);
});
Deno.test("QR reference encoding is compact, canonical, private-key-free and never accepts caller redirects or extra authority fields", async () => {
  const f = await fixture(), token = encodeCertificateReference(f.reference);
  equal(decodeCertificateReference(token), f.reference);
  equal(token.length < 300, true);
  for (
    const base of [
      "http://exam.example.test/",
      "https://user:password@exam.example.test/",
      "https://exam.example.test/?next=https://evil.test",
      "https://exam.example.test/#anything",
    ]
  ) {
    let rejected = false;
    try {
      certificateVerificationUrl(base, f.reference);
    } catch {
      rejected = true;
    }
    equal(rejected, true);
  }
  for (
    const value of [{ ...f.reference, recipient: "forged" }, {
      ...f.reference,
      signature: "a".repeat(86),
    }]
  ) {
    let rejected = false;
    try {
      certificateReference(value);
    } catch {
      rejected = true;
    }
    equal(rejected, true);
  }
});
Deno.test("document transport binds response MAC to exact request nonce, PDF hash, credential digest and language", async () => {
  const secret = "private-test-secret-".repeat(3),
    f = await fixture(),
    fetcher: typeof fetch = async (_url, init) => {
      const headers = new Headers(init?.headers),
        nonce = headers.get("x-document-nonce")!,
        time = headers.get("x-document-time")!,
        body = new Uint8Array(await new Response(init?.body).arrayBuffer());
      equal(
        headers.get("x-document-signature"),
        await documentMac(
          secret,
          `request.v1\n${time}\n${nonce}\n${await documentDigest(body)}`,
        ),
      );
      const d = f.document,
        signature = await documentMac(
          secret,
          `response.v1\n${nonce}\n${d.renderer_id}\n${d.sha256}\n${d.payload_hash}\nen\n${d.bytes.length}`,
        );
      return new Response(new Uint8Array(d.bytes), {
        headers: {
          "content-type": "application/pdf",
          "content-length": String(d.bytes.length),
          "x-document-renderer": d.renderer_id,
          "x-document-sha256": d.sha256,
          "x-document-payload": d.payload_hash,
          "x-document-signature": signature,
        },
      });
    };
  const transport = createCertificateDocumentTransport(
      "https://documents.example.test/render",
      secret,
      { fetcher },
    ),
    result = await transport.render(
      f.signed,
      "en",
      "https://exam.example.test/",
    );
  equal(result.sha256, f.document.sha256);
  const bad = createCertificateDocumentTransport(
    "https://documents.example.test/render",
    secret,
    {
      fetcher: async (url, init) => {
        const result = await fetcher(url, init);
        result.headers.set("x-document-signature", "f".repeat(64));
        return result;
      },
    },
  );
  let rejected = false;
  try {
    await bad.render(f.signed, "en", "https://exam.example.test/");
  } catch {
    rejected = true;
  }
  equal(rejected, true);
});
