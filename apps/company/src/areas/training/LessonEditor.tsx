// Lesson editor (/w/:org/builder/lessons/:id, HR): goal, phrases, words, dialogue,
// exercises and mission, saved as a draft. Learners keep the published version until
// HR publishes again. An AI draft needs a person's approval before it can go out.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { emptyLocalized, LocalizedField, ProblemList, problemsOf, StatusBadge, type BuilderOverview, type ExerciseDraft, type LessonDetail, type LessonDraft, type MissionDraft, type Problem } from './builderKit.tsx';
import { Loading, useDate, useLoad, useLocalized } from './lib.tsx';

const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1'] as const;
const KINDS = ['choice', 'gap', 'order', 'match'] as const;

function freshId(exercises: ExerciseDraft[]) {
  let next = exercises.length + 1;
  while (exercises.some((exercise) => exercise.id === `e${next}`)) next++;
  return `e${next}`;
}

function blankExercise(kind: ExerciseDraft['kind'], id: string): ExerciseDraft {
  switch (kind) {
    case 'choice': return { id, kind, items: [{ q: '', options: ['', ''], answer: 0 }] };
    case 'gap': return { id, kind, items: [{ text: '', answers: [''] }] };
    case 'order': return { id, kind, lines: ['', ''] };
    case 'match': return { id, kind, pairs: [['', ''], ['', '']] };
  }
}

/** Blank rows left while typing do not reach the server. */
function cleaned(draft: LessonDraft): LessonDraft {
  const has = (value: string) => value.trim().length > 0;
  return {
    ...draft,
    phrases: draft.phrases.filter((row) => has(row.en) || has(row.ru) || has(row.uz)),
    words: draft.words.filter((row) => has(row.en) || has(row.ru) || has(row.uz)),
    dialogue: { ...draft.dialogue, lines: draft.dialogue.lines.filter((line) => has(line.speaker) || has(line.text)) },
    exercises: draft.exercises.map((exercise) => {
      switch (exercise.kind) {
        case 'gap': return { ...exercise, items: exercise.items.map((item) => ({ ...item, answers: item.answers.map((answer) => answer.trim()).filter(Boolean) })) };
        case 'order': return { ...exercise, lines: exercise.lines.filter(has) };
        default: return exercise;
      }
    }),
  };
}

