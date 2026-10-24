import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  gradeSpr, legacyDomainFor, markupIssues, officialTaxonomy, parseRichText, plainText, sanitizeSvg, sprEntryIssue, toContentRows,
  validateItem, validateItems,
} from "./sat-practice-content.ts";
import { isCorrectAnswer } from "./sat-practice-core.ts";

Deno.test("SPR: exact accepted strings and every equivalent fraction or decimal earn credit", () => {
  const twoThirds = ["2/3", ".6666", ".6667", "0.666", "0.667"];
  for (const entry of ["2/3", " 2/3 ", "4/6", "10/15", ".6666", ".6667", "0.666", "0.667"]) assertEquals(gradeSpr(entry, twoThirds), true, entry);
  // Too imprecise for the 5-character answer space: the Digital SAT rejects these.
  for (const entry of [".66", ".67", "0.66", "0.67", "0.6", "1", "3/2", "-2/3", ""]) assertEquals(gradeSpr(entry, twoThirds), false, entry);
  // Only the fraction is listed: the grader still accepts the full-width decimals.
  for (const entry of [".6666", ".6667", "0.666", "0.667"]) assertEquals(gradeSpr(entry, ["2/3"]), true, entry);
  assertEquals(gradeSpr("0.668", ["2/3"]), false);
  for (const entry of ["3.5", "3.50", "7/2", "14/4", "3.500"]) assertEquals(gradeSpr(entry, ["7/2", "3.5"]), true, entry);
  for (const entry of ["3.4", "3", "7/3"]) assertEquals(gradeSpr(entry, ["7/2", "3.5"]), false, entry);
  assertEquals(gradeSpr("12", ["12"]), true);
  assertEquals(gradeSpr("12.0", ["12"]), true);
  assertEquals(gradeSpr("24/2", ["12"]), true);
  assertEquals(gradeSpr(12, ["12"]), true);
  assertEquals(gradeSpr("0", ["0"]), true);
  assertEquals(gradeSpr("0.0", ["0"]), true);
  assertEquals(gradeSpr("-0", ["0"]), true);
});

Deno.test("SPR: negatives use six characters and truncate toward zero", () => {
  const minusThird = ["-1/3", "-.3333", "-0.333"];
  for (const entry of ["-1/3", "-2/6", "-.3333", "-0.333", "−1/3"]) assertEquals(gradeSpr(entry, minusThird), true, entry);
  assertEquals(gradeSpr("-.333", minusThird), true); // equal value to the listed -0.333
  for (const entry of ["-0.33", "-.33", "1/3", ".3333", "-.3334"]) assertEquals(gradeSpr(entry, minusThird), false, entry);
  assertEquals(gradeSpr("-.6667", ["-2/3"]), true); // rounding
  assertEquals(gradeSpr("-.6666", ["-2/3"]), true); // truncation
  assertEquals(gradeSpr("-12.5", ["-25/2"]), true);
  assertEquals(gradeSpr("-12.4", ["-25/2"]), false);
});

Deno.test("SPR: malformed, oversized, mixed numbers and symbols never earn credit", () => {
  for (const entry of ["3 1/2", "1/0", "$5", "50%", "1,000", "abc", "--1", "1/-2", "1.2.3", "123456", ".", "+5", "0x10", "1e3"]) {
    assertEquals(gradeSpr(entry, ["7/2", "5", "0.5", "1000", "16", "-0.5", "123456"]), false, entry);
  }
  assertEquals(gradeSpr("5", "5"), false); // the key must be an accepted list
  assertEquals(gradeSpr(null, ["5"]), false);
  assertEquals(gradeSpr({ text: "5" }, ["5"]), false);
  assertEquals(sprEntryIssue("3 1/2")?.includes("mixed"), true);
  assertEquals(sprEntryIssue("-12345"), null);
  assertEquals(sprEntryIssue("123456") !== null, true);
  assertEquals(sprEntryIssue("-123456") !== null, true);
});

