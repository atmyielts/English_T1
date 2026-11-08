// /help and /help/:article, plus the same articles inside the workspace at /w/:org/help,
// where the list opens on the reader's own role and each article links to its screen.
import React, { useMemo, useState, type ReactNode } from 'react';
import { useAppT } from '../../../i18n/index.ts';
import { Link } from '../../../router.tsx';
import { useWorkspace } from '../../../session.tsx';
import { HELP_ARTICLES, HELP_AUDIENCES, HELP_AUDIENCE_OF, HELP_SCREEN, type HelpArticleId, type HelpAudience } from '../catalog.ts';
import { HELP, useContent } from '../content.ts';
import { breadcrumbLd } from '../seo.ts';
import { Crumbs, SiteFrame } from '../SiteChrome.tsx';
import type { helpEn } from '../../../i18n/site.help.en.ts';
import { PageLoading, PageMissing } from './common.tsx';

type Help = typeof helpEn;
const isArticle = (id: string): id is HelpArticleId => (HELP_ARTICLES as readonly string[]).includes(id);

/** Folded, so "ё", capitals and the two Uzbek apostrophes don't get in the way of a search. */
const fold = (value: string) => value.toLowerCase().replaceAll('ё', 'е').replace(/[‘’ʻʼ']/g, '');

export function searchArticles(text: Help, query: string): HelpArticleId[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return HELP_ARTICLES.filter((id) => {
    const article = text.articles[id];
    const haystack = fold([article.title, article.summary, ...article.steps, ...article.notes].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}

function ArticleList({ text, href, start }: { text: Help; href: (id: HelpArticleId) => string; start: HelpAudience | 'all' }) {
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<HelpAudience | 'all'>(start);
  const found = useMemo(() => searchArticles(text, query), [text, query]);
  const shown = (group: HelpAudience) => audience === 'all' || audience === group ? found.filter((id) => HELP_AUDIENCE_OF[id] === group) : [];
  const total = HELP_AUDIENCES.reduce((sum, group) => sum + shown(group).length, 0);
  return <>
    <div className="site-help-tools">
      <label className="site-help-search">{text.searchLabel}<input type="search" value={query} maxLength={80} placeholder={text.searchPlaceholder} onChange={(event) => setQuery(event.target.value)}/></label>
      <div className="site-help-tabs" role="group" aria-label={text.audienceLabel}>
        {(['all', ...HELP_AUDIENCES] as const).map((group) => <button key={group} type="button" className={audience === group ? '' : 'quiet'} aria-pressed={audience === group} onClick={() => setAudience(group)}>{text.audiences[group]}</button>)}
      </div>
    </div>
    {total === 0 && <p role="status" className="site-page-status">{text.noResults}</p>}
    {HELP_AUDIENCES.map((group) => {
      const items = shown(group);
      return items.length > 0 && <section key={group} className="site-help-group">
        <h2 className="site-h3">{text.audiences[group]}</h2>
        <ul className="site-help-list">
          {items.map((id) => <li key={id}><Link to={href(id)}><strong>{text.articles[id].title}</strong><span>{text.articles[id].summary}</span></Link></li>)}
        </ul>
      </section>;
    })}
  </>;
}

function Article({ text, id, href, action }: { text: Help; id: HelpArticleId; href: (id: HelpArticleId) => string; action?: ReactNode }) {
  const article = text.articles[id];
  const related = HELP_ARTICLES.filter((other) => other !== id && HELP_AUDIENCE_OF[other] === HELP_AUDIENCE_OF[id]).slice(0, 4);
  return <article className="site-help-article">
    <p className="site-eyebrow">{text.audiences[HELP_AUDIENCE_OF[id]]}</p>
    <h1>{article.title}</h1>
    <p className="site-lead">{article.summary}</p>
    {article.where && <p className="site-help-where"><strong>{text.whereLabel}</strong> {article.where}</p>}
    {action}
    <h2 className="site-h3">{text.stepsTitle}</h2>
    <ol className="site-help-steps">{article.steps.map((step) => <li key={step}>{step}</li>)}</ol>
    {article.notes.length > 0 && <>
      <h2 className="site-h3">{text.notesTitle}</h2>
      <ul className="site-plain-list">{article.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </>}
    {related.length > 0 && <>
      <h2 className="site-h3">{text.relatedTitle}</h2>
      <ul className="site-link-chips">{related.map((other) => <li key={other}><Link to={href(other)}>{text.articles[other].title}</Link></li>)}</ul>
    </>}
  </article>;
}

const publicHref = (id: HelpArticleId) => `/help/${id}`;

export function HelpPage() {
  const text = useContent(HELP);
  if (!text) return <PageLoading path="/help"/>;
  return <SiteFrame seo={{ title: text.metaTitle, description: text.metaDescription, path: '/help' }}>
    <section className="site-page-hero">
      <h1>{text.title}</h1>
      <p className="site-lead">{text.lead}</p>
    </section>
    <section className="site-section-tight"><ArticleList text={text} href={publicHref} start="all"/></section>
  </SiteFrame>;
}

export function HelpArticlePage({ id }: { id: string }) {
  const text = useContent(HELP);
  const path = `/help/${id}`;
  if (!isArticle(id)) return <PageMissing path={path}/>;
  if (!text) return <PageLoading path={path}/>;
  const article = text.articles[id];
  return <SiteFrame seo={{ title: `${article.title} | ${text.title}`, description: article.summary, path, jsonLd: [breadcrumbLd([{ name: text.title, path: '/help' }, { name: article.title, path }])] }}>
    <Crumbs items={[{ to: '/help', label: text.title }, { label: article.title }]}/>
    <Article text={text} id={id} href={publicHref}/>
  </SiteFrame>;
}

const ownAudience = (member: ReturnType<typeof useWorkspace>): HelpAudience => member.hr ? 'hr' : member.lead ? 'manager' : 'employee';

export function WorkspaceHelpPage() {
  const workspace = useWorkspace();
  const text = useContent(HELP);
  if (!text) return <p role="status">{text === null ? '' : ''}</p>;
  return <section className="site-help-app">
    <h1>{text.title}</h1>
    <p className="site-lead">{text.lead}</p>
    <ArticleList text={text} href={(id) => `/w/${workspace.org.id}/help/${id}`} start={ownAudience(workspace)}/>
  </section>;
}

export function WorkspaceHelpArticlePage({ id }: { id: string }) {
  const t = useAppT();
  const workspace = useWorkspace();
  const text = useContent(HELP);
  if (!isArticle(id)) return <p className="error" role="alert">{t('error.not_found')}</p>;
  if (!text) return <p role="status">{t('app.loading')}</p>;
  const base = `/w/${workspace.org.id}`, screen = HELP_SCREEN[id];
  return <section className="site-help-app">
    <p><Link to={`${base}/help`}>{text.back}</Link></p>
    <Article text={text} id={id} href={(other) => `${base}/help/${other}`} action={screen !== null ? <p><Link className="button-link" to={`${base}/${screen}`}>{text.openScreen}</Link></p> : undefined}/>
  </section>;
}
