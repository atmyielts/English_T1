import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createDocumentServer } from "./src/server.mjs";
import { documentFixture } from "./fixtures.mjs";
import { createCertificateDocumentTransport } from "../../supabase/functions/assessment-cloud/certificate-document-transport.ts";
const secret = "local-document-transport-".repeat(3);
async function listen(options = {}) {
  const service = createDocumentServer({ secret, ...options });
  await new Promise((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve)
  );
  return {
    ...service,
    url: "http://127.0.0.1:" + service.server.address().port + "/render",
  };
}
function signed(body, nonce = randomUUID(), time = String(Date.now())) {
  return {
    "content-type": "application/json",
    "x-document-time": time,
    "x-document-nonce": nonce,
    "x-document-signature": createHmac("sha256", secret).update(
      `request.v1\n${time}\n${nonce}\n${
        createHash("sha256").update(body).digest("hex")
      }`,
    ).digest("hex"),
  };
}
test("production private HTTP transport and isolated native renderer return authenticated PDF bytes and exact receipt", async () => {
  const service = await listen();
  try {
    const fixture = await documentFixture("ru"),
      result = await createCertificateDocumentTransport(service.url, secret, {
        allowLocalhost: true,
      }).render(
        fixture.input.certificate,
        "ru",
        fixture.input.verification_url,
      );
    assert.equal(Buffer.from(result.bytes).subarray(0, 5).toString(), "%PDF-");
    assert.equal(
      result.sha256,
      createHash("sha256").update(result.bytes).digest("hex"),
    );
    assert.equal(
      result.payload_hash,
      createHash("sha256").update(
        Buffer.from(fixture.input.certificate.payload, "base64url"),
      ).digest("hex"),
    );
    assert.equal(result.locale, "ru");
  } finally {
    await service.close();
  }
});
test("private renderer rejects missing/forged/stale transport, duplicate nonce and oversized input", async () => {
  const service = await listen();
  try {
    const fixture = await documentFixture(),
      body = JSON.stringify(fixture.input);
    let response = await fetch(service.url, { method: "POST", body });
    assert.equal(response.status, 403);
    await response.arrayBuffer();
    response = await fetch(service.url, {
      method: "POST",
      headers: { ...signed(body), "x-document-signature": "f".repeat(64) },
      body,
    });
    assert.equal(response.status, 403);
    await response.arrayBuffer();
    response = await fetch(service.url, {
      method: "POST",
      headers: signed(body, randomUUID(), String(Date.now() - 60000)),
      body,
    });
    assert.equal(response.status, 403);
    await response.arrayBuffer();
    const headers = signed(body);
    response = await fetch(service.url, { method: "POST", headers, body });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    response = await fetch(service.url, { method: "POST", headers, body });
    assert.equal(response.status, 409);
    await response.arrayBuffer();
    const large = JSON.stringify({ padding: "x".repeat(33000) });
    response = await fetch(service.url, {
      method: "POST",
      headers: signed(large),
      body: large,
    });
    assert.equal(response.status, 413);
    await response.arrayBuffer();
  } finally {
    await service.close();
  }
});
test("renderer has bounded concurrent admission and terminates deadline-exceeding workers", async () => {
  const service = await listen({ maxWorkers: 1 });
  try {
    const fixture = await documentFixture(),
      body = JSON.stringify(fixture.input),
      responses = await Promise.all(
        [1, 2, 3].map(() =>
          fetch(service.url, { method: "POST", headers: signed(body), body })
        ),
      );
    assert.equal(
      responses.filter((response) => response.status === 200).length,
      1,
    );
    assert.equal(
      responses.filter((response) => response.status === 503).length,
      2,
    );
    await Promise.all(responses.map((response) => response.arrayBuffer()));
  } finally {
    await service.close();
  }
  const deadline = await listen({ deadlineMs: 1 });
  try {
    const fixture = await documentFixture(),
      body = JSON.stringify(fixture.input),
      response = await fetch(deadline.url, {
        method: "POST",
        headers: signed(body),
        body,
      });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      code: "document_render_unavailable",
    });
  } finally {
    await deadline.close();
  }
});
