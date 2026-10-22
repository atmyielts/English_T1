import {
  blankItemDraft,
  buildItemDraft,
  editItemDraft,
  restoreItemDraft,
} from "./authoring.ts";
import { MEDIA_RESPONSE_TYPES } from "./media-answer.ts";
const assert = (value: unknown, message = "Assertion failed") => {
  if (!value) throw new Error(message);
};
Deno.test("media answer authoring preserves exact byte policies, chosen formats and capture/upload sources across edits", () => {
  for (const type of MEDIA_RESPONSE_TYPES) {
    const draft = blankItemDraft(type);
    draft.prompt = "Record or upload your answer";
    draft.rubricId = "00000000-0000-4000-8000-000000000001";
    draft.responsePolicy.maxBytes = "1048583";
    draft.responsePolicy.mimes = draft.responsePolicy.mimes.slice(0, 1);
    draft.responsePolicy.sources = type === "file_response"
      ? ["upload"]
      : ["capture", "upload"];
    const first = buildItemDraft(draft),
      edited = buildItemDraft(editItemDraft(first.item, first.key)),
      restored = buildItemDraft(restoreItemDraft(draft));
    assert(
      JSON.stringify(first) === JSON.stringify(edited),
      "Revision changed media answer policy",
    );
    assert(
      JSON.stringify(first) === JSON.stringify(restored),
      "Draft recovery changed media answer policy",
    );
    assert(
      first.item.media_response?.max_bytes === 1048583,
      "Exact byte ceiling was rounded",
    );
    assert(
      Object.keys(first.key).length === 0,
      "Subjective question acquired an automatic key",
    );
  }
});
Deno.test("media answer drafts retain incomplete controls but invalid policies cannot be saved", () => {
  const draft = blankItemDraft("audio_response");
  draft.prompt = "Speak";
  draft.rubricId = "00000000-0000-4000-8000-000000000001";
  for (
    const policy of [
      { ...draft.responsePolicy, maxBytes: "" },
      { ...draft.responsePolicy, maxBytes: "-" },
      { ...draft.responsePolicy, sources: [] },
      { ...draft.responsePolicy, mimes: [] },
    ]
  ) {
    const restored = restoreItemDraft({ ...draft, responsePolicy: policy });
    assert(JSON.stringify(restored.responsePolicy) === JSON.stringify(policy));
    let failed = false;
    try {
      buildItemDraft(restored);
    } catch {
      failed = true;
    }
    assert(
      failed,
      "Incomplete media answer policy became a valid saved question",
    );
  }
  const old = { ...draft } as Record<string, unknown>;
  delete old.responsePolicy;
  const restored = restoreItemDraft(old);
  assert(
    restored.responsePolicy.mimes.includes("audio/ogg"),
    "Legacy draft did not receive type-matched editable defaults",
  );
});
