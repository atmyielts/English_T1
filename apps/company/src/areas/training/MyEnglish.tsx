// My English (/w/:org/me): the learner's home — level, target and gap, tests to
// take, assignments, where to continue, this week, Schood English and certificates.
import React, { useEffect, useState } from 'react';
import { LEVEL_LABEL, isLevel } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { LevelBadge, Loading, Progress, useDate, useLoad, useLocalized, useWeekday, type Localized } from './lib.tsx';

interface LessonRef { code: string; track_code: string; track_title: Localized; title: Localized; stage: string; level: string; step: string | null }
interface Home {
  member: { full_name: string | null; job_role: string; seat: boolean; level: string | null; level_source: string | null; level_at: string | null; target_level: string | null; target_date: string | null; gap: number | null };
  english_url: string | null;
  assignments: { id: string; track_code: string | null; track_title: Localized | null; target_level: string | null; due_date: string | null; note: string | null; lessons_done: number; lessons_total: number; meets_target: boolean | null; overdue: boolean; next: LessonRef | null }[];
  continue: LessonRef | null;
  resuming: boolean;
  week: { minutes: number; lessons: number; activities: number; days: { day: string; minutes: number }[] };
  totals: { lessons: number; roleplays: number; writing: number };
  certificates: { attempt_id: string; code: string; level: string | null; graded_at: string | null; title: string | null; kind: string | null }[];
}
/** The hiring area's contract (docs/product/45_COMPANY_ENGLISH.md). */
interface MyTest { assessment_id: string; title: string; kind: string; status: 'todo' | 'in_progress' | 'done'; level: string | null; attempt_id: string | null; deadline_at: string | null }

const lessonPath = (org: string, ref: LessonRef) => `/w/${org}/learn/${ref.track_code}/${ref.code}`;

/** Tests from hiring; shows nothing when that area is not there yet or fails. */
function TestsToTake({ org }: { org: string }) {
  const t = useAppT(), when = useDate();
  const [tests, setTests] = useState<MyTest[]>([]);
  useEffect(() => {
    let live = true;
    api<{ tests: MyTest[] }>(`orgs/${org}/my/tests`).then((result) => { if (live) setTests(Array.isArray(result?.tests) ? result.tests : []); }).catch(() => { if (live) setTests([]); });
    return () => { live = false; };
  }, [org]);
  const open = tests.filter((test) => test.status !== 'done');
  if (!open.length) return null;
  return <section className="training-card" aria-labelledby="training-tests">
    <h2 id="training-tests">{t('training.me.tests')}</h2>
    <ul className="training-list">
      {open.map((test) => <li key={test.assessment_id}>
        <div>
          <strong>{test.title}</strong>
          <span>{test.deadline_at ? t('training.me.testDeadline', { date: when(test.deadline_at) }) : t('training.me.testNoDeadline')}</span>
        </div>
        <Link className="button-link" to={`/w/${org}/test/${test.assessment_id}`}>{test.status === 'in_progress' ? t('training.me.testContinue') : t('training.me.testStart')}</Link>
      </li>)}
    </ul>
    <p><Link to={`/w/${org}/tests`}>{t('training.me.allTests')}</Link></p>
  </section>;
}

function WeekChart({ days }: { days: Home['week']['days'] }) {
  const t = useAppT();
  const date = useWeekday();
  const max = Math.max(15, ...days.map((day) => day.minutes));
  return <figure className="training-week" aria-label={t('training.me.weekChart')}>
    <ol>
      {days.map((day) => <li key={day.day}>
        <span className="training-week-bar" style={{ height: `${Math.round(day.minutes / max * 100)}%` }}/>
        <span className="training-week-day">{date(day.day)}</span>
        <span className="visually-hidden">{t('common.minutes', { count: day.minutes })}</span>
      </li>)}
    </ol>
  </figure>;
}

