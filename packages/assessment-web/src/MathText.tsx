import React, { useEffect, useState } from 'react';
import { hasMath, splitMath } from './math-text.ts';

type Katex = typeof import('katex').default;
let loading: Promise<Katex> | null = null;
// KaTeX and its fonts load only when a question contains a formula.
const loadKatex = () => loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([module]) => module.default);

function render(katex: Katex, value: string, displayMode: boolean): string {
  // KaTeX escapes the input; trust stays off so \href, \url and HTML extensions are not rendered.
  return katex.renderToString(value, { displayMode, throwOnError: false, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 200, output: 'htmlAndMathml' });
}

/** Question text with \( inline \) and \[ display \] formulas. Text without formulas renders unchanged. */
export function MathText({ text }: { text: string }) {
  const [katex, setKatex] = useState<Katex | null>(null);
  const math = hasMath(text);
  useEffect(() => {
    if (!math || katex) return;
    let live = true;
    loadKatex().then((loaded) => { if (live) setKatex(() => loaded); }).catch(() => { loading = null; });
    return () => { live = false; };
  }, [math, katex]);
  if (!math) return <>{text}</>;
  return <>{splitMath(text).map((segment, index) => {
    if (segment.kind === 'text') return <React.Fragment key={index}>{segment.value}</React.Fragment>;
    const display = segment.kind === 'display';
    // Until KaTeX arrives (or if it cannot load) the formula source stays readable.
    if (!katex) return <code key={index} className="math-source">{segment.value}</code>;
    return <span key={index} className={display ? 'math-display' : 'math-inline'} dangerouslySetInnerHTML={{ __html: render(katex, segment.value, display) }} />;
  })}</>;
}
