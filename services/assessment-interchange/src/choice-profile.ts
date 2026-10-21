import { strToU8, zipSync } from "fflate";
import {
  type AnswerKey,
  type Item,
  object,
  validateItem,
  validateKey,
} from "../../../packages/assessment-core/src/mod.ts";
import {
  elements,
  type PackageReview,
  textContent,
  value,
  type XmlElement,
} from "./model.ts";
import { children, CP_NS, parseXml, QTI_NS } from "./xml.ts";
import { fail, sha256 } from "./policy.ts";

export interface DraftCandidate {
  path: string;
  identifier: string;
  item: Item;
  key: AnswerKey;
  source_hash: string;
  review_hash: string;
  warnings: string[];
}
export interface ConversionResult {
  schema_version: "assessment.qti-candidates.v1";
  source_hash: string;
  review_hash: string;
  draft_candidates: DraftCandidate[];
  blocked: { path: string; code: string; message: string }[];
  publishable: false;
}
const TEMPLATE =
  "https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct.xml";
const plain = (node: XmlElement) => {
  if (elements(node).length) {
    fail(
      "presentation_mapping_required",
      "Structured or rich presentation requires explicit mapping; it is not flattened.",
    );
  }
  return textContent(node).trim();
};
const onlyAttributes = (node: XmlElement, names: string[]) => {
  if (
    node.attributes.some((attr) =>
      attr.namespace !== null || !names.includes(attr.name)
    )
  ) {
    fail(
      "attribute_mapping_required",
      "A presentation or processing attribute requires explicit mapping.",
    );
  }
};
const significant = (node: XmlElement) =>
  node.children.filter((child) =>
    child.kind === "element" || child.value.trim()
  );
const qti = (node: XmlElement) => {
  if (node.namespace !== QTI_NS) {
    fail(
      "namespace_mapping_required",
      "Foreign content requires explicit mapping.",
    );
  }
};
const id = (value: string | null): string => {
  if (!value || !/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(value)) {
    return fail(
      "identifier_mapping_required",
      "Option identifiers require explicit portable remapping.",
    );
  }
  return value;
};
function scoreRule(response: string, maxScore: number) {
  return `<qti-response-processing><qti-response-condition><qti-response-if><qti-match><qti-variable identifier="${response}"/><qti-correct identifier="${response}"/></qti-match><qti-set-outcome-value identifier="SCORE"><qti-base-value base-type="float">${maxScore}</qti-base-value></qti-set-outcome-value></qti-response-if><qti-response-else><qti-set-outcome-value identifier="SCORE"><qti-base-value base-type="float">0</qti-base-value></qti-set-outcome-value></qti-response-else></qti-response-condition></qti-response-processing>`;
}
/** Compare inert trees to a generated, audited rule. Never evaluate arbitrary
 * response-processing XML or mistake a matching correct-response for scoring. */