export function MyEnglish() {
  const t = useAppT(), pick = useLocalized(), when = useDate();
  const { org, member } = useWorkspace();
  const { data, error } = useLoad<Home>(member ? `orgs/${org.id}/my/home` : null);
  if (!member) return <section><h1>{t('training.me.title')}</h1><p>{t('training.notMember')}</p></section>;
  if (!data) return <Loading error={error}/>;
  const { member: me, week } = data;
  const levelText = (level: string | null) => level && isLevel(level) ? LEVEL_LABEL[level] : t('level.none');
  const gapText = me.target_level === null ? t('training.me.noTarget')
    : me.level === null ? t('training.me.gapUntested')
    : me.gap === 0 ? t('training.me.gapReached') : t('training.me.gap', { count: me.gap ?? 0 });

  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.me.title')}</h1>
      <p>{me.full_name ? t('training.me.hello', { name: me.full_name.split(' ')[0] }) : t('training.me.helloAnon')} {t(`job.${me.job_role}` as AppKey)}.</p>
    </header>

    <div className="company-grid training-levels">
      <div className="company-stat">
        <span>{t('training.me.level')}</span>
        <strong>{levelText(me.level)}</strong>
        <span>{me.level ? t('training.me.levelSource', { date: when(me.level_at) }) : t('training.me.levelNone')}</span>
      </div>
      <div className="company-stat">
        <span>{t('training.me.target')}</span>
        <strong>{me.target_level ? levelText(me.target_level) : '—'}</strong>
        <span>{me.target_date ? t('training.me.targetBy', { date: when(me.target_date) }) : t('training.me.targetHint')}</span>
      </div>
      <div className="company-stat">
        <span>{t('training.me.gapTitle')}</span>
        <strong>{me.target_level && me.level ? (me.gap === 0 ? '✓' : `+${me.gap}`) : '—'}</strong>
        <span>{gapText}</span>
      </div>
    </div>

    <TestsToTake org={org.id}/>

    {data.continue && <section className="training-card training-continue" aria-labelledby="training-continue">
      <p className="eyebrow">{data.resuming ? t('training.me.continue') : t('training.me.next')}</p>
      <h2 id="training-continue">{pick(data.continue.title)}</h2>
      <p>{pick(data.continue.track_title)} · <LevelBadge level={data.continue.level}/></p>
      <Link className="button-link" to={lessonPath(org.id, data.continue)}>{data.resuming ? t('training.me.continueButton') : t('training.me.startButton')}</Link>
    </section>}

    <section className="training-card" aria-labelledby="training-assignments">
      <h2 id="training-assignments">{t('training.me.assignments')}</h2>
      {data.assignments.length === 0 ? <p>{t('training.me.noAssignments')}</p> : <ul className="training-list">
        {data.assignments.map((item) => <li key={item.id}>
          <div>
            <strong>{item.track_title ? pick(item.track_title) : t('training.me.levelGoal', { level: levelText(item.target_level) })}</strong>
            <span>
              {item.target_level && item.track_title && t('training.me.assignmentTarget', { level: levelText(item.target_level) })}
              {item.target_level && item.track_title && item.due_date && ' · '}
              {item.due_date && t('training.me.due', { date: when(item.due_date) })}
              {' '}{item.overdue && <span className="company-badge bad">{t('training.me.overdue')}</span>}
              {item.meets_target && <span className="company-badge good">{t('training.me.targetMet')}</span>}
            </span>
            {item.note && <span className="training-note">{item.note}</span>}
            {item.lessons_total > 0 && <>
              <Progress value={item.lessons_done} total={item.lessons_total} label={t('training.me.lessonsProgress', { done: item.lessons_done, total: item.lessons_total })}/>
              <span>{t('training.me.lessonsProgress', { done: item.lessons_done, total: item.lessons_total })}</span>
            </>}
          </div>
          {item.next && <Link className="button-link quiet" to={lessonPath(org.id, item.next)}>{t('training.me.openLesson')}</Link>}
        </li>)}
      </ul>}
    </section>

    <section className="training-card" aria-labelledby="training-week">
      <h2 id="training-week">{t('training.me.week')}</h2>
      <div className="training-week-row">
        <div className="training-week-stats">
          <p><strong>{week.minutes}</strong> {t('training.me.minutes', { count: week.minutes })}</p>
          <p><strong>{week.lessons}</strong> {t('training.me.lessonsWeek', { count: week.lessons })}</p>
          <p className="hint">{t('training.me.totals', { lessons: data.totals.lessons, roleplays: data.totals.roleplays, writing: data.totals.writing })}</p>
        </div>
        <WeekChart days={week.days}/>
      </div>
    </section>

    <section className="training-card" aria-labelledby="training-practice">
      <h2 id="training-practice">{t('training.me.practice')}</h2>
      <div className="training-shortcuts">
        <Link to={`/w/${org.id}/learn`}><strong>{t('training.nav.lessons')}</strong><span>{t('training.me.lessonsHint')}</span></Link>
        <Link to={`/w/${org.id}/roleplay`}><strong>{t('training.nav.roleplay')}</strong><span>{t('training.me.roleplayHint')}</span></Link>
        <Link to={`/w/${org.id}/writing`}><strong>{t('training.nav.writing')}</strong><span>{t('training.me.writingHint')}</span></Link>
        <Link to={`/w/${org.id}/glossary`}><strong>{t('training.nav.glossary')}</strong><span>{t('training.me.glossaryHint')}</span></Link>
      </div>
    </section>

    {data.english_url && <section className="training-card training-english" aria-labelledby="training-english">
      <h2 id="training-english">{t('training.me.english')}</h2>
      <p>{t('training.me.englishLead')}</p>
      <a className="button-link" href={data.english_url} target="_blank" rel="noopener">{t('training.me.englishOpen')}<span className="visually-hidden"> {t('training.newTab')}</span></a>
    </section>}

    {data.certificates.length > 0 && <section className="training-card" aria-labelledby="training-certificates">
      <h2 id="training-certificates">{t('training.me.certificates')}</h2>
      <ul className="training-list">
        {data.certificates.map((item) => <li key={item.attempt_id}>
          <div>
            <strong>{item.title ?? t('training.me.certificate')} · {levelText(item.level)}</strong>
            <span>{when(item.graded_at)} · {t('training.me.certificateCode', { code: item.code })}</span>
          </div>
          <Link className="button-link quiet" to={`/v/${item.code}`}>{t('training.me.certificateOpen')}</Link>
        </li>)}
      </ul>
      <p className="hint">{t('training.me.certificateNote')}</p>
    </section>}
  </div>;
}
