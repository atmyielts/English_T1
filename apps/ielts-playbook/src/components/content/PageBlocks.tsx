import React from 'react';
import { ArrowRight, CheckCircle2, MessageCircleQuestion } from 'lucide-react';

const toList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => String(entry ?? '')).filter(Boolean) : [];

const toRecordList = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];

const blockId = (section: Record<string, unknown>, index: number) => String(section.id ?? `${section.block_type ?? 'section'}-${index}`);

export const PageBlocks: React.FC<{ sections: Array<Record<string, unknown>> }> = ({ sections }) => (
  <div className="page-blocks">
    {sections.map((section, index) => {
      const id = blockId(section, index);
      const type = String(section.block_type ?? 'rich_text');
      const heading = section.heading ? String(section.heading) : null;
      const content = (section.content ?? {}) as Record<string, unknown>;

      if (type === 'checklist') {
        return (
          <section key={id} className="content-card checklist-card">
            {heading ? <h2>{heading}</h2> : null}
            <ul className="checklist-grid">
              {toList(content.items).map((item) => (
                <li key={item}>
                  <CheckCircle2 size={18} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      }

      if (type === 'cta_strip') {
        return (
          <section key={id} className="cta-strip">
            <div>
              {heading ? <p className="eyebrow">{heading}</p> : null}
              <h2>{String(content.label ?? 'Next step')}</h2>
              <p>{String(content.primary_text ?? '')}</p>
            </div>
            <div className="cta-actions">
              <a href={String(content.primary_url ?? '#')} className="button button-primary">
                {String(content.primary_text ?? 'Open')}
                <ArrowRight size={16} />
              </a>
              <a href={String(content.secondary_url ?? '#')} className="button button-secondary">
                {String(content.secondary_text ?? 'Learn more')}
              </a>
            </div>
          </section>
        );
      }

      if (type === 'faq') {
        return (
          <section key={id} className="content-card faq-card">
            {heading ? <h2>{heading}</h2> : null}
            <div className="faq-list">
              {toRecordList(content.items).map((item, itemIndex) => (
                <article key={`${id}-${itemIndex}`}>
                  <MessageCircleQuestion size={18} />
                  <div>
                    <h3>{String(item.question ?? 'Question')}</h3>
                    <p>{String(item.answer ?? '')}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      }

      if (type === 'comparison_table' || type === 'band_grid' || type === 'timeline' || type === 'resource_cards' || type === 'stat_grid') {
        return (
          <section key={id} className="content-card">
            {heading ? <h2>{heading}</h2> : null}
            <div className="data-grid">
              {toRecordList(content.items).map((item, itemIndex) => (
                <article key={`${id}-${itemIndex}`} className="data-item">
                  <strong>{String(item.label ?? item.title ?? `Item ${itemIndex + 1}`)}</strong>
                  <p>{String(item.value ?? item.description ?? item.note ?? '')}</p>
                </article>
              ))}
            </div>
          </section>
        );
      }

      if (type === 'callout') {
        return (
          <section key={id} className="callout-card">
            {heading ? <p className="eyebrow">{heading}</p> : null}
            <h2>{String(content.label ?? content.title ?? 'Important')}</h2>
            <p>{String(content.body ?? content.description ?? content.note ?? '')}</p>
          </section>
        );
      }

      // Default prose-card. Exhaustively render anything text-shaped in
      // content so authored copy under any reasonable key shows up.
      // 1. content.lead → lead paragraph
      // 2. Any string value at the top level of content (excluding known
      //    non-prose keys) → body paragraphs in declaration order
      // 3. Array-of-strings fields (paragraphs, body, items, points, bullets)
      //    → list paragraphs / bullets
      const proseLead = typeof content.lead === 'string' && content.lead.trim() ? content.lead.trim() : null;

      const reservedKeys = new Set(['lead', 'items', 'paragraphs', 'bullets', 'points']);
      const proseStringValues: string[] = [];
      for (const [key, value] of Object.entries(content)) {
        if (reservedKeys.has(key)) continue;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed) proseStringValues.push(trimmed);
        }
      }
      const proseParagraphsField = ['paragraphs', 'body']
        .flatMap((key) => (Array.isArray(content[key])
          ? (content[key] as unknown[]).map((p) => String(p ?? '').trim()).filter(Boolean)
          : []));
      const proseItems = [
        ...toList(content.items),
        ...toList(content.points),
        ...toList(content.bullets),
      ];

      return (
        <section key={id} className="content-card prose-card">
          {heading ? <h2>{heading}</h2> : null}
          {proseLead ? <p className="lead-copy">{proseLead}</p> : null}
          {proseStringValues.map((paragraph, paragraphIndex) => (
            <p key={`${id}-str-${paragraphIndex}`}>{paragraph}</p>
          ))}
          {proseParagraphsField.map((paragraph, paragraphIndex) => (
            <p key={`${id}-para-${paragraphIndex}`}>{paragraph}</p>
          ))}
          {proseItems.length > 0 ? (
            <ul>
              {proseItems.map((item, itemIndex) => (
                <li key={`${id}-item-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      );
    })}
  </div>
);
