import test from "node:test";
import assert from "node:assert/strict";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from "pdf-lib";
import { createHash, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { renderCertificate } from "./src/renderer.mjs";
import { documentFixture } from "./fixtures.mjs";
test("certificate PDF is deterministic, embeds mother fonts and original independently verifiable signed credential", async () => {
  const fixture = await documentFixture(),
    one = await renderCertificate(fixture.input),
    two = await renderCertificate(fixture.input);
  assert.equal(one.sha256, two.sha256);
  assert.equal(one.renderer_id, two.renderer_id);
  assert.equal(
    one.sha256,
    createHash("sha256").update(one.bytes).digest("hex"),
  );
  assert.equal(one.page_count, 2);
  assert.ok(one.bytes.byteLength < 3000000);
  const pdf = await PDFDocument.load(one.bytes),
    names = pdf.catalog.lookup(PDFName.of("Names"), PDFDict).lookup(
      PDFName.of("EmbeddedFiles"),
      PDFDict,
    ).lookup(PDFName.of("Names"), PDFArray);
  assert.equal(names.size(), 6);
  const file = names.lookup(1, PDFDict),
    stream = file.lookup(PDFName.of("EF"), PDFDict).lookup(
      PDFName.of("F"),
      PDFRawStream,
    ),
    attachment = JSON.parse(
      Buffer.from(decodePDFRawStream(stream).decode()).toString("utf8"),
    );
  assert.deepEqual(attachment, fixture.input.certificate);
  assert.equal(
    verify(
      null,
      Buffer.from(
        `${attachment.format}.${attachment.key_id}.${attachment.payload}`,
      ),
      fixture.publicKey,
      Buffer.from(attachment.signature, "base64url"),
    ),
    true,
  );
  assert.equal(
    pdf.getCreationDate().toISOString(),
    fixture.claims.issued_at.replace("Z", ".000Z"),
  );
  assert.equal(pdf.catalog.has(PDFName.of("OpenAction")), false);
  const links = pdf.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray);
  assert.equal(links.size(), 1);
  assert.equal(
    links.lookup(0, PDFDict).lookup(PDFName.of("A"), PDFDict).get(
      PDFName.of("URI"),
    ).decodeText(),
    fixture.input.verification_url,
  );
});
test("all three document languages and long Unicode names/criteria render without silent truncation", async () => {
  for (const locale of ["en", "uz", "ru"]) {
    const fixture = await documentFixture(locale, {
      recipient: "Жаҳонгир O‘ktamov ".repeat(9).trim(),
      issuer: "O‘zbekiston ta’lim markazi",
      achievement: "Развёрнутая проверка математических знаний и навыков "
        .repeat(3).trim(),
      criteria:
        "Мезон: must meet the independently reviewed institutional threshold. "
          .repeat(27).trim(),
    });
    const result = await renderCertificate(fixture.input);
    assert.ok(result.page_count >= 2 && result.page_count <= 8);
  }
});
test("extended-Cyrillic PDFs retain the full licensed static fallback font, not broken composite subsets", async () => {
  const fixture = await documentFixture("ru", {
      recipient: "Жаҳонгир O‘ktamov",
    }),
    result = await renderCertificate(fixture.input),
    pdf = await PDFDocument.load(result.bytes),
    fallback = await readFile(
      new URL("./assets/Certificate-Noto-Regular.ttf", import.meta.url),
    ),
    expected = createHash("sha256").update(fallback).digest("hex");
  const embedded = pdf.context.enumerateIndirectObjects().some(([, value]) =>
    value instanceof PDFRawStream &&
    createHash("sha256").update(decodePDFRawStream(value).decode()).digest(
        "hex",
      ) === expected
  );
  assert.equal(
    embedded,
    true,
    "The exact complete fallback font must be embedded to preserve composite outlines",
  );
  assert.ok(result.bytes.byteLength < 3000000);
});
test("renderer rejects reference substitution, arbitrary URL targets, unsupported glyphs and controls", async () => {
  const fixture = await documentFixture();
  for (
    const verification_url of [
      "file:///etc/passwd",
      "https://evil.test/#certificate=x",
      fixture.input.verification_url.replace("certificate=", "wrong="),
    ]
  ) {
    await assert.rejects(
      renderCertificate({ ...fixture.input, verification_url }),
    );
  }
  for (const recipient of ["Name\u202eabc", "Name\u0000abc", "Example 🧪"]) {
    const sample = await documentFixture("en", { recipient });
    await assert.rejects(renderCertificate(sample.input));
  }
});
