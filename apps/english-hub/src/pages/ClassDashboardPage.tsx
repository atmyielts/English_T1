import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import {
  archiveClass,
  cancelAssignment,
  createAssignment,
  dateAfter,
  getClassDashboard,
  getClassDigest,
  newJoinCode,
  removeStudent,
  rosterCsv,
  searchClassContent,
  updateClass,
  type AssignmentKind,
  type ClassDashboard,
  type ClassLocale,
  type ContentResult,
  type NewAssignment,
  type PlanTier,
  type RosterEntry,
  type TeacherAssignment,
} from '../lib/classes';
import { CEFR_LEVELS, SKILLS, type CefrLevel, type SkillKey } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, ProgressBar, Segmented, SkillDot, Stat, Tag } from '../ui/kit';
import '../classes.css';

type Tab = 'students' | 'assignments' | 'digest' | 'settings';
const TABS: Tab[] = ['students', 'assignments', 'digest', 'settings'];
const SKILL_KEYS = SKILLS.map((skill) => skill.key);

const useRun = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
};

const copy = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

// --- Invite ------------------------------------------------------------------------------

const InvitePanel = ({ data, onChanged }: { data: ClassDashboard; onChanged: () => void }) => {
  const t = useT();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run } = useRun();
  const cls = data.class;
  if (!cls.join_code || !cls.join_link) return null;
  const mark = async (what: 'code' | 'link', text: string) => {
    if (await copy(text)) {
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    }
  };
  return (
    <Panel title={t('classes.invite.title')} aside={<Tag>{t('classes.invite.count', { count: data.roster.length, max: cls.max_students })}</Tag>}>
      <p className="hint">{t('classes.invite.lead')}</p>
      <div className="en-class-code" aria-label={t('classes.invite.codeLabel')}>{cls.join_code}</div>
      <p className="en-class-link">{cls.join_link}</p>
      <div className="en-actions">
        <button type="button" onClick={() => void mark('link', cls.join_link!)}>{copied === 'link' ? t('classes.invite.copied') : t('classes.invite.copyLink')}</button>
        <button type="button" className="quiet" onClick={() => void mark('code', cls.join_code!)}>{copied === 'code' ? t('classes.invite.copied') : t('classes.invite.copyCode')}</button>
        {!confirming ? <button type="button" className="is-link" onClick={() => setConfirming(true)}>{t('classes.invite.newCode')}</button> : null}
      </div>
      {confirming ? (
        <div className="en-explain en-stack">
          <span>{t('classes.invite.newCodeConfirm')}</span>
          <div className="en-actions">
            <button type="button" disabled={busy} onClick={() => void run(() => newJoinCode(cls.id), () => { setConfirming(false); onChanged(); })}>{t('classes.invite.newCodeYes')}</button>
            <button type="button" className="quiet" onClick={() => setConfirming(false)}>{t('classes.leave.no')}</button>
          </div>
        </div>
      ) : null}
      {error ? <ErrorState error={error} /> : null}
    </Panel>
  );
};

// --- Students ---------------------------------------------------------------------------------

const LevelChips = ({ levels }: { levels: RosterEntry['levels'] }) => {
  const t = useT();
  return (
    <span className="en-class-levels">
      {SKILL_KEYS.map((skill) => (
        <span key={skill} className="en-class-level" title={t(`skill.${skill}`)}>
          <SkillDot skill={skill} />
          <span className="visually-hidden">{t(`skill.${skill}`)}: </span>
          {levels[skill] ?? '–'}
        </span>
      ))}
    </span>
  );
};

