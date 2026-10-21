import { generateKeyPairSync, sign } from "node:crypto";
import {
  certificateVerificationUrl,
  referenceForCertificate,
} from "../../packages/assessment-core/src/certificate-document.ts";
export async function documentFixture(locale = "en", overrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519"),
    claims = {
      schema_version: "schood.certificate.v1",
      certificate_id: "20000000-0000-4000-8000-000000000001",
      program_id: "20000000-0000-4000-8000-000000000002",
      score_revision_id: "20000000-0000-4000-8000-000000000003",
      issuer: "Schood Test Academy",
      recipient: locale === "ru" ? "Дилшод Каримов" : "Dilshod Karimov",
      achievement: locale === "ru"
        ? "Математическая подготовка"
        : "Mathematics placement",
      criteria:
        "The independently approved released result meets the institution’s 70% threshold.",
      exam: "Placement assessment",
      score: 8,
      maximum_score: 10,
      minimum_percent: 70,
      grading_generation: 2,
      issued_at: "2026-10-20T12:00:00Z",
      expires_at: "2027-10-20T12:00:00Z",
      ...overrides,
    },
    payload = Buffer.from(JSON.stringify(claims)).toString("base64url"),
    certificate = {
      format: "schood.certificate.v1",
      key_id: "sample-key",
      payload,
      signature: sign(
        null,
        Buffer.from("schood.certificate.v1.sample-key." + payload),
        privateKey,
      ).toString("base64url"),
    };
  return {
    claims,
    publicKey,
    input: {
      certificate,
      locale,
      verification_url: certificateVerificationUrl(
        "https://exam.example.test/",
        await referenceForCertificate(certificate),
      ),
    },
  };
}
