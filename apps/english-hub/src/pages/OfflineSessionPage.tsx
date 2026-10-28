import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { entryForActivity, newEntry, type OfflineActivity, type QueueEntry } from '../lib/offline/model';
import { deleteEntries, listEntries, putEntry } from '../lib/offline/store';
import { syncNow } from '../lib/offline/sync';
import { useOfflineState, useOnline } from '../lib/offline/useOffline';
import { skillByKey } from '../lib/skills';
import { RUNNERS } from '../components/offline/runners';
import { EmptyState, LevelBadge, Loading, PageHeader, Panel, SkillDot, Tag } from '../ui/kit';

type T = ReturnType<typeof useT>;

const statusText = (entry: QueueEntry | null, t: T): string => {
  if (!entry) return t('offline.status.todo');
  if (entry.status === 'queued') return t('offline.status.queued');
  if (entry.status === 'failed') return t('offline.status.failed');
  return entry.result?.score !== null && entry.result?.score !== undefined
    ? t('offline.status.score', { score: Math.round(entry.result.score) })
    : t('offline.status.synced');
};

const reasonText = (entry: QueueEntry, t: T): string | null => {
  if (entry.status === 'failed' && entry.reason) return t(`offline.reason.${entry.reason}`);
  if (entry.status === 'queued' && entry.tries > 0) return t('offline.reason.retry');
  return null;
};

/**
 * /offline: today's saved activities, done without a connection. Answers are
 * queued on the device and sent through the normal submit routes once the
 * learner is online and signed in (also from any other page, see OfflineSync).
 * Works signed out too, because an expired session cannot be refreshed offline.
 */