const RosterTable = ({ data, onChanged }: { data: ClassDashboard; onChanged: () => void }) => {
  const t = useT();
  const { date } = useI18n();
  const [removing, setRemoving] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const archived = data.class.status !== 'active';
  if (!data.roster.length) {
    return <EmptyState title={t('classes.roster.emptyTitle')} body={t('classes.roster.emptyBody')} />;
  }
  return (
    <>
      <div className="en-class-table-wrap">
        <table className="en-table en-class-table">
          <thead>
            <tr>
              <th scope="col">{t('classes.roster.name')}</th>
              <th scope="col">{t('classes.roster.levels')}</th>
              <th scope="col">{t('classes.roster.streak')}</th>
              <th scope="col">{t('classes.roster.minutes')}</th>
              <th scope="col">{t('classes.roster.lastActive')}</th>
              <th scope="col">{t('classes.roster.assignments')}</th>
              <th scope="col">{t('classes.roster.plan')}</th>
              {!archived ? <th scope="col"><span className="visually-hidden">{t('classes.roster.remove')}</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {data.roster.map((row) => (
              <tr key={row.user_id}>
                <th scope="row">{row.name === 'Learner' ? t('classes.roster.anon') : row.name}</th>
                <td><LevelChips levels={row.levels} /></td>
                <td>{row.streak}</td>
                <td>{row.minutes_week}</td>
                <td>{row.last_active ? date(row.last_active, { dateStyle: 'medium' }) : t('classes.roster.never')}</td>
                <td>{`${row.assignments_done}/${row.assignments_total}`}</td>
                <td>{row.plan === 'free' ? <span className="en-tag is-warn">{t('classes.plan.free')}</span> : <span className="hint">{t(`classes.plan.${row.plan}`)}</span>}</td>
                {!archived ? (
                  <td>
                    {removing === row.user_id ? (
                      <span className="en-row" style={{ gap: '.3rem', flexWrap: 'nowrap' }}>
                        <button type="button" disabled={busy} onClick={() => void run(() => removeStudent(data.class.id, row.user_id), () => { setRemoving(null); onChanged(); })}>{t('classes.roster.removeYes')}</button>
                        <button type="button" className="quiet" onClick={() => setRemoving(null)}>{t('classes.leave.no')}</button>
                      </span>
                    ) : (
                      <button type="button" className="is-link" onClick={() => setRemoving(row.user_id)}>{t('classes.roster.remove')}</button>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <ErrorState error={error} /> : null}
    </>
  );
};

const StudentsTab = ({ data, onChanged }: { data: ClassDashboard; onChanged: () => void }) => {
  const t = useT();
  const { pricingHref } = useEnglish();
  const roster = data.roster;
  const active = roster.filter((row) => row.activities_week > 0).length;
  const minutes = roster.reduce((sum, row) => sum + row.minutes_week, 0);
  const totalWork = roster.reduce((sum, row) => sum + row.assignments_total, 0);
  const doneWork = roster.reduce((sum, row) => sum + row.assignments_done, 0);
  const free = roster.filter((row) => row.plan === 'free').length;

  const exportCsv = () => {
    const csv = rosterCsv(roster, SKILL_KEYS, {
      name: t('classes.roster.name'),
      skill: (skill: SkillKey) => t(`skill.${skill}`),
      streak: t('classes.roster.streak'),
      minutes: t('classes.roster.minutes'),
      activities: t('classes.roster.activities'),
      lastActive: t('classes.roster.lastActive'),
      assignments: t('classes.roster.assignments'),
      plan: t('classes.roster.plan'),
      planLabel: (plan: PlanTier) => t(`classes.plan.${plan}`),
    });
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${data.class.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'class'}-${dateAfter(0)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="en-stack">
      <Panel>
        <div className="en-stats">
          <Stat label={t('classes.stats.students')} value={roster.length} />
          <Stat label={t('classes.stats.active')} value={active} hint={t('classes.stats.thisWeek')} />
          <Stat label={t('classes.stats.minutes')} value={minutes} hint={t('classes.stats.thisWeek')} />
          <Stat label={t('classes.stats.work')} value={totalWork ? `${Math.round((doneWork / totalWork) * 100)}%` : '–'} />
        </div>
      </Panel>

      <Panel title={t('classes.roster.title')} aside={roster.length ? <button type="button" className="quiet" onClick={exportCsv}>{t('classes.roster.csv')}</button> : null}>
        <RosterTable data={data} onChanged={onChanged} />
        {free ? (
          <p className="en-explain">
            {t('classes.plan.note', { count: free })} <a href={pricingHref()}>{t('classes.plan.seePlans')}</a>
          </p>
        ) : null}
      </Panel>

      <div className="en-grid-cards">
        <Panel title={t('classes.weak.title')}>
          {data.weak_skills.length ? (
            <ul className="en-class-bars">
              {data.weak_skills.map((entry) => (
                <li key={entry.skill}>
                  <span className="en-row" style={{ gap: '.4rem' }}><SkillDot skill={entry.skill} /><strong>{t(`skill.${entry.skill}`)}</strong>{entry.average_level ? <LevelBadge level={entry.average_level} muted /> : null}</span>
                  <span className="hint">{t('classes.weak.students', { count: entry.students })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="hint">{t('classes.weak.empty')}</p>}
        </Panel>
        <Panel title={t('classes.mistakes.title')}>
          {data.mistakes.length ? (
            <ul className="en-class-bars">
              {data.mistakes.map((entry) => (
                <li key={entry.topic}>
                  <strong>{t(`topic.${entry.topic}`)}</strong>
                  <span className="hint">{t('classes.mistakes.students', { count: entry.students })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="hint">{t('classes.mistakes.empty')}</p>}
          <p className="hint">{t('classes.mistakes.privacy')}</p>
        </Panel>
      </div>
    </div>
  );
};

// --- Assignments --------------------------------------------------------------------------------

const KINDS: AssignmentKind[] = ['lessons', 'skill_count', 'roleplay', 'speaking_mock'];

const LessonPicker = ({ classId, selected, onChange }: { classId: string; selected: ContentResult[]; onChange: (next: ContentResult[]) => void }) => {
  const t = useT();
  const [skill, setSkill] = useState<SkillKey | ''>('');
  const [level, setLevel] = useState<CefrLevel | ''>('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContentResult[] | null>(null);
  const { busy, error, run } = useRun();
  const search = () => run(async () => setResults((await searchClassContent(classId, { skill, level, q: query.trim() })).items));
  const chosen = new Set(selected.map((item) => item.id));
  return (
    <div className="en-stack">
      <div className="en-class-form-row">
        <label>
          {t('classes.new.skill')}
          <select value={skill} onChange={(event) => setSkill(event.target.value as SkillKey | '')}>
            <option value="">{t('classes.new.anySkill')}</option>
            {SKILL_KEYS.map((key) => <option key={key} value={key}>{t(`skill.${key}`)}</option>)}
          </select>
        </label>
        <label>
          {t('classes.new.level')}
          <select value={level} onChange={(event) => setLevel(event.target.value as CefrLevel | '')}>
            <option value="">{t('classes.new.anyLevel')}</option>
            {CEFR_LEVELS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
      </div>
      <div className="en-class-join-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }}
          placeholder={t('classes.new.searchPlaceholder')}
          aria-label={t('classes.new.searchLabel')}
          maxLength={60}
        />
        <button type="button" className="quiet" disabled={busy} onClick={() => void search()}>{busy ? t('common.loading') : t('classes.new.search')}</button>
      </div>
      {error ? <ErrorState error={error} /> : null}
      {results ? (
        results.length ? (
          <ul className="en-list en-class-results">
            {results.map((item) => (
              <li key={item.id} className="en-item">
                <span className="en-item-main">
                  <span className="en-row" style={{ gap: '.4rem' }}><SkillDot skill={item.skill} /><small>{t(`skill.${item.skill}`)}</small></span>
                  <strong>{item.title}</strong>
                </span>
                <span className="en-item-meta">
                  {item.level ? <LevelBadge level={item.level} muted /> : null}
                  <Tag>{t('common.minutesShort', { count: item.minutes })}</Tag>
                  <button
                    type="button"
                    className={chosen.has(item.id) ? 'quiet' : ''}
                    disabled={!chosen.has(item.id) && selected.length >= 10}
                    onClick={() => onChange(chosen.has(item.id) ? selected.filter((entry) => entry.id !== item.id) : [...selected, item])}
                  >
                    {chosen.has(item.id) ? t('classes.new.added') : t('classes.new.add')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="hint">{t('classes.new.noResults')}</p>
      ) : null}
      <p className="hint">{t('classes.new.selected', { count: selected.length })}</p>
      {selected.length ? (
        <ul className="en-class-chips">
          {selected.map((item) => (
            <li key={item.id}>
              <span>{item.title}</span>
              <button type="button" className="is-link" aria-label={t('classes.new.removeLesson', { title: item.title })} onClick={() => onChange(selected.filter((entry) => entry.id !== item.id))}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const NewAssignmentForm = ({ data, onCreated }: { data: ClassDashboard; onCreated: () => void }) => {
  const t = useT();
  const [kind, setKind] = useState<AssignmentKind>('lessons');
  const [lessons, setLessons] = useState<ContentResult[]>([]);
  const [skill, setSkill] = useState<SkillKey>('listening');
  const [level, setLevel] = useState<CefrLevel | ''>(data.class.level ?? '');
  const [count, setCount] = useState(3);
  const [scenario, setScenario] = useState('');
  const [due, setDue] = useState(dateAfter(7));
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run } = useRun();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body: NewAssignment = { kind, due_date: due, title: title.trim() || undefined, note: note.trim() || undefined };
    if (kind === 'lessons') body.content_item_ids = lessons.map((item) => item.id);
    if (kind === 'skill_count') Object.assign(body, { skill, level: level || null, count });
    if (kind === 'roleplay') body.scenario_id = scenario || null;
    void run(() => createAssignment(data.class.id, body), () => {
      setLessons([]);
      setTitle('');
      setNote('');
      onCreated();
    });
  };

  const ready = kind !== 'lessons' || lessons.length > 0;
  return (
    <form className="en-class-form" onSubmit={submit}>
      <h3>{t('classes.new.title')}</h3>
      <Segmented label={t('classes.new.kind')} value={kind} options={KINDS.map((value) => ({ value, label: t(`classes.kind.${value}`) }))} onChange={setKind} />
      <p className="hint">{t(`classes.kind.${kind}.hint`)}</p>

      {kind === 'lessons' ? <LessonPicker classId={data.class.id} selected={lessons} onChange={setLessons} /> : null}
      {kind === 'skill_count' ? (
        <div className="en-class-form-row">
          <label>
            {t('classes.new.skill')}
            <select value={skill} onChange={(event) => setSkill(event.target.value as SkillKey)}>
              {SKILL_KEYS.map((key) => <option key={key} value={key}>{t(`skill.${key}`)}</option>)}
            </select>
          </label>
          <label>
            {t('classes.new.level')}
            <select value={level} onChange={(event) => setLevel(event.target.value as CefrLevel | '')}>
              <option value="">{t('classes.new.anyLevel')}</option>
              {CEFR_LEVELS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label>
            {t('classes.new.count')}
            <input type="number" min={1} max={20} value={count} onChange={(event) => setCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} />
          </label>
        </div>
      ) : null}
      {kind === 'roleplay' ? (
        <label>
          {t('classes.new.scenario')}
          <select value={scenario} onChange={(event) => setScenario(event.target.value)}>
            <option value="">{t('classes.new.anyScenario')}</option>
            {data.scenarios.map((entry) => <option key={entry.id} value={entry.id}>{`${entry.title} (${entry.levels[0]}–${entry.levels[1]})`}</option>)}
          </select>
        </label>
      ) : null}

      <div className="en-class-form-row">
        <label>
          {t('classes.new.due')}
          <input type="date" value={due} min={dateAfter(0)} max={dateAfter(90)} required onChange={(event) => setDue(event.target.value)} />
        </label>
        <label>
          {t('classes.new.customTitle')}
          <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder={t('classes.new.customTitlePlaceholder')} />
        </label>
      </div>
      <label>
        {t('classes.new.note')}
        <textarea rows={2} maxLength={280} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('classes.new.notePlaceholder')} />
      </label>
      <p className="hint">{t('classes.new.accessNote')}</p>
      <div className="en-actions">
        <button type="submit" disabled={busy || !ready || !due}>{busy ? t('common.saving') : t('classes.new.cta')}</button>
      </div>
      {error ? <ErrorState error={error} /> : null}
    </form>
  );
};

const AssignmentRow = ({ data, assignment, onChanged }: { data: ClassDashboard; assignment: TeacherAssignment; onChanged: () => void }) => {
  const t = useT();
  const { date } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const { busy, error, run } = useRun();
  const finished = new Set(assignment.finished);
  const waiting = data.roster.filter((row) => !finished.has(row.user_id));
  return (
    <li className="en-class-assignment">
      <div className="en-row" style={{ justifyContent: 'space-between' }}>
        <span className="en-item-main">
          <span className="en-row" style={{ gap: '.4rem' }}>
            {assignment.skill ? <SkillDot skill={assignment.skill} /> : null}
            <small className="en-class-meta">{t(`classes.kind.${assignment.kind}`)} · {t('classes.due.on', { date: date(`${assignment.due_date}T12:00:00`, { dateStyle: 'medium' }) })}</small>
          </span>
          <strong>{assignment.label}</strong>
          {assignment.note ? <span className="hint">{assignment.note}</span> : null}
        </span>
        <span className="en-item-meta">
          {assignment.overdue ? <span className="en-tag is-warn">{t('classes.assignments.overdue', { count: assignment.overdue })}</span> : null}
          <Tag>{t('classes.assignments.done', { done: assignment.done, total: assignment.students })}</Tag>
        </span>
      </div>
      {assignment.students ? <ProgressBar value={(assignment.done / assignment.students) * 100} label={t('classes.assignments.done', { done: assignment.done, total: assignment.students })} /> : null}
      {assignment.lessons.length > 1 ? <p className="hint">{assignment.lessons.map((lesson) => lesson.title).join(' · ')}</p> : null}
      <div className="en-actions">
        {waiting.length && assignment.students ? (
          <button type="button" className="is-link" aria-expanded={showWho} onClick={() => setShowWho(!showWho)}>{t('classes.assignments.who', { count: waiting.length })}</button>
        ) : null}
        {data.class.status === 'active' && !confirming ? <button type="button" className="is-link" onClick={() => setConfirming(true)}>{t('classes.assignments.cancel')}</button> : null}
        {confirming ? (
          <>
            <button type="button" disabled={busy} onClick={() => void run(() => cancelAssignment(data.class.id, assignment.id), onChanged)}>{t('classes.assignments.cancelYes')}</button>
            <button type="button" className="quiet" onClick={() => setConfirming(false)}>{t('classes.leave.no')}</button>
          </>
        ) : null}
      </div>
      {showWho ? <p className="hint">{waiting.map((row) => (row.name === 'Learner' ? t('classes.roster.anon') : row.name)).join(', ')}</p> : null}
      {error ? <ErrorState error={error} /> : null}
    </li>
  );
};

const AssignmentsTab = ({ data, onChanged }: { data: ClassDashboard; onChanged: () => void }) => {
  const t = useT();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="en-grid-2">
      <Panel title={t('classes.assignments.title')}>
        {notice ? <p className="en-notice" role="status">{notice}</p> : null}
        {data.assignments.length ? (
          <ul className="en-list">
            {data.assignments.map((assignment) => <AssignmentRow key={assignment.id} data={data} assignment={assignment} onChanged={onChanged} />)}
          </ul>
        ) : <EmptyState title={t('classes.assignments.emptyTitle')} body={t('classes.assignments.emptyBody')} />}
      </Panel>
      {data.class.status === 'active' ? (
        <Panel>
          <NewAssignmentForm data={data} onCreated={() => { setNotice(t('classes.new.done')); onChanged(); }} />
        </Panel>
      ) : null}
    </div>
  );
};

// --- Digest and settings ------------------------------------------------------------------------

const DigestTab = ({ data }: { data: ClassDashboard }) => {
  const t = useT();
  const { locale, date } = useI18n();
  const digest = useResource((signal) => getClassDigest(data.class.id, locale, signal), [data.class.id, locale]);
  const value = digest.data?.digest;
  if (!value) return digest.error ? <ErrorState error={digest.error} onRetry={digest.reload} /> : <section className="en-panel"><Loading lines={5} /></section>;
  const range = `${date(`${value.week_start}T12:00:00`, { dateStyle: 'medium' })} – ${date(`${value.week_end}T12:00:00`, { dateStyle: 'medium' })}`;
  return (
    <div className="en-stack">
      <Panel title={t('classes.digest.title')} aside={<Tag>{range}</Tag>}>
        <div className="en-stats">
          <Stat label={t('classes.stats.active')} value={`${value.active_students}/${value.students}`} />
          <Stat label={t('classes.digest.activities')} value={value.activities} />
          <Stat label={t('classes.stats.minutes')} value={value.minutes} />
        </div>
        {value.top.length ? <p>{t('classes.digest.top', { names: value.top.map((entry) => entry.name).join(', ') })}</p> : null}
        {value.inactive.total ? (
          <p className="en-explain">{t('classes.digest.inactive', { names: value.inactive.names.join(', '), count: value.inactive.total })}</p>
        ) : value.students ? <p className="en-notice">{t('classes.digest.allActive')}</p> : null}
      </Panel>
      <div className="en-grid-cards">
        <Panel title={t('classes.assignments.title')}>
          {value.assignments.length ? (
            <ul className="en-class-bars">
              {value.assignments.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.label}</strong>
                  <span className="hint">{t('classes.assignments.done', { done: entry.done, total: entry.total })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="hint">{t('classes.digest.noAssignments')}</p>}
        </Panel>
        <Panel title={t('classes.weak.title')}>
          {value.weak_skills.length || value.mistakes.length ? (
            <ul className="en-class-bars">
              {value.weak_skills.map((entry) => <li key={entry.skill}><strong>{t(`skill.${entry.skill}`)}</strong>{entry.average_level ? <LevelBadge level={entry.average_level} muted /> : null}</li>)}
              {value.mistakes.map((entry) => <li key={entry.topic}><strong>{t(`topic.${entry.topic}`)}</strong><span className="hint">{t('classes.mistakes.students', { count: entry.students })}</span></li>)}
            </ul>
          ) : <p className="hint">{t('classes.weak.empty')}</p>}
        </Panel>
      </div>
      <p className="hint">{data.class.digest_telegram ? t('classes.digest.telegramOn') : t('classes.digest.telegramOff')}</p>
    </div>
  );
};

const SettingsTab = ({ data, onChanged }: { data: ClassDashboard; onChanged: () => void }) => {
  const t = useT();
  const { locale } = useI18n();
  const { telegramHref } = useEnglish();
  const cls = data.class;
  const [name, setName] = useState(cls.name);
  const [level, setLevel] = useState<CefrLevel | ''>(cls.level ?? '');
  const [school, setSchool] = useState(cls.school_name ?? '');
  const [archiving, setArchiving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useRun();
  if (cls.status !== 'active') return <Panel><p className="hint">{t('classes.settings.archived')}</p></Panel>;

  const save = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    void run(() => updateClass(cls.id, { name: name.trim(), level: level || null, school_name: school.trim() }), () => { setSaved(true); onChanged(); });
  };

  return (
    <div className="en-grid-2">
      <Panel title={t('classes.settings.title')}>
        <form className="en-class-form" onSubmit={save}>
          <label>
            {t('classes.create.name')}
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
          </label>
          <div className="en-class-form-row">
            <label>
              {t('classes.create.level')}
              <select value={level} onChange={(event) => setLevel(event.target.value as CefrLevel | '')}>
                <option value="">{t('classes.create.levelAny')}</option>
                {CEFR_LEVELS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </label>
            <label>
              {t('classes.create.school')}
              <input value={school} onChange={(event) => setSchool(event.target.value)} maxLength={120} />
            </label>
          </div>
          <div className="en-actions">
            <button type="submit" disabled={busy || !name.trim()}>{busy ? t('common.saving') : t('classes.settings.save')}</button>
            {saved ? <span className="hint" role="status">{t('classes.settings.saved')}</span> : null}
          </div>
        </form>
      </Panel>
      <div className="en-stack">
        <Panel title={t('classes.digest.telegramTitle')}>
          <label className="en-toggle">
            <input
              type="checkbox"
              checked={cls.digest_telegram}
              disabled={busy}
              onChange={(event) => void run(() => updateClass(cls.id, { digest_telegram: event.target.checked, digest_locale: locale as ClassLocale }), onChanged)}
            />
            <span>{t('classes.digest.telegramToggle')}</span>
          </label>
          <p className="hint">{t('classes.digest.telegramHint')} <a href={telegramHref}>{t('classes.digest.telegramLink')}</a></p>
        </Panel>
        <Panel title={t('classes.archive.title')}>
          <p className="hint">{t('classes.archive.body')}</p>
          {archiving ? (
            <div className="en-actions">
              <button type="button" disabled={busy} onClick={() => void run(() => archiveClass(cls.id), onChanged)}>{t('classes.archive.yes')}</button>
              <button type="button" className="quiet" onClick={() => setArchiving(false)}>{t('classes.leave.no')}</button>
            </div>
          ) : (
            <div className="en-actions"><button type="button" className="quiet" onClick={() => setArchiving(true)}>{t('classes.archive.cta')}</button></div>
          )}
        </Panel>
        {error ? <ErrorState error={error} /> : null}
      </div>
    </div>
  );
};

// --- Page -------------------------------------------------------------------------------------------

export const ClassDashboardPage = () => {
  const t = useT();
  const { locale } = useI18n();
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'students';
  const dashboard = useResource((signal) => getClassDashboard(id, locale, signal), [id, locale]);
  const data = dashboard.data;
  const back = { to: '/classes', label: t('classes.title') };

  if (!data) {
    const forbidden = dashboard.error instanceof ApiError && (dashboard.error.status === 403 || dashboard.error.status === 404);
    return (
      <>
        <PageHeader back={back} eyebrow={t('classes.dashboard.eyebrow')} title={t('classes.dashboard.loadingTitle')} />
        {forbidden ? (
          <section className="en-panel">
            <EmptyState title={t('classes.dashboard.forbiddenTitle')} body={t('classes.dashboard.forbiddenBody')} action={<Link className="en-button" to="/classes">{t('classes.title')}</Link>} />
          </section>
        ) : dashboard.error ? <ErrorState error={dashboard.error} onRetry={dashboard.reload} /> : <section className="en-panel"><Loading lines={6} /></section>}
      </>
    );
  }

  const cls = data.class;
  const lead = [cls.school_name, t('classes.teaching.students', { count: data.roster.length })].filter(Boolean).join(' · ');
  return (
    <>
      <PageHeader
        back={back}
        eyebrow={t('classes.dashboard.eyebrow')}
        title={cls.name}
        lead={lead}
        actions={<span className="en-row">{cls.level ? <LevelBadge level={cls.level} /> : null}{cls.status !== 'active' ? <Tag>{t('classes.archived')}</Tag> : null}</span>}
      />
      {dashboard.error ? <ErrorState error={dashboard.error} onRetry={dashboard.reload} /> : null}
      <InvitePanel data={data} onChanged={dashboard.reload} />
      <div className="en-class-tabs">
        <Segmented
          label={t('classes.dashboard.sections')}
          value={tab}
          options={TABS.map((value) => ({ value, label: t(`classes.tab.${value}`) }))}
          onChange={(value) => setParams(value === 'students' ? {} : { tab: value }, { replace: true })}
        />
      </div>
      {tab === 'students' ? <StudentsTab data={data} onChanged={dashboard.reload} /> : null}
      {tab === 'assignments' ? <AssignmentsTab data={data} onChanged={dashboard.reload} /> : null}
      {tab === 'digest' ? <DigestTab data={data} /> : null}
      {tab === 'settings' ? <SettingsTab data={data} onChanged={dashboard.reload} /> : null}
    </>
  );
};
