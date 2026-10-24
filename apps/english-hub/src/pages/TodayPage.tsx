import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { getToday, taskHref, type TodayResponse, type TodayTask } from '../lib/hub';
import type { SkillKey } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, Panel, ProgressBar, SkillDot, Tag } from '../ui/kit';
import { Onboarding } from './Onboarding';
import { TopicWeekPanel } from './TopicWeekPanel';
import { GoalCard } from './goal/GoalCard';

const greetingKey = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'today.greeting.morning';
  if (hour < 18) return 'today.greeting.afternoon';
  return 'today.greeting.evening';
};

const TaskRow = ({ task, dueReviews, primary }: { task: TodayTask; dueReviews: number; primary: boolean }) => {
  const t = useT();
  const skillName = t(`skill.${task.skill}`);
  const title = task.kind === 'review' ? t('today.task.review', { count: dueReviews }) : task.title;
  const reason = task.reason === 'review_due'
    ? t('today.reason.review_due')
    : task.reason === 'fix_mistake'
      ? t('today.reason.fix_mistake', { example: task.detail ?? '' })
      : t(`today.reason.${task.reason}`, { skill: skillName });
  const kindNote = task.item_kind === 'retry' && task.previous_score !== null
    ? t('today.kind.retry', { score: task.previous_score })
    : task.item_kind && task.item_kind !== 'new' ? t(`today.kind.${task.item_kind}`) : null;
  return (
    <li>
      <Link className={`en-item ${task.done ? 'is-done' : ''}`.trim()} to={taskHref(task)}>
        <span className={`en-check ${task.done ? 'is-done' : ''}`.trim()} aria-hidden="true">{task.done ? '✓' : ''}</span>
        <span className="en-item-main">
          <span className="en-row" style={{ gap: '.4rem' }}>
            <SkillDot skill={task.skill} />
            <small style={{ fontWeight: 700, color: 'var(--muted)', fontSize: '.75rem' }}>{task.kind === 'review' ? t('nav.review') : skillName}</small>
          </span>
          <strong>{title}</strong>
          <span>{reason}{kindNote ? ` · ${kindNote}` : ''}</span>
        </span>
        <span className="en-item-meta">
          {task.level ? <LevelBadge level={task.level} muted /> : null}
          <Tag>{t('common.minutesShort', { count: task.minutes })}</Tag>
          {task.done
            ? <span className="visually-hidden">{t('today.done')}</span>
            : <span className={primary ? 'en-button' : 'en-button-quiet'}>{primary ? t('today.start') : t('today.open')}</span>}
        </span>
      </Link>
    </li>
  );
};

const WeekStrip = ({ week }: { week: TodayResponse['week'] }) => {
  const { date } = useI18n();
  return (
    <div className="en-week">
      {week.map((day, index) => (
        <div key={day.date} className={`en-week-day ${day.count > 0 ? 'is-active' : ''} ${index === week.length - 1 ? 'is-today' : ''}`.trim()}>
          <span aria-hidden="true">{day.count > 0 ? '✓' : ''}</span>
          {date(`${day.date}T12:00:00`, { weekday: 'narrow' })}
        </div>
      ))}
    </div>
  );
};

