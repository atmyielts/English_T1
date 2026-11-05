import pack from '../maths/index.ts';
import { WRITING_KEYS } from '../maths/writing.ts';
import type { Drill, Lesson, QuizQuestion, QuizSet, WritingTask } from '../src/types.ts';

// B3 Admission Maths: every authored problem's answer is checked here by an independent
// computation (arithmetic, enumeration, numeric root finding and integration, substitution),
// and every wrong option is checked to be wrong. Options are read the way a learner reads
// them: numbers ("2,5", "3/4", "5√2", "2π/3"), expressions in x, sets of roots ("−2; 3",
// "∅", "{3; 4}"), intervals ("(−∞; −2] ∪ [3; +∞)") and vectors ("(1; −1; 2)").
// Every bank question, drill item, placement question, lesson check and writing task
// must have exactly one verifier here, and there may be no verifier without a problem.

// --- reading options -----------------------------------------------------------------------------------------
type Fn = (x: number) => number;
const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const normalize = (text: string) => text.replace(/[−–]/g, '-').replace(/[·×]/g, '*').trim();

/** Compiles a maths expression in x (implicit multiplication, √, π, e, superscript powers). */
function compile(source: string): Fn {
  const text = normalize(source);
  type Token = { t: 'num'; v: number } | { t: 'pow'; v: number } | { t: 'op'; v: string } | { t: 'x' } | { t: 'pi' } | { t: 'e' } | { t: 'sqrt' };
  const tokens: Token[] = [];
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (/\s/.test(char)) { i++; continue; }
    const number = /^\d+(?:[.,]\d+)?/.exec(text.slice(i));
    if (number) { tokens.push({ t: 'num', v: Number(number[0].replace(',', '.')) }); i += number[0].length; continue; }
    if (SUPERSCRIPT[char]) { let digits = ''; while (SUPERSCRIPT[text[i]]) digits += SUPERSCRIPT[text[i++]]; tokens.push({ t: 'pow', v: Number(digits) }); continue; }
    if ('+-*/^()'.includes(char)) { tokens.push({ t: 'op', v: char }); i++; continue; }
    if (char === 'x') { tokens.push({ t: 'x' }); i++; continue; }
    if (char === 'π') { tokens.push({ t: 'pi' }); i++; continue; }
    if (char === 'e') { tokens.push({ t: 'e' }); i++; continue; }
    if (char === '√') { tokens.push({ t: 'sqrt' }); i++; continue; }
    throw new Error(`cannot read "${source}" at "${text.slice(i)}"`);
  }
  let at = 0;
  const peek = () => tokens[at];
  const isOp = (value: string) => peek()?.t === 'op' && (peek() as { v: string }).v === value;
  const startsAtom = () => { const token = peek(); return !!token && (token.t === 'num' || token.t === 'x' || token.t === 'pi' || token.t === 'e' || token.t === 'sqrt' || (token.t === 'op' && token.v === '(')); };
  const atom = (): Fn => {
    const token = tokens[at++];
    if (!token) throw new Error(`unexpected end in "${source}"`);
    if (token.t === 'num') { const v = token.v; return () => v; }
    if (token.t === 'x') return (x) => x;
    if (token.t === 'pi') return () => Math.PI;
    if (token.t === 'e') return () => Math.E;
    if (token.t === 'sqrt') { const inner = postfix(); return (x) => Math.sqrt(inner(x)); }
    if (token.t === 'op' && token.v === '(') { const inner = expr(); if (!isOp(')')) throw new Error(`missing ) in "${source}"`); at++; return inner; }
    throw new Error(`unexpected token in "${source}"`);
  };
  const postfix = (): Fn => { let base = atom(); while (peek()?.t === 'pow') { const n = (tokens[at++] as { v: number }).v; const b = base; base = (x) => b(x) ** n; } return base; };
  const power = (): Fn => { const base = postfix(); if (isOp('^')) { at++; const exponent = unary(); return (x) => base(x) ** exponent(x); } return base; };
  const unary = (): Fn => { if (isOp('-')) { at++; const inner = unary(); return (x) => -inner(x); } if (isOp('+')) { at++; return unary(); } return power(); };
  const term = (): Fn => {
    let left = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const op = (tokens[at++] as { v: string }).v, right = unary(), l = left; left = op === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x); }
      else if (startsAtom()) { const right = unary(), l = left; left = (x) => l(x) * right(x); }
      else return left;
    }
  };
  const expr = (): Fn => {
    let left = term();
    while (isOp('+') || isOp('-')) { const op = (tokens[at++] as { v: string }).v, right = term(), l = left; left = op === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x); }
    return left;
  };
  const fn = expr();
  if (at !== tokens.length) throw new Error(`trailing input in "${source}"`);
  return fn;
}
const valueOf = (source: string) => { const v = compile(source)(Number.NaN); if (!Number.isFinite(v)) throw new Error(`"${source}" is not a number`); return v; };
/** "∅", "3", "2; −1/2", "{3; 4}": a set of numbers. */
const setOf = (source: string): number[] => { const text = normalize(source).replace(/^\{|\}$/g, '').trim(); return text === '∅' ? [] : text.split(';').map((part) => valueOf(part)).sort((a, b) => a - b); };
/** "(1; −1; 2)": a vector. */
const vectorOf = (source: string): number[] => { const match = /^\((.*)\)$/.exec(normalize(source)); if (!match) throw new Error(`not a vector: ${source}`); return match[1].split(';').map((part) => valueOf(part)); };
/** "(−∞; −3) ∪ [2; +∞)", "{−2; 1}", "∅": membership, plus the finite endpoints for sampling. */
function regionOf(source: string): { has: (x: number) => boolean; ends: number[] } {
  const parts = normalize(source).split('∪').map((part) => part.trim());
  const tests: ((x: number) => boolean)[] = [], ends: number[] = [];
  const end = (text: string) => { const t = text.trim(); if (/^-∞$/.test(t)) return -Infinity; if (/^\+?∞$/.test(t)) return Infinity; const v = valueOf(t); ends.push(v); return v; };
  for (const part of parts) {
    if (part === '∅') continue;
    if (part.startsWith('{')) { const values = setOf(part); ends.push(...values); tests.push((x) => values.some((v) => Math.abs(v - x) < 1e-12)); continue; }
    const match = /^([[(])\s*(.+?)\s*;\s*(.+?)\s*([\])])$/.exec(part);
    if (!match) throw new Error(`not an interval: ${source}`);
    const lo = end(match[2]), hi = end(match[3]), loClosed = match[1] === '[', hiClosed = match[4] === ']';
    tests.push((x) => (lo === -Infinity || (loClosed ? x >= lo - 1e-12 : x > lo + 1e-12)) && (hi === Infinity || (hiClosed ? x <= hi + 1e-12 : x < hi - 1e-12)));
  }
  return { has: (x) => tests.some((test) => test(x)), ends };
}

