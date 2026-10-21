import type { Element, Node } from "@xmldom/xmldom";
import { unpackArchive } from "./archive.ts";
import {
  inspectArchive,
  type PackageDiagnostic,
  type PackageInspection,
} from "./package.ts";
import { boundedJson, fail, sha256 } from "./policy.ts";
import { children, descendants, parseXml, QTI_NS } from "./xml.ts";

/** Inert, loss-aware XML data. This is never HTML and must not be passed to
 * innerHTML, a template engine, a player or a response-processing evaluator. */
export type XmlData = { kind: "text"; value: string } | {
  kind: "element";
  name: string;
  namespace: string | null;
  attributes: { name: string; namespace: string | null; value: string }[];
  children: XmlData[];
};
export type XmlElement = Extract<XmlData, { kind: "element" }>;
export interface Declaration {
  identifier: string;
  cardinality: string;
  base_type: string | null;
  correct: string[];
  default: string[];
  mapping: XmlElement | null;
  source: XmlElement;
}
export interface SemanticDocument {
  path: string;
  resource_ids: string[];
  kind: string;
  identifier: string | null;
  title: string | null;
  language: string | null;
  responses: Declaration[];
  outcomes: Declaration[];
  interactions: {
    type: string;
    response_identifier: string | null;
    source: XmlElement;
  }[];
  processing: XmlElement[];
  source_tree: XmlElement;
}
export interface PackageReview {
  schema_version: "assessment.qti-review.v1";
  source_hash: string;
  review_hash: string;
  inspection: PackageInspection;
  manifest_tree: XmlElement;
  documents: SemanticDocument[];
  diagnostics: PackageDiagnostic[];
  runnable: false;
  requires_human_review: true;
}
const attribute = (element: Element, name: string) =>
  element.hasAttribute(name) ? element.getAttribute(name) : null;
