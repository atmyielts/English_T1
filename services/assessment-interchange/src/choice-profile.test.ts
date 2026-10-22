import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  type Item,
  scoreResponse as grade,
} from "../../../packages/assessment-core/src/mod.ts";
import { buildChoicePackage, draftCandidates } from "./choice-profile.ts";
import { reviewPackage } from "./model.ts";
import { CP_NS, QTI_NS } from "./xml.ts";
const base = (type: Item["type"] = "single_choice") => ({
  schema_version: "assessment.item.v1" as const,
  type,
  locale: "en" as const,
  prompt: 'Which <value> & "choice"? Русский Ўзбек 😀',
  max_score: 7.25,
  options: [{ id: "A", text: "One & <two>" }, { id: "B", text: "Three" }, {
    id: "C",
    text: "Four",
  }],
  tags: [],
});
async function altered(change: (source: string) => string) {
  const built = await buildChoicePackage([{
    id: "source",
    item: base(),
    key: { correct: "A" },
  }]);
  const files = unzipSync(built.bytes);
  files["items/item-1.xml"] = strToU8(
    change(strFromU8(files["items/item-1.xml"])),
  );
  return new Uint8Array(zipSync(files));
}
test("real QTI package round trips choice/multiple/order with identical legal-response scores", async () => {
  const samples = [{
    type: "single_choice",
    correct: "A",
    responses: ["A", "B", "C", null],
  }, {
    type: "multi_choice",
    correct: ["A", "C"],
    responses: [[], ["A"], ["A", "C"], ["A", "B"], ["B", "C"]],
  }, {
    type: "ordering",
    correct: ["B", "A", "C"],
    responses: [["A", "B", "C"], ["B", "A", "C"], ["C", "A", "B"], null],
  }] as const;
  for (const sample of samples) {
    const item = base(sample.type),
      key = {
        correct: sample.correct,
        partial_credit: false,
        case_sensitive: false,
      },
      built = await buildChoicePackage([{ id: "source_version", item, key }]),
      review = await reviewPackage(built.bytes),
      conversion = draftCandidates(review);
    assert.deepEqual(review.diagnostics, []);
    assert.deepEqual(conversion.blocked, []);
    assert.equal(conversion.draft_candidates.length, 1);
    assert.equal(conversion.publishable, false);
    assert.equal(built.source_rows[0].source_id, "source_version");
    const restored = conversion.draft_candidates[0];
    assert.equal(restored.item.prompt, item.prompt);
    assert.equal(restored.item.max_score, item.max_score);
    assert.deepEqual(restored.item.options, item.options);
    for (const response of sample.responses) {
      assert.deepEqual(
        grade(restored.item, restored.key, response),
        grade(item, key as never, response),
      );
    }
  }
});
test("standard template awards one point; descriptive normal maximum never rescales it", async () => {
  const xml =
    `<qti-assessment-item xmlns="${QTI_NS}" identifier="q" title="Q" xml:lang="en" adaptive="false" time-dependent="false"><qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="identifier"><qti-correct-response><qti-value>A</qti-value></qti-correct-response></qti-response-declaration><qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float"/><qti-item-body><qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-prompt>Choose</qti-prompt><qti-simple-choice identifier="A">A</qti-simple-choice><qti-simple-choice identifier="B">B</qti-simple-choice></qti-choice-interaction></qti-item-body><qti-response-processing template="https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct.xml"/></qti-assessment-item>`;
  const pack = (source: string) =>
    new Uint8Array(zipSync({
      "imsmanifest.xml": strToU8(
        `<manifest xmlns="${CP_NS}" identifier="m"><resources><resource identifier="r" type="imsqti_item_xmlv3p0" href="item.xml"><file href="item.xml"/></resource></resources></manifest>`,
      ),
      "item.xml": strToU8(source),
    }));
  assert.equal(
    draftCandidates(await reviewPackage(pack(xml))).draft_candidates[0].item
      .max_score,
    1,
  );
  const conflict = draftCandidates(
    await reviewPackage(
      pack(
        xml.replace(
          'identifier="SCORE"',
          'identifier="SCORE" normal-maximum="10"',
        ),
      ),
    ),
  );
  assert.equal(conflict.draft_candidates.length, 0);
  assert.equal(conflict.blocked[0].code, "score_range_conflict");
});
test("rich, adaptive, composite, constrained, custom-scored and invalid packages cannot become apparently complete banks", async () => {
  const alterations = [
    (s: string) =>
      s.replace("Which &lt;value&gt;", "<strong>Which</strong> &lt;value&gt;"),
    (s: string) => s.replace('adaptive="false"', 'adaptive="true"'),
    (s: string) => s.replace('max-choices="1"', 'max-choices="2"'),
    (s: string) => s.replace("<qti-match>", "<qti-or>"),
    (s: string) =>
      s.replace("<qti-item-body>", "<qti-item-body><div>extra</div>"),
    (s: string) => s.replace('shuffle="false"', 'shuffle="true"'),
    (s: string) => s.replace('xml:lang="en"', 'xml:lang="en-US"'),
    (s: string) =>
      s.replace("<qti-choice-interaction", "<div><qti-choice-interaction")
        .replace(
          "</qti-choice-interaction>",
          "</qti-choice-interaction></div>",
        ),
    (s: string) =>
      s.replace(
        'identifier="RESPONSE" cardinality',
        'identifier="CHANGED" cardinality',
      ),
  ];
  for (const change of alterations) {
    const result = draftCandidates(await reviewPackage(await altered(change)));
    assert.equal(result.draft_candidates.length, 0);
    assert.ok(result.blocked.length);
    assert.equal(result.publishable, false);
  }
});
test("additional score operations, undeclared attributes and foreign prompts are never silently ignored", async () => {
  for (
    const change of [(s: string) =>
      s.replace(
        "</qti-response-processing>",
        '<qti-set-outcome-value identifier="SCORE"><qti-base-value base-type="float">999</qti-base-value></qti-set-outcome-value></qti-response-processing>',
      ), (s: string) =>
      s.replace(
        '<qti-simple-choice identifier="A"',
        '<qti-simple-choice fixed="true" identifier="A"',
      ), (s: string) => s.replace("<p>", '<p xmlns="urn:foreign">')]
  ) {
    const result = draftCandidates(await reviewPackage(await altered(change)));
    assert.equal(result.draft_candidates.length, 0);
    assert.ok(result.blocked.length);
  }
});
test("export escapes XML, preserves astral text and refuses unsafe/unsupported semantics instead of omitting them", async () => {
  for (
    const item of [
      { ...base(), prompt: "bad\0text" },
      { ...base(), tags: ["licensed"] },
      { ...base(), copyright: "Do not omit source licensing" },
      { ...base(), response_ids: ["extra"] },
      { ...base(), type: "numeric" },
      {
        ...base(),
        options: [{ id: "not portable", text: "A" }, { id: "B", text: "B" }],
      },
    ]
  ) {
    await assert.rejects(
      buildChoicePackage([{ id: "s", item, key: { correct: "A" } }]),
    );
  }
  await assert.rejects(
    buildChoicePackage([{
      id: "s",
      item: base("multi_choice"),
      key: { correct: ["A"], partial_credit: true },
    }]),
  );
  await assert.rejects(buildChoicePackage([]));
  const built = await buildChoicePackage([{
    id: "s",
    item: { ...base(), prompt: "x".repeat(199) + "😀 end" },
    key: { correct: "A" },
  }]);
  assert.deepEqual(
    draftCandidates(await reviewPackage(built.bytes)).blocked,
    [],
  );
});
test("same immutable export snapshot produces identical ZIP bytes and provenance on retries", async () => {
  const rows = [{ id: "v1", item: base(), key: { correct: "A" } }],
    first = await buildChoicePackage(rows),
    second = await buildChoicePackage(rows);
  assert.deepEqual(first, second);
  assert.equal(new DataView(first.bytes.buffer).getUint16(10, true), 0);
  assert.equal(new DataView(first.bytes.buffer).getUint16(12, true), 0x21);
});