// --- maths helpers --------------------------------------------------------------------------------------------
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const sameSet = (a: number[], b: number[], tol = 1e-9) => a.length === b.length && [...a].sort((p, q) => p - q).every((value, i) => close(value, [...b].sort((p, q) => p - q)[i], tol));
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
const count = (from: number, to: number, test: (n: number) => boolean) => { let n = 0; for (let i = from; i <= to; i++) if (test(i)) n++; return n; };
const isPrime = (n: number) => n > 1 && count(2, Math.floor(Math.sqrt(n)), (d) => n % d === 0) === 0;
const deg = Math.PI / 180;
const d = (f: Fn, x: number, h = 1e-5) => (f(x + h) - f(x - h)) / (2 * h);
function simpson(f: Fn, a: number, b: number, n = 2000) { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return (s * h) / 3; }
function bisect(f: Fn, a: number, b: number) { let fa = f(a); for (let i = 0; i < 200; i++) { const m = (a + b) / 2, fm = f(m); if (fm === 0) return m; if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; }
/** Roots of f in (lo, hi) by sign changes on a fine grid, refined by bisection; poles are left out by |f| at the root. */
function roots(f: Fn, lo = -20, hi = 20, step = 0.0017): number[] {
  const out: number[] = [];
  let x0 = lo, f0 = f(x0);
  for (let x1 = lo + step; x1 < hi; x1 += step) {
    const f1 = f(x1);
    if (Number.isFinite(f0) && Number.isFinite(f1) && f0 * f1 <= 0) {
      const r = f0 === 0 ? x0 : f1 === 0 ? x1 : bisect(f, x0, x1);
      if (Math.abs(f(r)) < 1e-7 && !out.some((seen) => Math.abs(seen - r) < 1e-6)) out.push(r);
    }
    x0 = x1; f0 = f1;
  }
  return out.sort((a, b) => a - b);
}
function quadRoots(a: number, b: number, c: number): number[] { const D = b * b - 4 * a * c; if (D < 0) return []; if (D === 0) return [-b / (2 * a)]; return [(-b - Math.sqrt(D)) / (2 * a), (-b + Math.sqrt(D)) / (2 * a)].sort((p, q) => p - q); }
/** x, y of a·x + b·y = e, c·x + d·y = f (Cramer). */
const solve2 = (a: number, b: number, e: number, c: number, dd: number, f: number) => { const det = a * dd - b * c; return [(e * dd - b * f) / det, (a * f - e * c) / det]; };
const heron = (a: number, b: number, c: number) => { const p = (a + b + c) / 2; return Math.sqrt(p * (p - a) * (p - b) * (p - c)); };
const shoelace = (points: [number, number][]) => Math.abs(points.reduce((sum, [x, y], i) => { const [nx, ny] = points[(i + 1) % points.length]; return sum + x * ny - nx * y; }, 0)) / 2;
const norm = (...v: number[]) => Math.hypot(...v);
const angleAt = (p: [number, number], a: [number, number], b: [number, number]) => { const u = [a[0] - p[0], a[1] - p[1]], v = [b[0] - p[0], b[1] - p[1]]; return Math.acos((u[0] * v[0] + u[1] * v[1]) / (norm(...u) * norm(...v))) / deg; };
function permutations<T>(items: T[]): T[][] { if (items.length <= 1) return [items]; return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])); }
const pairs = (n: number) => { const out: [number, number][] = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]); return out; };
const repeatingDecimal = (digits: number, length: number) => { let s = 0; for (let k = 1; k <= 30; k++) s += digits / 10 ** (length * k); return s; };
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const log = (base: number, x: number) => Math.log(x) / Math.log(base);
const minOf = (f: Fn, lo: number, hi: number, step = 0.0005) => { let best = Infinity; for (let x = lo; x <= hi + 1e-12; x += step) best = Math.min(best, f(x)); return best; };
const maxOf = (f: Fn, lo: number, hi: number, step = 0.0005) => -minOf((x) => -f(x), lo, hi, step);

// --- checks -----------------------------------------------------------------------------------------------------
type Check =
  | { value: number; tol?: number }
  | { set: number[]; tol?: number }
  | { region: (x: number) => boolean }
  | { fn: Fn; at?: number[]; tol?: number }
  | { fnTest: (g: Fn) => boolean }
  | { pick: (v: number, all: number[]) => boolean }
  | { vector: number[] };
const SAMPLES = [-3.7, -2.2, -1.3, -0.6, 0.4, 1.1, 1.9, 2.6, 3.3, 4.8];
const POSITIVE = [0.4, 1.1, 1.9, 2.6, 3.3, 4.8];

function verify(id: string, options: string[] | undefined, answer: QuizQuestion['answer'], check: Check): string | null {
  if (typeof answer === 'object' && !Array.isArray(answer)) {
    if (!('value' in check)) return `${id}: a typed number needs a value check`;
    return close(answer.numeric, check.value, Math.max(check.tol ?? 1e-9, answer.tolerance ?? 0)) ? null : `${id}: typed answer ${answer.numeric}, computed ${check.value}`;
  }
  if (typeof answer !== 'number' || !options) return `${id}: expected a choice`;
  const right = (index: number): boolean => {
    const option = options[index];
    if ('value' in check) return close(valueOf(option), check.value, check.tol);
    if ('set' in check) return sameSet(setOf(option), check.set, check.tol ?? 1e-6);
    if ('vector' in check) { const v = vectorOf(option); return v.length === check.vector.length && v.every((value, i) => close(value, check.vector[i])); }
    if ('pick' in check) return check.pick(valueOf(option), options.map(valueOf));
    if ('region' in check) {
      const regions = options.map(regionOf), mine = regions[index];
      const points = new Set<number>();
      for (let x = -20; x <= 20; x += 0.25) points.add(Math.round(x * 100) / 100);
      for (const region of regions) for (const e of region.ends) for (const offset of [0, -1e-3, 1e-3]) points.add(e + offset);
      return [...points].every((x) => mine.has(x) === check.region(x));
    }
    const g = compile(option.replace(/\s*=\s*0\s*$/, ''));
    if ('fn' in check) return (check.at ?? SAMPLES).every((x) => close(g(x), check.fn(x), check.tol ?? 1e-9));
    return check.fnTest(g);
  };
  if (!right(answer)) return `${id}: the keyed option "${options[answer]}" is not right`;
  const others = options.map((_, index) => index).filter((index) => index !== answer && right(index));
  return others.length ? `${id}: other options are also right: ${others.map((index) => options[index]).join(', ')}` : null;
}

// --- the verifiers ------------------------------------------------------------------------------------------------
const bank = (code: string, checks: Record<string, Check>) => Object.fromEntries(Object.entries(checks).map(([id, check]) => [`bank.${code}#${id}`, check]));
const within = (tol: number) => ({ tol });

