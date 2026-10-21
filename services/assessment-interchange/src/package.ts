import { type Archive, unpackArchive } from "./archive.ts";
import { archivePath, fail, packageReference } from "./policy.ts";
import { children, CP_NS, descendants, parseXml, QTI_NS } from "./xml.ts";
export interface PackageDiagnostic {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
  resource?: string;
}
export interface PackageResource {
  id: string;
  type: string;
  entry: string | null;
  entry_origin: "manifest_href" | "single_template_file" | null;
  files: string[];
  dependencies: string[];
  root?: string;
  identifier?: string;
  interactions?: string[];
  references: string[];
}
export interface PackageInspection {
  schema_version: "assessment.qti-inspection.v1";
  source_hash: string;
  manifest_identifier: string;
  resources: PackageResource[];
  files: { path: string; bytes: number; sha256: string }[];
  expanded_bytes: number;
  diagnostics: PackageDiagnostic[];
  runnable: false;
}
const roots: Record<string, string> = {
  imsqti_item_xmlv3p0: "qti-assessment-item",
  imsqti_test_xmlv3p0: "qti-assessment-test",
  imsqti_stimulus_xmlv3p0: "qti-assessment-stimulus",
  imsqti_section_xmlv3p0: "qti-assessment-section",
  imsqti_rptemplate_xmlv3p0: "qti-response-processing",
};
const standardTemplates = new Set(
  [
    "match_correct",
    "map_response",
    "map_response_point",
    "CC2_match",
    "CC2_match_basic",
    "CC2_map_response",
  ].flatMap((name) =>
    ["http", "https"].map((scheme) =>
      `${scheme}://purl.imsglobal.org/spec/qti/v3p0/rptemplates/${name}.xml`
    )
  ),
);
const identifier = (value: string | null): string => {
  if (!value || value.length > 200 || /[\s\u0000-\u001f/:]/.test(value)) {
    return fail(
      "resource_identifier",
      "Resource identifiers must be nonempty and unambiguous.",
    );
  }
  return value;
};
/** Inspection preserves resource identities and reports unsupported semantics.
 * It deliberately returns runnable:false: inspection is not scoring conversion,
 * asset clearance, human review, schema certification or publication authority. */
