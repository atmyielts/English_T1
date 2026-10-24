import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  cleanDisplayName,
  formatCertificateCode,
  generateCertificateCode,
  latestMeasurement,
  measurementMethod,
  normalizeCertificateCode,
  publicCertificate,
  testResultRecord,
} from "./english-certificate.ts";
import { readLevelHistory } from "./english-levels.ts";

Deno.test("certificate codes are 12 Crockford base32 characters and round-trip through what people type", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 200; index += 1) {
    const code = generateCertificateCode();
    assertEquals(code.length, CODE_LENGTH);
    for (const char of code) assert(CODE_ALPHABET.includes(char), `unexpected ${char}`);
    assertEquals(normalizeCertificateCode(code), code);
    assertEquals(normalizeCertificateCode(formatCertificateCode(code).toLowerCase()), code);
    seen.add(code);
  }
  assertEquals(seen.size, 200);
  // Every byte value maps into the alphabet.
  assertEquals(generateCertificateCode((bytes) => bytes.fill(255)), "Z".repeat(12));
  assertEquals(formatCertificateCode("ABCDEFGHJKMN"), "ABCD-EFGH-JKMN");
});

Deno.test("code normalisation forgives look-alikes and rejects anything else", () => {
  assertEquals(normalizeCertificateCode(" abcd-efgh-jkmo "), "ABCDEFGHJKM0");
  assertEquals(normalizeCertificateCode("ABCDEFGHJKMI"), "ABCDEFGHJKM1");
  assertEquals(normalizeCertificateCode("ABCDEFGHJKM"), null);
  assertEquals(normalizeCertificateCode("ABCDEFGHJKMNP"), null);
  assertEquals(normalizeCertificateCode("ABCDEFGHJKMU"), null);
  assertEquals(normalizeCertificateCode("ABCD'EFGH;--"), null);
  assertEquals(normalizeCertificateCode(42), null);
});

Deno.test("display names are cleaned, bounded and never empty", () => {
  assertEquals(cleanDisplayName("  Aziza   Karimova \n"), "Aziza Karimova");
  assertEquals(cleanDisplayName("Ойбек <script>"), "Ойбек script");
  assertEquals(cleanDisplayName("Oʻgʻiloy​"), "Oʻgʻiloy");
  assertEquals(cleanDisplayName("A"), null);
  assertEquals(cleanDisplayName("   "), null);
  assertEquals(cleanDisplayName(null), null);
  assertEquals([...cleanDisplayName("x".repeat(200))!].length, 60);
});

Deno.test("a placement counts as measured only when it matches the server's recent test result", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  const stored = testResultRecord("b1", {
    reading: { level: "B2", evidence: "..." },
    listening: { level: "B1" },
    writing: "a2",
    grammar: { level: "B1" },
  }, new Date("2026-10-20T09:50:00Z"));
  assertEquals(stored, {
    at: "2026-10-20T09:50:00.000Z",
    overall: "B1",
    per_skill: { reading: "B2", listening: "B1", writing: "A2", grammar: "B1" },
  });
  const saved = { overall: "B1", per_skill: { reading: { level: "B2" }, listening: { level: "B1" }, writing: { level: "A2" }, grammar: { level: "B1" } } };
  const flat = (perSkill: Record<string, { level: string }>) =>
    Object.fromEntries(Object.entries(perSkill).map(([skill, entry]) => [skill, entry.level]));
  assertEquals(measurementMethod({ overall: "B1", per_skill: flat(saved.per_skill) }, stored, now), "test");
  // A different level, a self-chosen level, an old result or none at all.
  assertEquals(measurementMethod({ overall: "C1", per_skill: flat(saved.per_skill) }, stored, now), "self");
  assertEquals(measurementMethod({ overall: "B1", per_skill: { ...flat(saved.per_skill), reading: "C2" } }, stored, now), "self");
  assertEquals(measurementMethod({ overall: "B1", per_skill: {} }, stored, now), "self");
  assertEquals(measurementMethod({ overall: "B1", per_skill: flat(saved.per_skill) }, stored, new Date("2026-10-21T10:00:00Z")), "self");
  assertEquals(measurementMethod({ overall: "B1", per_skill: flat(saved.per_skill) }, null, now), "self");
  assertEquals(testResultRecord("Z9", {}), null);
});

Deno.test("certificates come from the latest tested placement or check, never from a chosen level or a move-up", () => {
  const placement = { at: "2026-09-01T10:00:00.000Z", source: "placement", overall: "A2", per_skill: { reading: "A2", writing: "A2", listening: "A2", grammar: "A2" } };
  const check = { at: "2026-10-01T10:00:00.000Z", source: "check", method: "test", overall: "B1", per_skill: { reading: "B1", writing: "A2", listening: "B1", grammar: "B1", speaking: "B2" } };
  const levelUp = { at: "2026-10-05T10:00:00.000Z", source: "level_up", overall: "B1", per_skill: { reading: "B2" } };

  assertEquals(latestMeasurement(readLevelHistory({ level_history: [placement, check, levelUp] })), {
    status: "ok",
    measurement: {
      measured_by: "check",
      measured_at: "2026-10-01T10:00:00.000Z",
      overall: "B1",
      // Speaking was never tested, so it is not on the certificate.
      per_skill: { reading: "B1", listening: "B1", writing: "A2", grammar: "B1" },
    },
  });
  // An older placement with per-skill levels came from the test.
  assertEquals(latestMeasurement(readLevelHistory({ level_history: [placement] })).status, "ok");
  // A self-chosen check replaces the earlier test: no certificate until the next test.
  const selfCheck = { ...check, at: "2026-10-10T10:00:00.000Z", method: "self" };
  assertEquals(latestMeasurement(readLevelHistory({ level_history: [placement, check, selfCheck] })), {
    status: "self_assessed",
    at: "2026-10-10T10:00:00.000Z",
  });
  // An older self-chosen placement had no per-skill levels; an older check is not trusted.
  assertEquals(latestMeasurement(readLevelHistory({ level_history: [{ ...placement, per_skill: {} }] })).status, "self_assessed");
  assertEquals(latestMeasurement(readLevelHistory({ level_history: [placement, { ...check, method: undefined }] })).status, "self_assessed");
  assertEquals(latestMeasurement([]), { status: "none" });
});

Deno.test("the public payload has only what is printed on the certificate", () => {
  const row = {
    id: "8a3b5d8e-0000-4000-8000-000000000001",
    code: "ABCDEFGHJKMN",
    user_id: "8a3b5d8e-0000-4000-8000-000000000002",
    display_name: "Aziza K.",
    overall: "B1",
    per_skill: { reading: "B1", listening: "A2", hacked: "C2", writing: "nope" },
    measured_by: "check",
    measured_at: "2026-10-01T10:00:00.000Z",
    activities_count: 37,
    issued_at: "2026-10-02T10:00:00.000Z",
    revoked_at: null,
  };
  const out = publicCertificate(row);
  assertEquals(out, {
    code: "ABCDEFGHJKMN",
    display_name: "Aziza K.",
    overall: "B1",
    per_skill: { reading: "B1", listening: "A2" },
    measured_by: "check",
    measured_at: "2026-10-01T10:00:00.000Z",
    activities_count: 37,
    issued_at: "2026-10-02T10:00:00.000Z",
  });
  assert(!JSON.stringify(out).includes(row.user_id));
  assertEquals(publicCertificate({ ...row, revoked_at: "2026-10-03T10:00:00.000Z" }), null);
  assertEquals(publicCertificate({ ...row, overall: "X" }), null);
  assertEquals(publicCertificate(null), null);
});