const banks: Record<string, Check> = {
  ...bank('math.num.natural', {
    q1: { value: gcd(24, 36) }, q2: { value: lcm(6, 8) }, q3: { pick: (v) => v % 9 === 0 },
    q4: { value: count(1, 100, (n) => n % 6 === 0) }, q5: { value: count(1, 360, (n) => 360 % n === 0) },
    q6: { value: (() => { const products = new Set<number>(); for (let a = 1; a <= 72; a++) for (let b = 1; b <= 72; b++) if (gcd(a, b) === 6 && lcm(a, b) === 72) products.add(a * b); if (products.size !== 1) throw new Error('q6 products'); return [...products][0]; })() },
    q7: { value: 2 ** 10 % 7 }, q8: { value: (() => { for (let n = 2; ; n++) if (n % 4 === 1 && n % 6 === 1 && n % 10 === 1) return n; })() },
    q9: { value: count(10, 99, isPrime) },
  }),
  ...bank('math.num.fractions', {
    q1: { value: 2 / 3 + 1 / 4 }, q2: { value: 0.75 * 0.4 }, q3: { value: (3 / 5) / (9 / 10) }, q4: { value: (1 / 2 - 1 / 3) * 6 },
    q5: { value: (2 + 1 / 3) - (1 + 3 / 4) }, q6: { value: repeatingDecimal(3, 1) }, q7: { value: repeatingDecimal(36, 2) }, q8: { value: 1.2 / 0.04 },
    q9: { value: (3 / 4 + 0.25) / (1 - 2 / 5) },
  }),
  ...bank('math.num.percent', {
    q1: { value: 80 * 0.15 }, q2: { value: ((250000 - 200000) / 200000) * 100 }, q3: { value: 100 - 100 * 1.2 * 0.8 }, q4: { value: roots((x) => x * 0.7 - 56, 0, 200)[0], ...within(1e-6) },
    q5: { value: (12 * 5) / 3 }, q6: { value: (60 / 5) * 8 }, q7: { value: 1000 * 1.2 * 1.2 }, q8: { value: ((200 * 0.3) / 300) * 100 }, q9: { value: 250 * 0.4 },
  }),
  ...bank('math.num.real', {
    q1: { value: Math.sqrt(49) + Math.sqrt(16) }, q2: { value: Math.sqrt(50) }, q3: { value: (Math.sqrt(3) - 1) * (Math.sqrt(3) + 1) }, q4: { value: 1 / (Math.SQRT2 - 1) },
    q5: { pick: (v, all) => v === Math.max(...all) }, q6: { value: Math.sqrt(7 + 4 * Math.sqrt(3)) }, q7: { value: Math.abs(-7) - Math.abs(3 - 5) }, q8: { value: Math.sqrt(0.0036) },
    q9: { value: Math.sqrt(5) ** 2 + Math.cbrt(8) },
  }),
  ...bank('math.alg.expressions', {
    q1: { fn: (x) => (x + 3) ** 2 }, q2: { fn: (x) => x * x - 25 }, q3: { value: 51 ** 2 - 49 ** 2 },
    q4: { value: (() => { const [a, b] = quadRoots(1, -7, 10); return a * a + b * b; })() }, q5: { fn: (x) => (x ** 3 - 8) / (x - 2) },
    q6: { value: (() => { const x = (3 + Math.sqrt(5)) / 2; return x * x + 1 / (x * x); })() }, q7: { fn: (x) => 2 * x * (x - 3) - (x - 1) ** 2 },
    q8: { value: 3 * (-2) ** 2 - 5 * -2 + 1 }, q9: { value: 101 * 99 },
  }),
  ...bank('math.alg.powers', {
    q1: { value: 2 ** 3 * 2 ** 4 }, q2: { value: 8 ** (2 / 3) }, q3: { value: (3 ** -2) ** -1 * 3 ** -3 }, q4: { fn: (x) => (x ** 5 * x ** -2) / x ** 3 },
    q5: { fn: (x) => Math.sqrt(x ** 6), at: POSITIVE }, q6: { value: 16 ** 0.75 },
    q7: { value: (() => { const at = (n: number) => (2 ** (n + 2) - 2 ** n) / (3 * 2 ** n); if (!close(at(3), at(7))) throw new Error('q7 depends on n'); return at(5); })() },
    q8: { value: 0.5 ** -2 }, q9: { value: Math.SQRT2 ** 6 / Math.cbrt(4) ** 3 },
  }),
  ...bank('math.alg.linear', {
    q1: { value: roots((x) => 3 * x + 7 - 22)[0], tol: 1e-6 }, q2: { value: roots((x) => 5 * (x - 2) - (3 * x + 4))[0], tol: 1e-6 },
    q3: { value: roots((x) => (x + 1) / 3 - (x - 1) / 2 - 1)[0], tol: 1e-6 }, q4: { value: (() => { const [x, y] = solve2(1, 1, 10, 1, -1, 4); return x * y; })() },
    q5: { value: (() => { const [x, y] = solve2(2, 3, 12, 3, -1, 7); return x + y; })() },
    q6: { pick: (a) => { const f = (x: number) => a * x + 2 - (3 * x - 1); return f(1) - f(0) === 0 && f(0) !== 0; } },
    q7: { pick: (k) => [0, 1, 5].every((x) => 4 * x - 2 * (2 * x - 1) === k) }, q8: { value: roots((x) => 0.2 * x - 1.5 - 0.5)[0], tol: 1e-6 },
    q9: { value: Math.max(...solve2(1, 1, 50, 1, -1, 12)) },
  }),
  ...bank('math.alg.quadratic', {
    q1: { set: quadRoots(1, -5, 6) }, q2: { value: quadRoots(1, 7, -18).reduce((a, b) => a + b, 0) }, q3: { value: quadRoots(1, -6, 9).length },
    q4: { set: quadRoots(2, -3, -2) }, q5: { value: quadRoots(1, -4, 1).reduce((s, r) => s + r * r, 0) }, q6: { pick: (m) => m > 0 && quadRoots(1, m, 9).length === 1 },
    q7: { value: quadRoots(1, -5, 4).flatMap((t) => [Math.sqrt(t), -Math.sqrt(t)]).reduce((a, b) => a * b, 1) }, q8: { value: Math.max(...quadRoots(1, 1, -12)) },
    q9: { fn: (x) => (x - 3) * (x + 5) },
  }),
  ...bank('math.alg.rational', {
    q1: { value: roots((x) => 6 / x - 3)[0], tol: 1e-6 }, q2: { value: roots((x) => (x + 2) / (x - 1) - 4)[0], tol: 1e-6 },
    q3: { set: roots((x) => (x * x - 9) / (x - 3)) }, q4: { set: roots((x) => 2 / x - 1 / (x - 1)) },
    q5: { set: roots((x) => x / (x - 2) - 8 / (x * x - 4) - 1) }, q6: { set: roots((x) => (x * x - x - 6) / (x + 2)) },
    q7: { value: Math.max(...roots((x) => 12 / (x + 1) - x)), tol: 1e-6 }, q8: { value: roots((x) => 3 / (x - 2) - 2 / (x + 1))[0], tol: 1e-6 },
    q9: { set: roots((x) => (x + 1) / (x - 1) + (x - 1) / (x + 1) - 5 / 2) },
  }),
  ...bank('math.alg.inequalities', {
    q1: { region: (x) => 3 * x - 5 > 7 }, q2: { region: (x) => -2 * x >= 8 }, q3: { region: (x) => x * x - x - 6 <= 0 }, q4: { region: (x) => x * x > 9 },
    q5: { value: count(-50, 50, (x) => (x - 1) * (x + 4) < 0) }, q6: { region: (x) => x + 3 !== 0 && (x - 2) / (x + 3) >= 0 },
    q7: { region: (x) => 2 * x - 1 > 3 && x * x <= 16 }, q8: { value: Math.max(...Array.from({ length: 101 }, (_, i) => i - 50).filter((x) => 5 - 2 * x > -3)) },
    q9: { region: (x) => x * x + 4 * x + 5 > 0 },
  }),
  ...bank('math.alg.modulus', {
    q1: { set: roots((x) => Math.abs(x - 3) - 5) }, q2: { value: roots((x) => Math.abs(2 * x + 1) - 7).reduce((a, b) => a + b, 0), tol: 1e-6 },
    q3: { region: (x) => Math.abs(x) < 3 }, q4: { region: (x) => Math.abs(x - 2) >= 4 }, q5: { set: roots((x) => Math.abs(x + 4) + 2) },
    q6: { region: (x) => Math.abs(Math.abs(x - 1) + Math.abs(x + 2) - 3) < 1e-12 }, q7: { set: roots((x) => Math.abs(x * x - 4) - 3 * x) },
    q8: { value: Math.abs(-3) * Math.abs(4 - 9) }, q9: { value: Array.from({ length: 41 }, (_, i) => i - 20).filter((x) => Math.abs(x - 5) <= 2).reduce((a, b) => a + b, 0) },
  }),
  ...bank('math.alg.irrational', {
    q1: { value: roots((x) => Math.sqrt(x + 3) - 4)[0], tol: 1e-6 }, q2: { set: roots((x) => Math.sqrt(2 * x - 1) - (x - 2)) }, q3: { set: roots((x) => Math.sqrt(x * x - 9) - 4) },
    q4: { region: (x) => x - 1 >= 0 && Math.sqrt(x - 1) < 3 }, q5: { value: roots((x) => Math.sqrt(x + 5) - (x - 1))[0], tol: 1e-6 },
    q6: { region: (x) => x + 2 >= 0 && Math.sqrt(x + 2) > x }, q7: { region: (x) => 4 - x >= 0 && x + 1 >= 0 },
    q8: { value: roots((x) => Math.sqrt(x + 7) + Math.sqrt(x - 1) - 4)[0], tol: 1e-6 }, q9: { set: roots((x) => Math.sqrt(x) + 3) },
  }),
  ...bank('math.fn.graphs', {
    q1: { value: ((x: number) => 2 * x * x - 3)(-2) }, q2: { value: roots((x) => 3 * x - 6)[0], tol: 1e-6 },
    q3: { value: (() => { let a = -100, b = 100; const f = (x: number) => x * x - 4 * x + 3; for (let i = 0; i < 300; i++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (f(m1) < f(m2)) b = m2; else a = m1; } return (a + b) / 2; })(), tol: 1e-6 },
    q4: { region: (x) => !Number.isNaN(Math.sqrt(x - 2)) }, q5: { region: (x) => Number.isFinite(1 / (x + 3)) },
    q6: { region: (() => { const least = minOf((x) => x * x - 4 * x + 3, -50, 50, 0.001); return (y: number) => y >= least - 1e-9; })() },
    q7: { value: ((x: number) => 2 * x + 1)(((x: number) => x * x)(3)) },
    q8: { fnTest: (g) => [-3.7, -2.2, -0.6, 0.4, 1.9, 2.6, 4.8].every((x) => close((g(x) + 1) / (g(x) - 2), x, 1e-9)) }, q9: { value: 5 - 3 ** 2 },
  }),
  ...bank('math.seq.arithmetic', {
    q1: { value: (() => { let a = 3; for (let n = 1; n < 10; n++) a += 4; return a; })() }, q2: { value: (() => { let a = 2; for (let n = 1; n < 20; n++) a += 3; return a; })() },
    q3: { value: Array.from({ length: 10 }, (_, i) => 5 + 3 * i).reduce((a, b) => a + b, 0) }, q4: { value: (() => { const [a1, dd] = solve2(1, 2, 7, 1, 6, 19); return a1 + 9 * dd; })() },
    q5: { value: Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => n % 2 === 0).reduce((a, b) => a + b, 0) },
    q6: { value: (() => { const sums = new Set<number>(); for (let a1 = -20; a1 <= 20; a1 += 0.5) for (let dd = -10; dd <= 10; dd += 0.5) { const t = (k: number) => a1 + (k - 1) * dd; if (t(1) + t(5) === 14 && t(2) * t(4) === 45) sums.add([1, 2, 3, 4, 5].reduce((s, k) => s + t(k), 0)); } if (sums.size !== 1) throw new Error('arith q6'); return [...sums][0]; })() },
    q7: { value: (() => { let s = 0; for (let n = 1; n < 100; n++) { s += 3 + 4 * (n - 1); if (s === 210) return n; } return -1; })() },
    q8: { value: (() => { for (let n = 1; n < 100; n++) if (7 + 4 * (n - 1) === 51) return n; return -1; })() }, q9: { value: 9 - 12 },
  }),
  ...bank('math.seq.geometric', {
    q1: { value: 2 * 3 ** 4 }, q2: { value: (() => { let b = 3; for (let n = 1; n < 7; n++) b *= 2; return b; })() }, q3: { value: Array.from({ length: 8 }, (_, i) => 2 ** i).reduce((a, b) => a + b, 0) },
    q4: { value: Array.from({ length: 200 }, (_, i) => 8 * 0.5 ** i).reduce((a, b) => a + b, 0) }, q5: { value: 6 / Math.cbrt(48 / 6) },
    q6: { value: bisect((q) => 9 / (1 - q) - 12, -0.99, 0.99), tol: 1e-9 }, q7: { value: (() => { const x = Math.sqrt(2 * 18); if (!close(x / 2, 18 / x)) throw new Error('geo q7'); return x; })() },
    q8: { value: 2 * (-2) ** 5 }, q9: { value: [0, 1, 2, 3].reduce((s, k) => s + 4 * (-0.5) ** k, 0) },
  }),
  ...bank('math.exp.equations', {
    q1: { value: roots((x) => 2 ** x - 32)[0], tol: 1e-6 }, q2: { value: roots((x) => 3 ** (x - 1) - 27)[0], tol: 1e-6 }, q3: { value: roots((x) => 4 ** x - 8)[0], tol: 1e-6 },
    q4: { set: roots((x) => 5 ** (2 * x) - 6 * 5 ** x + 5) }, q5: { region: (x) => 0.5 ** x > 4 }, q6: { value: roots((x) => 2 ** (x + 1) + 2 ** x - 24)[0], tol: 1e-6 },
    q7: { value: roots((x) => 9 ** x - 4 * 3 ** x + 3).reduce((a, b) => a + b, 0), tol: 1e-6 }, q8: { value: roots((x) => 10 ** x - 0.001)[0], tol: 1e-6 },
    q9: { region: (x) => 3 ** (2 * x - 1) <= 27 },
  }),
  ...bank('math.log.equations', {
    q1: { value: Math.log2(64) }, q2: { value: log(3, 81) - log(3, 9) }, q3: { value: roots((x) => Math.log2(x - 1) - 3, 1.0001, 50)[0], tol: 1e-6 }, q4: { value: Math.log10(25) + Math.log10(4) },
    q5: { set: roots((x) => Math.log2(x) + Math.log2(x - 2) - 3, 0, 50) }, q6: { value: 2 ** Math.log2(7) + log(5, 25) },
    q7: { region: (x) => x + 1 > 0 && -Math.log2(x + 1) > -2 }, q8: { value: roots((x) => log(4, x) - 1.5, 0.0001, 50)[0], tol: 1e-6 }, q9: { value: log(2, 3) * log(3, 8) },
  }),
  ...bank('math.trig.identities', {
    q1: { value: Math.sin(30 * deg) + Math.cos(60 * deg) }, q2: { value: Math.sin(37 * deg) ** 2 + Math.cos(37 * deg) ** 2 }, q3: { value: Math.cos(Math.PI - Math.asin(3 / 5)) },
    q4: { value: Math.cos(120 * deg) }, q5: { value: 2 * Math.sin(15 * deg) * Math.cos(15 * deg) },
    q6: { value: (() => { const a = Math.atan(2); return (Math.sin(a) + Math.cos(a)) / (Math.sin(a) - Math.cos(a)); })() },
    q7: { value: Math.cos(75 * deg) ** 2 - Math.sin(75 * deg) ** 2 }, q8: { value: Math.sin(210 * deg) },
    q9: { value: (() => { const a = bisect((t) => Math.sin(t) + Math.cos(t) - 1.2, 0, Math.PI / 4); return Math.sin(a) * Math.cos(a); })(), tol: 1e-6 },
  }),
  ...bank('math.trig.equations', {
    q1: { value: roots((x) => Math.sin(x) - 0.5, 0, 10)[0], tol: 1e-6 }, q2: { value: roots(Math.cos, 0, 2 * Math.PI).length },
    q3: { value: roots((x) => 2 * Math.cos(x) - 1, 0, 2 * Math.PI).reduce((a, b) => a + b, 0), tol: 1e-6 }, q4: { value: roots((x) => Math.tan(x) - Math.sqrt(3), 0, Math.PI)[0], tol: 1e-6 },
    q5: { value: roots((x) => Math.sin(2 * x), 0.0001, 2 * Math.PI - 0.0001).length }, q6: { value: roots((x) => Math.tan(x) ** 2 - 3, 0, Math.PI).length },
    q7: { value: roots((x) => Math.sin(x) + Math.cos(x) - 1, -Math.PI, Math.PI).reduce((a, b) => a + b, 0), tol: 1e-6 },
    q8: { value: roots((x) => Math.sin(x) - Math.sqrt(3) / 2, 0, 10)[0] / deg, tol: 1e-6 }, q9: { value: roots((x) => Math.cos(x) - 0.5, 0, 4 * Math.PI).length },
  }),
  ...bank('math.word.problems', {
    q1: { value: 240 / 3 }, q2: { value: roots((t) => 60 * t + 90 * t - 300, 0, 20)[0], tol: 1e-6 }, q3: { value: 1 / (1 / 6 + 1 / 12) }, q4: { value: solve2(1, 1, 20, 1, -1, 14)[1] },
    q5: { value: ((300 * 0.1 + 200 * 0.3) / 500) * 100 }, q6: { value: (() => { for (let t = 0; t < 100; t++) if (40 + t === 3 * (10 + t)) return t; return -1; })() },
    q7: { value: 60 / (30 / 15 + 30 / 10) }, q8: { value: 48 / 1.2 }, q9: { value: 1 / (1 / 3 - 1 / 6) },
  }),
  ...bank('math.calc.derivative', {
    q1: { value: d((x) => x ** 3, 2), tol: 1e-6 }, q2: { fn: (x) => d((t) => 3 * t * t - 5 * t + 2, x), tol: 1e-6 }, q3: { region: (x) => d((t) => t * t - 6 * t + 1, x) <= 1e-6 },
    q4: { value: (() => { const f = (x: number) => x ** 3 - 3 * x; const r = roots((x) => d(f, x), -10, 10); const max = r.filter((x) => d(f, x - 0.01) > 0 && d(f, x + 0.01) < 0); if (max.length !== 1) throw new Error('deriv q4'); return max[0]; })(), tol: 1e-5 },
    q5: { value: d(Math.sin, Math.PI / 3), tol: 1e-6 }, q6: { fn: (x) => { const f = (t: number) => t * t; return f(1) + d(f, 1) * (x - 1); }, tol: 1e-6 },
    q7: { value: d((x) => (2 * x + 1) ** 5, 0), tol: 1e-6 }, q8: { value: d((t) => t * t + 3 * t, 4), tol: 1e-6 }, q9: { value: maxOf((x) => x * x - 2 * x, 0, 3), tol: 1e-6 },
  }),
  ...bank('math.calc.integral', {
    q1: { value: simpson((x) => 3 * x * x, 0, 2), tol: 1e-8 }, q2: { fnTest: (g) => POSITIVE.every((x) => close(d(g, x), x * x, 1e-5)) },
    q3: { value: simpson((x) => 2 * x + 1, 1, 3), tol: 1e-8 }, q4: { value: simpson(Math.sin, 0, Math.PI), tol: 1e-8 }, q5: { value: 1 + simpson((x) => 2 * x + 3, 0, 2), tol: 1e-8 },
    q6: { value: (() => { const [a, b] = roots((x) => x * x - 4); return simpson((x) => 4 - x * x, a, b); })(), tol: 1e-6 }, q7: { value: simpson((x) => 1 / x, 1, Math.E), tol: 1e-8 },
    q8: { value: simpson((x) => 4 * x ** 3 + 1, 0, 1), tol: 1e-8 }, q9: { value: simpson(Math.cos, 0, Math.PI / 2), tol: 1e-8 },
  }),
  ...bank('math.prob.combinatorics', {
    q1: { value: permutations([1, 2, 3, 4, 5]).length }, q2: { value: (() => { const outcomes = ['HH', 'HT', 'TH', 'TT']; return outcomes.filter((o) => o === 'HH').length / outcomes.length; })() },
    q3: { value: (() => { let n = 0; for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) for (let c = b + 1; c < 10; c++) n++; return n; })() },
    q4: { value: count(1, 6, (n) => n % 2 === 0) / 6 }, q5: { value: (() => { let n = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === 7) n++; return n / 36; })() },
    q6: { value: (() => { let n = 0; for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) for (let c = 1; c <= 5; c++) if (a !== b && b !== c && a !== c) n++; return n; })() },
    q7: { value: (() => { const all = pairs(10); return all.filter(([i, j]) => i < 4 && j < 4).length / all.length; })() }, q8: { value: pairs(6).length },
    q9: { value: permutations([0, 1, 2, 3]).filter((digits) => digits[0] !== 0).length },
  }),
  ...bank('math.prob.statistics', {
    q1: { value: mean([4, 7, 7, 9, 13]) }, q2: { value: (() => { const values = [4, 7, 7, 9, 13]; const counts = new Map<number, number>(); for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1); return [...counts].sort((a, b) => b[1] - a[1])[0][0]; })() },
    q3: { value: (() => { const s = [3, 8, 1, 9, 5, 6].sort((a, b) => a - b); return (s[2] + s[3]) / 2; })() },
    q4: { value: (() => { const v = [2, 4, 4, 4, 5, 5, 7, 9], m = mean(v); return mean(v.map((x) => (x - m) ** 2)); })() }, q5: { value: Math.max(12, 5, 19, 7, 3) - Math.min(12, 5, 19, 7, 3) },
    q6: { value: 6 * 13 - 5 * 12 }, q7: { value: (12 * 160 + 8 * 150) / 20 }, q8: { value: mean([10, 20, 30, 40]) }, q9: { value: roots((x) => (3 + x + 7 + 10) / 4 - 6)[0], tol: 1e-6 },
  }),
  ...bank('math.logic.sets', {
    q1: { set: [1, 2, 3, 4].filter((x) => [3, 4, 5].includes(x)) }, q2: { value: new Set([1, 2, 3, 4, 3, 4, 5]).size }, q3: { set: [1, 2, 3, 4].filter((x) => ![3, 4, 5].includes(x)) },
    q4: { value: (() => { const football = new Set(Array.from({ length: 18 }, (_, i) => i)), chess = new Set(Array.from({ length: 15 }, (_, i) => i + 11)); if ([...football].filter((s) => chess.has(s)).length !== 7) throw new Error('sets q4'); return 30 - new Set([...football, ...chess]).size; })() },
    q5: { value: count(0, 15, () => true) }, q6: { value: count(1, 100, (n) => n % 2 !== 0 && n % 3 !== 0) }, q7: { value: count(-10, 10, (x) => x * x < 10) },
    q8: { value: (() => { for (let k = 0; k <= 25; k++) if (32 + 25 - k === 50) return k; return -1; })() }, q9: { set: [2, 4, 6, 8].filter((x) => 8 % x === 0) },
  }),
  ...bank('math.geo.triangles', {
    q1: { value: Math.hypot(6, 8) }, q2: { value: 180 - 50 - 70 }, q3: { value: heron(10, 13, 13) }, q4: { value: heron(2, 3, 4) / heron(3, 4.5, 6) },
    q5: { value: heron(6, 6, 6) }, q6: { value: heron(5, 12, 13) / ((5 + 12 + 13) / 2) }, q7: { value: norm(8 * Math.cos(60 * deg) - 7, 8 * Math.sin(60 * deg)) },
    q8: { value: Math.sqrt(25 ** 2 - 7 ** 2) },
    q9: { value: (() => { const a = 12, b = 8, c = norm(a - b * Math.cos(30 * deg), b * Math.sin(30 * deg)); const R = (a * b * c) / (4 * 0.5 * a * b * Math.sin(30 * deg)); return R * (10 / c); })() },
  }),
  ...bank('math.geo.quadrilaterals', {
    q1: { value: Math.hypot(5, 12) }, q2: { value: (36 / 4) ** 2 }, q3: { value: (360 - 2 * 65) / 2 }, q4: { value: Math.hypot(10 / 2, 24 / 2) },
    q5: { value: shoelace([[0, 0], [13, 0], [10, 6], [3, 6]]) }, q6: { value: roots((h) => Math.hypot((10 - 4) / 2, h) - 5, 0, 20)[0], tol: 1e-6 },
    q7: { value: Math.abs(10 * (10 * Math.sin(30 * deg)) - 0 * 10 * Math.cos(30 * deg)) }, q8: { value: ((14 + 11) / 2) - ((0 + 3) / 2) },
    q9: { value: (() => { const p = Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)] as [number, number]); return p.reduce((sum, v, k) => sum + angleAt(v, p[(k + 5) % 6], p[(k + 1) % 6]), 0); })(), tol: 1e-9 },
  }),
  ...bank('math.geo.circles', {
    q1: { value: 2 * Math.PI * 5 }, q2: { value: Math.PI * 9 }, q3: { value: angleAt([Math.cos(220 * deg), Math.sin(220 * deg)], [1, 0], [Math.cos(80 * deg), Math.sin(80 * deg)]), tol: 1e-9 },
    q4: { value: (2 * 4) ** 2 }, q5: { value: Math.hypot(6, 6) / 2 }, q6: { value: 2 * Math.sqrt(13 ** 2 - 5 ** 2) }, q7: { value: (Math.PI * 36 * 60) / 360 },
    q8: { value: Math.sqrt(10 ** 2 - 6 ** 2) },
    q9: { value: (() => { const a = 6 * Math.sqrt(3), A = [0, 0], B = [a, 0], C = [a / 2, (a * Math.sqrt(3)) / 2], G = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3]; return norm(G[0] - A[0], G[1] - A[1]); })() },
  }),
  ...bank('math.geo.areas', {
    q1: { value: (10 * 6) / 2 }, q2: { value: (8 / Math.SQRT2) ** 2 }, q3: { value: heron(13, 14, 15) }, q4: { value: (30 / 2 - 9) * 9 }, q5: { value: 2 * Math.sqrt((16 * Math.PI) / Math.PI) },
    q6: { value: 0.5 * 8 * 10 * Math.sin(150 * deg) }, q7: { value: (1.2 ** 2 - 1) * 100 }, q8: { value: (9 * 12) / 2 },
    q9: { value: shoelace([[Math.SQRT2, Math.SQRT2], [-Math.SQRT2, Math.SQRT2], [-Math.SQRT2, -Math.SQRT2], [Math.SQRT2, -Math.SQRT2]]) },
  }),
  ...bank('math.geo.vectors', {
    q1: { value: norm(4 - 1, 6 - 2) }, q2: { vector: [3 + -2, -1 + 5] }, q3: { value: 2 * 4 + 3 * -1 }, q4: { vector: [(-2 + 6) / 2, (5 + 1) / 2] },
    q5: { pick: (k) => k * 3 + 2 * -6 === 0 }, q6: { value: shoelace([[0, 0], [4, 0], [0, 3]]) },
    q7: { vector: (() => { const [x] = roots((t) => 2 * t + 1 - (-t + 7)); return [x, 2 * x + 1]; })() }, q8: { value: norm(-6, 8) }, q9: { value: (1 * 2 + 2 * 1) / (norm(1, 2) * norm(2, 1)) },
  }),
  ...bank('math.solid.polyhedra', {
    q1: { value: 3 ** 3 }, q2: { value: 6 * 4 ** 2 }, q3: { value: norm(2, 3, 6) }, q4: { value: (30 * 8) / 3 }, q5: { value: 4 * 4 * 10 }, q6: { value: norm(6 / 2, 4) },
    q7: { value: (2 * 3) ** 3 / 3 ** 3 }, q8: { value: roots((a) => a * Math.sqrt(3) - 5 * Math.sqrt(3), 0, 20)[0], tol: 1e-6 }, q9: { value: heron(2, 2, 2) * Math.sqrt(3) },
  }),
  ...bank('math.solid.revolution', {
    q1: { value: Math.PI * 9 * 5 }, q2: { value: (4 / 3) * Math.PI * 27 }, q3: { value: norm(3, 4) }, q4: { value: (Math.PI * 36 * 5) / 3 }, q5: { value: Math.sqrt((36 * Math.PI) / (4 * Math.PI)) },
    q6: { value: (24 * Math.PI) / (2 * Math.PI * 3) }, q7: { value: Math.PI * 6 * 10 }, q8: { value: ((4 / 3) * Math.PI * 6 ** 3) / ((4 / 3) * Math.PI * 3 ** 3) }, q9: { value: (4 / 3) * Math.PI * (6 / 2) ** 3 },
  }),
  ...bank('math.solid.vectors', {
    q1: { value: norm(3 - 1, 4 - 2, 4 - 3) }, q2: { value: 1 * 2 + -2 * 0 + 3 * -1 }, q3: { value: norm(2, -1, 2) }, q4: { vector: [(2 + 0) / 2, (-4 + 2) / 2, (6 - 2) / 2] },
    q5: { pick: (m) => 1 * 3 + 2 * -1 + m * 1 === 0 }, q6: { value: Math.acos(1 / (norm(1, 0, 1) * norm(0, 1, 1))) / deg, tol: 1e-9 }, q7: { value: norm(2, 3, 6) }, q8: { value: norm(3, 4, 12) },
    q9: { value: 1 / norm(1, 1, 1) },
  }),
};

