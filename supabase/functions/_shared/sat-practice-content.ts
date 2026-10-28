// SAT Practice content contract A: taxonomy, rich text, grid-in grading, SVG
// sanitising and strict item validation. Shared by the Edge functions (Deno),
// the browser app (Vite) and the content CLI (Node 22.18+/24 type stripping),
// so it must stay dependency-free and use only erasable TypeScript syntax.
// The validation rules are documented in scripts/content/validate-sat-practice.mjs.

export type SatSection = 'math' | 'reading_writing';
export type OfficialDomain =
  | 'information_and_ideas' | 'craft_and_structure' | 'expression_of_ideas' | 'standard_english_conventions'
  | 'algebra' | 'advanced_math' | 'problem_solving_data_analysis' | 'geometry_trigonometry';
export type LegacyDomain =
  | 'grammar' | 'transitions' | 'rhetoric' | 'vocabulary_in_context' | 'command_of_evidence'
  | 'algebra' | 'advanced_math' | 'problem_solving_data_analysis' | 'geometry_trig';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type AnswerFormat = 'mcq' | 'spr';

export const OFFICIAL_DOMAINS: Record<OfficialDomain, { section: SatSection; label: string; skills: readonly string[] }> = {
  information_and_ideas: { section: 'reading_writing', label: 'Information and Ideas',
    skills: ['central_ideas_and_details', 'command_of_evidence_textual', 'command_of_evidence_quantitative', 'inferences'] },
  craft_and_structure: { section: 'reading_writing', label: 'Craft and Structure',
    skills: ['words_in_context', 'text_structure_and_purpose', 'cross_text_connections'] },
  expression_of_ideas: { section: 'reading_writing', label: 'Expression of Ideas', skills: ['rhetorical_synthesis', 'transitions'] },
  standard_english_conventions: { section: 'reading_writing', label: 'Standard English Conventions', skills: ['boundaries', 'form_structure_and_sense'] },
  algebra: { section: 'math', label: 'Algebra', skills: ['linear_equations_one_variable', 'linear_functions',
    'linear_equations_two_variables', 'systems_of_linear_equations', 'linear_inequalities'] },
  advanced_math: { section: 'math', label: 'Advanced Math', skills: ['equivalent_expressions', 'nonlinear_equations_and_systems', 'nonlinear_functions'] },
  problem_solving_data_analysis: { section: 'math', label: 'Problem-Solving and Data Analysis', skills: ['ratios_rates_proportions_units',
    'percentages', 'one_variable_data', 'two_variable_data', 'probability_and_conditional_probability',
    'inference_from_samples_and_margin_of_error', 'evaluating_statistical_claims'] },
  geometry_trigonometry: { section: 'math', label: 'Geometry and Trigonometry',
    skills: ['area_and_volume', 'lines_angles_triangles', 'right_triangles_and_trigonometry', 'circles'] },
};
export const OFFICIAL_DOMAIN_IDS = Object.keys(OFFICIAL_DOMAINS) as OfficialDomain[];
// Display order of the Digital SAT: R&W modules present Craft and Structure,
// Information and Ideas, Standard English Conventions, then Expression of Ideas.
export const RW_MODULE_ORDER: OfficialDomain[] = ['craft_and_structure', 'information_and_ideas', 'standard_english_conventions', 'expression_of_ideas'];
export const MATH_DOMAIN_ORDER: OfficialDomain[] = ['algebra', 'advanced_math', 'problem_solving_data_analysis', 'geometry_trigonometry'];

export const SKILL_LABELS: Record<string, string> = {
  central_ideas_and_details: 'Central Ideas and Details', command_of_evidence_textual: 'Command of Evidence: Textual',
  command_of_evidence_quantitative: 'Command of Evidence: Quantitative', inferences: 'Inferences',
  words_in_context: 'Words in Context', text_structure_and_purpose: 'Text Structure and Purpose',
  cross_text_connections: 'Cross-Text Connections', rhetorical_synthesis: 'Rhetorical Synthesis', transitions: 'Transitions',
  boundaries: 'Boundaries', form_structure_and_sense: 'Form, Structure, and Sense',
  linear_equations_one_variable: 'Linear equations in one variable', linear_functions: 'Linear functions',
  linear_equations_two_variables: 'Linear equations in two variables', systems_of_linear_equations: 'Systems of two linear equations in two variables',
  linear_inequalities: 'Linear inequalities in one or two variables', equivalent_expressions: 'Equivalent expressions',
  nonlinear_equations_and_systems: 'Nonlinear equations in one variable and systems of equations in two variables',
  nonlinear_functions: 'Nonlinear functions', ratios_rates_proportions_units: 'Ratios, rates, proportional relationships, and units',
  percentages: 'Percentages', one_variable_data: 'One-variable data: distributions and measures of centre and spread',
  two_variable_data: 'Two-variable data: models and scatterplots', probability_and_conditional_probability: 'Probability and conditional probability',
  inference_from_samples_and_margin_of_error: 'Inference from sample statistics and margin of error',
  evaluating_statistical_claims: 'Evaluating statistical claims: observational studies and experiments',
  area_and_volume: 'Area and volume', lines_angles_triangles: 'Lines, angles, and triangles',
  right_triangles_and_trigonometry: 'Right triangles and trigonometry', circles: 'Circles',
};