function ExerciseEditor({ exercise, onChange }: { exercise: ExerciseDraft; onChange: (exercise: ExerciseDraft) => void }) {
  const t = useAppT();
  switch (exercise.kind) {
    case 'choice': {
      const setItem = (index: number, item: (typeof exercise.items)[number]) => onChange({ ...exercise, items: exercise.items.map((entry, position) => position === index ? item : entry) });
      return <>
        {exercise.items.map((item, index) => <fieldset key={index} className="training-b-row">
          <legend>{t('training.builder.ex.question', { n: index + 1 })}</legend>
          <label>{t('training.builder.ex.questionText')}<input lang="en" maxLength={400} value={item.q} onChange={(event) => setItem(index, { ...item, q: event.target.value })}/></label>
          {item.options.map((option, choice) => <div key={choice} className="training-b-option">
            <label className="check"><input type="radio" name={`${exercise.id}-${index}`} checked={item.answer === choice} onChange={() => setItem(index, { ...item, answer: choice })}/>{t('training.builder.ex.correct')}</label>
            <label className="training-b-grow"><span className="visually-hidden">{t('training.builder.ex.option', { n: choice + 1 })}</span>
              <input lang="en" maxLength={300} aria-label={t('training.builder.ex.option', { n: choice + 1 })} value={option} onChange={(event) => setItem(index, { ...item, options: item.options.map((entry, position) => position === choice ? event.target.value : entry) })}/>
            </label>
            {item.options.length > 2 && <button type="button" className="quiet" aria-label={t('training.builder.ex.removeOption', { n: choice + 1 })} onClick={() => setItem(index, { ...item, options: item.options.filter((_, position) => position !== choice), answer: item.answer >= choice && item.answer > 0 ? item.answer - 1 : item.answer })}>×</button>}
          </div>)}
          <div className="company-actions">
            {item.options.length < 6 && <button type="button" className="quiet" onClick={() => setItem(index, { ...item, options: [...item.options, ''] })}>{t('training.builder.ex.addOption')}</button>}
            {exercise.items.length > 1 && <button type="button" className="quiet" onClick={() => onChange({ ...exercise, items: exercise.items.filter((_, position) => position !== index) })}>{t('training.builder.ex.removeItem')}</button>}
          </div>
        </fieldset>)}
        {exercise.items.length < 12 && <button type="button" className="quiet" onClick={() => onChange({ ...exercise, items: [...exercise.items, { q: '', options: ['', ''], answer: 0 }] })}>{t('training.builder.ex.addQuestion')}</button>}
      </>;
    }
    case 'gap': {
      const setItem = (index: number, item: (typeof exercise.items)[number]) => onChange({ ...exercise, items: exercise.items.map((entry, position) => position === index ? item : entry) });
      return <>
        <p className="hint">{t('training.builder.ex.gapHint')}</p>
        {exercise.items.map((item, index) => <fieldset key={index} className="training-b-row">
          <legend>{t('training.builder.ex.sentence', { n: index + 1 })}</legend>
          <label>{t('training.builder.ex.sentenceText')}<input lang="en" maxLength={400} value={item.text} onChange={(event) => setItem(index, { ...item, text: event.target.value })}/></label>
          <label>{t('training.builder.ex.answers')}<input lang="en" maxLength={400} value={item.answers.join(' / ')} onChange={(event) => setItem(index, { ...item, answers: event.target.value.split('/').map((answer) => answer.trimStart()) })}/></label>
          {exercise.items.length > 1 && <button type="button" className="quiet" onClick={() => onChange({ ...exercise, items: exercise.items.filter((_, position) => position !== index) })}>{t('training.builder.ex.removeItem')}</button>}
        </fieldset>)}
        {exercise.items.length < 12 && <button type="button" className="quiet" onClick={() => onChange({ ...exercise, items: [...exercise.items, { text: '', answers: [''] }] })}>{t('training.builder.ex.addSentence')}</button>}
      </>;
    }
    case 'order':
      return <label>{t('training.builder.ex.lines')}
        <textarea rows={Math.max(4, exercise.lines.length + 1)} lang="en" value={exercise.lines.join('\n')} onChange={(event) => onChange({ ...exercise, lines: event.target.value.split('\n').slice(0, 12) })}/>
        <span className="hint">{t('training.builder.ex.linesHint')}</span>
      </label>;
    case 'match':
      return <>
        {exercise.pairs.map((pair, index) => <div key={index} className="training-b-pair">
          <label><span>{t('training.builder.ex.left', { n: index + 1 })}</span><input lang="en" maxLength={300} value={pair[0]} onChange={(event) => onChange({ ...exercise, pairs: exercise.pairs.map((entry, position) => position === index ? [event.target.value, entry[1]] : entry) })}/></label>
          <label><span>{t('training.builder.ex.right', { n: index + 1 })}</span><input lang="en" maxLength={300} value={pair[1]} onChange={(event) => onChange({ ...exercise, pairs: exercise.pairs.map((entry, position) => position === index ? [entry[0], event.target.value] : entry) })}/></label>
          {exercise.pairs.length > 2 && <button type="button" className="quiet" aria-label={t('training.builder.ex.removePair', { n: index + 1 })} onClick={() => onChange({ ...exercise, pairs: exercise.pairs.filter((_, position) => position !== index) })}>×</button>}
        </div>)}
        {exercise.pairs.length < 12 && <button type="button" className="quiet" onClick={() => onChange({ ...exercise, pairs: [...exercise.pairs, ['', '']] })}>{t('training.builder.ex.addPair')}</button>}
      </>;
  }
}

