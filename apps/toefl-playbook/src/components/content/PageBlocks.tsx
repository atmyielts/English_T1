import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Json = Record<string, unknown>;

const looksLikeMarkdown = (text: string): boolean =>
  /(^|\n)#{1,6}\s|(^|\n)[-*+]\s|(^|\n)\d+\.\s|\*\*[^*]+\*\*|`[^`]+`|^>\s|\[[^\]]+\]\([^)]+\)/.test(text);

const toList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v ?? '')).filter(Boolean) : [];

const blockId = (section: Json, index: number) =>
  String(section.id ?? `${section.block_type ?? 'section'}-${index}`);

// Renders authored playbook sections. Default branch renders rich text /
// markdown; structured block types render as cards. Mirrors the IELTS
// Playbook PageBlocks renderer so imported markdown displays correctly.
export const PageBlocks = ({ sections }: { sections: Json[] }) => (
  <div className="page-blocks" style={{ display: 'grid', gap: 16 }}>
    {sections.map((section, index) => {
      const id = blockId(section, index);
      const type = String(section.block_type ?? 'rich_text');
      const heading = section.heading ? String(section.heading) : null;
      const content = (section.content ?? {}) as Json;

      if (type === 'checklist') {
        return (
          <section key={id} className="panel">
            {heading ? <h2>{heading}</h2> : null}
            <ul>
              {toList(content.items).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        );
      }

      if (type === 'callout') {
        return (
          <section key={id} className="panel" style={{ borderLeft: '3px solid #059669' }}>
            {heading ? <p className="eyebrow">{heading}</p> : null}
            <h2>{String(content.label ?? content.title ?? 'Important')}</h2>
            <p>{String(content.body ?? content.description ?? content.note ?? '')}</p>
          </section>
        );
      }

      // Default: prose / markdown.
      const lead = typeof content.lead === 'string' ? content.lead.trim() : '';
      const reserved = new Set(['lead', 'items', 'paragraphs', 'bullets', 'points']);
      const stringValues: string[] = [];
      for (const [key, value] of Object.entries(content)) {
        if (reserved.has(key)) continue;
        if (typeof value === 'string' && value.trim()) stringValues.push(value.trim());
      }
      const paragraphs = ['paragraphs', 'body'].flatMap((key) =>
        Array.isArray(content[key]) ? (content[key] as unknown[]).map((p) => String(p ?? '').trim()).filter(Boolean) : [],
      );
      const items = [...toList(content.items), ...toList(content.points), ...toList(content.bullets)];

      const renderText = (text: string, key: string) =>
        looksLikeMarkdown(text) ? (
          <div className="prose-markdown" key={key}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        ) : (
          <p key={key}>{text}</p>
        );

      return (
        <section key={id} className="panel">
          {heading ? <h2>{heading}</h2> : null}
          {lead ? renderText(lead, `${id}-lead`) : null}
          {stringValues.map((p, i) => renderText(p, `${id}-s-${i}`))}
          {paragraphs.map((p, i) => renderText(p, `${id}-p-${i}`))}
          {items.length > 0 ? (
            <ul>
              {items.map((item, i) => (
                <li key={`${id}-i-${i}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      );
    })}
  </div>
);