export const TodayPage = () => {
  const t = useT();
  const { onboarding, displayName, pricingHref } = useEnglish();
  const placed = onboarding.value?.placementDone ?? false;
  const today = useResource((signal) => getToday(signal), [placed], placed);

  if (onboarding.status === 'loading') return <Loading lines={4} />;
  if (onboarding.status === 'error' && !onboarding.value) {
    return <ErrorState error={new Error('onboarding')} onRetry={() => window.location.reload()} />;
  }
  if (!placed) return <Onboarding />;

  const data = today.data;
  const tasks = data?.tasks ?? [];
  const nextIndex = tasks.findIndex((task) => !task.done);
  const allDone = tasks.length > 0 && nextIndex === -1;
  const level = data?.level ?? onboarding.value?.level ?? null;
  const target = data?.target_level ?? onboarding.value?.targetLevel ?? null;
  const readySkills = Object.entries(data?.level_status ?? {})
    .filter(([skill, status]) => status === 'ready' && (data?.available_skills ?? []).includes(skill as SkillKey))
    .map(([skill]) => skill as SkillKey);

  return (
    <>
      <div className="en-hello">
        <div>
          <p className="eyebrow">{t('today.eyebrow')}</p>
          <h1>{displayName ? t(greetingKey(), { name: displayName }) : t(`${greetingKey()}.anon`)}</h1>
          <p className="en-goal-line">
            {level ? <><span>{t('today.level')}</span><LevelBadge level={level} /></> : null}
            {target ? <><span aria-hidden="true">→</span><span>{t('today.target')}</span><LevelBadge level={target} muted /></> : null}
            <span>· {t('today.dailyGoal', { count: data?.daily_minutes ?? onboarding.value?.dailyMinutes ?? 20 })}</span>
          </p>
        </div>
      </div>

      {data?.level_check?.due ? (
        <section className="en-panel en-tone-lime">
          <div className="en-panel-head">
            <div>
              <h2>{t('levels.todayTitle')}</h2>
              <p style={{ margin: 0 }}>{t('levels.dueBody')}</p>
            </div>
            <Link className="en-button" to="/check">{t('levels.dueCta')}</Link>
          </div>
        </section>
      ) : null}

      {readySkills.length ? (
        <section className="en-panel en-tone-lime">
          <div className="en-panel-head">
            <div>
              <h2>{t('today.ready.title')}</h2>
              <p style={{ margin: 0 }}>{t('today.ready.body', { skills: readySkills.map((skill) => t(`skill.${skill}`)).join(', ') })}</p>
            </div>
            <Link className="en-button" to="/progress">{t('today.ready.cta')}</Link>
          </div>
        </section>
      ) : null}

      <div className="en-grid-2">
        <section className="en-panel en-session">
          <div className="en-session-head">
            <div>
              <h2>{allDone ? t('today.session.doneTitle') : t('today.session.title')}</h2>
              {data ? (
                <p className="hint">
                  {t('today.session.progress', { done: data.done_count, total: tasks.length, minutes: data.minutes_total })}
                </p>
              ) : null}
            </div>
            {data && tasks.length ? (
              <div style={{ minWidth: '8rem', flex: '0 1 12rem' }}>
                <ProgressBar value={(data.done_count / tasks.length) * 100} label={t('today.session.progressLabel')} />
              </div>
            ) : null}
          </div>

          {today.loading && !data ? <Loading lines={4} label={t('today.session.loading')} /> : null}
          {today.error ? <ErrorState error={today.error} onRetry={today.reload} /> : null}

          {data?.free ? (
            <p className="en-explain" style={{ margin: 0 }}>
              <strong>{t('free.todayTitle')}.</strong> {t('free.todayBody')} <a href={pricingHref()}>{t('free.seePlans')}</a>
            </p>
          ) : null}

          {data?.free && !tasks.some((task) => task.kind === 'activity') ? (
            <EmptyState
              title={t('free.usedTitle')}
              body={t('free.usedBody')}
              action={<a className="en-button" href={pricingHref()}>{t('today.noAccess.cta')}</a>}
            />
          ) : null}

          {data && !data.free && tasks.length === 0 ? (
            <EmptyState title={t('today.empty.title')} body={t('today.empty.body')} action={<Link className="en-button" to="/practice">{t('today.empty.cta')}</Link>} />
          ) : null}

          {tasks.length ? (
            <ul className="en-list">
              {tasks.map((task, index) => (
                <TaskRow key={task.id} task={task} dueReviews={data?.due_reviews ?? 0} primary={index === nextIndex} />
              ))}
            </ul>
          ) : null}

          {allDone ? (
            <div className="en-notice">{t('today.session.doneBody')}</div>
          ) : null}
          {allDone ? (
            <div className="en-actions">
              <Link className="en-button" to="/practice">{t('today.session.more')}</Link>
              <Link className="en-button-quiet" to="/tutor">{t('today.session.tutor')}</Link>
            </div>
          ) : null}
        </section>

        <div className="en-stack">
          <GoalCard />

          <Panel title={t('today.week.title')} aside={data ? <span>{t('today.week.streak', { count: data.streak })}</span> : null}>
            {data ? <WeekStrip week={data.week} /> : <Loading lines={1} />}
            <p className="hint">{data && data.streak > 0 ? t('today.week.keepGoing') : t('today.week.start')}</p>
          </Panel>

          <TopicWeekPanel />

          <Panel title={t('today.words.title')}>
            {data ? (
              data.total_words > 0 ? (
                <>
                  <p>{t('today.words.summary', { due: data.due_reviews, total: data.total_words })}</p>
                  <div className="en-actions">
                    <Link className={data.due_reviews > 0 ? 'en-button' : 'en-button-quiet'} to="/review">
                      {data.due_reviews > 0 ? t('today.words.review') : t('today.words.open')}
                    </Link>
                  </div>
                </>
              ) : (
                <p>{t('today.words.empty')}</p>
              )
            ) : <Loading lines={2} />}
          </Panel>

          <Panel title={t('today.tutor.title')} tone="teal">
            <p>{t('today.tutor.body')}</p>
            <div className="en-actions">
              <Link className="en-button-quiet" to="/tutor">{t('today.tutor.cta')}</Link>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
};

