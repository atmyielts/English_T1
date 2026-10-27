import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { QuestionCard } from '../components/QuestionCard';
import { attemptStart, bankGet, type Facets, type QuestionStatus, type SatQuestion } from '../lib/api';
import { OFFICIAL_DOMAIN_IDS, OFFICIAL_DOMAINS, type OfficialDomain } from '../lib/content';
import { useAccess } from '../lib/useAccess';
import { domainLabel, questionTaxonomy, sectionLabel, skillLabel } from '../lib/labels';
import { useAppT, useErrorText, type AppKey } from '../i18n';

const PAGE = 12;
const FILTERS = ['section_type', 'official_domain', 'skill', 'difficulty', 'format', 'status'] as const;

export const BankPage = () => {
  const t = useAppT();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { accessToken } = useAccess();
  const value = (name: typeof FILTERS[number]) => params.get(name) ?? '';
  const section = value('section_type'), domain = value('official_domain') as OfficialDomain | '', skill = value('skill');
  const difficulty = value('difficulty'), format = value('format'), status = value('status');
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<SatQuestion[]>([]);
  const [history, setHistory] = useState<Record<string, QuestionStatus>>({});
  const [facets, setFacets] = useState<Facets | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const startPending = useRef(false);
  const actor = useRef(accessToken);
  actor.current = accessToken;

  const changeFilter = (name: string, next: string) => {
    setParams(current => {
      const p = new URLSearchParams(current);
      next ? p.set(name, next) : p.delete(name);
      p.delete('offset');
      if (name === 'section_type' && next && domain && OFFICIAL_DOMAINS[domain]?.section !== next) { p.delete('official_domain'); p.delete('skill'); }
      if (name === 'official_domain') p.delete('skill');
      return p;
    });
  };
  const page = (next: number) => setParams(current => { const p = new URLSearchParams(current); next ? p.set('offset', String(next)) : p.delete('offset'); return p; });

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    if (!accessToken) return () => { active = false; };
    bankGet(accessToken, {
      section_type: (section || undefined) as never, official_domain: (domain || undefined) as never, skill: skill || undefined,
      difficulty: (difficulty || undefined) as never, format: (format || undefined) as never, status: (status || undefined) as never, limit: PAGE, offset,
    }).then(result => {
      if (!active) return;
      setQuestions(result.questions); setHistory(result.history ?? {}); setFacets(result.facets ?? null); setTotal(result.total ?? result.questions.length);
    }).catch(err => { if (active) { setError(err); setQuestions([]); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, section, domain, skill, difficulty, format, status, offset, reload]);

  const startFiltered = async () => {
    if (!accessToken || loading || !total || startPending.current) return;
    startPending.current = true; setStarting(true); setError(null);
    try {
      const result = await attemptStart(accessToken, {
        mode: 'bank', section_type: (section || undefined) as never, official_domain: (domain || undefined) as never, skill: skill || undefined,
        difficulty: (difficulty || undefined) as never, format: (format || undefined) as never, status: (status || undefined) as never, question_count: count,
      });
      if (actor.current === accessToken) navigate(`/lab/${result.attempt.id}`, { state: { selection: result.selection ?? null } });
    } catch (err) {
      if (actor.current === accessToken) setError(err);
    } finally {
      startPending.current = false; setStarting(false);
    }
  };
  const facet = (group: keyof Omit<Facets, 'total'>, key: string, label: string) => {
    const n = facets?.[group]?.[key];
    return n == null ? label : t('bank.facet', { label, count: n });
  };
  const domains = OFFICIAL_DOMAIN_IDS.filter(d => !section || OFFICIAL_DOMAINS[d].section === section);
  const skills = domain ? OFFICIAL_DOMAINS[domain].skills : [];
  const anyFilter = FILTERS.some(f => value(f));

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('bank.eyebrow')}</p>
            <h1>{t('bank.title')}</h1>
            <p>{t('bank.lead')}</p>
          </div>
          <div className="bank-start">
            <label>{t('bank.count')}
              <select value={count} onChange={event => setCount(Number(event.target.value))}>
                {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button type="button" className="btn solid" disabled={loading || starting || !total || !accessToken} onClick={() => void startFiltered()}>
              {starting ? t('bank.starting') : t('bank.start')}
            </button>
          </div>
        </header>
        {error ? <div className="alert error" role="alert">{errorText(error)} <button type="button" className="btn" disabled={loading || starting} onClick={() => setReload(v => v + 1)}>{t('common.retry')}</button></div> : null}
        <fieldset className="filter-bar bank-filters" disabled={starting}>
          <legend>{t('bank.filters')}</legend>
          <label>{t('bank.section')}
            <select value={section} onChange={event => changeFilter('section_type', event.target.value)}>
              <option value="">{t('bank.anySection')}</option>
              {(['reading_writing', 'math'] as const).map(s => <option key={s} value={s}>{sectionLabel(t, s)}</option>)}
            </select>
          </label>
          <label>{t('bank.domain')}
            <select value={domain} onChange={event => changeFilter('official_domain', event.target.value)}>
              <option value="">{t('bank.anyDomain')}</option>
              {domains.map(d => <option key={d} value={d}>{facet('official_domain', d, domainLabel(t, d))}</option>)}
            </select>
          </label>
          <label>{t('bank.skill')}
            <select value={skill} disabled={!domain} onChange={event => changeFilter('skill', event.target.value)}>
              <option value="">{t('bank.anySkill')}</option>
              {skills.map(s => <option key={s} value={s}>{facet('skill', s, skillLabel(t, s))}</option>)}
            </select>
          </label>
          <label>{t('bank.difficulty')}
            <select value={difficulty} onChange={event => changeFilter('difficulty', event.target.value)}>
              <option value="">{t('bank.anyDifficulty')}</option>
              {(['easy', 'medium', 'hard'] as const).map(d => <option key={d} value={d}>{facet('difficulty', d, t(`difficulty.${d}`))}</option>)}
            </select>
          </label>
          <label>{t('bank.format')}
            <select value={format} onChange={event => changeFilter('format', event.target.value)}>
              <option value="">{t('bank.anyFormat')}</option>
              {(['mcq', 'spr'] as const).map(f => <option key={f} value={f}>{facet('format', f, t(`format.${f}`))}</option>)}
            </select>
          </label>
          <label>{t('bank.status')}
            <select value={status} onChange={event => changeFilter('status', event.target.value)}>
              <option value="">{t('bank.anyStatus')}</option>
              {(['unseen', 'missed', 'correct'] as const).map(s => <option key={s} value={s}>{facet('status', s, t(`status.${s}`))}</option>)}
            </select>
          </label>
        </fieldset>
        <div className="bank-status">
          <p role="status">{loading ? t('bank.loading') : !error ? total ? t('bank.showing', { from: offset + 1, to: Math.min(total, offset + questions.length), total }) : t('bank.none') : ''}</p>
          {anyFilter ? <button type="button" className="btn ghost compact" onClick={() => setParams(new URLSearchParams())}>{t('bank.clear')}</button> : null}
        </div>
        <section className="question-grid" aria-label={t('bank.preview')} aria-busy={loading}>
          {questions.map(question => {
            const tax = questionTaxonomy(question);
            const st = history[question.id];
            return <div key={question.id} className="question-shell">
              <div className="chip-row">
                <span className={`chip ${question.section_type}`}>{domainLabel(t, tax.official_domain)}</span>
                {tax.skill ? <span className="chip neutral">{skillLabel(t, tax.skill)}</span> : null}
                <span className="chip neutral">{t(`difficulty.${question.difficulty}` as AppKey)}</span>
                {st ? <span className={`chip status-${st}`}>{t(`status.${st}` as AppKey)}</span> : null}
              </div>
              <QuestionCard question={question} readOnly />
            </div>;
          })}
        </section>
        {total > PAGE ? <nav className="row-actions pager" aria-label={t('bank.preview')}>
          <button type="button" className="btn ghost" disabled={offset === 0 || loading} onClick={() => page(Math.max(0, offset - PAGE))}>{t('bank.prev')}</button>
          <button type="button" className="btn ghost" disabled={offset + PAGE >= total || loading} onClick={() => page(offset + PAGE)}>{t('bank.next')}</button>
        </nav> : null}
      </main>
    </div>
  );
};