function ruleData(node: XmlElement): unknown {
  return {
    name: node.name,
    namespace: node.namespace,
    attributes: [...node.attributes].sort((a, b) =>
      (a.namespace ?? "").localeCompare(b.namespace ?? "") ||
      a.name.localeCompare(b.name)
    ),
    children: significant(node).map((child) =>
      child.kind === "text" ? child.value : ruleData(child)
    ),
  };
}
function processingScore(
  processing: XmlElement,
  response: string,
  outcome: XmlElement,
): number {
  onlyAttributes(outcome, [
    "identifier",
    "cardinality",
    "base-type",
    "normal-maximum",
    "normal-minimum",
  ]);
  if (
    value(outcome, "identifier") !== "SCORE" ||
    value(outcome, "cardinality") !== "single" ||
    value(outcome, "base-type") !== "float" || significant(outcome).length
  ) {
    fail(
      "outcome_mapping_required",
      "This score declaration requires explicit mapping.",
    );
  }
  const max = value(outcome, "normal-maximum");
  // normal-maximum is descriptive, not an instruction to scale the template.
  if (value(processing, "template") === TEMPLATE) {
    onlyAttributes(processing, ["template"]);
    if (significant(processing).length) {
      fail(
        "processing_mapping_required",
        "A template with local processing cannot be assumed equivalent.",
      );
    }
    if (max !== null && Number(max) !== 1) {
      fail(
        "score_range_conflict",
        "match_correct awards 1, not the descriptive normal-maximum.",
      );
    }
    return 1;
  }
  const score = Number(max);
  if (!max || !Number.isFinite(score) || score <= 0 || score > 1000) {
    fail(
      "processing_mapping_required",
      "Custom processing requires explicit mapping.",
    );
  }
  const expected = children(
    parseXml(
      new TextEncoder().encode(
        `<wrapper xmlns="${QTI_NS}">${scoreRule(response, score)}</wrapper>`,
      ),
    ).documentElement!,
  )[0];
  // Build the same inert representation without importing any executable processor.
  const convert = (element: typeof expected): XmlElement => ({
    kind: "element",
    name: element.localName!,
    namespace: element.namespaceURI,
    attributes: Array.from({ length: element.attributes.length }, (_, i) => {
      const attr = element.attributes.item(i)!;
      return {
        name: attr.localName!,
        namespace: attr.namespaceURI,
        value: attr.value,
      };
    }),
    children: Array.from(
      { length: element.childNodes.length },
      (_, i) => element.childNodes.item(i)!,
    ).filter((child) => child.nodeType === 1 || child.nodeType === 3).map(
      (child) =>
        child.nodeType === 1
          ? convert(child as typeof expected)
          : { kind: "text" as const, value: child.nodeValue ?? "" },
    ),
  });
  if (
    JSON.stringify(ruleData(processing)) !==
      JSON.stringify(ruleData(convert(expected)))
  ) {
    fail(
      "processing_mapping_required",
      "Response processing is not the audited all-or-nothing rule.",
    );
  }
  return score;
}
/** Deliberately reports unsupported items; never drops them from a successful
 * full-bank import or invents text/rubric/media/scoring conversions. */
