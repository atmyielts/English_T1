import { ArrowRight, CheckCircle2, Circle, Compass, NotebookPen, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../service-i18n/src/i18n.tsx';
import { TaskText } from '../components/TaskText';
import { Shell } from '../components/TopNav';
import { EmptyState, ErrorPanel, PracticeAccess, Skeleton, formatDate, useErrorText } from '../components/ui';
import { humanize, useDynamicT, useT } from '../i18n';
import type { Json, MyPlan, PlanItem } from '../lib/api';
import { usePlaybook } from '../lib/context';
import { useCatalog } from './LandingPage';

const rec = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const rows = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === 'object' && !Array.isArray(x)) : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const todayIso = () => new Date().toISOString().slice(0, 10);

type Dashboard = MyPlan & { profile: Json; diagnostic: Json | null; plans: Json[]; sections_completed_by_page: Record<string, number>; notes_count: number };

export const DashboardPage = () => {
  const t = useT();
  const dt = useDynamicT();
  const { locale } = useI18n();
  const errorText = useErrorText();
  const { config, api, access } = usePlaybook();
  const token = access.token!;
  const { catalog } = useCatalog();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    api.dashboard(token)
      .then((res) => active && setData(res as unknown as Dashboard))
      .catch((err) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, token, attempt]);

  if (error) return <Shell><ErrorPanel message={error} onRetry={() => setAttempt((n) => n + 1)} /></Shell>;
  if (!data) return <Shell><Skeleton lines={2} /><Skeleton lines={5} /><Skeleton lines={4} /></Shell>;

  const pages = [...(catalog?.modules ?? []), ...(catalog?.premium_guides ?? [])];
  const titleOf = (slug: string) => pages.find((p) => p.slug === slug)?.title ?? null;
  const profile = rec(data.profile);
  const result = rec(data.diagnostic?.recommendation_json);
  const hasDiagnostic = typeof result.version === 'string' && result.version.includes('diagnostic-v2');
  const bands = config.scale === 'toefl_band';
  // TOEFL: 1–6 bands (the legacy 0–120 columns are only a comparison).
  const current = bands
    ? num(rec(result.current).overall) ?? (profile.current_band != null ? Number(profile.current_band) : null)
    : num(rec(result.current).total) ?? num(profile.current_score_or_estimate);
  const target = bands ? (profile.target_band != null ? Number(profile.target_band) : null) : num(profile.target_total_score);
  const show = (v: number | null) => (v == null ? '—' : bands ? v.toFixed(1) : String(v));
  const deadline = typeof profile.deadline_date === 'string' ? profile.deadline_date : null;
  const daysLeft = deadline ? Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86400000) : null;
  const hasProfile = !!profile.user_id;

  const replaceItem = (item: PlanItem) =>
    setData((d) => {
      if (!d) return d;
      const swap = (list: PlanItem[]) => list.map((i) => (i.id === item.id ? item : i));
      const planItems = swap(d.plan_items);
      const moduleItems = swap(d.module_items);
      return { ...d, plan_items: planItems, module_items: moduleItems, progress: { ...d.progress, done: planItems.filter((i) => i.status === 'done').length, modules_done: moduleItems.filter((i) => i.status === 'done').length } };
    });

  const toggle = async (item: PlanItem) => {
    setBusy(item.id);
    try {
      replaceItem((await api.setItem(item.id, item.status === 'done' ? 'todo' : 'done', token)).item);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (item: PlanItem) => {
    setBusy(item.id);
    try {
      await api.removeItem(item.id, token);
      setData((d) => (d ? { ...d, module_items: d.module_items.filter((i) => i.id !== item.id), progress: { ...d.progress, modules_total: d.progress.modules_total - 1 } } : d));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  // This week's tasks: anything due within the next 7 days, plus overdue undone ones.
  const horizon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const upcoming = data.plan_items.filter((i) => (i.due_date ?? '') <= horizon && (i.status !== 'done' || (i.due_date ?? '') >= todayIso())).slice(0, 12);
  const bottlenecks = rows(result.bottlenecks).slice(0, 3);
  const suggestion = rec(result.plan_suggestion);
  const started = Object.entries(data.sections_completed_by_page ?? {})
    .map(([pageId, count]) => ({ page: pages.find((p) => p.id === pageId), count }))
    .filter((x) => x.page);

  return (
    <Shell>
      <section className="page-header">
        <div>
          <p className="eyebrow">{config.serviceName}</p>
          <h1>{t('dash.title', { exam: config.examName })}</h1>
          <p>{t('dash.lead')}</p>
        </div>
        <div className="hero-actions">
          <Link to="/diagnostic" className="btn solid"><Compass size={16} aria-hidden="true" /> {hasDiagnostic ? t('dash.seeDiagnostic') : t('diag.run')}</Link>
          <Link to="/onboarding" className="btn ghost">{t('diag.editGoals')}</Link>
        </div>
      </section>

      {!hasProfile ? (
        <EmptyState title={t('dash.setupTitle')} body={t('dash.setupBody', { exam: config.examName })}>
          <Link to="/onboarding" className="btn solid">{t('dash.setup')} <ArrowRight size={15} aria-hidden="true" /></Link>
        </EmptyState>
      ) : null}

      <section className="kpi-grid">
        <article className="kpi-card">
          <span>{bands ? t('diag.targetBand') : t('diag.target')}</span>
          <strong>{show(target)}</strong>
          <p>{bands ? t('dash.targetBandHint') : t('dash.targetHint')}</p>
        </article>
        <article className="kpi-card">
          <span>{bands ? t('diag.currentBand') : t('diag.current')}</span>
          <strong>{show(current)}</strong>
          <p>
            {current != null && target != null
              ? target > current
                ? bands ? t('dash.bandsToGo', { bands: (target - current).toFixed(1) }) : t('dash.toGo', { points: target - current })
                : t('diag.atTarget')
              : t('dash.noCurrent')}
          </p>
        </article>
        <article className="kpi-card">
          <span>{t('dash.testDate')}</span>
          <strong className="kpi-small">{deadline ? formatDate(deadline, locale) : '—'}</strong>
          <p>{daysLeft != null ? (daysLeft >= 0 ? t('diag.daysLeft', { days: daysLeft }) : t('dash.testPassed')) : t('diag.noDate')}</p>
        </article>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t('dash.planEyebrow')}</p>
            <h2>{data.plan ? String(rec(data.plan.metadata).template_title ?? humanize(data.plan.template_slug)) : t('dash.noPlanTitle')}</h2>
          </div>
          {data.plan ? <Link to={`/plans/${String(data.plan.template_slug)}`} className="btn ghost compact">{t('dash.openPlan')}</Link> : null}
        </div>
        {data.plan ? (
          <>
            <div className="read-progress">
              <div className="progress-track"><div className="progress-fill" style={{ width: `${data.progress.total ? Math.round((data.progress.done / data.progress.total) * 100) : 0}%` }} /></div>
              <span>{t('plans.progress', { done: data.progress.done, total: data.progress.total })}</span>
            </div>
            <h3>{t('dash.thisWeek')}</h3>
            {upcoming.length ? (
              <ul className="task-list">
                {upcoming.map((item) => (
                  <li key={item.id} className={item.status === 'done' ? 'done' : ''}>
                    <button type="button" className="check-button" aria-pressed={item.status === 'done'} aria-label={item.status === 'done' ? t('plans.markUndone') : t('plans.markDone')} onClick={() => void toggle(item)} disabled={busy === item.id}>
                      {item.status === 'done' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                    </button>
                    <div>
                      <span className="task-date">{formatDate(item.due_date, locale)}{(item.due_date ?? '') < todayIso() && item.status !== 'done' ? ` · ${t('dash.overdue')}` : ''}</span>
                      <p>{item.metadata?.checkpoint ? `${t('plans.checkpoint')}: ${item.title}` : item.metadata?.reading && item.page_slug ? <Link to={`/${item.page_slug}`}>{titleOf(item.page_slug) ?? item.page_slug}</Link> : <TaskText text={item.title} titleOf={titleOf} />}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p>{t('dash.nothingThisWeek')}</p>}
          </>
        ) : (
          <>
            <p>{hasDiagnostic && suggestion.template_slug ? t('dash.suggested', { plan: String(suggestion.template_title ?? humanize(suggestion.template_slug)) }) : t('dash.noPlanBody')}</p>
            <div className="hero-actions">
              {hasDiagnostic && suggestion.template_published ? <Link to={`/plans/${String(suggestion.template_slug)}`} className="btn solid">{t('diag.openPlan')}</Link> : null}
              <Link to="/plans" className="btn ghost">{t('diag.allPlans')}</Link>
            </div>
          </>
        )}
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>{t('dash.myModules')}</h2>
          {data.module_items.length ? (
            <ul className="task-list">
              {data.module_items.map((item) => (
                <li key={item.id} className={item.status === 'done' ? 'done' : ''}>
                  <button type="button" className="check-button" aria-pressed={item.status === 'done'} aria-label={item.status === 'done' ? t('plans.markUndone') : t('plans.markDone')} onClick={() => void toggle(item)} disabled={busy === item.id}>
                    {item.status === 'done' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                  </button>
                  <div><p><Link to={`/${item.page_slug}`}>{titleOf(item.page_slug ?? '') ?? item.title}</Link></p></div>
                  <button type="button" className="icon-button" aria-label={t('dash.remove')} onClick={() => void remove(item)} disabled={busy === item.id}><Trash2 size={15} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          ) : <p>{t('dash.noModules')}</p>}
          <Link to="/modules" className="inline-link">{t('dash.browseModules')}</Link>
        </section>

        <section className="panel">
          <h2>{t('dash.focus')}</h2>
          {bottlenecks.length ? (
            <ol className="plain-list">
              {bottlenecks.map((b) => (
                <li key={String(b.key)}>
                  <strong>{b.kind === 'domain' ? dt(`domain.${String(b.domain)}`, humanize(b.domain)) : dt(`section.${String(b.section)}`, humanize(b.section))}</strong>
                  {b.impact_unit === 'overall_band'
                    ? num(b.gap) != null ? ` · ${t('dash.bandGap', { gap: Number(b.gap).toFixed(1) })}` : ''
                    : num(b.estimated_impact) != null ? ` · ${t('diag.points', { points: Number(b.estimated_impact) })}` : ''}
                </li>
              ))}
            </ol>
          ) : <p>{hasDiagnostic ? t('diag.noBottlenecks') : t('dash.runFirst')}</p>}
          <PracticeAccess source="dashboard" compact />
        </section>
      </div>

      <div className="two-col">
        <section className="panel">
          <h2>{t('dash.reading')}</h2>
          {started.length ? (
            <ul className="plain-list">
              {started.map(({ page, count }) => <li key={page!.id}><Link to={`/${page!.slug}`}>{page!.title}</Link> <span className="muted-note">· {t('dash.sectionsRead', { count })}</span></li>)}
            </ul>
          ) : <p>{t('dash.noReading')}</p>}
        </section>
        <section className="panel">
          <h2><NotebookPen size={18} aria-hidden="true" /> {t('nav.notes')}</h2>
          <p>{data.notes_count ? t('dash.notesCount', { count: data.notes_count }) : t('notes.empty')}</p>
          <Link to="/notes" className="inline-link">{t('notes.all')}</Link>
        </section>
      </div>
    </Shell>
  );
};
