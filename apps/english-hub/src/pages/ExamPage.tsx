import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { ApiError } from '../lib/api';
import {
  EXAM_SECTIONS,
  type ExamAllowance,
  type ExamOverview,
  getExamOverview,
  type MockKind,
  type MockResult,
  type MockView,
  saveExamDate,
  startExamMock,
} from '../lib/exam';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, Loading, PageHeader, Panel, useErrorMessage } from '../ui/kit';
import { MockResultView } from './exam/ExamResults';
import { ExamRunner } from './exam/ExamRunner';
import { levelText } from './exam/parts';
import './exam/exam.css';

type T = ReturnType<typeof useT>;
const KINDS: MockKind[] = ['full', ...EXAM_SECTIONS];

const allowanceLine = (allowance: ExamAllowance, kind: 'full' | 'section', t: T): string => {
  if (allowance.per === 'week') return allowance.left > 0 ? t('exam.allowance.freeFull', { count: allowance.left }) : t('exam.allowance.freeFullUsed');
  if (allowance.basis === 'free') return allowance.left > 0 ? t('exam.allowance.freeSection', { count: allowance.left }) : t('exam.allowance.freeSectionUsed');
  return t(kind === 'full' ? 'exam.allowance.ownerFull' : 'exam.allowance.ownerSection', { count: allowance.left });
};

const SectionEstimates = ({ data }: { data: ExamOverview }) => {
  const t = useT();
  const { date } = useI18n();
  return (
    <Panel title={t('exam.ready.title')}>
      <div className="en-stack">
        <ul className="en-exam-ready">
          {data.estimates.map((entry) => (
            <li key={entry.section}>
              <div className="en-exam-ready-head">
                <strong>{t(`exam.section.${entry.section}`)}</strong>
                <span className="en-exam-ready-score">
                  {entry.score === null ? t('exam.ready.noData') : `${t('exam.result.score', { score: entry.score })} · ${levelText(entry.level, t)}`}
                </span>
              </div>
              <div className="en-exam-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(((entry.score ?? 0) / 75) * 100)}%` }} />
                {[38, 51, 65].map((cut) => <i key={cut} style={{ left: `${(cut / 75) * 100}%` }} />)}
              </div>
              <p className="en-exam-note">
                {entry.source === 'mock' && entry.at
                  ? t('exam.ready.fromMock', { date: date(entry.at, { dateStyle: 'medium' }) })
                  : entry.source === 'rating'
                    ? (entry.tentative ? t('exam.ready.fromRatingTentative') : t('exam.ready.fromRating'))
                    : t('exam.ready.takeSection')}
              </p>
            </li>
          ))}
        </ul>
        <p style={{ margin: 0 }}>
          {data.estimate.score === null
            ? t('exam.ready.overallPending')
            : t('exam.ready.overall', { score: data.estimate.score, level: levelText(data.estimate.level, t) })}
        </p>
        <p className="hint" style={{ margin: 0 }}>{t('exam.ready.disclaimer')}</p>
      </div>
    </Panel>
  );
};

