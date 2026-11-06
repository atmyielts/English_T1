// Custom role-play editor (/w/:org/builder/scenarios/:id, HR): who the AI plays, who
// the employee is, the goal, difficulty and the success criteria the AI's feedback
// checks one by one. HR sees how much it is practised, never what anyone said.
import React, { useState } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { emptyLocalized, LocalizedField, ProblemList, problemsOf, StatusBadge, type Localized, type Problem, type Status } from './builderKit.tsx';
import { Loading, useLoad, useLocalized } from './lib.tsx';

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
interface Form { title: Localized; goal: Localized; persona: string; learner_role: string; setting: string; opening: string; difficulty: (typeof DIFFICULTIES)[number]; checklist: string[] }
interface Detail { scenario: Form & { id: string; code: string; status: Status }; problems: Problem[]; practice: { sessions: number; people: number; average: number | null } }

const BLANK: Form = { title: emptyLocalized(), goal: emptyLocalized(), persona: '', learner_role: '', setting: '', opening: '', difficulty: 'medium', checklist: ['', ''] };

export function ScenarioEditor({ id }: { id: string }) {
  const { org } = useWorkspace();
  const isNew = id === 'new';
  const { data, error } = useLoad<Detail>(isNew ? null : `orgs/${org.id}/builder/scenarios/${id}`);
  if (!isNew && !data) return <Loading error={error}/>;
  return <Editor key={id} org={org.id} initial={data ?? null}/>;
}