function MissionEditor({ mission, options, onChange }: { mission: MissionDraft | null; options: BuilderOverview; onChange: (mission: MissionDraft | null) => void }) {
  const t = useAppT(), pick = useLocalized();
  const brief = mission?.brief ?? emptyLocalized();
  return <>
    <label>{t('training.builder.mission.kind')}
      <select value={mission?.kind ?? ''} onChange={(event) => {
        const kind = event.target.value;
        onChange(kind === 'roleplay' ? { kind, scenario: '', brief } : kind === 'writing' ? { kind, template: null, brief } : kind === 'task' ? { kind, brief } : null);
      }}>
        <option value="">{t('training.builder.mission.none')}</option>
        <option value="task">{t('training.mission.task')}</option>
        <option value="roleplay">{t('training.mission.roleplay')}</option>
        <option value="writing">{t('training.mission.writing')}</option>
      </select>
    </label>
    {mission?.kind === 'roleplay' && <label>{t('training.builder.mission.scenario')}
      <select value={mission.scenario} onChange={(event) => onChange({ ...mission, scenario: event.target.value })}>
        <option value="">{t('training.exercise.choose')}</option>
        {options.scenarios.some((entry) => entry.status === 'published') && <optgroup label={t('training.builder.ours')}>
          {options.scenarios.filter((entry) => entry.status === 'published').map((entry) => <option key={entry.id} value={`cs-${entry.id}`}>{pick(entry.title)}</option>)}
        </optgroup>}
        {options.scenario_options.map((track) => <optgroup key={track.code} label={pick(track.title)}>
          {track.scenarios.map((entry) => <option key={entry.code} value={entry.code}>{pick(entry.title)}</option>)}
        </optgroup>)}
      </select>
    </label>}
    {mission?.kind === 'writing' && <label>{t('training.builder.mission.template')}
      <select value={mission.template ?? ''} onChange={(event) => onChange({ ...mission, template: event.target.value || null })}>
        <option value="">{t('training.writing.free')}</option>
        {options.scenario_options.map((track) => <optgroup key={track.code} label={pick(track.title)}>
          {track.templates.map((entry) => <option key={entry.code} value={entry.code}>{pick(entry.title)}</option>)}
        </optgroup>)}
      </select>
    </label>}
    {mission && <LocalizedField label={t('training.builder.mission.brief')} rows={2} max={600} value={mission.brief} onChange={(value) => onChange({ ...mission, brief: value })}/>}
  </>;
}

interface LessonResults { started: number; completed: number; average_score: number | null; average_attempts: number | null; exercises: { id: string; n: number; kind: ExerciseDraft['kind']; prompt: string | null; percent: number | null }[] }

/** How the published lesson is going, among people who share their progress. */
function Results({ org, id }: { org: string; id: string }) {
  const t = useAppT();
  const { data, error } = useLoad<LessonResults>(`orgs/${org}/builder/lessons/${id}/results`);
  return <section className="training-card" aria-labelledby="training-b-results">
    <h2 id="training-b-results">{t('training.results.title')}</h2>
    {!data ? <Loading error={error}/> : data.started === 0 ? <p>{t('training.results.none')}</p> : <>
      <div className="company-grid">
        <div className="company-stat"><strong>{data.completed}/{data.started}</strong><span>{t('training.results.finished')}</span></div>
        <div className="company-stat"><strong>{data.average_score ?? '—'}</strong><span>{t('training.results.averageScore')}</span></div>
        <div className="company-stat"><strong>{data.average_attempts ?? '—'}</strong><span>{t('training.results.attempts')}</span></div>
      </div>
      <h3>{t('training.results.hardest')}</h3>
      <ul className="training-b-bars">
        {data.exercises.map((exercise) => <li key={exercise.id}>
          <span>{t('training.results.exercise', { n: exercise.n, kind: t(`training.exercise.${exercise.kind}` as AppKey) })}</span>
          <span className="training-b-bar" aria-hidden="true"><span style={{ width: `${exercise.percent ?? 0}%` }}/></span>
          <strong>{exercise.percent === null ? '—' : `${exercise.percent}%`}</strong>
        </li>)}
      </ul>
    </>}
    <p className="hint">{t('training.results.privacy')}</p>
  </section>;
}

function Translations<T extends { en: string; ru: string; uz: string; note?: string }>({ rows, onChange, blank, noun, withNote }: { rows: T[]; onChange: (rows: T[]) => void; blank: T; noun: 'phrase' | 'word'; withNote?: boolean }) {
  const t = useAppT();
  const set = (index: number, row: T) => onChange(rows.map((entry, position) => position === index ? row : entry));
  return <>
    <ul className="training-b-rows">
      {rows.map((row, index) => <li key={index}>
        <label><span>{t('training.builder.lang.en')}</span><input lang="en" maxLength={300} value={row.en} onChange={(event) => set(index, { ...row, en: event.target.value })}/></label>
        <label><span>{t('training.builder.lang.ru')}</span><input lang="ru" maxLength={300} value={row.ru} onChange={(event) => set(index, { ...row, ru: event.target.value })}/></label>
        <label><span>{t('training.builder.lang.uz')}</span><input lang="uz" maxLength={300} value={row.uz} onChange={(event) => set(index, { ...row, uz: event.target.value })}/></label>
        {withNote && <label><span>{t('training.builder.note')}</span><input lang="en" maxLength={120} value={row.note ?? ''} onChange={(event) => set(index, { ...row, note: event.target.value })}/></label>}
        <button type="button" className="quiet" aria-label={t(`training.builder.remove.${noun}` as AppKey, { n: index + 1 })} onClick={() => onChange(rows.filter((_, position) => position !== index))}>×</button>
      </li>)}
    </ul>
    {rows.length < 40 && <button type="button" className="quiet" onClick={() => onChange([...rows, { ...blank }])}>{t(`training.builder.add.${noun}` as AppKey)}</button>}
  </>;
}

