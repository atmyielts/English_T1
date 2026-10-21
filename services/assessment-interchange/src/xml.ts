import {
  type Document,
  DOMParser,
  type Element,
  type Node,
} from "@xmldom/xmldom";
import { fail, LIMITS } from "./policy.ts";
export const QTI_NS = "http://www.imsglobal.org/xsd/imsqtiasi_v3p0";
export const CP_NS = "http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1";
const invalidCharacters =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udfff]/u;
const checkCharacters = (source: string) => {
  if (invalidCharacters.test(source)) {
    fail(
      "xml_malformed",
      "XML contains characters outside the XML 1.0 character repertoire.",
    );
  }
};
/** Lexical resource guard only; the strict namespace-aware parser still owns
 * XML validity. Stops deep token stacks before constructing an untrusted DOM. */
function preflight(source: string) {
  let at = 0, depth = 0, events = 0;
  while ((at = source.indexOf("<", at)) >= 0) {
    if (++events > LIMITS.xmlNodes * 2) {
      fail("xml_complexity", "XML token budget exceeded.");
    }
    if (
      source.startsWith("<!--", at) || source.startsWith("<![CDATA[", at) ||
      source.startsWith("<?", at)
    ) {
      const close = source.startsWith("<!--", at)
          ? "-->"
          : source.startsWith("<![CDATA[", at)
          ? "]]>"
          : "?>",
        end = source.indexOf(close, at + 2);
      if (end < 0) fail("xml_malformed", "Unterminated XML markup.");
      at = end + close.length;
      continue;
    }
    let quote = "", end = at + 1;
    for (; end < source.length; end++) {
      const char = source[end];
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end === source.length) {
      fail("xml_malformed", "Unterminated XML element.");
    }
    if (source[at + 1] === "/") depth--;
    else if (source[at + 1] !== "!") {
      depth++;
      if (depth > LIMITS.xmlDepth) {
        fail("xml_complexity", "XML nesting limit exceeded.");
      }
      if (source.slice(at, end).trimEnd().endsWith("/")) depth--;
    }
    if (depth < 0) fail("xml_malformed", "Unexpected XML closing element.");
    at = end + 1;
  }
}
export function parseXml(bytes: Uint8Array): Document {
  if (!bytes.length || bytes.length > LIMITS.xmlBytes) {
    fail("xml_size", "XML resource size limit exceeded.");
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("xml_encoding", "XML resources must use valid UTF-8.");
  }
  checkCharacters(source!);
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(source!)) {
    fail("xml_dtd", "DTDs and entity declarations are not permitted.");
  }
  if (/<\?(?!xml(?:\s|\?>))/i.test(source!)) {
    fail(
      "xml_instruction",
      "Active XML processing instructions are not permitted.",
    );
  }
  const declaration = /^\s*<\?xml\s+([^?]+)\?>/.exec(source!);
  if (declaration) {
    const version = /version\s*=\s*['"]([^'"]+)['"]/.exec(declaration[1]);
    if (version && version[1] !== "1.0") {
      fail("xml_version", "Only the XML 1.0 package profile is supported.");
    }
    const encoding = /encoding\s*=\s*['"]([^'"]+)['"]/.exec(declaration[1]);
    if (encoding && !/^utf-?8$/i.test(encoding[1])) {
      fail(
        "xml_encoding",
        "The XML declaration must agree with UTF-8 source bytes.",
      );
    }
  }
  preflight(source!);
  let document: Document;
  try {
    document = new DOMParser({
      onError: () => {
        fail(
          "xml_malformed",
          "XML must be well formed, without parser recovery.",
        );
      },
    }).parseFromString(source!, "application/xml");
  } catch {
    fail(
      "xml_malformed",
      "XML must be well formed, namespace-valid and free of undefined entities.",
    );
  }
  if (document!.doctype || !document!.documentElement) {
    fail(
      "xml_root",
      "An XML resource must have one document element and no DTD.",
    );
  }
  const stack: { node: Node; depth: number }[] = [{
    node: document!,
    depth: 0,
  }];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > LIMITS.xmlNodes || depth > LIMITS.xmlDepth) {
      fail("xml_complexity", "XML node/depth limit exceeded.");
    }
    if (node.nodeValue) checkCharacters(node.nodeValue);
    if (node.nodeType === 1) {
      for (
        let index = 0;
        index < (node as Element).attributes.length;
        index++
      ) checkCharacters((node as Element).attributes.item(index)!.value);
    }
    if (node.nodeType === 1) {
      const element = node as Element;
      if (element.attributes.length > LIMITS.attributes) {
        fail("xml_attributes", "XML attribute limit exceeded.");
      }
      if (
        element.namespaceURI === "http://www.w3.org/2001/XInclude" ||
        element.hasAttributeNS("http://www.w3.org/XML/1998/namespace", "base")
      ) {
        fail(
          "xml_external_semantics",
          "XInclude and xml:base are not admitted by this package profile.",
        );
      }
    }
    for (let child = node.lastChild; child; child = child.previousSibling) {
      stack.push({ node: child, depth: depth + 1 });
    }
  }
  return document!;
}
export function children(parent: Node, name?: string, namespace?: string) {
  const result: Element[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) {
      const element = child as Element;
      if (
        (name === undefined || element.localName === name) &&
        (namespace === undefined || element.namespaceURI === namespace)
      ) result.push(element);
    }
  }
  return result;
}
export function descendants(parent: Node) {
  const result: Element[] = [], stack: Node[] = [parent];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeType === 1) result.push(node as Element);
    for (let child = node.lastChild; child; child = child.previousSibling) {
      stack.push(child);
    }
  }
  return result;
}