const DatePlan = ({ data, onSaved }: { data: ExamOverview; onSaved: (next: ExamOverview) => void }) => {
  const t = useT();
  const { date } = useI18n();
  const errorText = useErrorMessage();
  const [value, setValue] = useState(data.plan.date ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = data.plan;

  const save = async (next: string | null) => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveExamDate(next));
      if (next === null) setValue('');
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'english_onboarding_required' ? t('exam.date.onboarding') : errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const day = (iso: string) => date(`${iso}T12:00:00Z`, { day: 'numeric', month: 'short' });

  return (
    <Panel title={t('exam.date.title')}>
      <div className="en-stack">
        <form className="en-row" style={{ flexWrap: 'wrap', gap: '.5rem', alignItems: 'end' }} onSubmit={(event) => { event.preventDefault(); void save(value || null); }}>
          <label className="en-stack" style={{ gap: '.3rem' }}>
            {t('exam.date.label')}
            <input type="date" value={value} onChange={(event) => setValue(event.target.value)} disabled={saving} />
          </label>
          <button type="submit" disabled={saving || !value || value === plan.date}>{saving ? t('exam.date.saving') : t('exam.date.save')}</button>
          {plan.date ? <button type="button" className="quiet" disabled={saving} onClick={() => void save(null)}>{t('exam.date.clear')}</button> : null}
        </form>
        {error ? <div className="error" role="alert">{error}</div> : null}
        {plan.status === 'none' ? <p className="hint" style={{ margin: 0 }}>{t('exam.date.none')}</p> : null}
        {plan.status === 'today' ? <p className="en-explain" style={{ margin: 0 }}>{t('exam.date.today')}</p> : null}
        {plan.status === 'past' ? <p className="en-explain" style={{ margin: 0 }}>{t('exam.date.past')}</p> : null}
        {plan.status === 'upcoming' && plan.days_left !== null ? (
          <>
            <p style={{ margin: 0 }}><strong>{t('exam.date.daysLeft', { count: plan.days_left })}</strong></p>
            {plan.this_week ? (
              <p className="en-explain" style={{ margin: 0 }}>
                {plan.this_week.final
                  ? t('exam.plan.final', { section: t(`exam.section.${plan.this_week.focus}`) })
                  : t('exam.plan.thisWeek', { section: t(`exam.section.${plan.this_week.focus}`) })}
                {' '}{plan.this_week.mock === 'full' ? t('exam.plan.mockFull') : t('exam.plan.mockSection', { section: t(`exam.section.${plan.this_week.focus}`) })}
              </p>
            ) : null}
            <ul className="en-exam-weeks">
              {plan.weeks.map((week, index) => (
                <li key={week.weeks_to_go} className={index === 0 ? 'is-now' : ''}>
                  <span>{day(week.starts)} – {day(week.ends)}</span>
                  <span><strong>{t(`exam.section.${week.focus}`)}</strong> · {week.mock === 'full' ? t('exam.plan.full') : t('exam.plan.section')}{week.final ? ` · ${t('exam.plan.finalShort')}` : ''}</span>
                </li>
              ))}
            </ul>
            <p className="hint" style={{ margin: 0 }}>{t('exam.plan.note')}</p>
          </>
        ) : null}
      </div>
    </Panel>
  );
};

const Format = () => {
  const t = useT();
  return (
    <Panel title={t('exam.format.title')}>
      <div className="en-exam-format">
        <p>{t('exam.format.intro')}</p>
        {EXAM_SECTIONS.map((section) => (
          <div key={section}>
            <h3>{t(`exam.section.${section}`)}</h3>
            <p>{t(`exam.format.${section}`)}</p>
          </div>
        ))}
        <p className="hint">{t('exam.format.scoring')}</p>
        <p className="hint">{t('exam.styleNote')}</p>
      </div>
    </Panel>
  );
};

