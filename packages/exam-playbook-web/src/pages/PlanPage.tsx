import { ArrowRight, CalendarDays, CheckCircle2, Circle, Clock, Flag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../../service-i18n/src/i18n.tsx';
import { TaskText } from '../components/TaskText';
import { Shell } from '../components/TopNav';
import { EmptyState, ErrorPanel, PremiumGate, Skeleton, SkeletonGrid, formatDate, useErrorText } from '../components/ui';
import { humanize, useDynamicT, useT } from '../i18n';
import type { Json, MyPlan, PlanItem } from '../lib/api';
import { usePlaybook } from '../lib/context';
import { useCatalog } from './LandingPage';

const rec = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const rows = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === 'object' && !Array.isArray(x)) : []);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')).filter(Boolean) : []);
const today = () => new Date().toISOString().slice(0, 10);

const useTitles = () => {
  const { catalog } = useCatalog();
  return (slug: string) => [...(catalog?.modules ?? []), ...(catalog?.premium_guides ?? [])].find((p) => p.slug === slug)?.title ?? null;
};

export const PlansPage = () => {
  const t = useT();
  const { config, access } = usePlaybook();
  const { catalog, failed, retry } = useCatalog();
  const templates = [...(catalog?.plan_templates ?? [])].sort((a, b) => config.templates.indexOf(a.slug) - config.templates.indexOf(b.slug));
  return (
    <Shell>
      <section className="page-header">
        <div>
          <p className="eyebrow">{config.serviceName}</p>
          <h1>{t('plans.title')}</h1>
          <p>{t('plans.lead')}</p>
        </div>
        {access.premium ? <div className="hero-actions"><Link className="btn ghost" to="/diagnostic">{t('plans.whichOne')}</Link></div> : null}
      </section>
      {failed ? <ErrorPanel message={t('modules.loadFailed')} onRetry={retry} /> : !catalog ? <SkeletonGrid cards={5} /> : templates.length === 0 ? (
        <EmptyState title={t('plans.noneYet')} body={t('plans.noneYetBody')} />
      ) : (
        <div className="feature-grid catalog-grid">
          {templates.map((p) => (
            <Link key={p.id} to={`/plans/${p.slug}`} className="feature-card link-card">
              <span className="chip"><CalendarDays size={12} aria-hidden="true" /> {t('plans.weeks', { count: Math.max(1, Math.ceil(p.duration_days / 7)) })}</span>
              <h3>{p.title}</h3>
              <p>{p.summary}</p>
              <span className="card-cta">{t('plans.view')} <ArrowRight size={14} aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      )}
      {!access.premium && catalog?.plan_templates.length ? <PremiumGate compact source="plans" title={t('plans.gateTitle')} body={t('plans.gateBody')} /> : null}
    </Shell>
  );
};

/** A template task; tool tasks without a URL in their text get an explicit link. */
const TaskLine = ({ task, titleOf }: { task: Json; titleOf: (slug: string) => string | null }) => {
  const text = String(task.title ?? '');
  const url = typeof task.url === 'string' && task.url.startsWith('https://') && !text.includes('https://') ? task.url : null;
  return (
    <>
      <TaskText text={text} titleOf={titleOf} />
      {url ? <> · <TaskText text={url} /></> : null}
    </>
  );
};

const Checkpoint = ({ cp }: { cp: Json }) => {
  const t = useT();
  return (
    <div className="checkpoint">
      <p><Flag size={14} aria-hidden="true" /> <strong>{t('plans.checkpoint')}{cp.title ? `: ${String(cp.title)}` : ''}</strong></p>
      {cp.measure ? <p><span className="chip neutral">{t('plans.measure')}</span> {String(cp.measure)}</p> : null}
      {cp.target_band ? <p><span className="chip premium">{t('plans.bandTarget')}</span> {String(cp.target_band)}</p> : null}
      {cp.pass_rule ? <p><span className="chip ok">{t('plans.pass')}</span> {String(cp.pass_rule)}</p> : null}
      {cp.if_not ? <p><span className="chip warn">{t('plans.ifNot')}</span> {String(cp.if_not)}</p> : null}
      {cp.text && cp.text !== cp.pass_rule ? <p>{String(cp.text)}</p> : null}
    </div>
  );
};

export const PlanPage = () => {
  const t = useT();
  const dt = useDynamicT();
  const { locale } = useI18n();
  const errorText = useErrorText();
  const { slug = '' } = useParams();
  const { config, api, access } = usePlaybook();
  const titleOf = useTitles();
  const { catalog } = useCatalog();
  const [data, setData] = useState<{ plan: Json; weeks: Json[]; meta: Json; schedule_preview: Json; adopted: MyPlan | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(today());
  const [testDate, setTestDate] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const token = access.token;

  useEffect(() => {
    if (!access.premium || !token) return;
    let active = true;
    setError(null);
    api.plan(slug, token)
      .then((res) => {
        if (!active) return;
        setData(res as never);
        const preview = rec(res.schedule_preview);
        if (preview.test_date) setTestDate(String(preview.test_date));
      })
      .catch((err) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.premium, api, slug, token, attempt]);

  const items = useMemo(() => data?.adopted?.plan_items ?? [], [data]);
  const byWeek = useMemo(() => {
    const map = new Map<number, PlanItem[]>();
    for (const item of items) {
      const week = item.week_number ?? 0;
      map.set(week, [...(map.get(week) ?? []), item]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);

  if (access.status === 'loading') return <Shell><Skeleton lines={6} /></Shell>;
  if (!access.premium) {
    const summary = catalog?.plan_templates.find((p) => p.slug === slug);
    return (
      <Shell narrow>
        <section className="page-header">
          <div>
            <p className="eyebrow">{t('plans.eyebrow')}</p>
            <h1>{summary?.title ?? humanize(slug)}</h1>
            {summary?.summary ? <p>{summary.summary}</p> : null}
          </div>
        </section>
        <PremiumGate source={`plan:${slug}`} title={t('plans.gateTitle')} body={t('plans.gateBody')} />
      </Shell>
    );
  }
  if (error) return <Shell><ErrorPanel message={error} onRetry={() => setAttempt((n) => n + 1)}><Link to="/plans" className="btn ghost">{t('nav.plans')}</Link></ErrorPanel></Shell>;
  if (!data) return <Shell><Skeleton lines={3} /><Skeleton lines={8} /></Shell>;

  const plan = data.plan;
  const meta = rec(data.meta);
  const templateMeta = rec(plan.metadata);
  const weeks = rows(data.weeks);
  const adopted = data.adopted;
  const adoptedSchedule = rec(adopted?.plan?.schedule);
  const scheduleWeeks = rows(adoptedSchedule.weeks);
  const hours = rec(meta.weekly_hours);
  const done = adopted?.progress.done ?? 0;
  const total = adopted?.progress.total ?? 0;

  const adopt = async () => {
    if (!token) return;
    setBusy('adopt');
    setNotice(null);
    try {
      const res = await api.adoptPlan(slug, token, { start_date: startDate, test_date: testDate || null });
      setData((d) => (d ? { ...d, adopted: res } : d));
      setNotice(t('plans.adopted'));
    } catch (err) {
      setNotice(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (item: PlanItem) => {
    if (!token) return;
    setBusy(item.id);
    try {
      const res = await api.setItem(item.id, item.status === 'done' ? 'todo' : 'done', token);
      setData((d) => {
        if (!d?.adopted) return d;
        const planItems = d.adopted.plan_items.map((i) => (i.id === item.id ? res.item : i));
        return { ...d, adopted: { ...d.adopted, plan_items: planItems, progress: { ...d.adopted.progress, done: planItems.filter((i) => i.status === 'done').length } } };
      });
    } catch (err) {
      setNotice(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell>
      <section className="page-header">
        <div>
          <p className="eyebrow">{t('plans.eyebrow')}</p>
          <h1>{String(plan.title ?? '')}</h1>
          {plan.summary ? <p>{String(plan.summary)}</p> : null}
          <div className="chip-row">
            <span className="chip"><CalendarDays size={12} aria-hidden="true" /> {t('plans.weeks', { count: weeks.length || Math.ceil(Number(plan.duration_days ?? 7) / 7) })}</span>
            {hours.min != null && hours.max != null ? <span className="chip"><Clock size={12} aria-hidden="true" /> {t('plans.hoursRange', { min: Number(hours.min), max: Number(hours.max) })}</span> : null}
            {plan.focus_section && config.scale !== 'toefl_band' ? <span className="chip">{dt(`focus.${String(plan.focus_section)}`, humanize(plan.focus_section))}</span> : null}
            {plan.intensity ? <span className="chip">{dt(`intensity.${String(plan.intensity)}`, humanize(plan.intensity))}</span> : null}
            {config.scale === 'toefl_band' ? (
              <>
                {templateMeta.band_entry_min != null ? <span className="chip">{t('plans.entryBand', { min: Number(templateMeta.band_entry_min).toFixed(1), max: Number(templateMeta.band_entry_max ?? templateMeta.band_entry_min).toFixed(1), cefr: String(templateMeta.cefr_entry ?? '') })}</span> : null}
                {templateMeta.band_target_min != null ? <span className="chip premium">{t('plans.targetBand', { min: Number(templateMeta.band_target_min).toFixed(1), max: Number(templateMeta.band_target_max ?? templateMeta.band_target_min).toFixed(1), cefr: String(templateMeta.cefr_target ?? '') })}</span> : null}
                {list(templateMeta.focus_sections).map((s) => <span key={s} className="chip">{dt(`section.${s}`, humanize(s))}</span>)}
                {templateMeta.full_mocks != null ? <span className="chip">{t('plans.fullMocks', { count: Number(templateMeta.full_mocks) })}</span> : null}
              </>
            ) : plan.score_min != null && plan.score_max != null ? <span className="chip">{t('plans.scoreWindow', { min: Number(plan.score_min), max: Number(plan.score_max) })}</span> : null}
          </div>
        </div>
      </section>
      {notice ? <p className="alert" role="status">{notice}</p> : null}

      <section className="panel adopt-panel">
        <h2>{adopted ? t('plans.yourPlan') : t('plans.adoptTitle')}</h2>
        {adopted ? (
          <>
            <div className="read-progress">
              <div className="progress-track"><div className="progress-fill" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div>
              <span>{t('plans.progress', { done, total })}</span>
            </div>
            <p className="muted-note">
              {t('plans.scheduledFrom', { start: formatDate(adopted.plan?.start_date, locale) })}
              {adopted.plan?.test_date ? ` · ${t('plans.testOn', { date: formatDate(adopted.plan.test_date, locale) })}` : ''}
              {adoptedSchedule.compressed ? ` · ${t('plans.compressed')}` : ''}
              {Number(adoptedSchedule.buffer_weeks ?? 0) > 0 ? ` · ${t('plans.buffer', { count: Number(adoptedSchedule.buffer_weeks) })}` : ''}
            </p>
          </>
        ) : <p>{t('plans.adoptBody')}</p>}
        <div className="field-row">
          <label className="field"><span>{t('plans.startDate')}</span><input type="date" min={today()} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label className="field"><span>{t('plans.testDate')}</span><input type="date" min={startDate} value={testDate} onChange={(e) => setTestDate(e.target.value)} /><small>{t('common.optional')}</small></label>
        </div>
        <button type="button" className="btn solid" onClick={() => void adopt()} disabled={busy === 'adopt' || weeks.length === 0}>
          {busy === 'adopt' ? t('common.saving') : adopted ? t('plans.readopt') : t('plans.adopt')}
        </button>
        {weeks.length === 0 ? <p className="muted-note">{t('error.templateEmpty')}</p> : null}
      </section>

      {meta.who_for || list(meta.rules).length || rows(meta.phases).length || list(meta.decision_rules).length || list(meta.daily_routine).length ? (
        <section className="panel two-col">
          <div>
            {meta.who_for ? <><h2>{t('plans.whoFor')}</h2><p>{String(meta.who_for)}</p></> : null}
            {rows(meta.phases).length ? (
              <>
                <h3>{t('plans.phases')}</h3>
                <ol className="plain-list">
                  {rows(meta.phases).map((p, i) => <li key={i}><strong>{String(p.label)}</strong>{list(p.weeks).length ? ` (${t('plans.week')} ${list(p.weeks).join(', ')})` : ''}{p.goal ? ` — ${String(p.goal)}` : ''}</li>)}
                </ol>
              </>
            ) : null}
          </div>
          <div>
            {list(meta.rules).length ? <><h3>{t('plans.rules')}</h3><ul>{list(meta.rules).map((r, i) => <li key={i}>{r}</li>)}</ul></> : null}
            {list(meta.decision_rules).length ? (
              <><h3>{t('plans.decisionRules')}</h3><ul>{list(meta.decision_rules).map((r, i) => <li key={i}>{r}</li>)}</ul></>
            ) : null}
            {list(meta.daily_routine).length ? (
              <><h3>{t('plans.dailyRoutine')}</h3><ul>{list(meta.daily_routine).map((r, i) => <li key={i}>{r}</li>)}</ul></>
            ) : null}
            {templateMeta.recommended_for ? <><h3>{t('plans.recommendedFor')}</h3><p>{String(templateMeta.recommended_for)}</p></> : null}
          </div>
        </section>
      ) : null}

      {rows(meta.resources).length || rows(meta.error_codes).length ? (
        <section className="panel two-col">
          {rows(meta.resources).length ? (
            <div>
              <h3>{t('plans.resources')}</h3>
              <ul className="source-list">{rows(meta.resources).map((r, i) => <li key={i}><a href={String(r.url)} target="_blank" rel="noopener noreferrer">{String(r.label)}</a></li>)}</ul>
            </div>
          ) : null}
          {rows(meta.error_codes).length ? (
            <div>
              <h3>{t('plans.errorCodes')}</h3>
              <dl className="code-list">{rows(meta.error_codes).map((e) => <div key={String(e.code)}><dt>{String(e.code)}</dt><dd>{String(e.meaning)}</dd></div>)}</dl>
            </div>
          ) : null}
        </section>
      ) : null}

      {adopted && scheduleWeeks.length ? (
        <section className="panel">
          <h2>{t('plans.checklist')}</h2>
          {byWeek.map(([week, weekItems]) => {
            const info = scheduleWeeks.find((w) => Number(w.calendar_week) === week) ?? {};
            const weekDone = weekItems.filter((i) => i.status === 'done').length;
            return (
              <details key={week} className="week-block" open={weekDone < weekItems.length && weekItems.some((i) => (i.due_date ?? '') <= today()) || week === 1}>
                <summary>
                  <strong>{t('plans.week')} {week}</strong> · {String(info.label ?? '')}
                  <span className="muted-note"> {formatDate(info.starts_on, locale)} – {formatDate(info.ends_on, locale)}{info.hours != null ? ` · ${t('plans.hours', { count: Number(info.hours) })}` : ''} · {weekDone}/{weekItems.length}</span>
                </summary>
                <ul className="task-list">
                  {weekItems.map((item) => {
                    const m = item.metadata ?? {};
                    const isCheckpoint = m.checkpoint === true;
                    return (
                      <li key={item.id} className={`${item.status === 'done' ? 'done' : ''}${isCheckpoint ? ' is-checkpoint' : ''}`}>
                        <button type="button" className="check-button" aria-pressed={item.status === 'done'} aria-label={item.status === 'done' ? t('plans.markUndone') : t('plans.markDone')} onClick={() => void toggle(item)} disabled={busy === item.id}>
                          {item.status === 'done' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                        </button>
                        <div>
                          <span className="task-date">{formatDate(item.due_date, locale)}{m.day ? ` · ${t('plans.day', { day: Number(m.day) })}` : ''}{m.minutes ? ` · ${t('plans.minutes', { count: Number(m.minutes) })}` : ''}</span>
                          {isCheckpoint ? <Checkpoint cp={{ title: item.title, pass_rule: m.pass_rule, if_not: m.if_not, text: m.text, measure: m.measure, target_band: m.target_band }} /> : m.reading && item.page_slug ? (
                            <p><Link to={`/${item.page_slug}`}>{titleOf(item.page_slug) ?? item.page_slug}</Link></p>
                          ) : <p><TaskLine task={{ title: item.title, url: m.url }} titleOf={titleOf} /></p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </section>
      ) : (
        <section className="panel">
          <h2>{t('plans.schedule')}</h2>
          {weeks.map((week, i) => (
            <details key={i} className="week-block" open={i === 0}>
              <summary>
                <strong>{String(week.label ?? `${t('plans.week')} ${i + 1}`)}</strong>
                {week.phase ? <span className="chip neutral">{String(week.phase)}</span> : null}
                {week.hours != null ? <span className="muted-note"> · {t('plans.hours', { count: Number(week.hours) })}</span> : null}
              </summary>
              {list(week.focus).length ? <p className="muted-note">{t('plans.focus')}: {list(week.focus).join(' · ')}</p> : null}
              {rows(week.days).length ? rows(week.days).map((day, j) => (
                <div key={j} className="day-block">
                  <p className="day-head">{t('plans.day', { day: Number(day.day ?? j + 1) })}{day.weekday ? ` · ${String(day.weekday)}` : ''}{day.minutes ? ` · ${t('plans.minutes', { count: Number(day.minutes) })}` : ''}</p>
                  <ul>{rows(day.tasks).map((task, k) => <li key={k}><TaskLine task={task} titleOf={titleOf} /></li>)}</ul>
                </div>
              )) : rows(week.tasks).length ? (
                <ul>{rows(week.tasks).map((task, k) => <li key={k}><TaskLine task={task} titleOf={titleOf} /></li>)}</ul>
              ) : null}
              {list(week.modules).length ? <p>{t('plans.read')}: {list(week.modules).map((s, k) => <span key={s}>{k ? ', ' : ''}<Link to={`/${s}`}>{titleOf(s) ?? s}</Link></span>)}</p> : null}
              {week.checkpoint ? <Checkpoint cp={rec(week.checkpoint)} /> : null}
            </details>
          ))}
        </section>
      )}

      <div className="hero-actions">
        {meta.simulator_cta ? <a className="btn ghost" href={String(meta.simulator_cta)}>{t('nav.simulator', { exam: config.examName })}</a> : null}
        {meta.practice_cta ? <a className="btn ghost" href={String(meta.practice_cta)}>{t(config.practice.nameKey as 'product.satPractice')}</a> : null}
        <Link className="btn ghost" to="/plans">{t('plans.allPlans')}</Link>
      </div>
    </Shell>
  );
};
