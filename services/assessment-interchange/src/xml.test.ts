import { test } from "node:test";
import assert from "node:assert/strict";
import { children, descendants, parseXml, QTI_NS } from "./xml.ts";
import { InterchangeError } from "./policy.ts";
const parse = (source: string) => parseXml(new TextEncoder().encode(source));
test("namespace aware parsing retains text, entities and foreign-language content as data", () => {
  const doc = parse(
    `<?xml version="1.0" encoding="UTF-8"?><q:item xmlns:q="${QTI_NS}"><q:body>Ўзбек &amp; Русский<![CDATA[ <data> ]]></q:body></q:item>`,
  );
  assert.equal(doc.documentElement?.namespaceURI, QTI_NS);
  assert.equal(children(doc.documentElement!, "body", QTI_NS).length, 1);
  assert.equal(descendants(doc.documentElement!).length, 2);
  assert.equal(doc.documentElement?.textContent, "Ўзбек & Русский <data> ");
});
test("DTDs, entities, processing instructions, external inclusion and base rewrites reject", () => {
  for (
    const source of [
      '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>',
      '<!DOCTYPE x SYSTEM "https://example.com/a"><x/>',
      '<?xml-stylesheet href="https://example.com/a"?><x/>',
      '<xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="a"/>',
      '<x xml:base="../"/>',
    ]
  ) assert.throws(() => parse(source), InterchangeError);
});
test("malformed XML is never silently recovered", () => {
  for (
    const source of [
      "<a><b></a>",
      "<a/><b/>",
      "<a>&undefined;</a>",
      '<a x="1" x="2"/>',
      "<q:a/>",
      "<a>",
      "<a><!--",
      "<a><![CDATA[",
      "<a>\0</a>",
      "<a>&#0;</a>",
    ]
  ) assert.throws(() => parse(source), InterchangeError, source);
});
test("encoding and depth/attribute budgets apply before use", () => {
  assert.throws(() => parseXml(new Uint8Array([0xc0, 0xaf])), InterchangeError);
  assert.throws(
    () => parse('<?xml version="1.0" encoding="UTF-16"?><a/>'),
    InterchangeError,
  );
  assert.throws(
    () => parse("<a>".repeat(65) + "</a>".repeat(65)),
    InterchangeError,
  );
  assert.throws(
    () =>
      parse(
        "<a " + Array.from({ length: 65 }, (_, i) => `a${i}="x"`).join(" ") +
          "/>",
      ),
    InterchangeError,
  );
  assert.doesNotThrow(() =>
    parse('<a x="&gt;">text<!-- <nested> --><![CDATA[ <unclosed> ]]></a>')
  );
});
