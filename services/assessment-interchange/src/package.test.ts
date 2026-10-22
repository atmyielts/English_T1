import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { inspectPackage } from "./package.ts";
import { CP_NS, QTI_NS } from "./xml.ts";
const item = (
  body =
    '<qti-item-body><qti-choice-interaction response-identifier="R"/></qti-item-body>',
  id = "question",
) =>
  `<qti-assessment-item xmlns="${QTI_NS}" identifier="${id}" title="Question" adaptive="false" time-dependent="false">${body}</qti-assessment-item>`;
const resource = (id = "r", path = "items/a.xml", extra = "") =>
  `<resource identifier="${id}" type="imsqti_item_xmlv3p0" href="${path}"><file href="${path}"/>${extra}</resource>`;
const pack = (resources: string, files: Record<string, string> = {}) =>
  new Uint8Array(
    zipSync(
      Object.fromEntries(
        Object.entries({
          "imsmanifest.xml":
            `<manifest xmlns="${CP_NS}" identifier="bank"><resources>${resources}</resources></manifest>`,
          ...files,
        }).map(([path, data]) => [path, strToU8(data)]),
      ),
    ),
  );
test("package inspection preserves provenance, supported roots and complete resource graph", async () => {
  const result = await inspectPackage(
    pack(
      resource("r", "items/a.xml", '<dependency identifierref="media"/>') +
        '<resource identifier="media" type="webcontent"><file href="media/a.svg"/></resource>',
      {
        "items/a.xml": item(
          '<qti-item-body><img src="../media/a.svg" alt="Chart"/></qti-item-body>',
        ),
        "media/a.svg": "<svg/>",
      },
    ),
  );
  assert.equal(result.runnable, false);
  assert.match(result.source_hash, /^[a-f0-9]{64}$/);
  assert.equal(result.files.length, 3);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.resources[0].references, ["media/a.svg"]);
  assert.equal(result.resources[0].identifier, "question");
});
test("missing, undeclared, external and active content produce explicit blocked diagnostics", async () => {
  const result = await inspectPackage(pack(resource(), {
    "items/a.xml": item(
      '<qti-item-body><img src="../media/a.svg"/><a href="https://example.com/">link</a><script>code</script><p onclick="alert(1)">x</p></qti-item-body>',
    ),
    "media/a.svg": "<svg/>",
  }));
  for (
    const code of [
      "reference_not_declared",
      "reference_invalid",
      "active_content",
      "active_attribute",
      "file_unreferenced",
    ]
  ) assert.ok(result.diagnostics.some((entry) => entry.code === code), code);
  assert.equal(result.runnable, false);
});
test("dependency cycles and missing resources cannot disappear from the inspection", async () => {
  const result = await inspectPackage(
    pack(
      resource(
        "a",
        "items/a.xml",
        '<dependency identifierref="b"/><dependency identifierref="missing"/>',
      ) + resource("b", "items/b.xml", '<dependency identifierref="a"/>'),
      { "items/a.xml": item(), "items/b.xml": item(undefined, "b") },
    ),
  );
  for (const code of ["dependency_cycle", "dependency_missing"]) {
    assert.ok(result.diagnostics.some((entry) => entry.code === code), code);
  }
  assert.equal(result.resources.length, 2);
});
test("standard processing templates are recognized without retrieval, arbitrary templates block", async () => {
  for (
    const [template, blocked] of [[
      "https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct.xml",
      false,
    ], ["https://example.com/custom.xml", true]] as const
  ) {
    const result = await inspectPackage(
      pack(resource(), {
        "items/a.xml": item(
          `<qti-response-processing template="${template}"/>`,
        ),
      }),
    );
    assert.equal(
      result.diagnostics.some((entry) =>
        entry.code === "processing_template_unsupported"
      ),
      blocked,
    );
  }
});
test("bad root, duplicate identifiers, custom interactions and malformed resource XML are reported", async () => {
  const result = await inspectPackage(
    pack(
      resource("a", "items/a.xml") + resource("b", "items/b.xml") +
        resource("c", "items/c.xml") + resource("d", "items/d.xml"),
      {
        "items/a.xml": item(
          '<qti-item-body><qti-custom-interaction response-identifier="R"/></qti-item-body>',
        ),
        "items/b.xml": item(),
        "items/c.xml": "<broken>",
        "items/d.xml": "<x/>",
      },
    ),
  );
  for (
    const code of [
      "interaction_requires_mapping",
      "qti_identifier_duplicate",
      "resource_xml_invalid",
      "resource_root_mismatch",
    ]
  ) assert.ok(result.diagnostics.some((entry) => entry.code === code), code);
  assert.deepEqual(result.resources[0].interactions, [
    "qti-custom-interaction",
  ]);
});
test("manifest shape, namespace, identifiers and exact root filename are enforced", async () => {
  await assert.rejects(
    inspectPackage(new Uint8Array(zipSync({ "other.xml": strToU8("<x/>") }))),
  );
  await assert.rejects(
    inspectPackage(
      pack(resource("same") + resource("same"), { "items/a.xml": item() }),
    ),
  );
  await assert.rejects(
    inspectPackage(
      new Uint8Array(
        zipSync({
          "imsmanifest.xml": strToU8(
            '<manifest identifier="x"><resources/></manifest>',
          ),
        }),
      ),
    ),
  );
});
