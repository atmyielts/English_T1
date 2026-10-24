#!/usr/bin/env node
// Validate SAT Practice source content (contract A) before writing a migration.
//
//   node scripts/content/validate-sat-practice.mjs content/sat-practice/*.json
//   node scripts/content/validate-sat-practice.mjs --json --quiet content/sat-practice/algebra.json
//
// Exit code 1 when any ERROR is found; WARNINGS never fail. The same rules run in
// the admin import endpoint (admin-sat-practice) through
// supabase/functions/_shared/sat-practice-content.ts, so a file that passes here
// imports cleanly. Requires Node 22.18+ (TypeScript type stripping; Node 24 here).
//
// RULES (errors unless marked "warning")
//  File: a JSON array of item objects. Legacy {"questions": [...]} files such as
//    original-foundations.json are skipped. Slugs must be unique across ALL files
//    given, and passage+prompt pairs must be unique.
//  Fields: only slug, section, official_domain, skill, sat_domain, difficulty,
//    format, passage, prompt, table, figure_svg, options, answer, explanation.
//    Any other key is an error.
//  slug: kebab-case [a-z0-9-], <= 80 chars.
//  section: "math" | "reading_writing"; official_domain must belong to the section:
//    reading_writing: information_and_ideas, craft_and_structure,
//      expression_of_ideas, standard_english_conventions
//    math: algebra, advanced_math, problem_solving_data_analysis, geometry_trigonometry
//  skill: one of the official College Board skills of that domain (see
//    OFFICIAL_DOMAINS in the shared module / contract A).
//  sat_domain (legacy) must equal: information_and_ideas->command_of_evidence,
//    craft_and_structure->vocabulary_in_context, expression_of_ideas->transitions
//    when skill=transitions else rhetoric, standard_english_conventions->grammar,
//    algebra->algebra, advanced_math->advanced_math,
//    problem_solving_data_analysis->problem_solving_data_analysis,
//    geometry_trigonometry->geometry_trig.
//  difficulty: easy | medium | hard.   format: mcq | spr (spr = Math only).
//  prompt (<= 3000 chars), explanation (40..6000 chars), passage (<= 5000 chars,
//    REQUIRED for reading_writing; warning outside 25-150 words, per text for
//    "Text 1: ...\n\nText 2: ..." items), option labels (<= 600 chars):
//    - non-empty strings; the ONLY markup allowed is balanced, non-nested
//      <u>...</u> (underline). Any other tag (<b>, <br>, <script>, ...) or HTML
//      comment is an error. In math write "x < y" with a space or use \lt: "<y"
//      directly followed by a letter looks like a tag.
//    - math: $...$ inline, $$...$$ display, KaTeX-compatible LaTeX. Every math
//      segment must render with KaTeX (checked here when katex is installed).
//      Pandoc rule: "$" opens only before a non-space and closes only after a
//      non-space not followed by a digit; write \$ for money ("costs \$5").
//      Warning: an unpaired "$" that will show as a literal dollar sign.
//  table (optional): exactly {"headers": [1..8 cells], "rows": [[...], 1..25 rows]},
//    every row as long as headers; cells are strings (<= 300 chars, may hold
//    $math$ and <u>) or numbers.
//  figure_svg (optional, <= 30000 chars): one self-contained <svg> root WITH a
//    viewBox. Allowed elements: svg g path line polyline polygon rect circle
//    ellipse text tspan title desc defs marker clipPath linearGradient
//    radialGradient stop use symbol. Allowed attributes: geometry/presentation
//    attributes only (x y x1.. cx cy r rx ry width height d points viewBox
//    transform fill stroke stroke-* opacity font-* text-anchor
//    dominant-baseline dx dy marker-* refX refY orient offset stop-* ...,
//    id class role aria-label aria-hidden xmlns xmlns:xlink). NOT allowed: style
//    attributes or <style>, <script>, <foreignObject>, <image>, <a>, event
//    handlers (on*), href/xlink:href other than "#local-id", url() other than
//    url(#local-id), data:/javascript: values, DOCTYPE/ENTITY/CDATA. Anything
//    the sanitiser would strip is an error. Add a <title> to describe the figure.
//  mcq: options = exactly 4 objects {"id","label"} with ids A, B, C, D in order,
//    distinct labels; answer = "A" | "B" | "C" | "D". Warning when the
//    explanation does not mention at least two wrong choices ("Choice A ...").
//  spr: no options; answer = array of 1..12 distinct accepted strings. Each must be
//    enterable on the Digital SAT: integer, decimal or fraction (3/4, -7/2, .75),
//    at most 5 characters (6 with a leading minus), no mixed numbers, spaces, %, $
//    or commas. Warning when an accepted value is not equivalent to the others.
//    Grading (sat-engine): exact match after trimming, OR equal value (any
//    equivalent fraction/decimal), OR a decimal that truncates/rounds an accepted
//    value at the precision entered while filling the whole 5-character space
//    (6 with minus). So for 2/3 the grader accepts 2/3, 4/6, .6666, .6667,
//    0.666, 0.667 but not .66 or 0.67; list the fraction plus the usual decimal
//    forms anyway (e.g. ["2/3", ".6666", ".6667", "0.666", "0.667"]).
//  Text fields must not contain control characters: in JSON "\times", "\frac",
//    "\beta", "\right", "\theta" become tab/form-feed/backspace/CR characters, and
//    "\neq" a line break. Always double the backslash: "$a \\times b$".
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// The shared module is TypeScript without a package "type"; hide only Node's
// module-type reparse notice so real warnings stay visible.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  if (String(warning?.message ?? warning).includes('Module type of file')) return;
  return emitWarning.call(process, warning, ...rest);
};
const { validateItems, OFFICIAL_DOMAINS } = await import('../../supabase/functions/_shared/sat-practice-content.ts');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const patterns = args.filter(a => !a.startsWith('--'));
if (!patterns.length || flags.has('--help')) {
  console.log('Usage: node scripts/content/validate-sat-practice.mjs [--json] [--quiet] content/sat-practice/*.json');
  process.exit(patterns.length ? 0 : 2);
}

