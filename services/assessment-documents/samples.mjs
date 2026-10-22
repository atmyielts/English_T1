import { mkdir, writeFile } from "node:fs/promises";
import { renderCertificate } from "./src/renderer.mjs";
import { documentFixture } from "./fixtures.mjs";
const output = new URL("../../output/pdf/", import.meta.url);
await mkdir(output, { recursive: true });
for (
  const sample of [
    { locale: "en" },
    { locale: "uz" },
    { locale: "ru" },
    {
      locale: "en",
      suffix: "replacement-en",
      claims: {
        replaces_certificate_id: "20000000-0000-4000-8000-000000000004",
      },
    },
    {
      locale: "ru",
      suffix: "long-ru",
      claims: {
        recipient: "Жаҳонгир O‘ktamov ".repeat(9).trim(),
        issuer: "O‘zbekiston ta’lim markazi",
        achievement: "Развёрнутая проверка математических знаний и навыков "
          .repeat(3).trim(),
        criteria:
          "Мезон: must meet the independently reviewed institutional threshold. "
            .repeat(27).trim(),
      },
    },
  ]
) {
  const { locale } = sample,
    fixture = await documentFixture(locale, sample.claims),
    result = await renderCertificate(fixture.input);
  await writeFile(
    new URL(`schood-certificate-${sample.suffix ?? locale}.pdf`, output),
    result.bytes,
  );
  console.log(
    JSON.stringify({
      locale,
      bytes: result.bytes.byteLength,
      pages: result.page_count,
      sha256: result.sha256,
    }),
  );
}