/** /exam: practice for Uzbekistan's national (Multilevel) English exam. */
export const ExamPage = () => {
  const t = useT();
  const { date } = useI18n();
  const { pricingHref } = useEnglish();
  const errorText = useErrorMessage();
  const overview = useResource((signal) => getExamOverview(signal), []);
  const [data, setData] = useState<ExamOverview | null>(null);
  const [running, setRunning] = useState<MockView | null>(null);
  const [finished, setFinished] = useState<MockResult | null>(null);
  const [starting, setStarting] = useState<MockKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = data ?? overview.data;

  const start = async (kind: MockKind) => {
    setStarting(kind);
    setError(null);
    try {
      const response = await startExamMock(kind);
      setRunning(response.mock);
      window.scrollTo({ top: 0 });
    } catch (cause) {
      setError(cause instanceof ApiError && ['exam_mock_limit_reached', 'english_ai_unavailable', 'exam_papers_missing', 'service_paused'].includes(cause.code ?? '') ? cause.message : errorText(cause));
    } finally {
      setStarting(null);
    }
  };

  const reload = () => {
    setData(null);
    overview.reload();
  };

  const header = (
    <PageHeader
      eyebrow={t('exam.eyebrow')}
      title={t('exam.title')}
      lead={t('exam.lead')}
      actions={running || finished ? <button type="button" className="quiet" onClick={() => { setRunning(null); setFinished(null); reload(); }}>{t('exam.backToOverview')}</button> : undefined}
    />
  );

  if (finished) {
    return (
      <>
        {header}
        <Panel title={t('exam.result.title')}>
          <MockResultView result={finished} />
          <div className="en-actions" style={{ marginTop: '1rem' }}>
            <button type="button" onClick={() => { setFinished(null); setRunning(null); reload(); }}>{t('exam.backToOverview')}</button>
          </div>
        </Panel>
      </>
    );
  }

  if (running && view) {
    return (
      <>
        {header}
        <ExamRunner
          mock={running}
          timing={view.timing}
          onFinished={(result) => { setFinished(result); window.scrollTo({ top: 0 }); }}
          onLeave={() => { setRunning(null); reload(); }}
        />
      </>
    );
  }

  return (
    <>
      {header}
      {overview.loading && !view ? <Panel><Loading lines={6} /></Panel> : null}
      {overview.error && !view ? <ErrorState error={overview.error} onRetry={overview.reload} /> : null}
      {view?.paused ? (
        <section className="en-panel en-tone-teal" role="status">
          <p className="eyebrow">{t('paused.eyebrow')}</p>
          <h2>{t('paused.title', { service: t('exam.nav') })}</h2>
          <p>{t('paused.body')}</p>
        </section>
      ) : null}
      {view ? (
        <div className="en-stack">
          <div className="en-grid-2">
            <SectionEstimates data={view} />
            <DatePlan data={view} onSaved={setData} />
          </div>
          <div className="en-grid-2">
            <Panel title={t('exam.mocks.title')}>
              <div className="en-stack">
                <p className="hint" style={{ margin: 0 }}>{allowanceLine(view.allowance.full, 'full', t)}</p>
                <p className="hint" style={{ margin: 0 }}>{allowanceLine(view.allowance.section, 'section', t)}</p>
                {view.allowance.full.basis === 'free' ? <p className="hint" style={{ margin: 0 }}><a href={pricingHref()}>{t('exam.allowance.more')}</a></p> : null}
                {!view.ai_available ? <p className="en-explain" role="status" style={{ margin: 0 }}>{t('exam.aiOff')}</p> : null}
                {error ? <div className="error" role="alert">{error}</div> : null}
                {view.in_progress ? (
                  <div className="en-exam-email">
                    <strong>{t('exam.resume.title', { kind: t(`exam.kind.${view.in_progress.kind}`) })}</strong>
                    <small>{date(view.in_progress.started_at, { dateStyle: 'medium', timeStyle: 'short' })}</small>
                    <div className="en-actions"><button type="button" onClick={() => setRunning(view.in_progress)}>{t('exam.resume.cta')}</button></div>
                  </div>
                ) : null}
                <div className="en-exam-kinds">
                  {KINDS.map((kind) => {
                    const allowance = kind === 'full' ? view.allowance.full : view.allowance.section;
                    const needsAi = kind === 'full' || kind === 'writing' || kind === 'speaking';
                    return (
                      <button
                        key={kind}
                        type="button"
                        className={kind === 'full' ? 'is-large' : 'quiet'}
                        disabled={view.paused || starting !== null || !allowance.allowed || (needsAi && !view.ai_available)}
                        onClick={() => void start(kind)}
                      >
                        {starting === kind ? t('exam.starting') : t(`exam.kind.${kind}`)}
                      </button>
                    );
                  })}
                </div>
                <p className="hint" style={{ margin: 0 }}>{t('exam.mocks.note')}</p>
              </div>
            </Panel>
            <Format />
          </div>
          <Panel title={t('exam.history.title')}>
            {view.history.length === 0 ? <EmptyState title={t('exam.history.empty')} body={t('exam.history.emptyBody')} /> : (
              <ul className="en-list">
                {view.history.map((entry) => (
                  <li key={entry.id}>
                    <details>
                      <summary style={{ cursor: 'pointer' }}>
                        <strong>{t(`exam.kind.${entry.kind}`)}</strong>
                        {entry.overall_score !== null ? ` · ${t('exam.result.score', { score: entry.overall_score })} · ${levelText(entry.level, t)}` : ''}
                        {' · '}{date(entry.finished_at, { dateStyle: 'medium' })}
                      </summary>
                      {entry.result ? <div style={{ marginTop: '.75rem' }}><MockResultView result={entry.result} /></div> : null}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className="hint" style={{ margin: 0 }}>
            {t('exam.related')} <Link to="/speaking-mock">{t('exam.related.ielts')}</Link> · <Link to="/progress">{t('exam.related.progress')}</Link>
          </p>
        </div>
      ) : null}
    </>
  );
};