// PowerShell does not expand globs; support a simple "*" in the file name.
function expand(pattern) {
  if (!pattern.includes('*')) return [pattern];
  const dir = path.dirname(pattern), base = path.basename(pattern);
  const re = new RegExp('^' + base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f)).filter(f => statSync(f).isFile()).sort();
}

let katex = null;
try { katex = createRequire(import.meta.url)('katex'); } catch { /* KaTeX check is skipped when not installed. */ }
const mathCheck = katex ? (tex, display) => {
  try { katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', trust: false }); return null; }
  catch (error) { return String(error?.message ?? error).replace(/^KaTeX parse error: /, '').slice(0, 200); }
} : undefined;

const files = patterns.flatMap(expand);
const items = [], origin = [], skipped = [], fileErrors = [];
for (const file of files) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { fileErrors.push(`${file}: not valid JSON (${error.message})`); continue; }
  if (!Array.isArray(parsed)) {
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) { skipped.push(file); continue; }
    fileErrors.push(`${file}: must be a JSON array of items`); continue;
  }
  parsed.forEach((item, index) => { items.push(item); origin.push({ file, index }); });
}

const result = validateItems(items, mathCheck);
const where = issue => issue.index >= 0 ? `${origin[issue.index].file}#${origin[issue.index].index + 1}${issue.slug ? ` (${issue.slug})` : ''}` : 'input';
const stats = {};
for (const item of items) {
  if (!item || typeof item !== 'object') continue;
  const d = stats[item.official_domain] ??= { total: 0, easy: 0, medium: 0, hard: 0, spr: 0, skills: {} };
  d.total += 1; d[item.difficulty] = (d[item.difficulty] ?? 0) + 1;
  if (item.format === 'spr') d.spr += 1;
  d.skills[item.skill] = (d.skills[item.skill] ?? 0) + 1;
}
const advisories = [];
for (const [domain, d] of Object.entries(stats)) {
  const share = k => Math.round((d[k] / d.total) * 100);
  if (d.total >= 20 && (Math.abs(share('easy') - 35) > 15 || Math.abs(share('medium') - 40) > 15 || Math.abs(share('hard') - 25) > 15)) {
    advisories.push(`${domain}: difficulty ${share('easy')}/${share('medium')}/${share('hard')}% (target about 35/40/25)`);
  }
  const official = OFFICIAL_DOMAINS[domain];
  if (official) for (const skill of official.skills) if (!d.skills[skill]) advisories.push(`${domain}: no items for skill ${skill}`);
  if (official?.section === 'math' && d.total >= 20 && Math.abs((d.spr / d.total) * 100 - 25) > 12) advisories.push(`${domain}: ${Math.round((d.spr / d.total) * 100)}% spr (target about 25%)`);
}

if (flags.has('--json')) {
  console.log(JSON.stringify({ files, skipped, fileErrors, count: result.count, katexChecked: Boolean(katex), stats, advisories,
    errors: result.errors.map(e => ({ ...e, where: where(e) })), warnings: flags.has('--quiet') ? [] : result.warnings.map(w => ({ ...w, where: where(w) })) }, null, 2));
} else {
  for (const f of skipped) console.log(`skip  ${f} (legacy foundations format)`);
  for (const e of fileErrors) console.log(`ERROR ${e}`);
  for (const e of result.errors) console.log(`ERROR ${where(e)}: ${e.message}`);
  if (!flags.has('--quiet')) for (const w of result.warnings) console.log(`warn  ${where(w)}: ${w.message}`);
  for (const a of advisories) console.log(`note  ${a}`);
  for (const [domain, d] of Object.entries(stats)) console.log(`stats ${domain}: ${d.total} items (easy ${d.easy}, medium ${d.medium}, hard ${d.hard}, spr ${d.spr})`);
  console.log(`${result.count} items in ${files.length - skipped.length} file(s): ${result.errors.length + fileErrors.length} error(s), ${result.warnings.length} warning(s)${katex ? '' : ' (KaTeX not installed: math rendering not checked)'}`);
}
process.exit(result.errors.length || fileErrors.length ? 1 : 0);