export const LEGACY_DOMAINS: LegacyDomain[] = ['grammar', 'transitions', 'rhetoric', 'vocabulary_in_context', 'command_of_evidence',
  'algebra', 'advanced_math', 'problem_solving_data_analysis', 'geometry_trig'];
export const LEGACY_TO_OFFICIAL: Record<LegacyDomain, OfficialDomain> = {
  grammar: 'standard_english_conventions', transitions: 'expression_of_ideas', rhetoric: 'expression_of_ideas',
  vocabulary_in_context: 'craft_and_structure', command_of_evidence: 'information_and_ideas', algebra: 'algebra',
  advanced_math: 'advanced_math', problem_solving_data_analysis: 'problem_solving_data_analysis', geometry_trig: 'geometry_trigonometry',
};
// Skills that a legacy domain unambiguously names. Others cover the whole domain.
export const LEGACY_SKILLS: Partial<Record<LegacyDomain, string[]>> = {
  transitions: ['transitions'], rhetoric: ['rhetorical_synthesis'], vocabulary_in_context: ['words_in_context'],
  command_of_evidence: ['command_of_evidence_textual', 'command_of_evidence_quantitative'],
};

export function legacyDomainFor(domain: OfficialDomain, skill: string | null | undefined): LegacyDomain {
  switch (domain) {
    case 'information_and_ideas': return 'command_of_evidence';
    case 'craft_and_structure': return 'vocabulary_in_context';
    case 'expression_of_ideas': return skill === 'transitions' ? 'transitions' : 'rhetoric';
    case 'standard_english_conventions': return 'grammar';
    case 'geometry_trigonometry': return 'geometry_trig';
    default: return domain;
  }
}

const isOfficial = (value: unknown): value is OfficialDomain => typeof value === 'string' && value in OFFICIAL_DOMAINS;
const isLegacy = (value: unknown): value is LegacyDomain => typeof value === 'string' && (LEGACY_DOMAINS as string[]).includes(value);

/** Official taxonomy for any bank question, including the 27 legacy items that only carry sat_domain. */
export function officialTaxonomy(metadata: Record<string, unknown> | null | undefined, legacyDomain?: unknown): { official_domain: OfficialDomain; skill: string | null } {
  const meta = metadata ?? {};
  const declared = meta.sat_official_domain;
  if (isOfficial(declared)) {
    const skill = typeof meta.sat_skill === 'string' && OFFICIAL_DOMAINS[declared].skills.includes(meta.sat_skill) ? meta.sat_skill : null;
    return { official_domain: declared, skill };
  }
  const legacy = isLegacy(legacyDomain) ? legacyDomain : isLegacy(meta.sat_domain) ? meta.sat_domain : 'grammar';
  const skills = LEGACY_SKILLS[legacy];
  return { official_domain: LEGACY_TO_OFFICIAL[legacy], skill: skills?.length === 1 ? skills[0]! : null };
}

export function answerFormatOf(type: unknown, metadata?: Record<string, unknown> | null): AnswerFormat {
  if (metadata?.answer_format === 'spr' || type === 'question_spr') return 'spr';
  return 'mcq';
}

// ---------------------------------------------------------------- rich text
export type RichSegment = { kind: 'text'; text: string; underline: boolean } | { kind: 'math'; tex: string; display: boolean; underline: boolean };

const TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g;

/** Only balanced, non-nested <u>…</u> markup is permitted; everything else is an error. */
export function markupIssues(text: string): string[] {
  const issues: string[] = [];
  let depth = 0;
  if (text.includes('<!--')) issues.push('HTML comments are not allowed');
  for (const match of text.matchAll(TAG)) {
    const tag = match[0];
    if (tag === '<u>') { if (depth) issues.push('nested <u> is not allowed'); depth += 1; }
    else if (tag === '</u>') { if (!depth) issues.push('</u> without a matching <u>'); else depth -= 1; }
    else issues.push(`HTML tag ${tag.length > 40 ? tag.slice(0, 40) + '…' : tag} is not allowed (only <u>…</u>)`);
  }
  if (depth) issues.push('<u> is not closed');
  return issues;
}