export const OfflineSessionPage = () => {
  const t = useT();
  const { date } = useI18n();
  const { session, signInHref } = useEnglish();
  const userId = session?.user.id ?? null;
  const online = useOnline();
  const state = useOfflineState(userId);
  const [active, setActive] = useState<OfflineActivity | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const pack = state.pack;
  const owner = pack?.user_id ?? userId;
  // A different learner signed in on this device: never mix their answers.
  const foreign = Boolean(pack && userId && pack.user_id !== userId);
  const entries = state.entries.filter((entry) => entry.user_id === owner);
  const waiting = entries.filter((entry) => entry.status === 'queued').length;
  const canSend = online && Boolean(userId) && userId === owner;

  const finish = async (activity: OfflineActivity, body: Record<string, unknown>) => {
    if (!owner) return;
    setProblem(null);
    const entry = newEntry({ userId: owner, skill: activity.skill, slug: activity.slug, title: activity.title, body });
    try {
      await putEntry(entry);
    } catch {
      setProblem(t('offline.error.failed'));
      return;
    }
    setActive(null);
    window.scrollTo({ top: 0 });
    if (!canSend) {
      setNotice(t('offline.done.saved'));
      return;
    }
    try {
      await syncNow(owner);
      const sent = (await listEntries(owner)).find((saved) => saved.id === entry.id);
      if (sent?.status === 'synced') {
        const score = sent.result?.score;
        setNotice(typeof score === 'number' ? t('offline.done.sent', { score: Math.round(score) }) : t('offline.done.sentNoScore'));
      } else if (sent?.status === 'failed') {
        setNotice(reasonText(sent, t));
      } else {
        setNotice(t('offline.done.saved'));
      }
    } catch {
      // Still queued; it goes with the next sync.
      setNotice(t('offline.done.saved'));
    }
  };

  if (state.loading) return <Panel><Loading lines={5} /></Panel>;

  if (active) {
    const Runner = RUNNERS[active.skill];
    return (
      <>
        <PageHeader
          eyebrow={<><SkillDot skill={active.skill} /> {t(`skill.${active.skill}`)}</>}
          title={active.title}
          actions={<button type="button" className="quiet" onClick={() => setActive(null)}>{t('offline.page.back')}</button>}
        />
        {problem ? <p className="error" role="alert">{problem}</p> : null}
        <Runner activity={active} onFinish={(body) => void finish(active, body)} />
      </>
    );
  }

  if (!pack || foreign) {
    return (
      <>
        <PageHeader eyebrow={t('offline.page.eyebrow')} title={t('offline.page.title')} />
        <EmptyState
          title={t('offline.page.none')}
          body={state.problem ? t(`offline.error.${state.problem === 'quota' ? 'quota' : state.problem === 'unavailable' ? 'unavailable' : 'failed'}`) : t('offline.page.noneBody')}
          action={<Link className="en-button" to="/today">{t('offline.page.toToday')}</Link>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={t('offline.page.eyebrow')}
        title={t('offline.page.title')}
        lead={t('offline.page.lead')}
        actions={<Tag>{t('offline.page.savedOn', { date: date(pack.saved_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</Tag>}
      />
      <p className={online ? 'hint' : 'en-notice'} role="status">{online ? t('offline.page.online') : t('offline.page.offline')}</p>
      {notice ? <p className="en-notice" role="status">{notice}</p> : null}

      <Panel>
        <ul className="en-list">
          {pack.activities.map((activity) => {
            const entry = entryForActivity(entries, pack, activity);
            const reason = entry ? reasonText(entry, t) : null;
            const skill = skillByKey(activity.skill);
            return (
              <li key={`${activity.skill}/${activity.slug}`}>
                <div className={`en-item ${entry?.status === 'synced' ? 'is-done' : ''}`.trim()}>
                  <span className={`en-check ${entry && entry.status !== 'failed' ? 'is-done' : ''}`.trim()} aria-hidden="true">{entry && entry.status !== 'failed' ? '✓' : ''}</span>
                  <span className="en-item-main">
                    <span className="en-row" style={{ gap: '.4rem' }}>
                      <SkillDot skill={activity.skill} />
                      <small style={{ fontWeight: 700, color: 'var(--muted)', fontSize: '.75rem' }}>{skill ? t(`skill.${skill.key}`) : activity.skill}</small>
                    </span>
                    <strong>{activity.title}</strong>
                    <span>{statusText(entry, t)}{reason ? ` · ${reason}` : ''}</span>
                  </span>
                  <span className="en-item-meta">
                    {activity.level ? <LevelBadge level={activity.level} muted /> : null}
                    <Tag>{t('common.minutesShort', { count: activity.minutes })}</Tag>
                    <button type="button" className={entry ? 'quiet' : undefined} onClick={() => { setNotice(null); setActive(activity); }}>
                      {entry ? t('offline.page.redo') : t('offline.page.start')}
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      {pack.needs_connection.length ? (
        <Panel title={t('offline.needs.title')}>
          <p className="hint" style={{ margin: 0 }}>{t('offline.needs.body')}</p>
          <ul className="en-stack" style={{ gap: '.35rem', margin: 0, paddingLeft: '1.1rem' }}>
            {pack.needs_connection.map((task, index) => (
              <li key={index}>{task.kind === 'review' ? t('nav.review') : `${skillByKey(task.skill) ? t(`skill.${task.skill}`) : task.skill}: ${task.title}`}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {entries.length ? (
        <Panel title={t('offline.queue.title')}>
          {waiting ? <p style={{ margin: 0 }}>{t('offline.queue.waiting', { count: waiting })}</p> : null}
          {waiting && !userId ? (
            <p className="hint" style={{ margin: 0 }}>
              {t('offline.queue.signIn')}{' '}
              {online ? <a href={signInHref('/offline')}>{t('offline.queue.signInCta')}</a> : null}
            </p>
          ) : null}
          {waiting && canSend ? (
            <div className="en-actions">
              <button type="button" onClick={() => void syncNow(owner!).catch(() => undefined)}>{t('offline.card.sendNow')}</button>
            </div>
          ) : null}
          <ul className="en-stack" style={{ gap: '.4rem', margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {entries
              .slice()
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((entry) => (
                <li key={entry.id} className="en-row" style={{ justifyContent: 'space-between', gap: '.5rem' }}>
                  <span>
                    <strong>{entry.title}</strong> · <span className="hint">{statusText(entry, t)}</span>
                    {reasonText(entry, t) ? <span className="hint"> · {reasonText(entry, t)}</span> : null}
                  </span>
                  {entry.status === 'failed' ? (
                    <button type="button" className="is-link" onClick={() => void deleteEntries([entry.id]).catch(() => undefined)}>{t('offline.queue.remove')}</button>
                  ) : null}
                </li>
              ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
};