Deno.test("SPR: the scorer grades {text}, {value} and scalar answers against accepted keys", () => {
  const key = { accepted: ["3/4", "0.75", ".75"], feedback: { explanation: "x" } };
  assertEquals(isCorrectAnswer({ text: "6/8" }, key), true);
  assertEquals(isCorrectAnswer({ value: ".75" }, key), true);
  assertEquals(isCorrectAnswer(".750", key), true);
  assertEquals(isCorrectAnswer({ text: ".7" }, key), false);
  assertEquals(isCorrectAnswer({ selected_option: "A" }, key), false);
  assertEquals(isCorrectAnswer({}, key), false);
});

Deno.test("Sanitiser: removes scripts, handlers, styles, foreign content and every external reference", () => {
  const cases: Array<[string, string]> = [
    ['<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>', 'element <script>'],
    ['<svg viewBox="0 0 1 1" onload="alert(1)"/>', 'event handler onload'],
    ['<svg viewBox="0 0 1 1"><rect ONCLICK="x()" width="1"/></svg>', 'event handler ONCLICK'],
    ['<svg viewBox="0 0 1 1"><a href="javascript:alert(1)"><text>x</text></a></svg>', 'element <a>'],
    ['<svg viewBox="0 0 1 1"><use href="https://evil.test/x.svg#a"/></svg>', 'external reference href'],
    ['<svg viewBox="0 0 1 1"><use xlink:href="data:image/svg+xml;base64,PHN2Zz4="/></svg>', 'external reference xlink:href'],
    ['<svg viewBox="0 0 1 1"><image href="http://evil.test/p.png"/></svg>', 'element <image>'],
    ['<svg viewBox="0 0 1 1"><foreignObject><div>x</div></foreignObject></svg>', 'element <foreignObject>'],
    ['<svg viewBox="0 0 1 1"><style>@import url(http://x)</style></svg>', 'element <style>'],
    ['<svg viewBox="0 0 1 1"><rect style="fill:url(http://x)"/></svg>', 'attribute style'],
    ['<svg viewBox="0 0 1 1"><rect fill="url(http://evil.test/#g)"/></svg>', 'external url() in fill'],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg viewBox="0 0 1 1"/>', 'DOCTYPE or entity declaration'],
    ['<svg viewBox="0 0 1 1"><animate attributeName="href" to="javascript:alert(1)"/></svg>', 'element <animate>'],
    ['<svg viewBox="0 0 1 1"><set attributeName="onmouseover" to="alert(1)"/></svg>', 'element <set>'],
    ['<svg viewBox="0 0 1 1"><iframe src="x"></iframe></svg>', 'element <iframe>'],
    ['<svg viewBox="0 0 1 1" xmlns="http://www.w3.org/1999/xhtml"/>', 'non-SVG xmlns'],
    ['<svg viewBox="0 0 1 1"><rect fill="&#106;avascript:x"/></svg>', 'unsafe value in fill'],
  ];
  for (const [input, expected] of cases) {
    const { svg, removed } = sanitizeSvg(input);
    assert(removed.includes(expected), `${input} -> ${removed.join(", ")}`);
    assert(svg === null || !/script|onload|onclick|javascript|http:|https:|data:|style|foreignObject|iframe|animate|<set/i.test(svg.replace('http://www.w3.org/2000/svg', '').replace('http://www.w3.org/1999/xlink', '')), svg ?? "");
  }
  // Text outside the root, a second root, and unclosed markup cannot smuggle content.
  const tricky = sanitizeSvg('<p>x</p><svg viewBox="0 0 1 1"><text>a<script>b</script></text></svg><svg><script>c</script></svg>');
  assertEquals(tricky.svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>a</text></svg>');
  assertEquals(sanitizeSvg('<div>no svg</div>').svg, null);
  assertEquals(sanitizeSvg('<svg viewBox="0 0 1 1"><g><circle r="1">').svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><g><circle r="1"></circle></g></svg>');
});

Deno.test("Sanitiser: keeps a normal geometry figure intact and escapes text", () => {
  const figure = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><title>Right triangle ABC</title><defs><marker id="m" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z"/></marker></defs><polygon points="10,110 190,110 10,10" fill="none" stroke="#111" stroke-width="2"/><line x1="10" y1="110" x2="190" y2="110" marker-end="url(#m)"/><text x="100" y="118" text-anchor="middle" font-size="12">12 &amp; x &lt; 3</text><use href="#m"/></svg>';
  const { svg, removed } = sanitizeSvg(figure);
  assertEquals(removed, []);
  assertEquals(svg, figure);
});

Deno.test("Rich text: only balanced <u> is markup; math follows pandoc delimiters", () => {
  assertEquals(parseRichText("The <u>underlined</u> part"), [
    { kind: "text", text: "The ", underline: false }, { kind: "text", text: "underlined", underline: true }, { kind: "text", text: " part", underline: false }]);
  const unsafe = parseRichText('<img src=x onerror=alert(1)> and <u>open');
  assertEquals(unsafe.every(s => s.kind === "text" && !s.underline), true);
  assertEquals(plainText('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
  assertEquals(markupIssues("<u><u>x</u></u>").includes("nested <u> is not allowed"), true);
  assertEquals(markupIssues("a <b> c").length, 1);
  assertEquals(markupIssues("if $x<y$ and $y>3$ then x < y"), []);
  assertEquals(parseRichText("costs $5 and $10 today"), [{ kind: "text", text: "costs $5 and $10 today", underline: false }]);
  assertEquals(parseRichText("pay \\$5 for $x^2$"), [{ kind: "text", text: "pay $5 for ", underline: false }, { kind: "math", tex: "x^2", display: false, underline: false }]);
  assertEquals(parseRichText("$$\\frac{1}{2}$$"), [{ kind: "math", tex: "\\frac{1}{2}", display: true, underline: false }]);
  assertEquals(parseRichText("<u>$x$</u>")[0], { kind: "math", tex: "x", display: false, underline: true });
});

Deno.test("Taxonomy: legacy items map to official domains; official metadata wins", () => {
  assertEquals(officialTaxonomy({ sat_domain: "grammar" }), { official_domain: "standard_english_conventions", skill: null });
  assertEquals(officialTaxonomy({}, "transitions"), { official_domain: "expression_of_ideas", skill: "transitions" });
  assertEquals(officialTaxonomy({}, "geometry_trig"), { official_domain: "geometry_trigonometry", skill: null });
  assertEquals(officialTaxonomy({ sat_official_domain: "algebra", sat_skill: "linear_functions" }, "algebra"), { official_domain: "algebra", skill: "linear_functions" });
  assertEquals(officialTaxonomy({ sat_official_domain: "algebra", sat_skill: "circles" }), { official_domain: "algebra", skill: null });
  assertEquals(legacyDomainFor("expression_of_ideas", "transitions"), "transitions");
  assertEquals(legacyDomainFor("expression_of_ideas", "rhetorical_synthesis"), "rhetoric");
});

const mcq = {
  slug: "alg-lin1v-001", section: "math", official_domain: "algebra", skill: "linear_equations_one_variable", sat_domain: "algebra",
  difficulty: "easy", format: "mcq", prompt: "If $3x + 5 = 20$, what is the value of $x$?",
  options: [{ id: "A", label: "$3$" }, { id: "B", label: "$5$" }, { id: "C", label: "$\\frac{25}{3}$" }, { id: "D", label: "$15$" }],
  answer: "B", explanation: "Subtract 5 to get $3x = 15$, so $x = 5$. Choice A divides 15 by 5. Choice C adds 5. Choice D stops early.",
};
const spr = { ...mcq, slug: "alg-lin1v-002", format: "spr", options: undefined, answer: ["2/3", ".6666", ".6667", "0.666", "0.667"],
  prompt: "If $3x = 2$, what is $x$?", table: { headers: ["x", "y"], rows: [["1", "4"], ["2", 7]] },
  figure_svg: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' };
delete (spr as Record<string, unknown>).options;
const rw = { slug: "eoi-trans-001", section: "reading_writing", official_domain: "expression_of_ideas", skill: "transitions", sat_domain: "transitions",
  difficulty: "medium", format: "mcq", passage: "The morning train was nearly empty, and the station felt quiet. By evening, however, the platform had filled with commuters returning from the city, and every carriage carried standing passengers.",
  prompt: "Which choice completes the text with the most logical transition for the <u>underlined</u> portion?",
  options: [{ id: "A", label: "Similarly" }, { id: "B", label: "For example" }, { id: "C", label: "By contrast" }, { id: "D", label: "Therefore" }],
  answer: "C", explanation: "The texts contrast quiet and crowded trains. Choice A signals similarity, Choice B an example, Choice D a result." };

Deno.test("Validator: accepts contract-A mcq, spr with table/figure and R&W with <u>", () => {
  for (const item of [mcq, spr, rw]) assertEquals(validateItem(item).errors, [], (item as { slug: string }).slug);
  const result = validateItems([mcq, spr, rw]);
  assertEquals(result.errors, []);
  assertEquals(result.count, 3);
  const rows = toContentRows(spr as never);
  assertEquals(rows.type, "question_spr");
  assertEquals(rows.correct, { accepted: spr.answer });
  assertEquals((rows.data as Record<string, unknown>).options, undefined);
  assertEquals((rows.data.table as { rows: string[][] }).rows[1], ["2", "7"]);
  assertEquals(rows.metadata.answer_format, "spr");
  assertEquals(toContentRows(mcq as never).correct, { option_id: "B" });
});

Deno.test("Validator: rejects every contract violation", () => {
  const bad = (patch: Record<string, unknown>, base: Record<string, unknown> = mcq) => validateItem({ ...base, ...patch }).errors;
  assert(bad({ extra: 1 }).some(e => e.includes('unknown field')));
  assert(bad({ slug: "Bad Slug" }).some(e => e.includes("slug")));
  assert(bad({ official_domain: "craft_and_structure" }).some(e => e.includes("belongs to section")));
  assert(bad({ skill: "circles" }).some(e => e.includes("skill must be")));
  assert(bad({ sat_domain: "geometry_trig" }).some(e => e.includes("sat_domain")));
  assert(bad({ sat_domain: "rhetoric" }, rw).some(e => e.includes('"transitions"')));
  assert(bad({ difficulty: "expert" }).some(e => e.includes("difficulty")));
  assert(bad({ answer: "E" }).some(e => e.includes("mcq answer")));
  assert(bad({ options: mcq.options.slice(0, 3) }).some(e => e.includes("exactly 4")));
  assert(bad({ options: [...mcq.options.slice(0, 3), { id: "E", label: "x" }] }).some(e => e.includes('id must be "D"')));
  assert(bad({ prompt: "Use <b>bold</b>" }).some(e => e.includes("<b>")));
  assert(bad({ prompt: "<u>open" }).some(e => e.includes("not closed")));
  assert(bad({ prompt: "Compute $a \u0009imes b$" }).some(e => e.includes("control character")));
  assert(bad({ prompt: "Compute $a \neq b$" }).some(e => e.includes("line break")));
  assert(bad({ explanation: "Short." }).some(e => e.includes("at least 40")));
  assert(bad({ format: "spr", answer: ["3 1/2"] }, spr).some(e => e.includes("mixed")));
  assert(bad({ answer: ["123456"] }, spr).some(e => e.includes("at most 5")));
  assert(bad({ answer: "2/3" }, spr).some(e => e.includes("array")));
  assert(bad({ options: mcq.options }, spr).some(e => e.includes("must not have options")));
  assert(bad({ format: "spr", answer: ["1"], options: undefined }, rw).some(e => e.includes("Math only")));
  assert(bad({ passage: undefined }, rw).some(e => e.includes("need a passage")));
  assert(bad({ table: { headers: ["a"], rows: [["1", "2"]] } }).some(e => e.includes("matching the header")));
  assert(bad({ table: { headers: ["a"], rows: [["1"]], caption: "x" } }).some(e => e.includes("table must be")));
  assert(bad({ figure_svg: '<svg viewBox="0 0 1 1"><script>x</script></svg>' }).some(e => e.includes("disallowed")));
  assert(bad({ figure_svg: '<svg><circle r="1"/></svg>' }).some(e => e.includes("viewBox")));
  const dup = validateItems([mcq, { ...mcq }]);
  assert(dup.errors.some(e => e.message.includes("duplicate slug")));
  assert(dup.errors.some(e => e.message.includes("duplicate passage+prompt")));
  assertEquals(validateItems({}).errors.length, 1);
  const checked = validateItem(mcq, tex => tex.includes("frac") ? "Undefined control sequence" : null).errors;
  assert(checked.some(e => e.includes("KaTeX cannot render")));
  assert(validateItem({ ...spr, answer: ["2/3", "0.67"] }).warnings.some(w => w.includes('"0.67"')));
});