const drill = (tag: string, checks: Record<string, Check>) => Object.fromEntries(Object.entries(checks).map(([id, check]) => [`drill.${tag}#${id}`, check]));
const drills: Record<string, Check> = {
  ...drill('signs', { i1: { value: -3 - -5 }, i2: { value: -2 * -3 * -1 }, i3: { value: -(2 ** 2) }, i4: { value: 5 - 8 + -3 }, i5: { fn: (x) => -(x - 3) }, i6: { value: 7 - (2 - 9) } }),
  ...drill('order_of_operations', { i1: { value: 2 + 3 * 4 }, i2: { value: 20 - 12 / 4 }, i3: { value: (2 + 3) ** 2 - 4 * 5 }, i4: { value: (18 / 3) * 2 }, i5: { value: 2 ** 3 + 2 * 3 }, i6: { value: 3 + (6 / 3) * 2 } }),
  ...drill('fractions', { i1: { value: 1 / 2 + 1 / 3 }, i2: { value: (2 / 3) * (3 / 4) }, i3: { value: (3 / 4) / (3 / 8) }, i4: { value: 1 - 2 / 7 }, i5: { value: 5 / 6 - 1 / 4 }, i6: { value: (2 / 5) ** 2 } }),
  ...drill('percent_base', { i1: { value: 120 * 0.25 }, i2: { value: roots((x) => 0.2 * x - 30, 0, 1000, 0.01)[0], tol: 1e-6 }, i3: { value: ((50 - 40) / 40) * 100 }, i4: { value: ((50 - 40) / 50) * 100 }, i5: { value: 60 / (1 - 0.25) }, i6: { value: (18 / 72) * 100 } }),
  ...drill('lost_root', { i1: { set: roots((x) => x * x - 16) }, i2: { set: roots((x) => x * x - 5 * x) }, i3: { set: roots((x) => (x - 2) ** 2 - 9) }, i4: { set: roots((x) => x ** 3 - 4 * x) }, i5: { set: roots((x) => Math.abs(x) - 7) }, i6: { set: roots((x) => x * (x + 3)) } }),
  ...drill('domain', {
    i1: { region: (x) => !Number.isNaN(Math.sqrt(x - 4)) }, i2: { region: (x) => x * x - 9 !== 0 }, i3: { region: (x) => 5 - x > 0 },
    i4: { set: roots((x) => Math.sqrt(x) - (x - 2)) }, i5: { set: roots((x) => (x * x - 1) / (x - 1)) }, i6: { set: roots((x) => log(3, x) + log(3, x - 8) - 2, 0, 50) },
  }),
  ...drill('inequality_flip', { i1: { region: (x) => -3 * x < 12 }, i2: { region: (x) => -x / 2 >= 3 }, i3: { region: (x) => 5 - 2 * x > 1 }, i4: { region: (x) => -4 * x + 1 <= 9 }, i5: { region: (x) => (x - 3) / -2 > 1 }, i6: { region: (x) => 2 - x >= 2 * x - 4 } }),
  ...drill('powers', { i1: { fn: (x) => x ** 3 * x ** 5 }, i2: { fn: (x) => (x ** 2) ** 3 }, i3: { fn: (x) => x ** 7 / x ** 2 }, i4: { value: 2 ** 0 + 2 ** -1 }, i5: { fn: (x) => (3 * x) ** 2 }, i6: { value: 4 ** 0.5 } }),
  ...drill('formulas', { i1: { value: 4 * 5 }, i2: { value: 5 ** 2 }, i3: { value: 2 * Math.PI * 4 }, i4: { value: Math.PI * 4 ** 2 }, i5: { value: 6 * 2 ** 2 }, i6: { value: 2 * (3 + 7) } }),
  ...drill('units', { i1: { value: 1.5 * 100 }, i2: { value: 2.5 * 60 }, i3: { value: (72 * 1000) / 3600 }, i4: { value: (3 * 0.1 ** 3) / 0.001 }, i5: { value: 100 * 100 }, i6: { value: 90 / 60 } }),
  ...drill('trig_values', { i1: { value: Math.sin(60 * deg) }, i2: { value: Math.cos(90 * deg) }, i3: { value: Math.tan(60 * deg) }, i4: { value: Math.sin(150 * deg) }, i5: { value: Math.cos(180 * deg) }, i6: { value: Math.sin(-30 * deg) } }),
  ...drill('vieta', {
    i1: { value: quadRoots(1, -7, 12).reduce((a, b) => a + b, 0) }, i2: { value: quadRoots(1, -7, 12).reduce((a, b) => a * b, 1) }, i3: { value: quadRoots(1, 3, -10).reduce((a, b) => a + b, 0) },
    i4: { value: quadRoots(2, -8, 6).reduce((a, b) => a + b, 0) }, i5: { value: quadRoots(1, -5, -14).reduce((a, b) => a * b, 1) }, i6: { fn: (x) => (x - 2) * (x - 5) },
  }),
};