export function draftCandidates(review: PackageReview): ConversionResult {
  const result: ConversionResult = {
    schema_version: "assessment.qti-candidates.v1",
    source_hash: review.source_hash,
    review_hash: review.review_hash,
    draft_candidates: [],
    blocked: review.diagnostics.filter((d) => d.severity === "error").map((
      { path, code, message },
    ) => ({ path, code, message })),
    publishable: false,
  };
  for (const document of review.documents) {
    if (document.kind !== "qti-assessment-item") {
      result.blocked.push({
        path: document.path,
        code: "test_mapping_required",
        message: "Test/section/stimulus mapping remains required.",
      });
      continue;
    }
    try {
      if (
        review.diagnostics.some((d) =>
          d.severity === "error" &&
          (d.path === document.path || d.path === "imsmanifest.xml")
        )
      ) {
        fail(
          "package_diagnostic",
          "Resolve package/semantic diagnostics before conversion.",
        );
      }
      const root = document.source_tree;
      qti(root);
      if (
        root.attributes.some((attr) =>
          attr.namespace === null
            ? !["identifier", "title", "adaptive", "time-dependent"].includes(
              attr.name,
            )
            : !(attr.namespace === "http://www.w3.org/XML/1998/namespace" &&
              attr.name === "lang")
        )
      ) {
        fail(
          "attribute_mapping_required",
          "Item attributes require explicit mapping.",
        );
      }
      if (
        value(root, "adaptive") !== "false" ||
        value(root, "time-dependent") !== "false"
      ) {
        fail(
          "behavior_mapping_required",
          "Adaptive/time-dependent items require explicit mapping.",
        );
      }
      if (!["uz", "ru", "en"].includes(document.language ?? "")) {
        fail(
          "locale_mapping_required",
          "Choose an exact supported locale; regional/absent languages are not silently changed.",
        );
      }
      const allowed = [
        "qti-response-declaration",
        "qti-outcome-declaration",
        "qti-item-body",
        "qti-response-processing",
      ];
      if (
        elements(root).some((node) =>
          node.namespace !== QTI_NS || !allowed.includes(node.name)
        ) || root.children.some((node) =>
          node.kind === "text" && node.value.trim()
        )
      ) {
        fail(
          "item_structure_mapping_required",
          "Additional item structures need explicit mapping.",
        );
      }
      if (
        document.responses.length !== 1 || document.outcomes.length !== 1 ||
        document.processing.length !== 1 || document.interactions.length !== 1
      ) {
        fail(
          "composite_mapping_required",
          "Composite declarations/interactions/processing need explicit mapping.",
        );
      }
      const response = document.responses[0],
        interaction = document.interactions[0];
      onlyAttributes(response.source, [
        "identifier",
        "cardinality",
        "base-type",
      ]);
      if (
        response.identifier !== "RESPONSE" ||
        interaction.response_identifier !== response.identifier ||
        response.base_type !== "identifier" || response.mapping ||
        response.default.length
      ) {
        fail(
          "response_mapping_required",
          "Response declaration/scoring needs explicit mapping.",
        );
      }
      if (
        elements(response.source).some((node) =>
          node.name !== "qti-correct-response" || node.namespace !== QTI_NS
        ) || elements(response.source, "qti-correct-response").length !== 1
      ) {
        fail(
          "response_mapping_required",
          "Only an explicit correct response can enter this mapper.",
        );
      }
      const correctNode = elements(response.source, "qti-correct-response")[0];
      onlyAttributes(correctNode, []);
      if (
        elements(correctNode).some((node) =>
          node.name !== "qti-value" || node.namespace !== QTI_NS
        )
      ) {
        fail(
          "response_mapping_required",
          "Correct-response fields need explicit mapping.",
        );
      }
      for (const node of elements(correctNode)) {
        onlyAttributes(node, []);
        plain(node);
      }
      const body = elements(root, "qti-item-body");
      if (body.length !== 1) {
        fail("item_body_count", "One item body is required.");
      }
      onlyAttributes(body[0], []);
      const bodyChildren = elements(body[0]);
      if (
        body[0].children.some((node) =>
          node.kind === "text" && node.value.trim()
        )
      ) {
        fail(
          "presentation_mapping_required",
          "Unstructured body text requires explicit mapping.",
        );
      }
      const prompts = bodyChildren.filter((node) =>
        node.name === "p" && node.namespace === QTI_NS
      );
      if (bodyChildren.length !== prompts.length + 1 || prompts.length > 1) {
        fail(
          "presentation_mapping_required",
          "Additional body content requires explicit mapping.",
        );
      }
      for (const node of prompts) onlyAttributes(node, []);
      const control = interaction.source;
      qti(control);
      onlyAttributes(control, [
        "response-identifier",
        "max-choices",
        "min-choices",
        "shuffle",
        "orientation",
      ]);
      if (
        bodyChildren.filter((node) => !prompts.includes(node)).some((node) =>
          node.name !== control.name || node.namespace !== QTI_NS
        )
      ) {
        fail(
          "presentation_mapping_required",
          "Nested or wrapped interactions require explicit mapping.",
        );
      }
      if (
        value(control, "shuffle") === "true" ||
        value(control, "orientation") === "horizontal" ||
        (value(control, "min-choices") !== null &&
          value(control, "min-choices") !== "0")
      ) {
        fail(
          "interaction_behavior_mapping_required",
          "Selection, shuffle or layout constraints require explicit mapping.",
        );
      }
      const controlChildren = elements(control),
        internalPrompts = elements(control, "qti-prompt");
      if (prompts.length + internalPrompts.length !== 1) {
        fail(
          "presentation_mapping_required",
          "One unambiguous plain prompt is required.",
        );
      }
      if (
        control.children.some((node) =>
          node.kind === "text" && node.value.trim()
        )
      ) {
        fail(
          "presentation_mapping_required",
          "Interaction text requires explicit mapping.",
        );
      }
      for (const node of internalPrompts) {
        qti(node);
        onlyAttributes(node, []);
      }
      const choices = controlChildren.filter((node) =>
        node.name === "qti-simple-choice"
      );
      if (controlChildren.length !== choices.length + internalPrompts.length) {
        fail(
          "presentation_mapping_required",
          "Additional interaction content requires explicit mapping.",
        );
      }
      const options = choices.map((choice) => {
        qti(choice);
        onlyAttributes(choice, ["identifier"]);
        return { id: id(value(choice, "identifier")), text: plain(choice) };
      });
      if (options.length < 2) {
        fail("choice_count", "At least two choices are required.");
      }
      const correct = response.correct.map((answer) => id(answer));
      if (
        new Set(correct).size !== correct.length ||
        correct.some((answer) =>
          !options.some((option) => option.id === answer)
        )
      ) {
        fail(
          "correct_reference",
          "Correct responses must reference unique offered choices.",
        );
      }
      let type: Item["type"];
      if (
        control.name === "qti-choice-interaction" &&
        response.cardinality === "single" &&
        value(control, "max-choices") === "1" && correct.length === 1
      ) type = "single_choice";
      else if (
        control.name === "qti-choice-interaction" &&
        response.cardinality === "multiple" &&
        value(control, "max-choices") === "0" && correct.length
      ) type = "multi_choice";
      else if (
        control.name === "qti-order-interaction" &&
        response.cardinality === "ordered" &&
        correct.length === options.length &&
        value(control, "max-choices") === null
      ) type = "ordering";
      else {return fail(
          "interaction_mapping_required",
          "This interaction/cardinality/selection policy requires explicit mapping.",
        );}
      const max_score = processingScore(
        document.processing[0],
        response.identifier,
        document.outcomes[0].source,
      );
      const item = validateItem({
        schema_version: "assessment.item.v1",
        type,
        locale: document.language,
        prompt: plain((prompts[0] ?? internalPrompts[0])!),
        max_score,
        options,
        tags: [],
      });
      const key = validateKey(item, {
        correct: type === "single_choice" ? correct[0] : correct,
        case_sensitive: true,
        partial_credit: false,
      });
      result.draft_candidates.push({
        path: document.path,
        identifier: document.identifier!,
        item,
        key,
        source_hash: review.source_hash,
        review_hash: review.review_hash,
        warnings: [
          "Draft proposal only. Source, licensing, content and key require institutional review and independent approval.",
        ],
      });
    } catch (cause) {
      result.blocked.push({
        path: document.path,
        code: cause instanceof Error && "code" in cause
          ? String(cause.code)
          : "mapping_required",
        message: cause instanceof Error ? cause.message : "Mapping required.",
      });
    }
  }
  return result;
}
const escape = (source: string) => {
  if (
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udfff]/u
      .test(source)
  ) {
    fail(
      "export_xml_text",
      "Export text must consist of valid XML characters.",
    );
  }
  return source.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(
    ">",
    "&gt;",
  ).replaceAll('"', "&quot;").replaceAll("'", "&apos;");
};
/** No database/export permission is inferred here. Caller must materialize and
 * authorize the snapshot; this pure builder has no tenant or provider access. */
