import {
  MEDIA_ANSWER_PROTOCOL,
  MEDIA_POLICY_PROTOCOL,
  mediaAnswer,
  mediaAnswerAdmission,
  mediaAnswerPolicy,
} from "./media-answer.ts";
import { scoreResponse, validateItem } from "./mod.ts";
const id = "00000000-0000-4000-8000-000000000001";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}
function fails(run: () => unknown) {
  let rejected = false;
  try {
    run();
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Expected invalid contract to fail");
}
const policy = {
  schema_version: MEDIA_POLICY_PROTOCOL,
  mimes: ["application/pdf"],
  max_bytes: 1048576,
  sources: ["upload"],
};
Deno.test("native audio WebM and MP4 remain audio-only reviewed policies and exact manifests", () => {
  for (const mime of ["audio/webm", "audio/mp4"]) {
    const rules = { ...policy, mimes: [mime], sources: ["capture", "upload"] };
    equal(mediaAnswerPolicy(rules, "audio_response"), rules);
    fails(() => mediaAnswerPolicy(rules, "video_response"));
    fails(() => mediaAnswerPolicy(rules, "file_response"));
    equal(
      mediaAnswerAdmission({
        attempt_id: id,
        item_version_id: id,
        source: "capture",
        upload: {
          filename: "spoken answer",
          mime,
          byte_length: 3,
          parts: [{ sha256: "b".repeat(64), byte_length: 3 }],
        },
      }).upload.mime,
      mime,
    );
  }
});
Deno.test("media answer policies round trip through public items without subjective scoring authority", () => {
  const item = validateItem({
    schema_version: "assessment.item.v1",
    type: "file_response",
    prompt: "Submit your work",
    locale: "en",
    max_score: 10,
    rubric_id: id,
    media_response: { ...policy },
    candidate_id: id,
    key: { score: 10 },
  });
  equal(item.media_response, policy);
  equal("candidate_id" in item, false);
  equal("key" in item, false);
  equal(
    scoreResponse(item, {}, {
      schema_version: MEDIA_ANSWER_PROTOCOL,
      artifact_id: id,
      content_hash: "a".repeat(64),
    }),
    { score: null, max_score: 10, status: "needs_human" },
  );
});
Deno.test("media policies reject mismatched formats, unsafe sizes, duplicate/null entries and unsupported authority", () => {
  for (
    const bad of [
      { ...policy, mimes: ["video/webm"] },
      { ...policy, mimes: [null] },
      { ...policy, mimes: ["application/pdf", "application/pdf"] },
      { ...policy, max_bytes: .5 },
      { ...policy, max_bytes: 2147483649 },
      { ...policy, sources: ["capture"] },
      { ...policy, sources: ["upload", "upload"] },
      { ...policy, score: 10 },
    ]
  ) fails(() => mediaAnswerPolicy(bad, "file_response"));
  mediaAnswerPolicy({
    ...policy,
    mimes: ["audio/ogg"],
    sources: ["capture", "upload"],
  }, "audio_response");
  mediaAnswerPolicy(
    { ...policy, mimes: ["video/webm"], sources: ["capture"] },
    "video_response",
  );
  fails(() =>
    validateItem({
      schema_version: "assessment.item.v1",
      type: "short_answer",
      prompt: "Answer",
      locale: "en",
      max_score: 1,
      media_response: policy,
    })
  );
});
Deno.test("academic journal references reject URLs, caller identity and Proctor recording identifiers", () => {
  const answer = {
    schema_version: MEDIA_ANSWER_PROTOCOL,
    artifact_id: id,
    content_hash: "a".repeat(64),
  };
  equal(mediaAnswer(answer), answer);
  for (
    const bad of [
      { ...answer, url: "https://example.invalid/private" },
      { ...answer, candidate_id: id },
      { ...answer, recording_id: id },
      { ...answer, content_hash: "f".repeat(63) },
      { ...answer, schema_version: "proctor.recording.v1" },
      null,
      "filename.pdf",
    ]
  ) fails(() => mediaAnswer(bad));
});
Deno.test("admission pins exact ordered bytes and strips client-provided storage and readiness", () => {
  const raw = {
    attempt_id: id,
    item_version_id: id,
    source: "upload",
    state: "ready",
    candidate_id: id,
    upload: {
      filename: "answer.pdf",
      mime: "application/pdf",
      byte_length: 3,
      parts: [{ sha256: "a".repeat(64), byte_length: 3, object_key: "forged" }],
    },
  };
  equal(mediaAnswerAdmission(raw), {
    attempt_id: id,
    item_version_id: id,
    source: "upload",
    upload: {
      filename: "answer.pdf",
      mime: "application/pdf",
      byte_length: 3,
      parts: [{ sha256: "a".repeat(64), byte_length: 3 }],
    },
  });
  fails(() => mediaAnswerAdmission({ ...raw, source: "proctor" }));
  fails(() =>
    mediaAnswerAdmission({ ...raw, upload: { ...raw.upload, parts: [] } })
  );
});