const diagnostic: Record<string, Check> = Object.fromEntries(Object.entries({
  d01: { value: 3 / 4 + 1 / 8 }, d02: { value: 360 * 0.15 }, d03: { value: Math.sqrt(12) * Math.sqrt(3) }, d04: { value: repeatingDecimal(18, 2) },
  d05: { value: roots((x) => 2 * x - 7 - 9)[0], tol: 1e-6 }, d06: { set: roots((x) => x * x - 7 * x + 10) }, d07: { region: (x) => x * x - 3 * x - 4 < 0 },
  d08: { set: roots((x) => Math.sqrt(x + 3) - (x - 3)) }, d09: { value: 3 * 4 - 2 }, d10: { value: 4 + 7 * 3 }, d11: { value: roots((x) => 2 ** (x + 2) - 32)[0], tol: 1e-6 },
  d12: { set: roots((x) => Math.log2(x + 1) + Math.log2(x - 1) - 3, 0, 50) }, d13: { value: Math.cos(60 * deg) + Math.sin(30 * deg) },
  d14: { value: Math.tan(Math.PI - Math.asin(0.8)) }, d15: { value: 1 / (1 / 4 + 1 / 12) }, d16: { value: d((x) => x ** 3 - 3 * x * x, 2), tol: 1e-6 },
  d17: { value: 7 * 4 }, d18: { value: Math.hypot(5, 12) }, d19: { value: (Math.PI * 36 * 90) / 360 }, d20: { value: (Math.PI * 9 * 4) / 3 },
} as Record<string, Check>).map(([id, check]) => [`diag#${id}`, check]));

