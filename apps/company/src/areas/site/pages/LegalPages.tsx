// /privacy, /terms and /security: what the service really does, from the code. Schood
// staff see a banner saying the text still needs legal review; nobody else does.
import React from 'react';
import { useSession } from '../../../session.tsx';
import { LEGAL, useContent } from '../content.ts';
import { SiteFrame } from '../SiteChrome.tsx';
import { PageLoading } from './common.tsx';

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' | 'security' }) {
  const { me } = useSession();
  const text = useContent(LEGAL);
  const path = `/${kind}`;
  if (!text) return <PageLoading path={path}/>;
  const page = text[kind];
  return <SiteFrame seo={{ title: page.metaTitle, description: page.metaDescription, path }}>
    {me?.staff && <p className="site-draft-banner" role="note">{text.draftBanner}</p>}
    <article className="site-legal">
      <h1>{page.title}</h1>
      <p className="site-lead">{page.lead}</p>
      <p className="hint">{text.version}</p>
      {page.sections.map((section) => <section key={section.title}>
        <h2>{section.title}</h2>
        {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {section.items.length > 0 && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
      </section>)}
    </article>
  </SiteFrame>;
}