export function LessonEditor({ id }: { id: string }) {
  const { org } = useWorkspace();
  const { data, error, set } = useLoad<LessonDetail>(`orgs/${org.id}/builder/lessons/${id}`);
  const options = useLoad<BuilderOverview>(`orgs/${org.id}/builder`);
  if (!data || !options.data) return <Loading error={error || options.error}/>;
  return <Editor key={id} org={org.id} detail={data} options={options.data} onDetail={set}/>;
}

function Editor({ org, detail, options, onDetail }: { org: string; detail: LessonDetail; options: BuilderOverview; onDetail: (detail: LessonDetail) => void }) {
  const t = useAppT(), pick = useLocalized(), problem = useErrorText(), when = useDate();
  const { query } = useLocation();
  const [draft, setDraft] = useState<LessonDraft>(detail.lesson.draft);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState<Problem[] | null>(null);
  const [approved, setApproved] = useState(false);
  const { lesson } = detail;
  const change = (next: LessonDraft) => { setDraft(next); setDirty(true); setNotice(''); };
  const needsApproval = lesson.needs_approval;

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(): Promise<LessonDetail | null> {
    const next = await api<LessonDetail>(`orgs/${org}/builder/lessons/${lesson.id}`, { method: 'PUT', body: { revision: lesson.revision, draft: cleaned(draft) } });
    onDetail(next);
    setDraft(next.lesson.draft);
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
  const publish = () => run(async () => {
    const saved = dirty ? await save() : detail;
    const next = await api<LessonDetail>(`orgs/${org}/builder/lessons/${lesson.id}/publish`, { method: 'POST', body: { revision: saved!.lesson.revision, approved } });
    onDetail(next);
    setDraft(next.lesson.draft);
    return t('training.builder.published', { n: next.lesson.version });
  });
  const translate = () => run(async () => {
    const saved = dirty ? await save() : detail;
    const result = await api<{ status: 'ok' | 'ai_limit' | 'ai_unavailable'; filled?: number; remaining?: number; revision?: number; draft?: LessonDraft }>(`orgs/${org}/builder/lessons/${lesson.id}/translate`, { method: 'POST', body: { revision: saved!.lesson.revision }, timeoutMs: 60_000 });
    if (result.status !== 'ok' || !result.draft) throw new Error(t(result.status === 'ai_limit' ? 'training.ai.limit' : 'training.ai.unavailable'));
    onDetail({ ...detail, lesson: { ...saved!.lesson, draft: result.draft, revision: result.revision!, has_changes: lesson.version > 0 } });
    setDraft(result.draft);
    setDirty(false);
    return (result.remaining ?? 0) > 0 ? t('training.builder.translatedMore', { count: result.filled ?? 0, left: result.remaining ?? 0 }) : t('training.builder.translated', { count: result.filled ?? 0 });
  });
  const restore = (version: number) => {
    if (dirty && !confirm(t('training.builder.restoreConfirm'))) return;
    void run(async () => {
      const next = await api<LessonDetail>(`orgs/${org}/builder/lessons/${lesson.id}/restore`, { method: 'POST', body: { version } });
      onDetail(next);
      setDraft(next.lesson.draft);
      setDirty(false);
      return t('training.builder.restored', { n: version });
    });
  };

  const setExercise = (index: number, exercise: ExerciseDraft) => change({ ...draft, exercises: draft.exercises.map((entry, position) => position === index ? exercise : entry) });
  const moveExercise = (from: number, to: number) => {
    if (to < 0 || to >= draft.exercises.length) return;
    const next = [...draft.exercises];
    [next[from], next[to]] = [next[to], next[from]];
    change({ ...draft, exercises: next });
  };

  return <div className="training-page training-b-editor">
    <p className="training-crumbs"><Link to={`/w/${org}/builder`}>{t('training.nav.builder')}</Link></p>
    <header className="training-head">
      <h1>{pick(draft.title) || t('training.builder.untitled')}</h1>
      <p className="training-lesson-meta">
        <StatusBadge status={lesson.status} hasChanges={lesson.has_changes && !dirty}/>
        {lesson.version > 0 && <span className="company-badge">{t('training.builder.version', { n: lesson.version })}</span>}
        {lesson.source === 'ai' && <span className="company-badge">{t('training.builder.aiDraft')}</span>}
        {dirty && <span className="company-badge warn">{t('training.builder.unsaved')}</span>}
      </p>
    </header>
    {query.get('partial') === '1' && <p className="notice" role="status">{t('training.builder.ai.partial')}</p>}
    {needsApproval && <p className="notice" role="note">{t('training.builder.ai.review')}</p>}

    <section className="training-card" aria-labelledby="training-b-basics">
      <h2 id="training-b-basics">{t('training.builder.basics')}</h2>
      <LocalizedField label={t('training.builder.titleField')} max={200} value={draft.title} onChange={(title) => change({ ...draft, title })}/>
      <LocalizedField label={t('training.builder.goal')} hint={t('training.builder.goalHint')} rows={2} max={500} value={draft.goal} onChange={(goal) => change({ ...draft, goal })}/>
      <label>{t('training.builder.level')}
        <select value={draft.level} onChange={(event) => change({ ...draft, level: event.target.value })}>
          {LEVELS.map((value) => <option key={value} value={value}>{t(`level.${value}` as AppKey)}</option>)}
        </select>
      </label>
      <div className="company-actions">
        <button type="button" className="quiet" disabled={busy} onClick={() => void translate()}>{t('training.builder.translate')}</button>
        <span className="hint">{t('training.builder.translateHint')}</span>
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {failure && <p className="error" role="alert">{failure}</p>}
    </section>

    <section className="training-card" aria-labelledby="training-b-phrases">
      <h2 id="training-b-phrases">{t('training.step.phrases')}</h2>
      <Translations noun="phrase" rows={draft.phrases} blank={{ en: '', ru: '', uz: '' }} onChange={(phrases) => change({ ...draft, phrases })}/>
    </section>

    <section className="training-card" aria-labelledby="training-b-words">
      <h2 id="training-b-words">{t('training.step.words')}</h2>
      <Translations noun="word" withNote rows={draft.words} blank={{ en: '', ru: '', uz: '' }} onChange={(words) => change({ ...draft, words })}/>
    </section>

    <section className="training-card" aria-labelledby="training-b-dialogue">
      <h2 id="training-b-dialogue">{t('training.step.dialogue')}</h2>
      <LocalizedField label={t('training.builder.setting')} rows={2} max={500} value={draft.dialogue.setting} onChange={(setting) => change({ ...draft, dialogue: { ...draft.dialogue, setting } })}/>
      <ul className="training-b-rows is-dialogue">
        {draft.dialogue.lines.map((line, index) => <li key={index}>
          <label><span>{t('training.builder.speaker')}</span><input lang="en" maxLength={60} value={line.speaker} onChange={(event) => change({ ...draft, dialogue: { ...draft.dialogue, lines: draft.dialogue.lines.map((entry, position) => position === index ? { ...entry, speaker: event.target.value } : entry) } })}/></label>
          <label><span>{t('training.builder.line')}</span><input lang="en" maxLength={500} value={line.text} onChange={(event) => change({ ...draft, dialogue: { ...draft.dialogue, lines: draft.dialogue.lines.map((entry, position) => position === index ? { ...entry, text: event.target.value } : entry) } })}/></label>
          <button type="button" className="quiet" aria-label={t('training.builder.remove.line', { n: index + 1 })} onClick={() => change({ ...draft, dialogue: { ...draft.dialogue, lines: draft.dialogue.lines.filter((_, position) => position !== index) } })}>×</button>
        </li>)}
      </ul>
      {draft.dialogue.lines.length < 40 && <button type="button" className="quiet" onClick={() => change({ ...draft, dialogue: { ...draft.dialogue, lines: [...draft.dialogue.lines, { speaker: '', text: '' }] } })}>{t('training.builder.add.line')}</button>}
    </section>

    <section className="training-card" aria-labelledby="training-b-exercises">
      <h2 id="training-b-exercises">{t('training.step.exercises')}</h2>
      {draft.exercises.map((exercise, index) => <fieldset key={exercise.id} className="training-exercise training-b-exercise">
        <legend>{index + 1}. {t(`training.exercise.${exercise.kind}` as AppKey)}</legend>
        <label><span>{t('training.builder.ex.prompt')} <span className="hint">{t('common.optional')}</span></span><input lang="en" maxLength={300} value={exercise.prompt ?? ''} onChange={(event) => setExercise(index, { ...exercise, prompt: event.target.value })}/></label>
        <ExerciseEditor exercise={exercise} onChange={(value) => setExercise(index, value)}/>
        <div className="company-actions">
          <button type="button" className="quiet" disabled={index === 0} aria-label={t('training.builder.ex.moveUp', { n: index + 1 })} onClick={() => moveExercise(index, index - 1)}>↑</button>
          <button type="button" className="quiet" disabled={index === draft.exercises.length - 1} aria-label={t('training.builder.ex.moveDown', { n: index + 1 })} onClick={() => moveExercise(index, index + 1)}>↓</button>
          <button type="button" className="quiet" onClick={() => { if (confirm(t('training.builder.ex.removeConfirm'))) change({ ...draft, exercises: draft.exercises.filter((_, position) => position !== index) }); }}>{t('training.builder.ex.remove')}</button>
        </div>
      </fieldset>)}
      {draft.exercises.length === 0 && <p>{t('training.builder.ex.none')}</p>}
      {draft.exercises.length < 12 && <div className="company-actions">
        {KINDS.map((kind) => <button key={kind} type="button" className="quiet" onClick={() => change({ ...draft, exercises: [...draft.exercises, blankExercise(kind, freshId(draft.exercises))] })}>+ {t(`training.exercise.${kind}` as AppKey)}</button>)}
      </div>}
    </section>

    <section className="training-card" aria-labelledby="training-b-mission">
      <h2 id="training-b-mission">{t('training.step.mission')}</h2>
      <p className="hint">{t('training.builder.mission.lead')}</p>
      <MissionEditor mission={draft.mission} options={options} onChange={(mission) => change({ ...draft, mission })}/>
    </section>

    <section className="training-card training-b-publish" aria-labelledby="training-b-publish">
      <h2 id="training-b-publish">{t('training.builder.publishTitle')}</h2>
      <p>{t('training.builder.publishLead')}</p>
      {blocked ? <ProblemList problems={blocked}/> : !dirty && <ProblemList problems={detail.problems}/>}
      {needsApproval && <label className="check training-b-approve"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)}/>{t('training.builder.ai.approve')}</label>}
      {failure && <p className="error" role="alert">{failure}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="company-actions">
        <button type="button" className="quiet" disabled={busy || !dirty} onClick={() => void run(async () => { await save(); return t('common.saved'); })}>{t('training.builder.saveDraft')}</button>
        <button type="button" disabled={busy || (needsApproval && !approved)} onClick={() => void publish()}>{lesson.version > 0 ? t('training.builder.publishAgain') : t('training.builder.publish')}</button>
        {dirty ? <span className="hint">{t('training.builder.previewAfterSave')}</span> : <Link className="button-link quiet" to={`/w/${org}/builder/lessons/${lesson.id}/preview`}>{t('training.builder.preview')}</Link>}
      </div>
      {detail.used_in.length > 0 ? <p className="hint">{t('training.builder.usedIn', { courses: detail.used_in.map((course) => pick(course.title)).join(', ') })}</p> : lesson.version > 0 && <p className="hint">{t('training.builder.notInCourse')}</p>}
    </section>

    {lesson.version > 0 && <Results org={org} id={lesson.id}/>}

    {detail.versions.length > 0 && <section className="training-card" aria-labelledby="training-b-versions">
      <h2 id="training-b-versions">{t('training.builder.versions')}</h2>
      <p className="hint">{t('training.builder.versionsLead')}</p>
      <ul className="training-list">
        {detail.versions.map((version) => <li key={version.version}>
          <div><strong>{t('training.builder.version', { n: version.version })}</strong><span>{when(version.created_at)}</span></div>
          <button type="button" className="quiet" disabled={busy} onClick={() => restore(version.version)}>{t('training.builder.restore')}<span className="visually-hidden"> {version.version}</span></button>
        </li>)}
      </ul>
    </section>}
  </div>;
}
