import { useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MathText } from '../../../../packages/assessment-web/src/MathText';

// AI answers as Markdown (GitHub style) with maths. Formulas use \( … \) and
// \[ … \], like Exam and Admission, so a "$" in prices is never maths. They are cut
// out before Markdown parsing (which would eat their backslashes and underscores)
// and rendered by Exam's KaTeX component. Raw HTML is dropped, remote images show
// only their description, and links open safely in a new tab.

interface Formula { display: boolean; value: string }
const OPEN = '', CLOSE = '';

/** Replaces formulas outside code with placeholders; returns them in order. */
export function protectMath(text: string): { markdown: string; formulas: Formula[] } {
  const formulas: Formula[] = [];
  let out = '', i = 0;
  while (i < text.length) {
    if (text.startsWith('```', i) && (i === 0 || text[i - 1] === '\n')) {
      const end = text.indexOf('\n```', i + 3), stop = end < 0 ? text.length : end + 4;
      out += text.slice(i, stop); i = stop; continue;
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) { out += text.slice(i, end + 1); i = end + 1; continue; }
    }
    const open = text.startsWith('\\(', i) ? '\\(' : text.startsWith('\\[', i) ? '\\[' : null;
    if (open) {
      const end = text.indexOf(open === '\\(' ? '\\)' : '\\]', i + 2);
      if (end > i + 2 && end - i < 2000) {
        formulas.push({ display: open === '\\[', value: text.slice(i + 2, end) });
        out += `${OPEN}${formulas.length - 1}${CLOSE}`;
        i = end + 2; continue;
      }
    }
    out += text[i]; i += 1;
  }
  return { markdown: out, formulas };
}

type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> };
const PLACEHOLDER = new RegExp(`(${OPEN}\\d+${CLOSE})`);
/** remark plugin: placeholders in text become <span data-formula="n"> elements. */
function remarkFormulas() {
  const walk = (node: Node) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child): Node[] => {
      if (child.type !== 'text' || !child.value || !PLACEHOLDER.test(child.value)) { walk(child); return [child]; }
      return child.value.split(PLACEHOLDER).filter(Boolean).map((part) => {
        const index = part.startsWith(OPEN) ? part.slice(1, -1) : null;
        return index !== null ? { type: 'formula', data: { hName: 'span', hProperties: { dataFormula: index }, hChildren: [] } } : { type: 'text', value: part };
      });
    });
  };
  return (tree: Node) => walk(tree);
}

export function Answer({ text, className = '' }: { text: string; className?: string }) {
  const { markdown, formulas } = useMemo(() => protectMath(text), [text]);
  return <div className={`ai-answer ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkFormulas]} skipHtml components={{
      span: ({ node: _node, ...props }) => {
        const index = (props as Record<string, unknown>)['data-formula'];
        if (index === undefined) return <span {...props}/>;
        const formula = formulas[Number(index)];
        return formula ? <MathText text={formula.display ? `\\[${formula.value}\\]` : `\\(${formula.value}\\)`}/> : null;
      },
      a: ({ href, children }) => /^(https?:|mailto:)/i.test(href ?? '') ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children as ReactNode}</span>,
      img: ({ alt }) => alt ? <span className="italic text-gray-600">[{alt}]</span> : null,
      table: ({ children }) => <div className="ai-table"><table>{children}</table></div>,
    }}>{markdown}</ReactMarkdown>
  </div>;
}
