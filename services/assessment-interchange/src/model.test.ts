import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, strToU8, zipSync } from "fflate";
import { reviewPackage, textContent } from "./model.ts";
import { CP_NS, QTI_NS } from "./xml.ts";
const pack = (body: string, extra = "") =>
  new Uint8Array(zipSync({
    "imsmanifest.xml": strToU8(
      `<manifest xmlns="${CP_NS}" identifier="bank"><resources><resource identifier="r" type="imsqti_item_xmlv3p0" href="item.xml"><file href="item.xml"/></resource>${extra}</resources></manifest>`,
    ),
    "item.xml": strToU8(
      `<qti-assessment-item xmlns="${QTI_NS}" identifier="q" title="Title" xml:lang="ru" adaptive="false" time-dependent="false">${body}</qti-assessment-item>`,
    ),
  }));
test("review preserves response, outcome, weighted mapping, rich presentation and processing as inert data", async () => {
  const source = pack(
    '<qti-response-declaration identifier="R" cardinality="multiple" base-type="identifier"><qti-correct-response><qti-value>A</qti-value><qti-value>B</qti-value></qti-correct-response><qti-mapping default-value="-1" lower-bound="0"><qti-map-entry map-key="A" mapped-value="0.5"/></qti-mapping></qti-response-declaration><qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float" normal-maximum="7"/><qti-item-body><p lang="ru">Текст <strong>важно</strong></p><qti-choice-interaction response-identifier="R" max-choices="2"><qti-simple-choice identifier="A">First</qti-simple-choice></qti-choice-interaction></qti-item-body><qti-response-processing template="https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/map_response.xml"/>',
  );
  const result = await reviewPackage(source), document = result.documents[0];
  assert.equal(result.runnable, false);
  assert.equal(result.requires_human_review, true);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(document.responses[0].correct, ["A", "B"]);
  assert.equal(document.responses[0].mapping?.name, "qti-mapping");
  assert.equal(document.language, "ru");
  assert.equal(
    document.outcomes[0].source.attributes.find((attr) =>
      attr.name === "normal-maximum"
    )?.value,
    "7",
  );
  assert.ok(textContent(document.source_tree).includes("Текст важно"));
  assert.equal(document.processing.length, 1);
  assert.equal((await reviewPackage(source)).review_hash, result.review_hash);
  assert.notEqual(
    (await reviewPackage(pack("<qti-item-body>changed</qti-item-body>")))
      .review_hash,
    result.review_hash,
  );
});
test("all interaction families remain in the review instead of being skipped or executed", async () => {
  const names = [
    "choice",
    "text-entry",
    "extended-text",
    "gap-match",
    "hotspot",
    "hottext",
    "inline-choice",
    "match",
    "order",
    "graphic-order",
    "associate",
    "graphic-associate",
    "graphic-gap-match",
    "media",
    "position-object",
    "select-point",
    "slider",
    "upload",
    "drawing",
    "end-attempt",
    "custom",
    "portable-custom",
  ];
  const result = await reviewPackage(
    pack(
      '<qti-response-declaration identifier="R" cardinality="single" base-type="string"/><qti-item-body>' +
        names.map((name) =>
          `<qti-${name}-interaction response-identifier="R"/>`
        ).join("") + "</qti-item-body>",
    ),
  );
  assert.equal(result.documents[0].interactions.length, names.length);
  assert.ok(
    result.diagnostics.some((entry) =>
      entry.code === "interaction_requires_mapping"
    ),
  );
  assert.equal(result.runnable, false);
});
test("invalid declarations and undeclared interaction bindings block conversion explicitly", async () => {
  const result = await reviewPackage(
    pack(
      '<qti-response-declaration identifier="R" cardinality="single" base-type="identifier"><qti-correct-response><qti-value>A</qti-value><qti-value>B</qti-value></qti-correct-response></qti-response-declaration><qti-outcome-declaration identifier="R" cardinality="unknown"/><qti-item-body><qti-choice-interaction response-identifier="MISSING"/></qti-item-body>',
    ),
  );
  for (
    const code of [
      "declaration_identifier",
      "declaration_cardinality",
      "correct_cardinality",
      "interaction_response_missing",
    ]
  ) assert.ok(result.diagnostics.some((entry) => entry.code === code), code);
});
test("aliased manifest resources share one semantic document with all identities retained", async () => {
  const result = await reviewPackage(
    pack(
      "<qti-item-body/>",
      '<resource identifier="alias" type="imsqti_item_xmlv3p0" href="item.xml"><file href="item.xml"/></resource>',
    ),
  );
  assert.equal(result.documents.length, 1);
  assert.deepEqual(result.documents[0].resource_ids, ["r", "alias"]);
});
test("package metadata and licensing remain inert review data rather than disappearing", async () => {
  const files = {
    "imsmanifest.xml": strToU8(
      `<manifest xmlns="${CP_NS}" identifier="m"><metadata><license xmlns="urn:example:license">Institution permission required</license></metadata><resources><resource identifier="r" type="imsqti_item_xmlv3p0" href="item.xml"><file href="item.xml"/></resource></resources></manifest>`,
    ),
    "item.xml": strToU8(
      `<qti-assessment-item xmlns="${QTI_NS}" identifier="q" title="Q" adaptive="false"><qti-item-body/></qti-assessment-item>`,
    ),
  };
  const result = await reviewPackage(new Uint8Array(zipSync(files)));
  assert.ok(
    textContent(result.manifest_tree).includes(
      "Institution permission required",
    ),
  );
  assert.equal(result.requires_human_review, true);
});
test("standalone response-processing dependencies are preserved as data without execution or fabricated identifiers", async () => {
  const files = {
    "imsmanifest.xml": strToU8(
      `<manifest xmlns="${CP_NS}" identifier="m"><resources><resource identifier="template" type="imsqti_rptemplate_xmlv3p0" href="processing.xml"><file href="processing.xml"/></resource></resources></manifest>`,
    ),
    "processing.xml": strToU8(
      `<qti-response-processing xmlns="${QTI_NS}"><qti-set-outcome-value identifier="SCORE"><qti-base-value base-type="float">500</qti-base-value></qti-set-outcome-value></qti-response-processing>`,
    ),
  };
  const result = await reviewPackage(new Uint8Array(zipSync(files)));
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.documents[0].identifier, null);
  assert.equal(result.documents[0].resource_ids[0], "template");
  assert.equal(result.documents[0].processing.length, 1);
  assert.ok(textContent(result.documents[0].source_tree).includes("500"));
  assert.equal(result.runnable, false);
});
test("a template without href resolves only a single declared XML file and records that origin", async () => {
  const source = {
    "imsmanifest.xml": strToU8(
      `<manifest xmlns="${CP_NS}" identifier="m"><resources><resource identifier="t" type="imsqti_rptemplate_xmlv3p0"><file href="rule.xml"/></resource></resources></manifest>`,
    ),
    "rule.xml": strToU8(`<qti-response-processing xmlns="${QTI_NS}"/>`),
  };
  const result = await reviewPackage(new Uint8Array(zipSync(source)));
  assert.equal(result.documents.length, 1);
  assert.equal(
    result.inspection.resources[0].entry_origin,
    "single_template_file",
  );
  assert.equal(result.diagnostics[0].code, "template_entry_from_file");
  assert.equal(result.diagnostics[0].severity, "warning");
  source["imsmanifest.xml"] = strToU8(
    strFromU8(source["imsmanifest.xml"]).replace(
      '<file href="rule.xml"/>',
      '<file href="rule.xml"/><file href="other.xml"/>',
    ),
  );
  const ambiguous = await reviewPackage(
    new Uint8Array(zipSync({ ...source, "other.xml": source["rule.xml"] })),
  );
  assert.equal(ambiguous.documents.length, 0);
  assert.ok(
    ambiguous.diagnostics.some((row) => row.code === "resource_entry_missing"),
  );
});