const lessons: Record<string, Check> = {
  'lesson.quadratic-formula': { set: quadRoots(3, -5, 2) },
  'lesson.vieta': { value: quadRoots(1, -6, 4).reduce((s, r) => s + r * r, 0) },
  'lesson.interval-method': { region: (x) => (x + 2) * (x - 5) >= 0 },
  'lesson.modulus': { value: roots((x) => Math.abs(3 * x - 6) - 9).reduce((a, b) => a + b, 0), tol: 1e-6 },
  'lesson.irrational-check': { set: roots((x) => Math.sqrt(3 * x + 4) - x) },
  'lesson.log-rules': { value: log(3, 54) - log(3, 2) },
  'lesson.exp-substitution': { value: roots((x) => 9 ** x - 2 * 3 ** x - 3)[0], tol: 1e-6 },
  'lesson.trig-table': { value: Math.sin(240 * deg) },
  'lesson.area-formulas': { value: shoelace([[6, 0], [0, 3.5], [-6, 0], [0, -3.5]]) },
  'lesson.percent-problems': { value: (1.1 * 1.1 - 1) * 100 },
  'lesson.motion-work': { value: roots((t) => 16 * t - 4 * (t + 3), 0, 20)[0], tol: 1e-6 },
  'lesson.progressions': { value: Array.from({ length: 8 }, (_, i) => 2 + 5 * i).reduce((a, b) => a + b, 0) },
  'lesson.derivative-rules': { value: d((x) => x ** 3 - 12 * x, 1), tol: 1e-6 },
  'lesson.combinatorics': { value: count(0, 63, (n) => Math.floor(n / 8) !== n % 8) },
  'lesson.vectors': { pick: (k) => 2 * 3 + k * 6 === 0 },
};