// Pandoc-style math delimiters: `$` opens only before a non-space character and
// closes only after a non-space character not followed by a digit, so prices
// such as "$5 and $10" stay text. `\$` is always a literal dollar sign.
function mathSegments(text: string, underline: boolean, out: RichSegment[]) {
  let buffer = '', i = 0;
  const flush = () => { if (buffer) out.push({ kind: 'text', text: buffer, underline }); buffer = ''; };
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\' && text[i + 1] === '$') { buffer += '$'; i += 2; continue; }
    if (ch === '$' && text[i + 1] === '$') {
      const end = text.indexOf('$$', i + 2);
      if (end > i + 2) { flush(); out.push({ kind: 'math', tex: text.slice(i + 2, end).trim(), display: true, underline }); i = end + 2; continue; }
    }
    if (ch === '$' && text[i + 1] && !/\s/.test(text[i + 1]!) && text[i + 1] !== '$') {
      let j = i + 1, close = -1;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '$' && !/\s/.test(text[j - 1]!) && !/[0-9]/.test(text[j + 1] ?? '')) { close = j; break; }
        if (text[j] === '\n' && text[j + 1] === '\n') break;
        j += 1;
      }
      if (close > i + 1) { flush(); out.push({ kind: 'math', tex: text.slice(i + 1, close), display: false, underline }); i = close + 1; continue; }
    }
    buffer += ch; i += 1;
  }
  flush();
}

/** Split content text into plain text, inline/display math and underlined runs. Never returns HTML. */
export function parseRichText(input: unknown): RichSegment[] {
  const text = typeof input === 'string' ? input : input == null ? '' : String(input);
  const out: RichSegment[] = [];
  const balanced = markupIssues(text).length === 0;
  if (!balanced) { mathSegments(text, false, out); return out; }
  const parts = text.split(/(<\/?u>)/);
  let underline = false;
  for (const part of parts) {
    if (part === '<u>') { underline = true; continue; }
    if (part === '</u>') { underline = false; continue; }
    if (part) mathSegments(part, underline, out);
  }
  return out;
}

/** Plain text for search, AI prompts and accessibility (markup removed, math kept as TeX). */
export function plainText(input: unknown): string {
  return parseRichText(input).map(s => s.kind === 'text' ? s.text : s.tex).join('');
}

function literalDollarCount(text: string): number {
  return parseRichText(text).reduce((sum, s) => sum + (s.kind === 'text' ? (s.text.match(/\$/g)?.length ?? 0) : 0), 0)
    - (text.match(/\\\$/g)?.length ?? 0);
}

// ---------------------------------------------------------- grid-in (SPR)
export type SprNumber = { negative: boolean; num: bigint; den: bigint; kind: 'integer' | 'decimal' | 'fraction'; decimals: number };
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };

export function normalizeSprInput(value: unknown): string {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : '';
  return raw.trim().replace(/−/g, '-');
}

/** Parses a grid-in entry: integer, decimal (".75", "0.75", "-.5") or fraction ("3/4", "-7/2"). */
export function parseSprNumber(value: unknown): SprNumber | null {
  const s = normalizeSprInput(value);
  let m = /^(-?)(\d+)\/(\d+)$/.exec(s);
  if (m) {
    const den = BigInt(m[3]!);
    if (den === 0n) return null;
    let num = BigInt(m[2]!); const g = gcd(num, den) || 1n;
    num = num / g;
    return { negative: m[1] === '-' && num !== 0n, num: m[1] === '-' ? -num : num, den: den / g, kind: 'fraction', decimals: 0 };
  }
  m = /^(-?)(\d*)\.(\d+)$/.exec(s);
  if (m) {
    const decimals = m[3]!.length;
    let num = BigInt((m[2] || '0') + m[3]!), den = 10n ** BigInt(decimals);
    const g = gcd(num, den) || 1n; num /= g; den /= g;
    return { negative: m[1] === '-' && num !== 0n, num: m[1] === '-' ? -num : num, den, kind: 'decimal', decimals };
  }
  m = /^(-?)(\d+)$/.exec(s);
  if (m) { const num = BigInt(m[2]!); return { negative: m[1] === '-' && num !== 0n, num: m[1] === '-' ? -num : num, den: 1n, kind: 'integer', decimals: 0 }; }
  return null;
}

export const SPR_MAX_POSITIVE = 5, SPR_MAX_NEGATIVE = 6;
export const sprMaxLength = (entry: string): number => entry.startsWith('-') ? SPR_MAX_NEGATIVE : SPR_MAX_POSITIVE;

