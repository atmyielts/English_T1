import { ArrowRight, CheckCircle2, Circle, ExternalLink, MessageCircleQuestion } from 'lucide-react';
import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { useT } from '../i18n';
import type { Json, Section } from '../lib/api';

// Renders authored sections. Content is English; chrome strings are translated.
// Accepts the IELTS Playbook content shapes so the same authoring works.

const markdownComponents: Components = {
  table: ({ node: _node, ...props }) => (
    <div className="table-scroll" role="region" aria-label="Table" tabIndex={0}>
      <table {...props} />
    </div>
  ),
  a: ({ node: _node, href, children }) => <SmartLink href={href}>{children}</SmartLink>,
  img: () => null,
};

/** In-app paths use the router; https links open in a new tab; anything else is dropped. */
export const SmartLink = ({ href, children, className }: { href?: string | null; children: ReactNode; className?: string }) => {
  const url = typeof href === 'string' ? href.trim() : '';
  if (url.startsWith('/') && !url.startsWith('//')) return <Link to={url} className={className}>{children}</Link>;
  if (url.startsWith('#')) return <a href={url} className={className}>{children}</a>;
  if (/^https:\/\//i.test(url)) return <a href={url} className={className} target="_blank" rel="noopener noreferrer">{children}</a>;
  return <span className={className}>{children}</span>;
};

export const Markdown = ({ source }: { source: string }) => (
  <div className="prose-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{source}</ReactMarkdown>
  </div>
);

const isRecord = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const records = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isRecord) : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (isRecord(x) ? str(x.label ?? x.text ?? x.title) : str(x))).filter(Boolean) : []);
const safeUrl = (v: unknown): string | null => {
  const url = str(v);
  return /^(https:\/\/|\/)/i.test(url) ? url : null;
};

const Text = ({ value }: { value: string }) => <Markdown source={value} />;

const Table = ({ content }: { content: Json }) => {
  const headers = strings(content.columns ?? content.headers);
  const rawRows = Array.isArray(content.rows) ? content.rows : [];
  const rows: string[][] = rawRows.map((row) =>
    Array.isArray(row) ? row.map((cell) => str(cell)) : isRecord(row) ? (headers.length ? headers.map((h) => str(row[h] ?? row[h.toLowerCase()])) : Object.values(row).map(str)) : [],
  );
  if (!rows.length) return null;
  return (
    <div className="table-scroll" role="region" aria-label="Table" tabIndex={0}>
      <table>
        {headers.length ? <thead><tr>{headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead> : null}
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}</tr>)}</tbody>
      </table>
    </div>
  );
};