/** Writing tasks: the verified answers in WRITING_KEYS, computed again here. */
const writingChecks: Record<string, (key: (typeof WRITING_KEYS)[string]) => boolean> = {
  'write.quadratic': (key) => sameSet(key.set!, roots((x) => x * x - 2 * x - 15), 1e-6),
  'write.inequality': (key) => { const region = regionOf(key.interval!); return Array.from({ length: 161 }, (_, i) => -20 + i * 0.25).concat([1, 5, 0.999, 5.001]).every((x) => region.has(x) === ((x - 1) * (x - 5) <= 0)); },
  'write.irrational': (key) => sameSet(key.set!, roots((x) => Math.sqrt(2 * x + 3) - x), 1e-6),
  'write.exponential': (key) => sameSet(key.set!, roots((x) => 4 ** x - 3 * 2 ** x - 4), 1e-6),
  'write.logarithm': (key) => sameSet(key.set!, roots((x) => log(3, x + 2) + log(3, x - 4) - 3, 0, 50), 1e-6),
  'write.motion': (key) => close(key.value!, roots((t) => 12 * t + 18 * t - 60, 0, 20)[0], 1e-6),
  'write.triangle': (key) => close(key.value!, Math.abs(24 * 7 - 0) / norm(24, 7), 1e-9),
  'write.extremum': (key) => { const f = (x: number) => x ** 3 - 3 * x * x - 9 * x + 5; return sameSet(key.set!, [maxOf(f, -2, 4), minOf(f, -2, 4)], 1e-6); },
  'write.probability': (key) => { const colour = (i: number) => (i < 5 ? 'white' : 'black'); const all = pairs(8); return close(key.value!, all.filter(([i, j]) => colour(i) === colour(j)).length / all.length); },
  'write.progression': (key) => { let s = 0; for (let n = 1; n < 100; n++) { s += 5 + 4 * (n - 1); if (s === 230) return key.value === n; } return false; },
  'write.cone': (key) => { const r = 6 / 2, h = Math.sqrt(6 ** 2 - r ** 2); return close(key.value!, (Math.PI * r * r * h) / 3); },
  'write.trig': (key) => sameSet(key.set!, roots((x) => 2 * Math.sin(x) ** 2 + 3 * Math.cos(x), 0, 2 * Math.PI), 1e-6),
};