export type SprProblem = 'empty' | 'spaces' | 'symbols' | 'length' | 'format';
/** Machine-readable reason a grid-in entry cannot be entered on the Digital SAT (null when it can). */
export function sprEntryProblem(value: unknown): SprProblem | null {
  const s = normalizeSprInput(value);
  if (!s) return 'empty';
  if (/\s/.test(s)) return 'spaces';
  if (/[%$,]/.test(s)) return 'symbols';
  if (s.length > sprMaxLength(s)) return 'length';
  if (!parseSprNumber(s)) return 'format';
  return null;
}
const SPR_PROBLEM_TEXT: Record<SprProblem, string> = {
  empty: 'empty answer', spaces: 'no spaces or mixed numbers (enter 7/2, not 3 1/2)', symbols: 'no symbols such as %, $ or commas',
  length: `at most ${SPR_MAX_POSITIVE} characters (${SPR_MAX_NEGATIVE} with a leading minus)`, format: 'must be an integer, a decimal or a fraction such as 3/4',
};
/** Why a grid-in entry cannot be entered on the Digital SAT, or null when it can. */
export function sprEntryIssue(value: unknown): string | null {
  const problem = sprEntryProblem(value);
  return problem ? SPR_PROBLEM_TEXT[problem] : null;
}

const same = (a: SprNumber, b: { num: bigint; den: bigint }) => a.num * b.den === b.num * a.den;
function atPrecision(target: { num: bigint; den: bigint }, decimals: number, mode: 'trunc' | 'round'): { num: bigint; den: bigint } {
  const scale = 10n ** BigInt(decimals), scaled = target.num * scale, negative = scaled < 0n, abs = negative ? -scaled : scaled;
  let q = abs / target.den;
  if (mode === 'round' && (abs % target.den) * 2n >= target.den) q += 1n;
  return { num: negative ? -q : q, den: scale };
}

/**
 * Digital SAT grid-in grading. Correct when the trimmed entry exactly matches an
 * accepted string, or its value equals an accepted value (any equivalent fraction
 * or decimal), or it is a decimal that truncates or rounds an accepted value at
 * the precision entered while using the full answer space (5 characters, 6 with
 * a minus): for 2/3 ".6666", ".6667", "0.666", "0.667" count, ".66" or "0.67" do not.
 */
export function gradeSpr(value: unknown, accepted: unknown): boolean {
  const entry = normalizeSprInput(value);
  if (!entry || !Array.isArray(accepted)) return false;
  const keys = accepted.filter((a): a is string | number => typeof a === 'string' || (typeof a === 'number' && Number.isFinite(a))).map(normalizeSprInput).filter(Boolean);
  // An entry that cannot be typed into the Digital SAT answer space never scores.
  if (sprEntryIssue(entry)) return false;
  if (keys.includes(entry)) return true;
  const answer = parseSprNumber(entry)!;
  const targets = keys.map(parseSprNumber).filter((t): t is SprNumber => t !== null);
  if (targets.some(t => same(answer, t))) return true;
  if (answer.kind !== 'decimal' || entry.length !== sprMaxLength(entry)) return false;
  return targets.some(t => same(answer, atPrecision(t, answer.decimals, 'trunc')) || same(answer, atPrecision(t, answer.decimals, 'round')));
}

// ------------------------------------------------------------- SVG sanitiser
const SVG_ELEMENTS = new Set(['svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan',
  'title', 'desc', 'defs', 'marker', 'clipPath', 'linearGradient', 'radialGradient', 'stop', 'use', 'symbol']);
const SVG_ATTRIBUTES = new Set(['id', 'class', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'width', 'height',
  'd', 'points', 'viewBox', 'preserveAspectRatio', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'opacity',
  'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'baseline-shift',
  'letter-spacing', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust', 'marker-start', 'marker-mid', 'marker-end', 'markerWidth',
  'markerHeight', 'markerUnits', 'refX', 'refY', 'orient', 'clip-path', 'clip-rule', 'clipPathUnits', 'offset', 'stop-color',
  'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'vector-effect', 'display', 'visibility', 'role',
  'aria-label', 'aria-hidden', 'version', 'xmlns', 'xmlns:xlink', 'href', 'xlink:href', 'paint-order', 'shape-rendering', 'xml:space']);
