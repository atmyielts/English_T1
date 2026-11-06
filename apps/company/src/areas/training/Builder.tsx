// Course builder home (/w/:org/builder, HR): the company's own lessons, courses and
// role-plays, and the AI draft from a pasted document or the company glossary.
import React, { useState, type FormEvent } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { StatusBadge, type BuilderOverview, type LessonDetail } from './builderKit.tsx';
import { aiMessage, DIFFICULTY_CLASS, LevelBadge, Loading, readLocal, useDate, useLoad, useLocalized, writeLocal, type AiStatus } from './lib.tsx';

const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1'] as const;
const DOC_TYPES = ['policy', 'script', 'menu', 'product', 'other'] as const;

function AiDraft({ overview }: { overview: BuilderOverview }) {
  const t = useAppT(), problem = useErrorText();
  const { locale } = useI18n();
  const { org } = useWorkspace();
  const [mode, setMode] = useState<'text' | 'glossary'>('text');
  const [source, setSource] = useState(() => readLocal('training.builder.source', ''));
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>('policy');
  const [level, setLevel] = useState<string>('b1');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const saveSource = (value: string) => { setSource(value); writeLocal('training.builder.source', value || null); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setFailure('');
    try {
      const result = await api<{ status: AiStatus; partial?: boolean } & Partial<LessonDetail>>(`orgs/${org.id}/builder/draft`, {
        method: 'POST', timeoutMs: 120_000,
        body: { mode, source: mode === 'text' ? source : undefined, doc_type: docType, level, locale },
      });
      const message = aiMessage(result.status);
      if (message || !result.lesson) { setFailure(t(message ?? 'training.ai.unavailable')); return; }
      saveSource('');
      navigate(`/w/${org.id}/builder/lessons/${result.lesson.id}${result.partial ? '?partial=1' : ''}`);
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  return <section className="training-card" aria-labelledby="training-b-ai">
    <h2 id="training-b-ai">{t('training.builder.ai.title')}</h2>
    <p>{t('training.builder.ai.lead')}</p>
    <form onSubmit={submit} className="training-b-form">
      <fieldset className="training-b-inline">
        <legend>{t('training.builder.ai.from')}</legend>
        <label className="check"><input type="radio" name="training-b-mode" checked={mode === 'text'} onChange={() => setMode('text')}/>{t('training.builder.ai.fromText')}</label>
        <label className="check"><input type="radio" name="training-b-mode" checked={mode === 'glossary'} onChange={() => setMode('glossary')}/>{t('training.builder.ai.fromGlossary', { count: overview.glossary_terms })}</label>
      </fieldset>
      {mode === 'text' ? <>
        <label>{t('training.builder.ai.docType')}
          <select value={docType} onChange={(event) => setDocType(event.target.value as typeof docType)}>
            {DOC_TYPES.map((type) => <option key={type} value={type}>{t(`training.builder.ai.doc.${type}` as AppKey)}</option>)}
          </select>
        </label>
        <label>{t('training.builder.ai.source')}
          <textarea rows={8} maxLength={overview.max_source} value={source} onChange={(event) => saveSource(event.target.value)}/>
        </label>
        <p className="hint">{t('training.builder.ai.sourceHint', { count: source.length, max: overview.max_source })}</p>
      </> : overview.glossary_terms === 0 ? <p className="notice" role="note">{t('training.builder.ai.noTerms')} <Link to={`/w/${org.id}/glossary-admin`}>{t('training.nav.glossaryAdmin')}</Link></p>
        : <p className="hint">{t('training.builder.ai.glossaryHint')}</p>}
      <label>{t('training.builder.level')}
        <select value={level} onChange={(event) => setLevel(event.target.value)}>
          {LEVELS.map((value) => <option key={value} value={value}>{t(`level.${value}` as AppKey)}</option>)}
        </select>
      </label>
      {failure && <p className="error" role="alert">{failure}</p>}
      <div className="company-actions">
        <button disabled={busy || (mode === 'text' ? source.trim().length < 40 : overview.glossary_terms === 0)}>{busy ? t('training.builder.ai.working') : t('training.builder.ai.create')}</button>
      </div>
      <p className="hint">{t('training.builder.ai.safe')}</p>
    </form>
  </section>;
}

export function Builder() {
  const t = useAppT(), pick = useLocalized(), when = useDate(), problem = useErrorText();
  const { org } = useWorkspace();
  const { data, error, reload } = useLoad<BuilderOverview>(`orgs/${org.id}/builder`);
  const [lessonTitle, setLessonTitle] = useState(''), [courseTitle, setCourseTitle] = useState(''), [builtIn, setBuiltIn] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  if (!data) return <Loading error={error}/>;

  async function create(path: 'lessons' | 'courses', title: string) {
    setBusy(true); setFailure('');
    try {
      const result = await api<{ lesson?: { id: string }; course?: { id: string } }>(`orgs/${org.id}/builder/${path}`, { method: 'POST', body: { title } });
      navigate(`/w/${org.id}/builder/${path}/${result.lesson?.id ?? result.course?.id}`);
    } catch (cause) {
      setFailure(problem(cause));
      setBusy(false);
    }
  }
  async function copyFrom(path: string, body?: unknown) {
    setBusy(true); setFailure('');
    try {
      const { id } = await api<{ id: string }>(`orgs/${org.id}/builder/lessons/${path}`, { method: 'POST', body });
      navigate(`/w/${org.id}/builder/lessons/${id}`);
    } catch (cause) {
      setFailure(problem(cause));
      setBusy(false);
    }
  }
  async function remove(path: string, id: string, title: string) {
    if (!confirm(t('training.builder.deleteConfirm', { title }))) return;
    setFailure('');
    try {
      await api(`orgs/${org.id}/builder/${path}/${id}`, { method: 'DELETE' });
      await reload();
    } catch (cause) {
      setFailure(problem(cause));
    }
  }

  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.builder.title')}</h1>
      <p>{t('training.builder.lead')}</p>
    </header>
    {failure && <p className="error" role="alert">{failure}</p>}

    <AiDraft overview={data}/>

    <section className="training-card" aria-labelledby="training-b-lessons">
      <h2 id="training-b-lessons">{t('training.builder.lessons', { count: data.lessons.length })}</h2>
      <form className="training-b-add" onSubmit={(event) => { event.preventDefault(); void create('lessons', lessonTitle); }}>
        <label>{t('training.builder.newLesson')}<input lang="en" maxLength={200} value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)}/></label>
        <button disabled={busy || !lessonTitle.trim()}>{t('common.add')}</button>
      </form>
      <form className="training-b-add" onSubmit={(event) => { event.preventDefault(); void copyFrom('from-track', { lesson_code: builtIn }); }}>
        <label>{t('training.builder.fromBuiltIn')}
          <select value={builtIn} onChange={(event) => setBuiltIn(event.target.value)}>
            <option value="">{t('training.exercise.choose')}</option>
            {data.scenario_options.map((track) => <optgroup key={track.code} label={pick(track.title)}>
              {track.lessons.map((lesson) => <option key={lesson.code} value={lesson.code}>{pick(lesson.title)}</option>)}
            </optgroup>)}
          </select>
        </label>
        <button className="quiet" disabled={busy || !builtIn}>{t('training.builder.adapt')}</button>
      </form>
      {data.lessons.length === 0 ? <p>{t('training.builder.noLessons')}</p> : <ul className="training-list">
        {data.lessons.map((lesson) => <li key={lesson.id}>
          <div>
            <strong>{pick(lesson.title) || t('training.builder.untitled')}</strong>
            <span className="training-lesson-meta">
              <LevelBadge level={lesson.level}/>
              <StatusBadge status={lesson.status} hasChanges={lesson.has_changes}/>
              {lesson.needs_approval && <span className="company-badge warn">{t('training.builder.needsApproval')}</span>}
              {lesson.version > 0 && <span>{t('training.builder.version', { n: lesson.version })}</span>}
              <span>{when(lesson.updated_at)}</span>
            </span>
          </div>
          <span className="company-actions">
            <Link className="button-link quiet" to={`/w/${org.id}/builder/lessons/${lesson.id}`}>{t('common.edit')}<span className="visually-hidden"> {pick(lesson.title)}</span></Link>
            <button type="button" className="quiet" disabled={busy} onClick={() => void copyFrom(`${lesson.id}/duplicate`)}>{t('training.builder.copy')}<span className="visually-hidden"> {pick(lesson.title)}</span></button>
            <button type="button" className="quiet" onClick={() => void remove('lessons', lesson.id, pick(lesson.title))}>{lesson.version > 0 ? t('training.builder.archive') : t('common.delete')}<span className="visually-hidden"> {pick(lesson.title)}</span></button>
          </span>
        </li>)}
      </ul>}
    </section>

    <section className="training-card" aria-labelledby="training-b-courses">
      <h2 id="training-b-courses">{t('training.builder.courses', { count: data.courses.length })}</h2>
      <form className="training-b-add" onSubmit={(event) => { event.preventDefault(); void create('courses', courseTitle); }}>
        <label>{t('training.builder.newCourse')}<input lang="en" maxLength={200} value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)}/></label>
        <button disabled={busy || !courseTitle.trim()}>{t('common.add')}</button>
      </form>
      {data.courses.length === 0 ? <p>{t('training.builder.noCourses')}</p> : <ul className="training-list">
        {data.courses.map((course) => <li key={course.id}>
          <div>
            <strong>{pick(course.title) || t('training.builder.untitled')}</strong>
            <span className="training-lesson-meta">
              <StatusBadge status={course.status} hasChanges={course.has_changes}/>
              <span>{t('training.plan.lessons', { count: course.lesson_ids.length })}</span>
              {course.version > 0 && <span>{t('training.builder.version', { n: course.version })}</span>}
            </span>
          </div>
          <span className="company-actions">
            <Link className="button-link quiet" to={`/w/${org.id}/builder/courses/${course.id}`}>{t('common.edit')}<span className="visually-hidden"> {pick(course.title)}</span></Link>
            <button type="button" className="quiet" onClick={() => void remove('courses', course.id, pick(course.title))}>{course.version > 0 ? t('training.builder.archive') : t('common.delete')}<span className="visually-hidden"> {pick(course.title)}</span></button>
          </span>
        </li>)}
      </ul>}
    </section>

    <section className="training-card" aria-labelledby="training-b-scenarios">
      <h2 id="training-b-scenarios">{t('training.builder.scenarios', { count: data.scenarios.length })}</h2>
      <p>{t('training.builder.scenariosLead')}</p>
      <p><Link className="button-link" to={`/w/${org.id}/builder/scenarios/new`}>{t('training.builder.newScenario')}</Link></p>
      {data.scenarios.length === 0 ? <p>{t('training.builder.noScenarios')}</p> : <ul className="training-list">
        {data.scenarios.map((scenario) => <li key={scenario.id}>
          <div>
            <strong>{pick(scenario.title) || t('training.builder.untitled')}</strong>
            <span className="training-lesson-meta">
              <StatusBadge status={scenario.status}/>
              <span className={`company-badge ${DIFFICULTY_CLASS[scenario.difficulty]}`}>{t(`training.difficulty.${scenario.difficulty}` as AppKey)}</span>
            </span>
          </div>
          <span className="company-actions">
            <Link className="button-link quiet" to={`/w/${org.id}/builder/scenarios/${scenario.id}`}>{t('common.edit')}<span className="visually-hidden"> {pick(scenario.title)}</span></Link>
            <button type="button" className="quiet" onClick={() => void remove('scenarios', scenario.id, pick(scenario.title))}>{t('common.delete')}<span className="visually-hidden"> {pick(scenario.title)}</span></button>
          </span>
        </li>)}
      </ul>}
    </section>
  </div>;
}
