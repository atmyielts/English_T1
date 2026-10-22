import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import jsQR from "jsqr";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  files = process.argv.slice(2),
  python = process.env.ASSESSMENT_DOCUMENT_PYTHON ??
    (process.platform === "win32" ? "python" : "python3");
for (
  const file of files.length ? files : [
    "output/pdf/schood-certificate-en.pdf",
    "output/pdf/schood-certificate-uz.pdf",
    "output/pdf/schood-certificate-ru.pdf",
    "output/pdf/schood-certificate-long-ru.pdf",
    "output/pdf/schood-certificate-replacement-en.pdf",
  ]
) {
  const absolute = path.resolve(root, file),
    metadata = JSON.parse(
      execFileSync(python, [
        fileURLToPath(new URL("./verify_pdf.py", import.meta.url)),
        absolute,
      ], { encoding: "utf8", timeout: 40000, maxBuffer: 100000 }),
    ),
    png = PNG.sync.read(readFileSync(metadata.first_image)),
    qr = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, {
      inversionAttempts: "dontInvert",
    });
  assert.ok(qr, "No QR decoded from actual rasterized PDF");
  assert.ok(
    qr.data === metadata.url,
    "Raster QR and PDF verification link differ",
  );
  const url = new URL(qr.data),
    parts = url.hash.slice("#certificate=".length).split(".");
  assert.equal(url.search, "?verify_certificate=1");
  assert.equal(parts[0], "r1");
  assert.equal(parts[1], metadata.claims.certificate_id);
  assert.equal(parts[2], metadata.certificate.key_id);
  assert.equal(
    parts[3],
    createHash("sha256").update(
      Buffer.from(metadata.certificate.payload, "base64url"),
    ).digest("hex"),
  );
  assert.ok(
    parts[4] === metadata.certificate.signature,
    "Raster reference differs from signed credential",
  );
  console.log(JSON.stringify({
    file: path.basename(file),
    pages: metadata.pages,
    qr_decoded: true,
    full_text_verified: true,
    embedded_credential_matches_download: metadata.matches_download,
    sha256: metadata.sha256,
  }));
}