const SVG_NS = 'http://www.w3.org/2000/svg', XLINK_NS = 'http://www.w3.org/1999/xlink';
const escapeAttr = (v: string) => v.replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos);)/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const escapeText = (v: string) => v.replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function attributeProblem(name: string, value: string): string | null {
  if (/^on/i.test(name)) return `event handler ${name}`;
  if (!SVG_ATTRIBUTES.has(name)) return `attribute ${name}`;
  if (name === 'xmlns' && value !== SVG_NS) return 'non-SVG xmlns';
  if (name === 'xmlns:xlink' && value !== XLINK_NS) return 'unexpected xmlns:xlink';
  if ((name === 'href' || name === 'xlink:href') && !/^#[A-Za-z_][\w.-]*$/.test(value)) return `external reference ${name}`;
  if (/javascript:|vbscript:|data:|expression\s*\(|@import|&#/i.test(value)) return `unsafe value in ${name}`;
  const urls = value.match(/url\s*\([^)]*\)/gi) ?? [];
  if (urls.some(u => !/^url\(#[A-Za-z_][\w.-]*\)$/.test(u.replace(/\s+/g, '')))) return `external url() in ${name}`;
  if (value.length > 20000) return `oversized ${name}`;
  return null;
}

/**
 * Whitelist sanitiser for content SVG figures (no DOM required). Keeps only
 * known-safe SVG elements and presentation attributes; drops scripts, styles,
 * foreignObject, images, links, event handlers, entity declarations and every
 * external or data: reference. `removed` lists anything stripped.
 */
export function sanitizeSvg(input: unknown): { svg: string | null; removed: string[] } {
  const removed: string[] = [];
  if (typeof input !== 'string' || !input.trim()) return { svg: null, removed: ['empty figure'] };
  if (input.length > 60000) return { svg: null, removed: ['figure larger than 60000 characters'] };
  const s = input;
  let out = '', i = 0, skip = 0, rootSeen = false, rootClosed = false;
  const stack: string[] = [];
  const note = (what: string) => { if (!removed.includes(what)) removed.push(what); };
  while (i < s.length) {
    if (s.startsWith('<!--', i)) { const end = s.indexOf('-->', i + 4); i = end < 0 ? s.length : end + 3; continue; }
    if (s.startsWith('<?', i)) { const end = s.indexOf('?>', i + 2); i = end < 0 ? s.length : end + 2; continue; }
    if (s.startsWith('<![CDATA[', i)) { note('CDATA section'); const end = s.indexOf(']]>', i); i = end < 0 ? s.length : end + 3; continue; }
    if (s.startsWith('<!', i)) { note('DOCTYPE or entity declaration'); const end = s.indexOf('>', i); i = end < 0 ? s.length : end + 1; continue; }
    if (s[i] === '<') {
      const close = /^<\/\s*([A-Za-z][\w:.-]*)\s*>/.exec(s.slice(i));
      if (close) {
        const name = close[1]!;
        i += close[0].length;
        let at = stack.length - 1;
        while (at >= 0 && stack[at] !== name && stack[at] !== '!' + name) at -= 1;
        if (at < 0) continue;
        while (stack.length > at) {
          const top = stack.pop()!;
          if (top.startsWith('!')) skip -= 1; else out += `</${top}>`;
        }
        if (!stack.length && rootSeen) rootClosed = true;
        continue;
      }
      const open = /^<([A-Za-z][\w:.-]*)/.exec(s.slice(i));
      if (!open) { if (!skip && rootSeen && !rootClosed) out += '&lt;'; i += 1; continue; }
      const name = open[1]!;
      let j = i + open[0].length;
      const attrs: Array<[string, string]> = [];
      let selfClosing = false;
      while (j < s.length) {
        const ws = /^\s+/.exec(s.slice(j)); if (ws) j += ws[0].length;
        if (s[j] === '>') { j += 1; break; }
        if (s.startsWith('/>', j)) { selfClosing = true; j += 2; break; }
        const attr = /^([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/.exec(s.slice(j));
        if (!attr) { j += 1; continue; }
        attrs.push([attr[1]!, attr[2] ?? attr[3] ?? attr[4] ?? '']);
        j += attr[0].length;
      }
      i = j;
      const allowed = SVG_ELEMENTS.has(name) && !skip && !rootClosed && (rootSeen || name === 'svg') && !(name === 'svg' && rootSeen && !stack.length);
      if (!allowed) {
        if (!skip && !(rootClosed && name === 'svg')) note(`element <${name}>`);
        if (!selfClosing) { stack.push('!' + name); skip += 1; }
        continue;
      }
      const kept: string[] = [];
      for (const [attrName, value] of attrs) {
        const problem = attributeProblem(attrName, value);
        if (problem) { note(problem); continue; }
        kept.push(`${attrName}="${escapeAttr(value)}"`);
      }
      if (name === 'svg' && !rootSeen) {
        rootSeen = true;
        if (!attrs.some(([n]) => n === 'xmlns')) kept.unshift(`xmlns="${SVG_NS}"`);
        if (kept.some(a => a.startsWith('xlink:href=')) && !attrs.some(([n]) => n === 'xmlns:xlink')) kept.push(`xmlns:xlink="${XLINK_NS}"`);
      }
      out += `<${name}${kept.length ? ' ' + kept.join(' ') : ''}${selfClosing ? '/>' : '>'}`;
      if (!selfClosing) stack.push(name);
      else if (name === 'svg') rootClosed = true;
      continue;
    }
    const next = s.indexOf('<', i), text = s.slice(i, next < 0 ? s.length : next);
    i = next < 0 ? s.length : next;
    if (skip) continue;
    if (!rootSeen || rootClosed) { if (text.trim()) note('text outside <svg>'); continue; }
    out += escapeText(text);
  }
  while (stack.length) { const top = stack.pop()!; if (!top.startsWith('!')) out += `</${top}>`; }
  if (!rootSeen) return { svg: null, removed: removed.length ? removed : ['no <svg> root element'] };
  // Hidden xlink:href use declared later is still covered by the attribute check.
  return { svg: out.replace(/<svg([^>]*)>/, (m, a) => a.includes('xlink:href') || !out.includes('xlink:href') || a.includes('xmlns:xlink') ? m : `<svg${a} xmlns:xlink="${XLINK_NS}">`), removed };
}

export function svgTitle(svg: string | null): string | null {
  const m = svg ? /<title>([^<]{1,300})<\/title>/.exec(svg) : null;
  return m ? m[1]!.trim() : null;
}

// --------------------------------------------------------------- validation
export const CONTENT_REVISION = 'original-2026-10-v2';
export const ANSWER_SOURCE = 'original-schood-practice-v2';
const ITEM_KEYS = new Set(['slug', 'section', 'official_domain', 'skill', 'sat_domain', 'difficulty', 'format', 'passage', 'prompt',
  'table', 'figure_svg', 'options', 'answer', 'explanation']);
const LIMITS = { prompt: 3000, passage: 5000, explanation: 6000, option: 600, cell: 300 };

export type ItemIssue = { index: number; slug: string | null; message: string };
export type ValidationResult = { errors: ItemIssue[]; warnings: ItemIssue[]; count: number };
export type MathCheck = (tex: string, display: boolean) => string | null;
export type ContractItem = {
  slug: string; section: SatSection; official_domain: OfficialDomain; skill: string; sat_domain: LegacyDomain; difficulty: Difficulty;
  format: AnswerFormat; passage?: string; prompt: string; table?: { headers: string[]; rows: string[][] }; figure_svg?: string;
  options?: Array<{ id: string; label: string }>; answer: string | string[]; explanation: string;
};

const words = (text: string) => plainText(text).replace(/Text [12]:/g, ' ').split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length;

function textField(value: unknown, field: string, max: number, errors: string[], warnings: string[], mathCheck?: MathCheck, required = true): string | null {
  if (value === undefined && !required) return null;
  if (typeof value !== 'string' || !value.trim()) { errors.push(`${field} must be a non-empty string`); return null; }
  if (value.length > max) errors.push(`${field} is longer than ${max} characters`);
  // JSON turns \t \b \f \r \n into control characters: "\times", "\frac", "\beta",
  // "\right", "\neq" need a double backslash ("\\times") in the source file.
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value)) errors.push(`${field} contains a control character (tab/backspace/form feed/carriage return): write LaTeX commands such as \\times, \\frac, \\beta, \\right with a double backslash in JSON`);
  for (const segment of parseRichText(value)) {
    if (segment.kind === 'math' && segment.tex.includes('\n')) errors.push(`${field}: math contains a line break; "\\neq", "\\nu" etc. need a double backslash in JSON`);
  }
  for (const issue of markupIssues(value)) errors.push(`${field}: ${issue}`);
  const dollars = literalDollarCount(value);
  if (dollars > 0) warnings.push(`${field}: ${dollars} unpaired "$" will display as a dollar sign; write \\$ for money or check the math delimiters`);
  if (mathCheck) {
    for (const segment of parseRichText(value)) {
      if (segment.kind !== 'math') continue;
      if (!segment.tex.trim()) { errors.push(`${field}: empty math expression`); continue; }
      const problem = mathCheck(segment.tex, segment.display);
      if (problem) errors.push(`${field}: KaTeX cannot render "${segment.tex.slice(0, 60)}": ${problem}`);
    }
  }
  return value;
}

/** Validate one contract-A item. Returns human-readable errors (blocking) and warnings. */
export function validateItem(item: unknown, mathCheck?: MathCheck): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { errors: ['item must be a JSON object'], warnings };
  const q = item as Record<string, unknown>;
  for (const key of Object.keys(q)) if (!ITEM_KEYS.has(key)) errors.push(`unknown field "${key}"`);
  if (typeof q.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(q.slug) || q.slug.length > 80) errors.push('slug must be kebab-case [a-z0-9-], at most 80 characters');
  if (q.section !== 'math' && q.section !== 'reading_writing') errors.push('section must be "math" or "reading_writing"');
  const domain = isOfficial(q.official_domain) ? q.official_domain : null;
  if (!domain) errors.push(`official_domain must be one of ${OFFICIAL_DOMAIN_IDS.join(', ')}`);
  else {
    if (OFFICIAL_DOMAINS[domain].section !== q.section) errors.push(`official_domain ${domain} belongs to section ${OFFICIAL_DOMAINS[domain].section}`);
    if (typeof q.skill !== 'string' || !OFFICIAL_DOMAINS[domain].skills.includes(q.skill)) errors.push(`skill must be one of ${OFFICIAL_DOMAINS[domain].skills.join(', ')}`);
    const legacy = legacyDomainFor(domain, typeof q.skill === 'string' ? q.skill : null);
    if (q.sat_domain !== legacy) errors.push(`sat_domain must be "${legacy}" for ${domain}${domain === 'expression_of_ideas' ? '/' + String(q.skill) : ''}`);
  }
  if (!['easy', 'medium', 'hard'].includes(q.difficulty as string)) errors.push('difficulty must be easy, medium or hard');
  if (q.format !== 'mcq' && q.format !== 'spr') errors.push('format must be "mcq" or "spr"');
  if (q.format === 'spr' && q.section !== 'math') errors.push('spr (grid-in) items are Math only');
  const passage = textField(q.passage, 'passage', LIMITS.passage, errors, warnings, mathCheck, false);
  textField(q.prompt, 'prompt', LIMITS.prompt, errors, warnings, mathCheck);
  textField(q.explanation, 'explanation', LIMITS.explanation, errors, warnings, mathCheck);
  if (typeof q.explanation === 'string' && q.explanation.trim().length < 40) errors.push('explanation must explain the answer (at least 40 characters)');
  if (q.section === 'reading_writing') {
    if (passage === null) errors.push('reading_writing items need a passage');
    else { const n = words(passage); if (n < 25 || n > 150 * (passage.includes('Text 2:') ? 2 : 1)) warnings.push(`passage has ${n} words (target 25–150${passage.includes('Text 2:') ? ' per text' : ''})`); }
  }
  if (q.table !== undefined) {
    const table = q.table as Record<string, unknown> | null;
    if (!table || typeof table !== 'object' || Array.isArray(table) || Object.keys(table).some(k => k !== 'headers' && k !== 'rows')) errors.push('table must be {"headers": [...], "rows": [[...]]}');
    else {
      const headers = table.headers, rows = table.rows;
      const cell = (v: unknown) => (typeof v === 'string' && v.length <= LIMITS.cell) || (typeof v === 'number' && Number.isFinite(v));
      if (!Array.isArray(headers) || headers.length < 1 || headers.length > 8 || !headers.every(cell)) errors.push('table.headers must be 1–8 strings');
      if (!Array.isArray(rows) || rows.length < 1 || rows.length > 25) errors.push('table.rows must have 1–25 rows');
      else if (Array.isArray(headers) && rows.some(r => !Array.isArray(r) || r.length !== headers.length || !r.every(cell))) errors.push('every table row must be an array of cells matching the header count');
      for (const value of [...(Array.isArray(headers) ? headers : []), ...(Array.isArray(rows) ? rows.flat() : [])]) {
        if (typeof value === 'string') for (const issue of markupIssues(value)) errors.push(`table cell: ${issue}`);
      }
    }
  }
  if (q.figure_svg !== undefined) {
    if (typeof q.figure_svg !== 'string') errors.push('figure_svg must be a string');
    else {
      const { svg, removed } = sanitizeSvg(q.figure_svg);
      if (!svg) errors.push(`figure_svg is not a usable SVG (${removed.join('; ')})`);
      else if (removed.length) errors.push(`figure_svg contains disallowed content: ${removed.join('; ')}`);
      if (svg && !/^<svg[^>]*\sviewBox="[^"]+"/.test(svg)) errors.push('figure_svg root <svg> needs a viewBox');
      if (q.figure_svg.length > 30000) errors.push('figure_svg is longer than 30000 characters');
    }
  }
  if (q.format === 'mcq') {
    const options = q.options;
    if (!Array.isArray(options) || options.length !== 4) errors.push('mcq items need exactly 4 options');
    else {
      options.forEach((option, index) => {
        const o = option as Record<string, unknown> | null;
        const id = 'ABCD'[index];
        if (!o || typeof o !== 'object' || Object.keys(o).some(k => k !== 'id' && k !== 'label')) errors.push(`option ${index + 1} must be {"id","label"}`);
        else {
          if (o.id !== id) errors.push(`option ${index + 1} id must be "${id}"`);
          textField(o.label, `option ${id} label`, LIMITS.option, errors, warnings, mathCheck);
        }
      });
      const labels = options.map(o => plainText((o as Record<string, unknown>)?.label).trim().toLowerCase());
      if (new Set(labels).size !== labels.length) errors.push('option labels must be distinct');
    }
    if (typeof q.answer !== 'string' || !/^[ABCD]$/.test(q.answer)) errors.push('mcq answer must be "A", "B", "C" or "D"');
    if (typeof q.explanation === 'string' && typeof q.answer === 'string') {
      const others = 'ABCD'.split('').filter(l => l !== q.answer && new RegExp(`(Choice|Option|choice|option)\\s+${l}\\b|\\(${l}\\)|\\b${l}\\b[),:]`).test(q.explanation as string));
      if (others.length < 2) warnings.push('explanation should say why the wrong choices are wrong (mention e.g. "Choice A …")');
    }
  } else if (q.format === 'spr') {
    if (q.options !== undefined) errors.push('spr items must not have options');
    const accepted = q.answer;
    if (!Array.isArray(accepted) || accepted.length < 1 || accepted.length > 12) errors.push('spr answer must be an array of 1–12 accepted strings');
    else {
      if (accepted.some(a => typeof a !== 'string')) errors.push('spr accepted answers must be strings');
      const strings = accepted.filter((a): a is string => typeof a === 'string');
      if (new Set(strings.map(s => s.trim())).size !== strings.length) errors.push('spr accepted answers must be distinct');
      for (const a of strings) { const issue = sprEntryIssue(a); if (issue || a !== a.trim()) errors.push(`spr accepted answer "${a}": ${issue ?? 'no surrounding spaces'}`); }
      const parsed = strings.map(parseSprNumber).filter((p): p is SprNumber => p !== null);
      const exact = parsed.find(p => p.kind === 'fraction') ?? parsed.slice().sort((a, b) => b.decimals - a.decimals)[0];
      if (exact) for (const a of strings) {
        if (!gradeSpr(a, [`${exact.num}/${exact.den}`]) && !strings.some(other => other !== a && parseSprNumber(other)?.kind === 'fraction' && gradeSpr(a, [other]))) {
          warnings.push(`spr accepted answer "${a}" is not equivalent (or a full-width rounding) of ${exact.num}/${exact.den}; make sure every listed answer is truly correct`);
        }
      }
    }
  }
  return { errors, warnings };
}

/** Validate a whole set of items (one or more files): per-item rules plus unique slugs and prompts. */
export function validateItems(items: unknown, mathCheck?: MathCheck): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [], count: 0 };
  if (!Array.isArray(items)) { result.errors.push({ index: -1, slug: null, message: 'content must be a JSON array of items' }); return result; }
  if (items.length > 2000) { result.errors.push({ index: -1, slug: null, message: 'at most 2000 items per import' }); return result; }
  const slugs = new Map<string, number>(), prompts = new Map<string, number>();
  items.forEach((item, index) => {
    const slug = item && typeof item === 'object' && typeof (item as Record<string, unknown>).slug === 'string' ? (item as Record<string, unknown>).slug as string : null;
    const { errors, warnings } = validateItem(item, mathCheck);
    for (const message of errors) result.errors.push({ index, slug, message });
    for (const message of warnings) result.warnings.push({ index, slug, message });
    if (slug) {
      if (slugs.has(slug)) result.errors.push({ index, slug, message: `duplicate slug (also item ${slugs.get(slug)! + 1})` });
      else slugs.set(slug, index);
    }
    const q = item as Record<string, unknown>;
    if (q && typeof q.prompt === 'string') {
      const key = `${String(q.passage ?? '').trim()}\n${q.prompt.trim()}`.toLowerCase();
      if (prompts.has(key)) result.errors.push({ index, slug, message: `duplicate passage+prompt (same as item ${prompts.get(key)! + 1})` });
      else prompts.set(key, index);
    }
  });
  result.count = items.length;
  return result;
}

/** The exact database rows for a validated item (content_units + answer_keys), as in contract A. */
export function toContentRows(item: ContractItem, status: 'published' | 'draft' = 'published') {
  const data: Record<string, unknown> = { prompt: item.prompt };
  if (item.passage !== undefined) data.passage = item.passage;
  if (item.table !== undefined) data.table = { headers: item.table.headers.map(String), rows: item.table.rows.map(r => r.map(String)) };
  if (item.figure_svg !== undefined) data.figure_svg = item.figure_svg;
  if (item.format === 'mcq') data.options = item.options;
  return {
    slug: item.slug,
    official_domain: item.official_domain,
    section: item.section,
    type: item.format === 'mcq' ? 'question_single_choice' : 'question_spr',
    data,
    metadata: { section_type: item.section, sat_domain: item.sat_domain, sat_official_domain: item.official_domain, sat_skill: item.skill,
      difficulty: item.difficulty, difficulty_basis: 'editorial', content_status: status, content_revision: CONTENT_REVISION,
      original_slug: item.slug, answer_format: item.format },
    correct: item.format === 'mcq' ? { option_id: item.answer } : { accepted: item.answer },
    key_metadata: { feedback: { explanation: item.explanation }, source: ANSWER_SOURCE },
  };
}