const Items = ({ content }: { content: Json }) => {
  const items = records(content.items ?? content.cards ?? content.stats ?? content.steps);
  if (!items.length) return null;
  return (
    <div className="data-grid">
      {items.map((item, i) => {
        const label = str(item.label ?? item.title ?? item.name ?? item.step);
        const value = str(item.value ?? item.description ?? item.body ?? item.note ?? item.detail);
        const meta = str(item.meta ?? item.when ?? item.weight ?? item.duration);
        const url = safeUrl(item.url ?? item.href);
        return (
          <article key={i} className="data-item">
            {meta ? <span className="data-meta">{meta}</span> : null}
            {label ? <strong>{label}</strong> : null}
            {value ? <Text value={value} /> : null}
            {url ? <SmartLink href={url} className="inline-link">{str(item.link_text) || url.replace(/^https:\/\//, '')} <ExternalLink size={13} aria-hidden="true" /></SmartLink> : null}
          </article>
        );
      })}
    </div>
  );
};

const Prose = ({ content }: { content: Json }) => {
  const parts: ReactNode[] = [];
  const reserved = new Set(['items', 'paragraphs', 'bullets', 'points', 'rows', 'columns', 'headers', 'tone']);
  if (str(content.lead)) parts.push(<div key="lead" className="lead-copy"><Text value={str(content.lead)} /></div>);
  for (const [key, value] of Object.entries(content)) {
    if (key === 'lead' || reserved.has(key)) continue;
    if (typeof value === 'string' && value.trim()) parts.push(<Text key={key} value={value} />);
  }
  for (const key of ['paragraphs', 'body']) {
    const list = content[key];
    if (Array.isArray(list)) list.forEach((p, i) => str(p) && parts.push(<Text key={`${key}-${i}`} value={str(p)} />));
  }
  const bullets = [...strings(content.items), ...strings(content.points), ...strings(content.bullets)];
  if (bullets.length) parts.push(<ul key="bullets">{bullets.map((b, i) => <li key={i}><Text value={b} /></li>)}</ul>);
  if (records(content.items).length && !bullets.length) parts.push(<Items key="items" content={content} />);
  if (Array.isArray(content.rows)) parts.push(<Table key="table" content={content} />);
  return <>{parts}</>;
};

export type SectionTools = (section: Section) => ReactNode;

export const sectionAnchor = (section: Section) => `s-${section.id}`;

export const PageBlocks = ({ sections, tools, completed }: { sections: Section[]; tools?: SectionTools; completed?: Set<string> }) => {
  const t = useT();
  return (
    <div className="page-blocks">
      {sections.map((section, index) => {
        const type = section.block_type || 'rich_text';
        const content = isRecord(section.content) ? section.content : {};
        const heading = section.heading ? <h2>{section.heading}</h2> : null;
        const done = completed?.has(section.id);
        const extra = tools ? tools(section) : null;
        const key = section.id ?? `${type}-${index}`;
        const wrap = (className: string, body: ReactNode) => (
          <section key={key} id={sectionAnchor(section)} className={`panel block ${className}${done ? ' is-done' : ''}`} data-section-id={section.id}>
            {done ? <span className="done-flag"><CheckCircle2 size={15} aria-hidden="true" /> {t('content.read')}</span> : null}
            {body}
            {extra}
          </section>
        );

        if (type === 'checklist') {
          const items = Array.isArray(content.items) ? content.items : [];
          return wrap('checklist-card', <>
            {heading}
            {str(content.lead) ? <Text value={str(content.lead)} /> : null}
            <ul className="check-items">
              {items.map((item, i) => {
                const label = isRecord(item) ? str(item.label ?? item.text ?? item.title) : str(item);
                const detail = isRecord(item) ? str(item.detail ?? item.description) : '';
                return <li key={i}><Circle size={14} aria-hidden="true" /><div><Text value={label} />{detail ? <div className="check-detail"><Text value={detail} /></div> : null}</div></li>;
              })}
            </ul>
          </>);
        }
        if (type === 'callout') {
          const tone = ['warning', 'tip', 'info', 'success'].includes(str(content.tone)) ? str(content.tone) : 'info';
          return wrap(`callout-card tone-${tone}`, <>
            {section.heading ? <p className="eyebrow">{section.heading}</p> : null}
            {str(content.label ?? content.title) ? <h3>{str(content.label ?? content.title)}</h3> : null}
            <Text value={str(content.body ?? content.description ?? content.note ?? content.text)} />
            {strings(content.items).length ? <ul>{strings(content.items).map((b, i) => <li key={i}><Text value={b} /></li>)}</ul> : null}
          </>);
        }
        if (type === 'faq') {
          return wrap('faq-card', <>
            {heading}
            <div className="faq-list">
              {records(content.items).map((item, i) => (
                <details key={i} className="faq-item" open={i === 0}>
                  <summary><MessageCircleQuestion size={16} aria-hidden="true" /> {str(item.question ?? item.q)}</summary>
                  <Text value={str(item.answer ?? item.a)} />
                </details>
              ))}
            </div>
          </>);
        }
        if (type === 'comparison_table') {
          return wrap('table-card', <>
            {heading}
            {str(content.lead) ? <Text value={str(content.lead)} /> : null}
            {Array.isArray(content.rows) ? <Table content={content} /> : <Items content={content} />}
            {str(content.note) ? <p className="muted-note"><Text value={str(content.note)} /></p> : null}
          </>);
        }
        if (type === 'timeline') {
          const steps = records(content.items ?? content.steps);
          return wrap('timeline-card', <>
            {heading}
            {str(content.lead) ? <Text value={str(content.lead)} /> : null}
            <ol className="timeline">
              {steps.map((step, i) => (
                <li key={i}>
                  <span className="timeline-dot" aria-hidden="true">{i + 1}</span>
                  <div>
                    {str(step.when ?? step.meta) ? <span className="data-meta">{str(step.when ?? step.meta)}</span> : null}
                    <strong>{str(step.label ?? step.title)}</strong>
                    <Text value={str(step.value ?? step.description ?? step.body)} />
                  </div>
                </li>
              ))}
            </ol>
          </>);
        }
        if (type === 'cta_strip') {
          const primary = safeUrl(content.primary_url);
          const secondary = safeUrl(content.secondary_url);
          return wrap('cta-card', <>
            {section.heading ? <p className="eyebrow">{section.heading}</p> : null}
            <h3>{str(content.label ?? content.title)}</h3>
            {str(content.body ?? content.description) ? <Text value={str(content.body ?? content.description)} /> : null}
            <div className="hero-actions">
              {primary ? <SmartLink className="btn solid" href={primary}>{str(content.primary_text) || t('common.open')} <ArrowRight size={15} aria-hidden="true" /></SmartLink> : null}
              {secondary ? <SmartLink className="btn ghost" href={secondary}>{str(content.secondary_text) || t('common.learnMore')}</SmartLink> : null}
            </div>
          </>);
        }
        if (['domain_grid', 'skill_grid', 'stat_grid', 'resource_cards', 'band_grid'].includes(type)) {
          return wrap(`grid-card ${type}`, <>
            {heading}
            {str(content.lead) ? <Text value={str(content.lead)} /> : null}
            <Items content={content} />
            {str(content.note) ? <p className="muted-note"><Text value={str(content.note)} /></p> : null}
          </>);
        }
        return wrap('prose-card', <>{heading}<Prose content={content} /></>);
      })}
    </div>
  );
};
