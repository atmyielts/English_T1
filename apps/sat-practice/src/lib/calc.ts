// A small scientific calculator engine (no eval, no dependencies). Supports
// + - × ÷ ^, parentheses, implicit multiplication (2π, 3(4), 2√9), unary minus,
// factorial, π, e, ans, sqrt/√, cbrt, sin cos tan asin acos atan (degrees or
// radians), log (base 10), ln and abs.
export type AngleMode = 'deg' | 'rad';
export type CalcResult = { ok: true; value: number; text: string } | { ok: false; error: 'syntax' | 'math' | 'empty' };

type Token = { kind: 'num'; value: number } | { kind: 'op'; value: string } | { kind: 'id'; value: string };
const FUNCS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'cbrt', 'log', 'ln', 'abs']);
const CONSTS = new Set(['pi', 'e', 'ans']);

function tokenize(input: string): Token[] | null {
  const s = input.replace(/\s+/g, '').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/\*\*/g, '^');
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) return null;
      tokens.push({ kind: 'num', value: Number(m[1]) });
      i += m[1]!.length;
      if (s[i] === '.') return null;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      const m = /^[a-z]+/i.exec(s.slice(i))!;
      const word = m[0].toLowerCase();
      // Greedy split of glued names such as "2pie" is ambiguous; accept known names only.
      const known = [...FUNCS, ...CONSTS].sort((a, b) => b.length - a.length);
      let rest = word;
      while (rest) {
        const hit = known.find(k => rest.startsWith(k));
        if (!hit) return null;
        tokens.push({ kind: 'id', value: hit });
        rest = rest.slice(hit.length);
      }
      i += word.length;
      continue;
    }
    if ('+-*/^()!'.includes(ch)) { tokens.push({ kind: 'op', value: ch }); i += 1; continue; }
    return null;
  }
  return tokens;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let r = 1; for (let k = 2; k <= n; k++) r *= k; return r;
}

export function evaluate(input: string, mode: AngleMode = 'deg', ans = 0): CalcResult {
  if (!input.trim()) return { ok: false, error: 'empty' };
  const parsed = tokenize(input);
  if (!parsed || !parsed.length) return { ok: false, error: 'syntax' };
  const tokens: Token[] = parsed;
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => { const t = peek(); return t?.kind === 'op' && t.value === v; };
  const toRad = (x: number) => mode === 'deg' ? (x * Math.PI) / 180 : x;
  const fromRad = (x: number) => mode === 'deg' ? (x * 180) / Math.PI : x;
  // Exact values at common degree angles (sin 30 = 0.5, tan 45 = 1, cos 90 = 0).
  const clean = (x: number) => Math.abs(x) < 1e-12 ? 0 : Math.abs(x - Math.round(x)) < 1e-12 ? Math.round(x) : x;
  const call = (name: string, x: number): number => {
    switch (name) {
      case 'sin': return clean(Math.sin(toRad(x)));
      case 'cos': return clean(Math.cos(toRad(x)));
      case 'tan': { if (mode === 'deg' && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-12) return NaN; return clean(Math.tan(toRad(x))); }
      case 'asin': return fromRad(Math.asin(x));
      case 'acos': return fromRad(Math.acos(x));
      case 'atan': return fromRad(Math.atan(x));
      case 'sqrt': return Math.sqrt(x);
      case 'cbrt': return Math.cbrt(x);
      case 'log': return Math.log10(x);
      case 'ln': return Math.log(x);
      case 'abs': return Math.abs(x);
      default: return NaN;
    }
  };
  const startsFactor = () => { const t = peek(); return !!t && (t.kind === 'num' || t.kind === 'id' || (t.kind === 'op' && t.value === '(')); };
  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) { const op = (tokens[pos++] as { value: string }).value; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term(): number {
    let v = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const op = (tokens[pos++] as { value: string }).value; const r = unary(); v = op === '*' ? v * r : v / r; continue; }
      if (startsFactor()) { v *= power(); continue; }
      return v;
    }
  }
  function unary(): number {
    if (isOp('-')) { pos++; return -unary(); }
    if (isOp('+')) { pos++; return unary(); }
    return power();
  }
  function power(): number {
    const base = postfix();
    if (isOp('^')) { pos++; return Math.pow(base, unary()); }
    return base;
  }
  function postfix(): number {
    let v = primary();
    while (isOp('!')) { pos++; v = factorial(v); }
    return v;
  }
  function primary(): number {
    const t = tokens[pos++];
    if (!t) throw new Error('syntax');
    if (t.kind === 'num') return t.value;
    if (t.kind === 'op' && t.value === '(') { const v = expr(); if (!isOp(')')) throw new Error('syntax'); pos++; return v; }
    if (t.kind === 'id') {
      if (t.value === 'pi') return Math.PI;
      if (t.value === 'e') return Math.E;
      if (t.value === 'ans') return ans;
      if (FUNCS.has(t.value)) {
        // sqrt9 and sin30 without brackets apply to the next factor.
        const arg = isOp('(') ? (pos++, (() => { const v = expr(); if (!isOp(')')) throw new Error('syntax'); pos++; return v; })()) : unary();
        return call(t.value, arg);
      }
    }
    throw new Error('syntax');
  }
  try {
    const value = expr();
    if (pos !== tokens.length) return { ok: false, error: 'syntax' };
    if (!Number.isFinite(value)) return { ok: false, error: 'math' };
    return { ok: true, value, text: formatNumber(value) };
  } catch {
    return { ok: false, error: 'syntax' };
  }
}

export function formatNumber(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e12 || abs < 1e-9) return value.toExponential(8).replace(/\.?0+e/, 'e');
  return String(Number(value.toPrecision(12)));
}