export function inspectArchive(archive: Archive): PackageInspection {
  const manifest = archive.files.get("imsmanifest.xml");
  if (!manifest) {
    fail(
      "manifest_missing",
      "A QTI ZIP package requires root imsmanifest.xml.",
    );
  }
  const document = parseXml(manifest!), root = document.documentElement!;
  if (root.localName !== "manifest" || root.namespaceURI !== CP_NS) {
    fail(
      "manifest_namespace",
      "Use the QTI 3 content-package manifest namespace.",
    );
  }
  const id = identifier(root.getAttribute("identifier")),
    groups = children(root, "resources", CP_NS);
  if (groups.length !== 1) {
    fail("manifest_resources", "A package requires one resource catalogue.");
  }
  const diagnostics: PackageDiagnostic[] = [],
    resources: PackageResource[] = [],
    catalog = new Map<string, PackageResource>(),
    declared = new Set<string>();
  const issue = (
    code: string,
    path: string,
    message: string,
    resource?: string,
    severity: PackageDiagnostic["severity"] = "error",
  ) => {
    if (diagnostics.length >= 1000) {
      fail(
        "diagnostic_limit",
        "The package has too many unresolved diagnostics.",
      );
    }
    diagnostics.push({
      code,
      severity,
      path,
      message,
      ...(resource ? { resource } : {}),
    });
  };
  const resolve = (from: string, href: string, resource: string) => {
    try {
      const path = packageReference(from, href);
      if (!archive.files.has(path)) {
        issue(
          "file_missing",
          from,
          "A declared package file is missing.",
          resource,
        );
        return null;
      }
      return path;
    } catch {
      issue(
        "reference_invalid",
        from,
        "A file reference is external, escaping or ambiguous.",
        resource,
      );
      return null;
    }
  };
  for (const node of children(groups[0], "resource", CP_NS)) {
    const rid = identifier(node.getAttribute("identifier"));
    if (catalog.has(rid)) {
      fail(
        "resource_duplicate",
        "Manifest resource identifiers must be unique.",
      );
    }
    const type = node.getAttribute("type") ?? "",
      href = node.getAttribute("href"),
      files: string[] = [],
      dependencies: string[] = [];
    let entry = href ? resolve("imsmanifest.xml", href, rid) : null;
    let entry_origin: PackageResource["entry_origin"] = href
      ? "manifest_href"
      : null;
    for (const file of children(node, "file", CP_NS)) {
      const path = resolve(
        "imsmanifest.xml",
        file.getAttribute("href") ?? "",
        rid,
      );
      if (path) {
        if (files.includes(path)) {
          issue(
            "file_declaration_duplicate",
            "imsmanifest.xml",
            "A resource declares the same file more than once.",
            rid,
          );
        } else files.push(path);
        declared.add(path);
      }
    }
    for (const dependency of children(node, "dependency", CP_NS)) {
      const dependencyId = identifier(dependency.getAttribute("identifierref"));
      if (dependencies.includes(dependencyId)) {
        issue(
          "dependency_duplicate",
          "imsmanifest.xml",
          "Duplicate resource dependency.",
          rid,
        );
      } else dependencies.push(dependencyId);
    }
    if (
      !href && type === "imsqti_rptemplate_xmlv3p0" && files.length === 1 &&
      /\.xml$/i.test(files[0])
    ) {
      entry = files[0];
      entry_origin = "single_template_file";
      issue(
        "template_entry_from_file",
        "imsmanifest.xml",
        "A standalone template without href resolves only its sole declared XML file; this is not execution or scoring approval.",
        rid,
        "warning",
      );
    }
    if (entry && !files.includes(entry)) {
      issue(
        "entry_not_declared",
        entry,
        "A resource entry must appear in its file declarations.",
        rid,
      );
    }
    const resource: PackageResource = {
      id: rid,
      type,
      entry,
      entry_origin,
      files,
      dependencies,
      references: [],
    };
    resources.push(resource);
    catalog.set(rid, resource);
  }
  if (!resources.length || resources.length > 5000) {
    fail(
      "resource_limit",
      "A package requires a bounded nonempty resource catalogue.",
    );
  }
  let edges = 0;
  const incoming = new Map(resources.map((resource) => [resource.id, 0])),
    dependants = new Map<string, string[]>();
  for (const resource of resources) {
    for (const dependency of resource.dependencies) {
      if (++edges > 50000) {
        fail("dependency_limit", "Package dependency limit exceeded.");
      }
      if (!catalog.has(dependency)) {
        issue(
          "dependency_missing",
          "imsmanifest.xml",
          "A resource dependency is missing.",
          resource.id,
        );
      } else {
        incoming.set(resource.id, incoming.get(resource.id)! + 1);
        dependants.set(dependency, [
          ...(dependants.get(dependency) ?? []),
          resource.id,
        ]);
      }
    }
  }
  const queue = [...incoming].filter(([, count]) => !count).map(([rid]) => rid);
  let consumed = 0;
  while (consumed < queue.length) {
    const rid = queue[consumed++];
    for (const dependant of dependants.get(rid) ?? []) {
      const remaining = incoming.get(dependant)! - 1;
      incoming.set(dependant, remaining);
      if (!remaining) queue.push(dependant);
    }
  }
  if (consumed !== resources.length) {
    issue(
      "dependency_cycle",
      "imsmanifest.xml",
      "Resource dependencies contain a cycle.",
    );
  }
  let graphSteps = 0;
  const owns = (resource: PackageResource, path: string) => {
    const pending = [resource], visited = new Set<string>();
    while (pending.length) {
      if (++graphSteps > 1000000) {
        fail("graph_complexity", "Resource graph traversal budget exceeded.");
      }
      const current = pending.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      if (current.files.includes(path)) return true;
      for (const dep of current.dependencies) {
        const linked = catalog.get(dep);
        if (linked) pending.push(linked);
      }
    }
    return false;
  };
  const xmlIdentifiers = new Map<string, string>(),
    xmlCache = new Map<string, ReturnType<typeof parseXml>>();
  let aggregateXmlBytes = 0, inspectedElements = 0;
  for (const resource of resources) {
    const expected = roots[resource.type];
    if (!expected) {
      if (resource.type !== "webcontent") {
        issue(
          "resource_type_unsupported",
          "imsmanifest.xml",
          "This resource type requires an explicit interchange mapping.",
          resource.id,
        );
      }
      continue;
    }
    if (!resource.entry) {
      issue(
        "resource_entry_missing",
        "imsmanifest.xml",
        "A QTI resource requires an entry XML file.",
        resource.id,
      );
      continue;
    }
    try {
      let xml = xmlCache.get(resource.entry);
      if (!xml) {
        const data = archive.files.get(resource.entry)!;
        aggregateXmlBytes += data.length;
        if (aggregateXmlBytes > 32 * 1048576) {
          fail(
            "xml_aggregate_limit",
            "Aggregate resource XML exceeds package inspection policy.",
          );
        }
        xml = parseXml(data);
        xmlCache.set(resource.entry, xml);
      }
      const qti = xml.documentElement!;
      if (qti.namespaceURI !== QTI_NS || qti.localName !== expected) {
        issue(
          "resource_root_mismatch",
          resource.entry,
          "The resource namespace/root does not match its declared QTI type.",
          resource.id,
        );
        continue;
      }
      resource.root = expected;
      // Standalone response-processing templates have manifest identity, not
      // an assessment-item identifier. Preserve their rules as inert data.
      if (expected !== "qti-response-processing") {
        resource.identifier = identifier(qti.getAttribute("identifier"));
        const previous = xmlIdentifiers.get(resource.identifier);
        if (previous && previous !== resource.entry) {
          issue(
            "qti_identifier_duplicate",
            resource.entry,
            "Different QTI files share an identifier; review explicit remapping.",
            resource.id,
          );
        }
        xmlIdentifiers.set(resource.identifier, resource.entry);
      }
      const interactions = new Set<string>(), references = new Set<string>();
      for (const element of descendants(qti)) {
        if (++inspectedElements > 1000000) {
          fail(
            "xml_aggregate_limit",
            "Aggregate resource traversal exceeds inspection policy.",
          );
        }
        if (
          element.namespaceURI === QTI_NS &&
          element.localName?.endsWith("-interaction")
        ) {
          interactions.add(element.localName);
          if (
            element.localName.includes("custom") ||
            element.localName.includes("portable")
          ) {
            issue(
              "interaction_requires_mapping",
              resource.entry,
              "Custom/portable code is retained as source but never executed or adopted automatically.",
              resource.id,
            );
          }
        }
        if (
          element.localName &&
          ["script", "iframe", "embed", "style"].includes(element.localName)
        ) {
          issue(
            "active_content",
            resource.entry,
            "Active presentation content cannot enter an assessment renderer.",
            resource.id,
          );
        }
        for (let n = 0; n < element.attributes.length; n++) {
          const attribute = element.attributes.item(n)!;
          if (/^on/i.test(attribute.localName ?? attribute.name)) {
            issue(
              "active_attribute",
              resource.entry,
              "Event-handler attributes cannot enter an assessment renderer.",
              resource.id,
            );
          }
        }
        for (
          const attribute of [
            "href",
            "src",
            "data",
            "poster",
            "longdesc",
            "template-location",
          ]
        ) {
          if (element.hasAttribute(attribute)) {
            const path = resolve(
              resource.entry,
              element.getAttribute(attribute)!,
              resource.id,
            );
            if (path) {
              references.add(path);
              if (!owns(resource, path)) {
                issue(
                  "reference_not_declared",
                  resource.entry,
                  "A referenced file is outside this resource and its declared dependencies.",
                  resource.id,
                );
              }
            }
          }
        }
        if (
          element.namespaceURI === QTI_NS &&
          element.localName === "qti-response-processing" &&
          element.hasAttribute("template")
        ) {
          const template = element.getAttribute("template")!;
          if (!standardTemplates.has(template)) {
            if (/^[a-z][a-z0-9+.-]*:/i.test(template)) {
              issue(
                "processing_template_unsupported",
                resource.entry,
                "A nonstandard remote processing template requires explicit review; it is never fetched.",
                resource.id,
              );
            } else {
              const path = resolve(resource.entry, template, resource.id);
              if (path) {
                references.add(path);
                if (!owns(resource, path)) {
                  issue(
                    "reference_not_declared",
                    resource.entry,
                    "A local processing template is not declared by this resource graph.",
                    resource.id,
                  );
                }
              }
            }
          }
        }
      }
      resource.interactions = [...interactions].sort();
      resource.references = [...references].sort();
    } catch (cause) {
      issue(
        "resource_xml_invalid",
        resource.entry,
        cause instanceof Error ? cause.message : "Invalid resource XML.",
        resource.id,
      );
    }
  }
  for (const entry of archive.entries) {
    archivePath(entry.path);
    if (entry.path !== "imsmanifest.xml" && !declared.has(entry.path)) {
      issue(
        "file_unreferenced",
        entry.path,
        "This file is retained in the source but is not declared by the manifest.",
        undefined,
        "warning",
      );
    }
  }
  return {
    schema_version: "assessment.qti-inspection.v1",
    source_hash: archive.source_hash,
    manifest_identifier: id,
    resources,
    files: archive.entries.map(({ path, bytes, sha256 }) => ({
      path,
      bytes,
      sha256,
    })),
    expanded_bytes: archive.expanded_bytes,
    diagnostics,
    runnable: false,
  };
}
export async function inspectPackage(bytes: Uint8Array<ArrayBuffer>) {
  return inspectArchive(await unpackArchive(bytes));
}
