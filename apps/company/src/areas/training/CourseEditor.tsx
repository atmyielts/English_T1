// Course editor (/w/:org/builder/courses/:id, HR): title, summary, which job role it
// is for, and the ordered lessons. Learners see the published snapshot until HR
// publishes again. From here HR goes on to assign it like any track.
import React, { useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { LocalizedField, ProblemList, problemsOf, StatusBadge, type BuilderOverview, type CourseDetail, type Localized, type Problem } from './builderKit.tsx';
import { LevelBadge, Loading, useLoad, useLocalized } from './lib.tsx';

export function CourseEditor({ id }: { id: string }) {
  const { org } = useWorkspace();
  const { data, error, set } = useLoad<CourseDetail>(`orgs/${org.id}/builder/courses/${id}`);
  const options = useLoad<BuilderOverview>(`orgs/${org.id}/builder`);
  if (!data || !options.data) return <Loading error={error || options.error}/>;
  return <Editor key={id} org={org.id} detail={data} options={options.data} onDetail={set}/>;
}

interface CourseResults { people_started: number; people_finished: number; lessons: { id: string; title: Localized | null; started: number; completed: number; average_score: number | null }[] }

/** The course's funnel, among people who share their progress. */
function Results({ org, id }: { org: string; id: string }) {
  const t = useAppT(), pick = useLocalized();
  const { data, error } = useLoad<CourseResults>(`orgs/${org}/builder/courses/${id}/results`);
  return <section className="training-card" aria-labelledby="training-b-course-results">
    <h2 id="training-b-course-results">{t('training.results.title')}</h2>
    {!data ? <Loading error={error}/> : data.people_started === 0 ? <p>{t('training.results.none')}</p> : <>
      <p>{t('training.results.courseLine', { started: data.people_started, finished: data.people_finished })}</p>
      <ul className="training-b-bars">
        {data.lessons.map((lesson) => <li key={lesson.id}>
          <span>{lesson.title ? pick(lesson.title) : '—'}</span>
          <span className="training-b-bar" aria-hidden="true"><span style={{ width: `${data.people_started ? Math.round(lesson.completed / data.people_started * 100) : 0}%` }}/></span>
          <strong>{lesson.completed}/{data.people_started}{lesson.average_score !== null ? ` · ${lesson.average_score}` : ''}</strong>
        </li>)}
      </ul>
    </>}
    <p className="hint">{t('training.results.privacy')}</p>
  </section>;
}

function Editor({ org, detail, options, onDetail }: { org: string; detail: CourseDetail; options: BuilderOverview; onDetail: (detail: CourseDetail) => void }) {
  const t = useAppT(), pick = useLocalized(), problem = useErrorText();
  const { course } = detail;
  const [title, setTitle] = useState(course.title), [summary, setSummary] = useState(course.summary);
  const [jobRole, setJobRole] = useState(course.job_role ?? '');
  const [ids, setIds] = useState(course.lesson_ids);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState<Problem[] | null>(null);
  const [pick_, setPick] = useState('');
  const touched = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setDirty(true); setNotice(''); };
  const lessonOf = (lessonId: string) => options.lessons.find((lesson) => lesson.id === lessonId);
  const available = options.lessons.filter((lesson) => !ids.includes(lesson.id) && lesson.status !== 'archived');
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    touched(setIds)(next);
  };

  async function save(): Promise<CourseDetail> {
    const next = await api<CourseDetail>(`orgs/${org}/builder/courses/${course.id}`, { method: 'PUT', body: { revision: course.revision, title, summary, job_role: jobRole || null, lesson_ids: ids } });
    onDetail(next);
    setDirty(false);
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
      <h1>{pick(title) || t('training.builder.untitled')}</h1>
      <p className="training-lesson-meta">
        <StatusBadge status={course.status} hasChanges={course.has_changes && !dirty}/>
        {course.version > 0 && <span className="company-badge">{t('training.builder.version', { n: course.version })}</span>}
        {dirty && <span className="company-badge warn">{t('training.builder.unsaved')}</span>}
      </p>
    </header>

    <section className="training-card" aria-labelledby="training-b-course-basics">
      <h2 id="training-b-course-basics">{t('training.builder.basics')}</h2>
      <LocalizedField label={t('training.builder.titleField')} max={200} value={title} onChange={touched(setTitle)}/>
      <LocalizedField label={t('training.builder.summary')} rows={2} max={800} value={summary} onChange={touched(setSummary)}/>
      <label>{t('training.builder.courseFor')}
        <select value={jobRole} onChange={(event) => touched(setJobRole)(event.target.value)}>
          <option value="">{t('training.builder.courseForAll')}</option>
          {options.job_roles.map((role) => <option key={role.code} value={role.code}>{pick(role.title)}</option>)}
        </select>
        <span className="hint">{t('training.builder.courseForHint')}</span>
      </label>
    </section>

    <section className="training-card" aria-labelledby="training-b-course-lessons">
      <h2 id="training-b-course-lessons">{t('training.builder.courseLessons', { count: ids.length })}</h2>
      {ids.length === 0 ? <p>{t('training.builder.courseEmpty')}</p> : <ol className="training-b-order">
        {ids.map((lessonId, index) => {
          const lesson = lessonOf(lessonId);
          const name = lesson ? pick(lesson.title) || t('training.builder.untitled') : lessonId;
          return <li key={lessonId}>
            <span className="training-b-grow">
              <strong>{name}</strong>
              {lesson && <span className="training-lesson-meta"><LevelBadge level={lesson.level}/><StatusBadge status={lesson.status} hasChanges={lesson.has_changes}/></span>}
            </span>
            <span className="training-order-buttons">
              <button type="button" className="quiet" disabled={index === 0} aria-label={t('training.exercise.up', { line: name })} onClick={() => move(index, index - 1)}>↑</button>
              <button type="button" className="quiet" disabled={index === ids.length - 1} aria-label={t('training.exercise.down', { line: name })} onClick={() => move(index, index + 1)}>↓</button>
              <button type="button" className="quiet" aria-label={t('training.builder.removeFromCourse', { title: name })} onClick={() => touched(setIds)(ids.filter((entry) => entry !== lessonId))}>×</button>
            </span>
          </li>;
        })}
      </ol>}
      {available.length > 0 ? <form className="training-b-add" onSubmit={(event) => { event.preventDefault(); if (pick_) { touched(setIds)([...ids, pick_]); setPick(''); } }}>
        <label>{t('training.builder.addLesson')}
          <select value={pick_} onChange={(event) => setPick(event.target.value)}>
            <option value="">{t('training.exercise.choose')}</option>
            {available.map((lesson) => <option key={lesson.id} value={lesson.id}>{pick(lesson.title) || t('training.builder.untitled')}{lesson.status === 'draft' ? ` · ${t('training.builder.status.draft')}` : ''}</option>)}
          </select>
        </label>
        <button className="quiet" disabled={!pick_}>{t('common.add')}</button>
      </form> : <p className="hint">{t('training.builder.noMoreLessons')} <Link to={`/w/${org}/builder`}>{t('training.nav.builder')}</Link></p>}
    </section>

    <section className="training-card training-b-publish" aria-labelledby="training-b-course-publish">
      <h2 id="training-b-course-publish">{t('training.builder.publishTitle')}</h2>
      <p>{t('training.builder.coursePublishLead')}</p>
      {blocked ? <ProblemList problems={blocked}/> : !dirty && <ProblemList problems={detail.problems}/>}
      {failure && <p className="error" role="alert">{failure}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="company-actions">
        <button type="button" className="quiet" disabled={busy || !dirty} onClick={() => void run(async () => { await save(); return t('common.saved'); })}>{t('training.builder.saveDraft')}</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => {
          const saved = dirty ? await save() : detail;
          const next = await api<CourseDetail>(`orgs/${org}/builder/courses/${course.id}/publish`, { method: 'POST', body: { revision: saved.course.revision } });
          onDetail(next);
          return t('training.builder.published', { n: next.course.version });
        })}>{course.version > 0 ? t('training.builder.publishAgain') : t('training.builder.publish')}</button>
        {course.status === 'published' && <Link className="button-link quiet" to={`/w/${org}/training`}>{t('training.builder.assignCourse')}</Link>}
      </div>
    </section>

    {course.version > 0 && <Results org={org} id={course.id}/>}
  </div>;
}