// --- the tests --------------------------------------------------------------------------------------------------
const quizSets = pack.activities.filter((activity): activity is QuizSet => activity.kind === 'quiz_set' && !activity.mock);
const drillSets = pack.activities.filter((activity): activity is Drill => activity.kind === 'drill');
const lessonCards = pack.activities.filter((activity): activity is Lesson => activity.kind === 'lesson');
const writingTasks = pack.activities.filter((activity): activity is WritingTask => activity.kind === 'writing');

Deno.test('maths answers: every bank question is right and no wrong option is also right', () => {
  const failures: string[] = [];
  let checked = 0;
  for (const set of quizSets) for (const question of set.questions) {
    const id = `${set.id}#${question.id}`, check = banks[id];
    if (!check) { failures.push(`${id}: no verifier`); continue; }
    try { const problem = verify(id, question.options, question.answer, check); if (problem) failures.push(problem); else checked++; } catch (cause) { failures.push(`${id}: ${(cause as Error).message}`); }
  }
  const known = new Set(quizSets.flatMap((set) => set.questions.map((question) => `${set.id}#${question.id}`)));
  for (const id of Object.keys(banks)) if (!known.has(id)) failures.push(`${id}: a verifier for no question`);
  if (failures.length) throw new Error(`${failures.length} problem(s):\n${failures.join('\n')}`);
  if (checked < 33 * 8) throw new Error(`only ${checked} bank questions checked`);
});

Deno.test('maths answers: drills, placement questions, lesson checks and writing tasks', () => {
  const failures: string[] = [];
  const run = (id: string, options: string[] | undefined, answer: QuizQuestion['answer'], check: Check | undefined) => {
    if (!check) { failures.push(`${id}: no verifier`); return; }
    try { const problem = verify(id, options, answer, check); if (problem) failures.push(problem); } catch (cause) { failures.push(`${id}: ${(cause as Error).message}`); }
  };
  const ids = new Set<string>();
  for (const set of drillSets) for (const item of set.items) { const id = `${set.id}#${item.id}`; ids.add(id); run(id, item.options, item.answer as number, drills[id]); }
  for (const id of Object.keys(drills)) if (!ids.has(id)) failures.push(`${id}: a verifier for no drill item`);
  const questions = pack.diagnostic.items.filter((item) => item.kind === 'question');
  for (const item of questions) run(`diag#${item.id}`, item.options, item.answer!, diagnostic[`diag#${item.id}`]);
  for (const id of Object.keys(diagnostic)) if (!questions.some((item) => `diag#${item.id}` === id)) failures.push(`${id}: a verifier for no placement question`);
  for (const lesson of lessonCards) run(lesson.id, lesson.check.options, lesson.check.answer, lessons[lesson.id]);
  for (const id of Object.keys(lessons)) if (!lessonCards.some((lesson) => lesson.id === id)) failures.push(`${id}: a verifier for no lesson`);
  for (const task of writingTasks) {
    const key = WRITING_KEYS[task.id], check = writingChecks[task.id];
    if (!key || !check) { failures.push(`${task.id}: no key or verifier`); continue; }
    if (!check(key)) failures.push(`${task.id}: the key "${key.text}" does not match the computation`);
    if (!task.assessorNotes.includes(key.text)) failures.push(`${task.id}: the assessor notes do not carry the verified answer`);
  }
  for (const id of Object.keys(writingChecks)) if (!writingTasks.some((task) => task.id === id)) failures.push(`${id}: a verifier for no writing task`);
  if (failures.length) throw new Error(`${failures.length} problem(s):\n${failures.join('\n')}`);
});

Deno.test('maths answers: the option reader and the checks catch wrong keys', () => {
  if (!close(valueOf('2√3 + 1'), 2 * Math.sqrt(3) + 1) || !close(valueOf('−4/5'), -0.8) || !close(valueOf('5π/6'), (5 * Math.PI) / 6) || !close(valueOf('2,5'), 2.5)) throw new Error('numbers');
  if (!sameSet(setOf('2; −1/2'), [-0.5, 2]) || setOf('∅').length !== 0 || !sameSet(setOf('{3; 4}'), [3, 4])) throw new Error('sets');
  const region = regionOf('(−∞; −3) ∪ [2; +∞)');
  if (region.has(-3) || !region.has(-3.5) || !region.has(2) || region.has(0)) throw new Error('intervals');
  if (!close(compile('(x − 5)(x + 5)')(3), -16) || !close(compile('x² + 6x + 9')(-1), 4)) throw new Error('expressions');
  // A key moved to a wrong option, or a second right option, is caught.
  if (!verify('wrong-key', ['5', '7', '9'], 1, { value: 5 })) throw new Error('a wrong key passed');
  if (!verify('two-right', ['1/2', '0,5', '2'], 0, { value: 0.5 })) throw new Error('two right options passed');
  if (!verify('brackets', ['(1; 5)', '[1; 5]'], 0, { region: (x) => (x - 1) * (x - 5) <= 0 })) throw new Error('open brackets passed for a closed interval');
});
