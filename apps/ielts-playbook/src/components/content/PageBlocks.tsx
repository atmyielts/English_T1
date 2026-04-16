import React from 'react';

const toList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => String(entry ?? '')).filter(Boolean) : [];

const toRecordList = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];

export const PageBlocks: React.FC<{ sections: Array<Record<string, unknown>> }> = ({ sections }) => (
  <div className="page-blocks">
    {sections.map((section) => {
      const id = String(section.id ?? crypto.randomUUID());
      const type = String(section.block_type ?? 'rich_text');
      const heading = section.heading ? String(section.heading) : null;
      const content = (section.content ?? {}) as Record<string, unknown>;

      if (type === 'checklist') {
        return (
          <section key={id} className="content-card">
            {heading ? <h2>{heading}</h2> : null}
            <ul className="checklist-grid">
              {toList(content.items).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        );
      }

      if (type === 'cta_strip') {
        return (
          <section key={id} className="cta-strip">
            {heading ? <p className="eyebrow">{heading}</p> : null}
            <div>
              <h2>{String(content.label ?? 'Next step')}</h2>
              <p>{String(content.primary_text ?? '')}</p>
            </div>
            <div className="cta-actions">
              <a href={String(content.primary_url ?? '#')} className="button button-dark">
                {String(content.primary_text ?? 'Open')}
              </a>
              <a href={String(content.secondary_url ?? '#')} className="button button-light">
                {String(content.secondary_text ?? 'Learn more')}
              </a>
            </div>
          </section>
        );
      }

      if (type === 'faq') {
        return (
          <section key={id} className="content-card">
            {heading ? <h2>{heading}</h2> : null}
            <div className="faq-list">
              {toRecordList(content.items).map((item, index) => (
                <article key={`${id}-${index}`}>
                  <h3>{String(item.question ?? 'Question')}</h3>
                  <p>{String(item.answer ?? '')}</p>
                </article>
              ))}
            </div>
          </section>
        );
      }

      if (type === 'comparison_table' || type === 'band_grid' || type === 'timeline') {
        return (
          <section key={id} className="content-card">
            {heading ? <h2>{heading}</h2> : null}
            <div className="data-grid">
              {toRecordList(content.items).map((item, index) => (
                <article key={`${id}-${index}`}>
                  <strong>{String(item.label ?? item.title ?? `Item ${index + 1}`)}</strong>
                  <p>{String(item.value ?? item.description ?? item.note ?? '')}</p>
                </article>
              ))}
            </div>
          </section>
        );
      }

      return (
        <section key={id} className="content-card">
          {heading ? <h2>{heading}</h2> : null}
          {'lead' in content ? <p className="lead-copy">{String(content.lead ?? '')}</p> : null}
          {'body' in content ? <p>{String(content.body ?? '')}</p> : null}
        </section>
      );
    })}
  </div>
);
