import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFDocument, PDFString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import qrcode from "qrcode-generator";
import {
  certificateClaims,
  certificateEnvelope,
} from "../../../packages/assessment-core/src/certificates.ts";
import {
  certificateLocale,
  decodeCertificateReference,
  referenceForCertificate,
} from "../../../packages/assessment-core/src/certificate-document.ts";
const assets = new URL(
  "../../../packages/service-design/assets/",
  import.meta.url,
);
const loaded = Promise.all([
  readFile(
    new URL("../assets/Certificate-Manrope-Regular.ttf", import.meta.url),
  ),
  readFile(new URL("../assets/Certificate-Sora-Semibold.ttf", import.meta.url)),
  readFile(new URL("Manrope-OFL.txt", assets)),
  readFile(new URL("Sora-OFL.txt", assets)),
  readFile(new URL("../assets/Certificate-Noto-Regular.ttf", import.meta.url)),
  readFile(new URL("../assets/NotoSans-OFL.txt", import.meta.url)),
]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const paper = rgb(246 / 255, 241 / 255, 232 / 255),
  ink = rgb(15 / 255, 23 / 255, 42 / 255),
  muted = rgb(75 / 255, 85 / 255, 99 / 255),
  white = rgb(1, 1, 1);
const copy = {
  en: {
    title: "Certificate of achievement",
    awarded: "Awarded to",
    score: "Released score",
    issued: "Issued",
    expires: "Expires",
    noExpiry: "No scheduled expiry",
    verify: "Scan to verify the signed claim and current status",
    details: "Certificate record and award criteria",
    criteria: "Award criteria",
    issuer: "Issuing institution",
    exam: "Assessment",
    threshold: "Required percentage",
    reference: "Certificate reference",
    replaces: "Replaces certificate",
    notice:
      "The attached JSON credential is cryptographically signed. This PDF file is not digitally signed. Check current status before relying on this award.",
    continued: "Certificate record - continued",
  },
  uz: {
    title: "Muvaffaqiyat sertifikati",
    awarded: "Sertifikat oluvchi",
    score: "E’lon qilingan natija",
    issued: "Berilgan sana",
    expires: "Amal qilish muddati",
    noExpiry: "Amal qilish muddati belgilanmagan",
    verify: "Imzolangan ma’lumot va joriy holatni tekshirish",
    details: "Sertifikat yozuvi va taqdirlash mezonlari",
    criteria: "Taqdirlash mezonlari",
    issuer: "Sertifikat bergan muassasa",
    exam: "Baholash",
    threshold: "Talab etilgan foiz",
    reference: "Sertifikat raqami",
    replaces: "O‘rniga berilgan sertifikat",
    notice:
      "Biriktirilgan JSON ma’lumoti kriptografik imzolangan. PDF faylning o‘zi raqamli imzolanmagan. Sertifikatning joriy holatini tekshiring.",
    continued: "Sertifikat yozuvi - davomi",
  },
  ru: {
    title: "Сертификат достижения",
    awarded: "Получатель",
    score: "Опубликованный результат",
    issued: "Дата выдачи",
    expires: "Действителен до",
    noExpiry: "Срок действия не установлен",
    verify: "Проверить подписанные данные и текущий статус",
    details: "Запись сертификата и критерии выдачи",
    criteria: "Критерии выдачи",
    issuer: "Выдавшая организация",
    exam: "Оценивание",
    threshold: "Требуемый процент",
    reference: "Номер сертификата",
    replaces: "Заменяет сертификат",
    notice:
      "Вложенный JSON-документ криптографически подписан. Сам PDF-файл не имеет цифровой подписи. Проверьте текущий статус сертификата.",
    continued: "Запись сертификата - продолжение",
  },
};
function lines(text, font, size, width) {
  const result = [];
  for (const paragraph of String(text).replaceAll("\r", "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        result.push(line);
        line = "";
      }
      let part = "";
      for (const character of word) {
        if (part && font.widthOfTextAtSize(part + character, size) > width) {
          result.push(part);
          part = "";
        }
        part += character;
      }
      line = part;
    }
    result.push(line);
  }
  return result;
}
function fitted(text, font, width, maxHeight, start, min) {
  for (let size = start; size >= min; size--) {
    const value = lines(text, font, size, width);
    if (value.length * size * 1.3 <= maxHeight) return { size, lines: value };
  }
  throw new Error("document_layout_overflow");
}
function drawBlock(
  page,
  text,
  font,
  x,
  y,
  width,
  maxHeight,
  start,
  min = start,
  color = ink,
) {
  const fit = fitted(text, font, width, maxHeight, start, min);
  for (const line of fit.lines) {
    page.drawText(line, { x, y, size: fit.size, font, color });
    y -= fit.size * 1.3;
  }
  return y;
}
export async function renderCertificate(input) {
  const certificate = certificateEnvelope(input.certificate),
    claims = certificateClaims(certificate.payload),
    locale = certificateLocale(input.locale),
    words = copy[locale],
    url = new URL(input.verification_url),
    reference = await referenceForCertificate(certificate);
  if (
    url.protocol !== "https:" &&
      !(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        url.protocol === "http:") ||
    url.username || url.password || url.toString().length > 1400 ||
    url.search !== "?verify_certificate=1" ||
    !url.hash.startsWith("#certificate=")
  ) throw new Error("invalid_verification_url");
  if (
    JSON.stringify(
      decodeCertificateReference(url.hash.slice("#certificate=".length)),
    ) !== JSON.stringify(reference)
  ) throw new Error("verification_reference_mismatch");
  const [
      bodyBytes,
      headingBytes,
      bodyLicense,
      headingLicense,
      fallbackBytes,
      fallbackLicense,
    ] = await loaded,
    brandCoverage = fontkit.create(bodyBytes),
    fallbackCoverage = fontkit.create(fallbackBytes),
    headingCoverage = fontkit.create(headingBytes);
  const texts = [
    ...Object.values(words),
    ...Object.values(claims).filter((value) => typeof value === "string"),
  ];
  const useFallback = texts.some((text) =>
      [...text].some((character) =>
        character !== "\n" && character !== "\t" &&
        !brandCoverage.hasGlyphForCodePoint(character.codePointAt(0))
      )
    ),
    bodyCoverage = useFallback ? fallbackCoverage : brandCoverage;
  for (const text of texts) {
    if (
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u
        .test(text)
    ) throw new Error("unsupported_document_text");
    for (const character of text) {
      if (
        character !== "\n" && character !== "\t" &&
        !bodyCoverage.hasGlyphForCodePoint(character.codePointAt(0))
      ) throw new Error("unsupported_document_glyph");
    }
  }
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  const body = await doc.embedFont(useFallback ? fallbackBytes : bodyBytes, {
      // Extended-Cyrillic composite glyphs must retain their complete font;
      // subsetting lost visible outlines despite correct text extraction.
      subset: !useFallback,
    }),
    heading = await doc.embedFont(headingBytes, { subset: true }),
    display = (text) =>
      [...text].every((character) =>
          headingCoverage.hasGlyphForCodePoint(character.codePointAt(0))
        )
        ? heading
        : body;
  const issued = new Date(claims.issued_at);
  doc.setTitle(words.title + " - " + claims.recipient);
  doc.setAuthor(claims.issuer);
  doc.setCreator("Schood Assessment Cloud");
  doc.setProducer("Schood certificate document renderer");
  doc.setCreationDate(issued);
  doc.setModificationDate(issued);
  const page = doc.addPage([842, 595]);
  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: paper });
  page.drawRectangle({
    x: 32,
    y: 32,
    width: 778,
    height: 531,
    color: white,
    borderColor: ink,
    borderWidth: .8,
  });
  page.drawText("Schood", {
    x: 56,
    y: 525,
    size: 19,
    font: heading,
    color: ink,
  });
  page.drawText("Assessment Cloud", {
    x: 56,
    y: 508,
    size: 9,
    font: body,
    color: muted,
  });
  drawBlock(page, claims.issuer, body, 405, 530, 380, 42, 12, 10);
  page.drawLine({
    start: { x: 56, y: 485 },
    end: { x: 786, y: 485 },
    color: ink,
    thickness: .6,
  });
  drawBlock(page, words.title, display(words.title), 56, 447, 530, 62, 25, 19);
  page.drawText(words.awarded, {
    x: 56,
    y: 385,
    size: 10,
    font: body,
    color: muted,
  });
  drawBlock(
    page,
    claims.recipient,
    display(claims.recipient),
    56,
    350,
    530,
    78,
    28,
    15,
  );
  drawBlock(
    page,
    claims.achievement,
    display(claims.achievement),
    56,
    252,
    530,
    62,
    20,
    12,
  );
  drawBlock(page, claims.exam, body, 56, 168, 530, 30, 11, 9);
  page.drawText(
    words.score + ": " + claims.score + " / " + claims.maximum_score,
    { x: 56, y: 123, size: 12, font: body, color: ink },
  );
  page.drawText(words.issued + ": " + issued.toISOString().slice(0, 10), {
    x: 56,
    y: 101,
    size: 9,
    font: body,
    color: muted,
  });
  drawBlock(
    page,
    claims.expires_at
      ? words.expires + ": " +
        new Date(claims.expires_at).toISOString().slice(0, 10)
      : words.noExpiry,
    body,
    300,
    101,
    295,
    26,
    9,
    8,
    muted,
  );
  const qr = qrcode(0, "M");
  qr.addData(url.toString(), "Byte");
  qr.make();
  const modules = qr.getModuleCount(),
    unit = 156 / (modules + 8),
    left = 622,
    bottom = 284;
  page.drawRectangle({
    x: left,
    y: bottom,
    width: 156,
    height: 156,
    color: white,
  });
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) {
        page.drawRectangle({
          x: left + (col + 4) * unit,
          y: bottom + (modules - row + 3) * unit,
          width: unit + .005,
          height: unit + .005,
          color: ink,
        });
      }
    }
  }
  drawBlock(page, words.verify, body, 622, 264, 156, 43, 9, 8);
  drawBlock(page, claims.certificate_id, body, 622, 202, 156, 32, 7, 7, muted);
  drawBlock(page, words.notice, body, 56, 69, 730, 30, 8, 7, muted);
  const link = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [left, bottom, left + 156, bottom + 156],
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url.toString()) },
  });
  page.node.addAnnot(doc.context.register(link));
  let details, y;
  const nextPage = () => {
    details = doc.addPage([842, 595]);
    details.drawRectangle({
      x: 0,
      y: 0,
      width: 842,
      height: 595,
      color: paper,
    });
    details.drawText(
      doc.getPageCount() === 2 ? words.details : words.continued,
      { x: 48, y: 540, size: 18, font: body, color: ink },
    );
    y = 501;
  };
  nextPage();
  const paragraph = (title, value) => {
    const wrapped = lines(String(value), body, 11, 746);
    // Keep labels with their first values, without orphaning a short final
    // digest onto a new page when the complete replacement record fits.
    if (y - 18 - Math.min(wrapped.length, 2) * 15 < 80) nextPage();
    details.drawText(title, { x: 48, y, size: 10, font: body, color: muted });
    y -= 18;
    for (const line of wrapped) {
      if (y < 80) nextPage();
      details.drawText(line, { x: 48, y, size: 11, font: body, color: ink });
      y -= 15;
    }
    y -= 10;
  };
  paragraph(words.issuer, claims.issuer);
  paragraph(words.awarded, claims.recipient);
  paragraph(words.exam, claims.exam);
  paragraph(words.title, claims.achievement);
  paragraph(words.criteria, claims.criteria);
  paragraph(words.threshold, String(claims.minimum_percent) + "%");
  paragraph(words.reference, claims.certificate_id);
  if (claims.replaces_certificate_id) {
    paragraph(words.replaces, claims.replaces_certificate_id);
  }
  paragraph("SHA-256", reference.payload_hash);
  for (let i = 1; i < doc.getPageCount(); i++) {
    const p = doc.getPage(i);
    drawBlock(p, words.notice, body, 48, 46, 700, 25, 7, 7, muted);
    p.drawText(String(i + 1) + " / " + doc.getPageCount(), {
      x: 754,
      y: 29,
      size: 8,
      font: body,
      color: muted,
    });
  }
  await doc.attach(
    Buffer.from(JSON.stringify(certificate)),
    `schood-certificate-${claims.certificate_id}.json`,
    {
      mimeType: "application/json",
      description:
        "Cryptographically signed original credential. Verify independently using trusted issuer keys.",
      creationDate: issued,
      modificationDate: issued,
    },
  );
  await doc.attach(bodyLicense, "Manrope-OFL.txt", {
    mimeType: "text/plain",
    creationDate: issued,
    modificationDate: issued,
  });
  await doc.attach(headingLicense, "Sora-OFL.txt", {
    mimeType: "text/plain",
    creationDate: issued,
    modificationDate: issued,
  });
  if (useFallback) {
    await doc.attach(fallbackLicense, "NotoSans-OFL.txt", {
      mimeType: "text/plain",
      creationDate: issued,
      modificationDate: issued,
    });
  }
  const bytes = await doc.save({ useObjectStreams: false });
  if (bytes.byteLength > 3000000 || doc.getPageCount() > 8) {
    throw new Error("document_limit_exceeded");
  }
  const build = Buffer.concat([
    await readFile(new URL("./renderer.mjs", import.meta.url)),
    await readFile(new URL("../package-lock.json", import.meta.url)),
    await readFile(
      new URL(
        "../../../packages/assessment-core/src/certificates.ts",
        import.meta.url,
      ),
    ),
    await readFile(
      new URL(
        "../../../packages/assessment-core/src/certificate-document.ts",
        import.meta.url,
      ),
    ),
    ...await loaded,
    Buffer.from(url.origin + url.pathname + url.search),
    Buffer.from(
      JSON.stringify({
        node: process.versions.node,
        v8: process.versions.v8,
        zlib: process.versions.zlib,
      }),
    ),
  ]);
  return {
    bytes,
    renderer_id: hash(build),
    sha256: hash(bytes),
    payload_hash: reference.payload_hash,
    locale,
    page_count: doc.getPageCount(),
  };
}