export async function buildChoicePackage(
  rows: { id: string; item: unknown; key: unknown }[],
) {
  if (
    !rows.length || rows.length > 2000 ||
    rows.some((row) =>
      !row || typeof row !== "object" || typeof row.id !== "string" ||
      !row.id || row.id.length > 200
    ) || new Set(rows.map((row) => row.id)).size !== rows.length
  ) fail("export_rows", "Export requires 1–2,000 uniquely identified rows.");
  const files: Record<string, Uint8Array> = {},
    resources: string[] = [],
    source_rows: {
      source_id: string;
      item_path: string;
      item_sha256: string;
    }[] = [];
  let totalBytes = 0;
  for (const [index, row] of rows.entries()) {
    const rawItem = object(row.item), rawKey = object(row.key);
    if (
      Object.keys(row).some((key) => !["id", "item", "key"].includes(key)) ||
      Object.keys(rawItem).some((key) =>
        ![
          "schema_version",
          "type",
          "locale",
          "prompt",
          "max_score",
          "options",
          "tags",
          "media",
          "rubric_id",
          "response_ids",
          "image_response",
          "media_response",
        ].includes(key)
      ) || Object.keys(rawKey).some((key) =>
        !["correct", "case_sensitive", "partial_credit"].includes(key)
      )
    ) {
      fail(
        "export_mapping_required",
        "Unmapped source fields may not be silently discarded by export.",
      );
    }
    for (const name of ["case_sensitive", "partial_credit"]) {
      if (rawKey[name] !== undefined && typeof rawKey[name] !== "boolean") {
        fail(
          "export_mapping_required",
          "Scoring flags must be explicit booleans.",
        );
      }
    }
    if (Array.isArray(rawItem.options)) {
      for (const rawOption of rawItem.options) {
        const option = object(rawOption);
        if (
          Object.keys(option).some((key) =>
            !["id", "text"].includes(key)
          )
        ) {
          fail(
            "export_mapping_required",
            "Unmapped option properties require explicit export mapping.",
          );
        }
      }
    }
    const item = validateItem(row.item), key = validateKey(item, row.key);
    if (
      !["single_choice", "multi_choice", "true_false", "ordering"].includes(
        item.type,
      ) || item.media?.length || item.rubric_id || item.tags.length ||
      item.response_ids?.length || key.partial_credit
    ) {
      fail(
        "export_mapping_required",
        "Export of this type, media, rubric, metadata or scoring requires explicit mapping; nothing is silently omitted.",
      );
    }
    for (const option of item.options!) id(option.id);
    const answers =
        (Array.isArray(key.correct) ? key.correct : [key.correct]) as string[],
      responseCardinality = item.type === "multi_choice"
        ? "multiple"
        : item.type === "ordering"
        ? "ordered"
        : "single";
    const interaction = item.type === "ordering"
        ? "qti-order-interaction"
        : "qti-choice-interaction",
      path = `items/item-${index + 1}.xml`;
    const source =
      `<?xml version="1.0" encoding="UTF-8"?><qti-assessment-item xmlns="${QTI_NS}" identifier="item_${
        index + 1
      }" title="${
        escape([...item.prompt].slice(0, 200).join(""))
      }" xml:lang="${item.locale}" adaptive="false" time-dependent="false"><qti-response-declaration identifier="RESPONSE" cardinality="${responseCardinality}" base-type="identifier"><qti-correct-response>${
        answers.map((answer) => `<qti-value>${escape(answer)}</qti-value>`)
          .join("")
      }</qti-correct-response></qti-response-declaration><qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float" normal-minimum="0" normal-maximum="${item.max_score}"/><qti-item-body><p>${
        escape(item.prompt)
      }</p><${interaction} response-identifier="RESPONSE"${
        item.type === "ordering"
          ? ""
          : ` max-choices="${item.type === "multi_choice" ? 0 : 1}"`
      } shuffle="false">${
        item.options!.map((option) =>
          `<qti-simple-choice identifier="${escape(option.id)}">${
            escape(option.text)
          }</qti-simple-choice>`
        ).join("")
      }</${interaction}></qti-item-body>${
        scoreRule("RESPONSE", item.max_score)
      }</qti-assessment-item>`;
    const data = strToU8(source);
    totalBytes += data.length;
    if (data.length > 4 * 1048576 || totalBytes > 32 * 1048576) {
      fail(
        "export_size",
        "An exported item or aggregate XML exceeds review policy.",
      );
    }
    files[path] = data;
    source_rows.push({
      source_id: row.id,
      item_path: path,
      item_sha256: await sha256(new Uint8Array(data)),
    });
    resources.push(
      `<resource identifier="resource_${
        index + 1
      }" type="imsqti_item_xmlv3p0" href="${path}"><file href="${path}"/></resource>`,
    );
  }
  files["imsmanifest.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><manifest xmlns="${CP_NS}" identifier="schood_bank"><metadata><schema>QTI Item Bank</schema><schemaversion>3.0.0</schemaversion></metadata><organizations/><resources>${
      resources.join("")
    }</resources></manifest>`,
  );
  // ZIP's local DOS date fields are fixed, never the retry wall clock.
  const bytes = new Uint8Array(
    zipSync(files, { level: 6, mtime: new Date(1980, 0, 1) }),
  );
  return {
    bytes,
    sha256: await sha256(bytes),
    item_count: rows.length,
    source_rows,
  };
}
