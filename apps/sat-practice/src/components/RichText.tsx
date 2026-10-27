import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Fragment, memo, useMemo } from 'react';
import { parseRichText, sanitizeSvg, svgTitle } from '../lib/content';

// KaTeX runs with trust:false, so \href, \url, \includegraphics and HTML
// extensions are disabled; its output is generated markup, not content HTML.
const cache = new Map<string, string | null>();
export function renderMath(tex: string, display: boolean): string | null {
  const key = (display ? 'D' : 'I') + tex;
  if (cache.has(key)) return cache.get(key)!;
  let html: string | null;
  try {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', trust: false, maxExpand: 500, maxSize: 20, output: 'htmlAndMathml' });
  } catch {
    html = null;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, html);
  return html;
}

/** Content text: plain text, <u> underlines and $…$ / $$…$$ math. Never injects content HTML. */
export const RichText = memo(function RichText(props: { text: unknown; as?: 'span' | 'div' | 'p'; className?: string; mathErrorLabel?: string }) {
  const segments = useMemo(() => parseRichText(props.text), [props.text]);
  const Tag = props.as ?? 'span';
  return <Tag className={['rich-text', props.className].filter(Boolean).join(' ')}>
    {segments.map((segment, index) => {
      let node;
      if (segment.kind === 'text') {
        const lines = segment.text.split('\n');
        node = lines.map((line, i) => <Fragment key={i}>{i > 0 ? <br /> : null}{line}</Fragment>);
      } else {
        const html = renderMath(segment.tex, segment.display);
        node = html
          ? <span className={segment.display ? 'math-display' : 'math-inline'} dangerouslySetInnerHTML={{ __html: html }} />
          : <code className="math-fallback" title={props.mathErrorLabel}>{segment.tex}</code>;
      }
      return segment.underline ? <u key={index}>{node}</u> : <Fragment key={index}>{node}</Fragment>;
    })}
  </Tag>;
});

/** A content figure: whitelisted SVG shown as an image, so it can never run script or load resources. */
export function Figure(props: { svg: unknown; label: string }) {
  const clean = useMemo(() => sanitizeSvg(props.svg).svg, [props.svg]);
  if (!clean) return null;
  const alt = svgTitle(clean) ?? props.label;
  return <figure className="question-figure">
    <img src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clean)} alt={alt} loading="lazy" decoding="async" />
  </figure>;
}

export function DataTable(props: { table: unknown; label: string }) {
  const table = props.table as { headers?: unknown; rows?: unknown } | null;
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) return null;
  return <div className="table-scroll" role="region" aria-label={props.label} tabIndex={0}>
    <table className="question-table">
      <thead><tr>{table.headers.map((h, i) => <th key={i} scope="col"><RichText text={String(h)} /></th>)}</tr></thead>
      <tbody>{table.rows.filter(Array.isArray).map((row, r) => <tr key={r}>{(row as unknown[]).map((cell, c) => <td key={c}><RichText text={String(cell ?? '')} /></td>)}</tr>)}</tbody>
    </table>
  </div>;
}