/** Aggregate budgets apply even when many manifest resources alias one XML. */
const budget = () => ({ nodes: 0, text: 0 });
function tree(
  node: Node,
  limits: ReturnType<typeof budget>,
  cache: WeakMap<Node, XmlData>,
): XmlData | null {
  const previous = cache.get(node);
  if (previous) return previous;
  if (++limits.nodes > 250000) {
    fail(
      "semantic_complexity",
      "The semantic review exceeds its aggregate node budget.",
    );
  }
  if (node.nodeType === 3 || node.nodeType === 4) {
    const value = node.nodeValue ?? "";
    limits.text += value.length;
    if (limits.text > 16 * 1048576) {
      fail(
        "semantic_complexity",
        "The semantic review exceeds its text budget.",
      );
    }
    return { kind: "text", value };
  }
  if (node.nodeType !== 1) return null;
  const element = node as Element, attributes: XmlElement["attributes"] = [];
  for (let index = 0; index < element.attributes.length; index++) {
    const attr = element.attributes.item(index)!;
    if (attr.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
    attributes.push({
      name: attr.localName ?? attr.name,
      namespace: attr.namespaceURI,
      value: attr.value,
    });
  }
  const nested: XmlData[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const data = tree(child, limits, cache);
    if (data) nested.push(data);
  }
  const data: XmlElement = {
    kind: "element",
    name: element.localName!,
    namespace: element.namespaceURI,
    attributes,
    children: nested,
  };
  cache.set(node, data);
  return data;
}
export const elements = (element: XmlElement, name?: string) =>
  element.children.filter((child): child is XmlElement =>
    child.kind === "element" && (name === undefined || child.name === name)
  );
export const value = (element: XmlElement, name: string) =>
  element.attributes.find((attr) =>
    attr.name === name && attr.namespace === null
  )?.value ?? null;
export const textContent = (node: XmlData): string =>
  node.kind === "text" ? node.value : node.children.map(textContent).join("");
export async function reviewPackage(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<PackageReview> {
  const archive = await unpackArchive(bytes),
    inspection = inspectArchive(archive),
    documents: SemanticDocument[] = [],
    diagnostics = [...inspection.diagnostics],
    seenPaths = new Set<string>(),
    limits = budget();
  let xmlBytes = 0;
  const manifest_tree = tree(
    parseXml(archive.files.get("imsmanifest.xml")!).documentElement!,
    limits,
    new WeakMap(),
  ) as XmlElement;
  const issue = (code: string, path: string, message: string) => {
    if (diagnostics.length >= 1000) {
      fail("diagnostic_limit", "Semantic review has too many diagnostics.");
    }
    diagnostics.push({ code, path, message, severity: "error" });
  };
  for (const resource of inspection.resources) {
    if (!resource.entry || !resource.root || seenPaths.has(resource.entry)) {
      continue;
    }
    seenPaths.add(resource.entry);
    const data = archive.files.get(resource.entry)!;
    xmlBytes += data.length;
    if (xmlBytes > 32 * 1048576) {
      fail("semantic_complexity", "Aggregate XML review bytes exceed policy.");
    }
    const root = parseXml(data).documentElement!,
      cache = new WeakMap<Node, XmlData>(),
      source = tree(root, limits, cache) as XmlElement;
    const declaration = (element: Element): Declaration => {
      const values = (name: string) =>
        children(element, name, QTI_NS).flatMap((group) =>
          children(group, "qti-value", QTI_NS).map((node) =>
            node.textContent ?? ""
          )
        );
      const source = tree(element, limits, cache) as XmlElement;
      return {
        identifier: attribute(element, "identifier") ?? "",
        cardinality: attribute(element, "cardinality") ?? "",
        base_type: attribute(element, "base-type"),
        correct: values("qti-correct-response"),
        default: values("qti-default-value"),
        mapping: elements(source).find((node) =>
          ["qti-mapping", "qti-area-mapping"].includes(node.name)
        ) ?? null,
        source,
      };
    };
    const responses = children(root, "qti-response-declaration", QTI_NS).map(
        declaration,
      ),
      outcomes = children(root, "qti-outcome-declaration", QTI_NS).map(
        declaration,
      );
    const responseIds = new Set<string>(), allIds = new Set<string>();
    for (const declaration of [...responses, ...outcomes]) {
      if (!declaration.identifier || allIds.has(declaration.identifier)) {
        issue(
          "declaration_identifier",
          resource.entry,
          "Response/outcome identifiers must be nonempty and unique.",
        );
      }
      allIds.add(declaration.identifier);
      if (
        !["single", "multiple", "ordered", "record"].includes(
          declaration.cardinality,
        )
      ) {
        issue(
          "declaration_cardinality",
          resource.entry,
          "A declaration has an invalid or absent cardinality.",
        );
      }
      if (
        declaration.cardinality === "single" && declaration.correct.length > 1
      ) {
        issue(
          "correct_cardinality",
          resource.entry,
          "A single response cannot have multiple correct values.",
        );
      }
    }
    for (const response of responses) {
      responseIds.add(response.identifier);
    }
    const interactions: SemanticDocument["interactions"] = [];
    for (const element of descendants(root)) {
      if (
        element.namespaceURI === QTI_NS &&
        element.localName?.endsWith("-interaction")
      ) {
        const response = attribute(element, "response-identifier");
        interactions.push({
          type: element.localName,
          response_identifier: response,
          source: tree(element, limits, cache) as XmlElement,
        });
        if (!response || !responseIds.has(response)) {
          issue(
            "interaction_response_missing",
            resource.entry,
            "An interaction does not bind a declared response.",
          );
        }
      }
    }
    if (root.localName === "qti-assessment-item") {
      if (attribute(root, "adaptive") !== "false") {
        issue(
          "adaptive_mapping_required",
          resource.entry,
          "Adaptive or unspecified item behavior needs explicit mapping.",
        );
      }
      if (children(root, "qti-item-body", QTI_NS).length !== 1) {
        issue(
          "item_body_count",
          resource.entry,
          "An item requires exactly one body.",
        );
      }
    }
    documents.push({
      path: resource.entry,
      resource_ids: inspection.resources.filter((entry) =>
        entry.entry === resource.entry
      ).map((entry) =>
        entry.id
      ),
      kind: root.localName!,
      identifier: attribute(root, "identifier"),
      title: attribute(root, "title"),
      language: root.getAttributeNS(
        "http://www.w3.org/XML/1998/namespace",
        "lang",
      ),
      responses,
      outcomes,
      interactions,
      processing: source.name === "qti-response-processing"
        ? [source]
        : elements(source, "qti-response-processing"),
      source_tree: source,
    });
  }
  const content = {
    schema_version: "assessment.qti-review.v1" as const,
    source_hash: archive.source_hash,
    inspection,
    manifest_tree,
    documents,
    diagnostics,
    runnable: false as const,
    requires_human_review: true as const,
  };
  // A domain-separated exact snapshot hash, not a claim of institutional approval.
  return {
    ...content,
    review_hash: await sha256(
      new TextEncoder().encode(
        "assessment.qti-review.v1\n" + boundedJson(content),
      ),
    ),
  };
}