/** Paste a procedure, a complaint or a script and get a draft to edit. */
function AiScenario({ org }: { org: string }) {
  const t = useAppT(), problem = useErrorText();
  const { locale } = useI18n();
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  async function draft() {
    setBusy(true); setFailure('');
    try {
      const result = await api<{ status: 'ok' | 'ai_limit' | 'ai_unavailable'; id?: string }>(`orgs/${org}/builder/scenarios/draft`, { method: 'POST', body: { source, locale }, timeoutMs: 60_000 });
      if (result.status !== 'ok' || !result.id) { setFailure(t(result.status === 'ai_limit' ? 'training.ai.limit' : 'training.ai.unavailable')); return; }
      navigate(`/w/${org}/builder/scenarios/${result.id}`, { replace: true });
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <section className="training-card" aria-labelledby="training-b-scenario-ai">
    <h2 id="training-b-scenario-ai">{t('training.scenario.aiTitle')}</h2>
    <p>{t('training.scenario.aiLead')}</p>
    <label>{t('training.builder.ai.source')}<textarea rows={5} maxLength={6000} value={source} onChange={(event) => setSource(event.target.value)}/></label>
    {failure && <p className="error" role="alert">{failure}</p>}
    <div className="company-actions">
      <button type="button" disabled={busy || source.trim().length < 40} onClick={() => void draft()}>{busy ? t('training.builder.ai.working') : t('training.scenario.aiCreate')}</button>
    </div>
  </section>;
}

function Editor({ org, initial }: { org: string; initial: Detail | null }) {
  const t = useAppT(), pick = useLocalized(), problem = useErrorText();
  const [detail, setDetail] = useState(initial);
  const [form, setForm] = useState<Form>(initial ? { ...initial.scenario, checklist: initial.scenario.checklist.length ? initial.scenario.checklist : ['', ''] } : BLANK);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState<Problem[] | null>(null);
  const change = (patch: Partial<Form>) => { setForm({ ...form, ...patch }); setDirty(true); setNotice(''); };
  const body = () => ({ ...form, checklist: form.checklist.map((item) => item.trim()).filter(Boolean) });

  async function save(): Promise<Detail> {
    const next = detail
      ? await api<Detail>(`orgs/${org}/builder/scenarios/${detail.scenario.id}`, { method: 'PUT', body: body() })
      : await api<Detail>(`orgs/${org}/builder/scenarios`, { method: 'POST', body: body() });
    setDetail(next);
    setDirty(false);
    if (!detail) navigate(`/w/${org}/builder/scenarios/${next.scenario.id}`, { replace: true });
    return next;
  }
  async function run(action: () => Promise<string>) {
    setBusy(true); setFailure(''); setNotice(''); setBlocked(null);
    try {
      setNotice(await action());
    } catch (cause) {
      const listed = problemsOf(cause);
      if (listed) setBlocked(listed);
      else setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  return <div className="training-page training-b-editor">
    <p className="training-crumbs"><Link to={`/w/${org}/builder`}>{t('training.nav.builder')}</Link></p>
    <header className="training-head">
      <h1>{pick(form.title) || t('training.builder.newScenario')}</h1>
      <p className="training-lesson-meta">
        {detail && <StatusBadge status={detail.scenario.status}/>}
        {dirty && <span className="company-badge warn">{t('training.builder.unsaved')}</span>}
      </p>
      <p>{t('training.scenario.lead')}</p>
    </header>

    {!detail && <AiScenario org={org}/>}

    <section className="training-card" aria-labelledby="training-b-scenario-who">
      <h2 id="training-b-scenario-who">{t('training.scenario.situation')}</h2>
      <LocalizedField label={t('training.builder.titleField')} max={200} value={form.title} onChange={(title) => change({ title })}/>
      <LocalizedField label={t('training.scenario.goal')} hint={t('training.scenario.goalHint')} rows={2} max={500} value={form.goal} onChange={(goal) => change({ goal })}/>
      <label>{t('training.scenario.persona')}
        <textarea rows={4} lang="en" maxLength={2000} value={form.persona} onChange={(event) => change({ persona: event.target.value })}/>
        <span className="hint">{t('training.scenario.personaHint')}</span>
      </label>
      <label>{t('training.scenario.learnerRole')}<input lang="en" maxLength={600} value={form.learner_role} onChange={(event) => change({ learner_role: event.target.value })}/></label>
      <label>{t('training.scenario.setting')}<textarea rows={2} lang="en" maxLength={1000} value={form.setting} onChange={(event) => change({ setting: event.target.value })}/></label>
      <label>{t('training.scenario.opening')}<input lang="en" maxLength={600} value={form.opening} onChange={(event) => change({ opening: event.target.value })}/><span className="hint">{t('training.scenario.openingHint')}</span></label>
      <label>{t('training.roleplay.difficulty')}
        <select value={form.difficulty} onChange={(event) => change({ difficulty: event.target.value as Form['difficulty'] })}>
          {DIFFICULTIES.map((value) => <option key={value} value={value}>{t(`training.difficulty.${value}` as AppKey)}</option>)}
        </select>
      </label>
    </section>

    <section className="training-card" aria-labelledby="training-b-scenario-criteria">
      <h2 id="training-b-scenario-criteria">{t('training.scenario.criteria')}</h2>
      <p className="hint">{t('training.scenario.criteriaHint')}</p>
      <ol className="training-b-criteria">
        {form.checklist.map((item, index) => <li key={index}>
          <label className="training-b-grow"><span className="visually-hidden">{t('training.scenario.criterion', { n: index + 1 })}</span>
            <input lang="en" maxLength={200} aria-label={t('training.scenario.criterion', { n: index + 1 })} value={item} onChange={(event) => change({ checklist: form.checklist.map((entry, position) => position === index ? event.target.value : entry) })}/>
          </label>
          {form.checklist.length > 2 && <button type="button" className="quiet" aria-label={t('training.scenario.removeCriterion', { n: index + 1 })} onClick={() => change({ checklist: form.checklist.filter((_, position) => position !== index) })}>×</button>}
        </li>)}
      </ol>
      {form.checklist.length < 6 && <button type="button" className="quiet" onClick={() => change({ checklist: [...form.checklist, ''] })}>{t('training.scenario.addCriterion')}</button>}
    </section>

    <section className="training-card training-b-publish" aria-labelledby="training-b-scenario-publish">
      <h2 id="training-b-scenario-publish">{t('training.builder.publishTitle')}</h2>
      <p>{t('training.scenario.publishLead')}</p>
      {blocked ? <ProblemList problems={blocked}/> : detail && !dirty && <ProblemList problems={detail.problems}/>}
      {failure && <p className="error" role="alert">{failure}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="company-actions">
        <button type="button" className="quiet" disabled={busy || (!dirty && Boolean(detail))} onClick={() => void run(async () => { await save(); return t('common.saved'); })}>{t('training.builder.saveDraft')}</button>
        {detail?.scenario.status !== 'published' && <button type="button" disabled={busy} onClick={() => void run(async () => {
          const saved = dirty || !detail ? await save() : detail;
          setDetail(await api<Detail>(`orgs/${org}/builder/scenarios/${saved.scenario.id}/publish`, { method: 'POST' }));
          return t('training.scenario.published');
        })}>{t('training.builder.publish')}</button>}
        {detail?.scenario.status === 'published' && <button type="button" className="quiet" disabled={busy} onClick={() => void run(async () => {
          setDetail(await api<Detail>(`orgs/${org}/builder/scenarios/${detail.scenario.id}/archive`, { method: 'POST' }));
          return t('training.scenario.archived');
        })}>{t('training.builder.archive')}</button>}
      </div>
    </section>

    {detail && <section className="training-card" aria-labelledby="training-b-scenario-use">
      <h2 id="training-b-scenario-use">{t('training.scenario.practice')}</h2>
      <p>{detail.practice.sessions === 0 ? t('training.scenario.noPractice') : t('training.scenario.practised', { sessions: detail.practice.sessions, people: detail.practice.people })}
        {detail.practice.average !== null && ` ${t('training.scenario.average', { score: detail.practice.average })}`}</p>
      <p className="hint">{t('training.scenario.practicePrivacy')}</p>
    </section>}
  </div>;
}
