import { BookmarkCheck, BookmarkPlus, CheckCircle2, Crown, ExternalLink, ListTree, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageBlocks, sectionAnchor } from '../components/PageBlocks';
import { HighlightSaver, MarkRead, SectionCoach } from '../components/StudyTools';
import { Shell } from '../components/TopNav';
import { EmptyState, ErrorPanel, PracticeAccess, PremiumGate, Skeleton, useErrorText } from '../components/ui';
import { useDynamicT, useT } from '../i18n';
import { ApiError, type Json, type Note, type PagePayload, type PlanItem, type Section } from '../lib/api';
import { usePlaybook } from '../lib/context';
import { pricingUrl } from '../lib/platformUrls';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: PagePayload }
  | { kind: 'gated'; teaser: Json; code: string }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

const COACH_TYPES = new Set(['rich_text', 'faq', 'callout', 'comparison_table', 'checklist', 'timeline']);

export const ContentPage = () => {
  const t = useT();
  const dt = useDynamicT();
  const errorText = useErrorText();
  const { slug = '' } = useParams();
  const { config, api, access } = usePlaybook();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [moduleItem, setModuleItem] = useState<PlanItem | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const article = useRef<HTMLDivElement>(null);
  const token = access.token;

  useEffect(() => {
    if (access.status === 'loading') return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setState({ kind: 'loading' });
    api.page(slug, token, controller.signal)
      .then((data) => {
        if (!active) return;
        if (!data?.page || typeof data.page.title !== 'string') throw new Error('invalid');
        setState({ kind: 'ready', data: { ...data, sections: Array.isArray(data.sections) ? data.sections : [] } });
        const page = data.page;
        const base = { page_id: String(page.id ?? ''), page_type: String(page.page_type ?? ''), module_key: page.module_key ? String(page.module_key) : null, metadata: { slug } };
        void api.track({ event_name: 'page_view', ...base }, token);
        if (token) void api.track({ event_name: 'module_open', ...base }, token);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403) && error.details.teaser) {
          setState({ kind: 'gated', teaser: error.details.teaser as Json, code: error.code });
          void api.track({ event_name: 'premium_gate_seen', metadata: { slug } }, token);
        } else if (error instanceof ApiError && error.status === 404) setState({ kind: 'missing' });
        else setState({ kind: 'error', message: errorText(error) });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
    // errorText is stable per locale; reloading on locale change is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, slug, token, access.status, attempt]);

  useEffect(() => {
    if (!access.premium || !token || state.kind !== 'ready') return;
    let active = true;
    api.pageMe(slug, token)
      .then((me) => {
        if (!active) return;
        setCompleted(new Set(me.completed_section_ids ?? []));
        setModuleItem(me.module_item ?? null);
        setNotes(me.notes ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [access.premium, api, slug, state.kind, token]);

  const sections = state.kind === 'ready' ? state.data.sections : [];
  const headings = useMemo(() => sections.filter((s) => s.heading), [sections]);

  if (state.kind === 'loading') {
    return <Shell><Skeleton lines={2} /><Skeleton lines={6} /><Skeleton lines={5} /></Shell>;
  }
  if (state.kind === 'missing') {
    return (
      <Shell narrow>
        <EmptyState title={t('content.missingTitle')} body={t('content.missingBody')}>
          <Link className="btn solid" to="/modules">{t('nav.modules')}</Link>
        </EmptyState>
      </Shell>
    );
  }
  if (state.kind === 'error') {
    return <Shell narrow><ErrorPanel message={state.message} onRetry={() => setAttempt((n) => n + 1)}><Link className="btn ghost" to="/modules">{t('nav.modules')}</Link></ErrorPanel></Shell>;
  }
  if (state.kind === 'gated') {
    return (
      <Shell narrow>
        <section className="page-header">
          <div>
            <span className="chip premium"><Crown size={12} aria-hidden="true" /> {t('premium.badge')}</span>
            <h1>{String(state.teaser.title ?? '')}</h1>
            {state.teaser.summary ? <p>{String(state.teaser.summary)}</p> : null}
          </div>
        </section>
        <PremiumGate source={`page:${slug}`} title={state.code === 'auth_required' ? t('gate.signInTitle') : t('gate.guideTitle')} />
      </Shell>
    );
  }

  const { page, child_pages: children, sources } = state.data;
  const meta = (page.metadata ?? {}) as Json;
  const parent = state.data.parent_page ?? null;
  const group = typeof meta.module_group === 'string' ? meta.module_group : '';
  const kicker = typeof meta.hero_kicker === 'string' && meta.hero_kicker.trim() ? meta.hero_kicker : group ? dt(`group.${group}`, '') : '';
  const minutes = Number(meta.reading_minutes ?? meta.estimated_reading_minutes ?? 0);
  const related = (Array.isArray(meta.related_practice) ? meta.related_practice : [])
    .filter((r): r is Json => !!r && typeof r === 'object')
    .map((r) => ({ label: String(r.label ?? ''), url: String(r.url ?? '') }))
    .filter((r) => r.label && r.url.startsWith('https://'));
  const total = sections.length;
  const doneCount = sections.filter((s) => completed.has(s.id)).length;

  const toggleSection = async (section: Section) => {
    if (!token) return;
    const next = !completed.has(section.id);
    setBusy(section.id);
    try {
      await api.sectionComplete(slug, section.id, next, token);
      setCompleted((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(section.id);
        else copy.delete(section.id);
        return copy;
      });
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const addToPlan = async () => {
    if (!token) return;
    setBusy('plan');
    setNotice(null);
    try {
      const res = await api.addToPlan(slug, token);
      setModuleItem(res.item);
      setNotice(t('content.addedToPlan'));
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const togglePlanItem = async () => {
    if (!token || !moduleItem) return;
    setBusy('plan');
    try {
      const res = await api.setItem(moduleItem.id, moduleItem.status === 'done' ? 'todo' : 'done', token);
      setModuleItem(res.item);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const removeNote = async (id: string) => {
    if (!token) return;
    try {
      await api.deleteNote(id, token);
      setNotes((list) => list.filter((n) => n.id !== id));
    } catch (error) {
      setNotice(errorText(error));
    }
  };

  const tools = access.premium
    ? (section: Section) => (
      <div className="section-tools">
        <MarkRead done={completed.has(section.id)} busy={busy === section.id} onToggle={() => void toggleSection(section)} />
        {COACH_TYPES.has(section.block_type) || !section.block_type ? <SectionCoach slug={slug} section={section} /> : null}
      </div>
    )
    : undefined;

  return (
    <Shell>
      <section className="page-header">
        <div>
          <p className="eyebrow">
            {String(page.visibility) === 'premium' ? `${t('premium.badge')} · ` : ''}{kicker || t('content.eyebrow', { service: config.serviceName })}
          </p>
          <h1>{String(page.title)}</h1>
          {page.summary ? <p>{String(page.summary)}</p> : null}
          <p className="page-meta">
            {minutes > 0 ? <span>{t('content.minutes', { count: minutes })}</span> : null}
            {total > 0 ? <span>{t('content.sections', { count: total })}</span> : null}
            {parent ? <span>{t('content.partOf')} <Link to={`/${String(parent.slug)}`}>{String(parent.title)}</Link></span> : null}
          </p>
          {access.premium && total > 0 ? (
            <div className="read-progress" aria-label={t('content.progress', { done: doneCount, total })}>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round((doneCount / total) * 100)}%` }} /></div>
              <span>{t('content.progress', { done: doneCount, total })}</span>
            </div>
          ) : null}
        </div>
        <div className="hero-actions header-actions">
          {access.premium ? (
            moduleItem ? (
              <button type="button" className="btn solid" onClick={() => void togglePlanItem()} disabled={busy === 'plan'}>
                {moduleItem.status === 'done' ? <CheckCircle2 size={16} aria-hidden="true" /> : <BookmarkCheck size={16} aria-hidden="true" />}
                {moduleItem.status === 'done' ? t('content.inPlanDone') : t('content.inPlanMarkDone')}
              </button>
            ) : (
              <button type="button" className="btn solid" onClick={() => void addToPlan()} disabled={busy === 'plan'}>
                <BookmarkPlus size={16} aria-hidden="true" /> {t('content.addToPlan')}
              </button>
            )
          ) : (
            <a className="btn solid" href={pricingUrl(config.productSlug)} onClick={() => void api.track({ event_name: 'upgrade_click', metadata: { source: `add-to-plan:${slug}` } }, token)}>
              <BookmarkPlus size={16} aria-hidden="true" /> {t('content.addToPlanPremium')}
            </a>
          )}
          <PracticeAccess source={`page:${slug}`} />
        </div>
      </section>
      {notice ? <p className="alert" role="status">{notice}</p> : null}

      <div className="content-layout">
        {headings.length > 2 ? (
          <aside className="toc">
            <details open>
              <summary><ListTree size={15} aria-hidden="true" /> {t('content.toc')}</summary>
              <ol>
                {headings.map((s) => (
                  <li key={s.id} className={completed.has(s.id) ? 'done' : ''}><a href={`#${sectionAnchor(s)}`}>{s.heading}</a></li>
                ))}
              </ol>
            </details>
          </aside>
        ) : null}
        <div className="article" ref={article}>
          {sections.length ? <PageBlocks sections={sections} tools={tools} completed={completed} /> : <EmptyState title={t('content.emptyTitle')} body={t('content.emptyBody')} />}
          {!access.premium ? <PremiumGate compact source={`tools:${slug}`} title={t('content.toolsTitle')} body={t('content.toolsBody')} /> : null}
        </div>
      </div>

      {access.premium && notes.length ? (
        <section className="panel">
          <h2>{t('notes.onThisPage')}</h2>
          <ul className="note-list">
            {notes.map((note) => (
              <li key={note.id}>
                {note.anchor_text ? <blockquote>{note.anchor_text}</blockquote> : null}
                {note.body ? <p>{note.body}</p> : null}
                <button type="button" className="icon-button" onClick={() => void removeNote(note.id)} aria-label={t('notes.delete')}><Trash2 size={15} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
          <Link to="/notes" className="inline-link">{t('notes.all')}</Link>
        </section>
      ) : null}

      {related.length ? (
        <section className="panel">
          <p className="eyebrow">{t('content.relatedPractice')}</p>
          <ul className="source-list">
            {related.map((r) => (
              <li key={r.url}>
                <a href={r.url} onClick={() => void api.track({ event_name: 'practice_click', page_id: String(page.id), metadata: { url: r.url, source: 'related_practice' } }, token)}>
                  <ExternalLink size={14} aria-hidden="true" /> {r.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {children.length ? (
        <section className="panel">
          <p className="eyebrow">{t('content.deepGuides')}</p>
          <div className="feature-grid catalog-grid">
            {children.map((child) => (
              <Link key={String(child.id)} to={`/${String(child.slug)}`} className="feature-card link-card">
                {String(child.visibility) === 'premium' ? <span className="chip premium">{t('premium.badge')}</span> : null}
                <h3>{String(child.title ?? '')}</h3>
                <p>{String(child.summary ?? '')}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {sources.length ? (
        <section className="panel">
          <p className="eyebrow">{t('content.sources')}</p>
          <ul className="source-list">
            {sources.map((row, i) => {
              const source = (row.source ?? {}) as Json;
              const url = typeof source.url === 'string' && source.url.startsWith('https://') ? source.url : null;
              return (
                <li key={i}>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => void api.track({ event_name: 'official_source_clicked', page_id: String(page.id), metadata: { url } }, token)}>
                      <ExternalLink size={14} aria-hidden="true" /> {String(source.title ?? url)}
                    </a>
                  ) : <span>{String(source.title ?? '')}</span>}
                  {row.citation_note ? <small>{String(row.citation_note)}</small> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {access.premium ? <HighlightSaver slug={slug} container={article} onSaved={(note) => setNotes((list) => [note, ...list])} /> : null}
    </Shell>
  );
};
