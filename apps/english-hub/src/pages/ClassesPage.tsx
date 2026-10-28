import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n, useT } from '../i18n';
import { createClass, getClasses, joinClass, leaveClass, lookupClass, type ClassPreview, type ClassesResponse } from '../lib/classes';
import { CEFR_LEVELS, type CefrLevel } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { AssignmentItem } from '../components/ClassAssignmentsCard';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, Tag } from '../ui/kit';
import '../classes.css';

/** Join with a code (or a ?join= link), after an explicit consent screen. */
const JoinPanel = ({ onJoined }: { onJoined: (name: string) => void }) => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('join') ?? '');
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const autoLooked = useRef(false);

  const find = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setAgreed(false);
    try {
      setPreview(await lookupClass(value));
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  // A join link opens the consent screen straight away.
  useEffect(() => {
    const fromLink = params.get('join');
    if (fromLink && !autoLooked.current) {
      autoLooked.current = true;
      void find(fromLink);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearLink = () => {
    if (params.has('join')) {
      params.delete('join');
      setParams(params, { replace: true });
    }
  };

  const join = async () => {
    if (!preview || !agreed) return;
    setBusy(true);
    setError(null);
    try {
      await joinClass(preview.code);
      onJoined(preview.class.name);
      setPreview(null);
      setCode('');
      clearLink();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void find(code);
  };

  return (
    <Panel title={t('classes.join.title')}>
      {!preview ? (
        <form className="en-class-join" onSubmit={submit}>
          <label htmlFor="class-code">{t('classes.join.label')}</label>
          <div className="en-class-join-row">
            <input
              id="class-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={60}
              placeholder="ABC234"
            />
            <button type="submit" disabled={busy || !code.trim()}>{busy ? t('common.loading') : t('classes.join.find')}</button>
          </div>
          <p className="hint">{t('classes.join.hint')}</p>
        </form>
      ) : preview.role !== 'none' ? (
        <div className="en-stack">
          <p className="en-notice">{preview.role === 'teacher' ? t('classes.join.youTeach', { name: preview.class.name }) : t('classes.join.already', { name: preview.class.name })}</p>
          <div className="en-actions">
            <button type="button" className="quiet" onClick={() => { setPreview(null); clearLink(); }}>{t('common.back')}</button>
          </div>
        </div>
      ) : (
        <div className="en-class-consent" role="group" aria-labelledby="consent-title">
          <p className="eyebrow">{t('classes.consent.eyebrow')}</p>
          <h3 id="consent-title">{preview.class.name}</h3>
          <p className="hint">
            {t('classes.consent.teacher', { teacher: preview.class.teacher })}
            {preview.class.school_name ? ` · ${preview.class.school_name}` : ''}
            {preview.class.level ? <> · <LevelBadge level={preview.class.level} muted /></> : null}
          </p>
          <div className="en-explain">
            <strong>{t('classes.consent.title')}</strong>
            <ul>
              <li>{t('classes.consent.sees')}</li>
              <li>{t('classes.consent.notSees')}</li>
              <li>{t('classes.consent.plan')}</li>
              <li>{t('classes.consent.leave')}</li>
            </ul>
          </div>
          <label className="en-toggle">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span>{t('classes.consent.agree')}</span>
          </label>
          <div className="en-actions">
            <button type="button" disabled={!agreed || busy} onClick={() => void join()}>{busy ? t('common.saving') : t('classes.consent.join')}</button>
            <button type="button" className="quiet" onClick={() => { setPreview(null); clearLink(); }}>{t('classes.consent.cancel')}</button>
          </div>
        </div>
      )}
      {error ? <ErrorState error={error} /> : null}
    </Panel>
  );
};

const CreateClassForm = ({ caps, teachingCount, onCreated }: { caps: ClassesResponse['caps']; teachingCount: number; onCreated: () => void }) => {
  const t = useT();
  const { locale } = useI18n();
  const [name, setName] = useState('');
  const [level, setLevel] = useState<CefrLevel | ''>('');
  const [school, setSchool] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const full = teachingCount >= caps.max_classes_per_teacher;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createClass({ name: name.trim(), level: level || null, school_name: school.trim(), locale });
      setName('');
      setLevel('');
      setSchool('');
      onCreated();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="en-class-form" onSubmit={(event) => void submit(event)}>
      <h3>{t('classes.create.title')}</h3>
      <p className="hint">{t('classes.create.lead')}</p>
      <label>
        {t('classes.create.name')}
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder={t('classes.create.namePlaceholder')} />
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
          <input value={school} onChange={(event) => setSchool(event.target.value)} maxLength={120} placeholder={t('classes.create.schoolPlaceholder')} />
        </label>
      </div>
      {full ? <p className="hint">{t('classes.create.full', { count: caps.max_classes_per_teacher })}</p> : null}
      <div className="en-actions">
        <button type="submit" disabled={busy || full || !name.trim()}>{busy ? t('common.saving') : t('classes.create.cta')}</button>
      </div>
      {error ? <ErrorState error={error} /> : null}
    </form>
  );
};

const JoinedClass = ({ entry, onLeft }: { entry: ClassesResponse['joined'][number]; onLeft: () => void }) => {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const open = entry.assignments.filter((assignment) => assignment.state !== 'done');
  const done = entry.assignments.filter((assignment) => assignment.state === 'done');

  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      await leaveClass(entry.id);
      onLeft();
    } catch (cause) {
      setError(cause);
      setBusy(false);
    }
  };

  return (
    <Panel
      title={entry.name}
      aside={<span className="en-row" style={{ gap: '.4rem' }}>{entry.level ? <LevelBadge level={entry.level} muted /> : null}<Tag>{t('classes.teacher', { name: entry.teacher })}</Tag></span>}
    >
      {entry.school_name ? <p className="hint">{entry.school_name}</p> : null}
      {open.length ? (
        <ul className="en-list">{open.map((assignment) => <AssignmentItem key={assignment.id} assignment={assignment} showClass={false} />)}</ul>
      ) : (
        <p className="hint">{t('classes.mine.noWork')}</p>
      )}
      {done.length ? (
        <details className="en-class-done">
          <summary>{t('classes.mine.done', { count: done.length })}</summary>
          <ul className="en-list">{done.map((assignment) => <AssignmentItem key={assignment.id} assignment={assignment} showClass={false} />)}</ul>
        </details>
      ) : null}
      {confirming ? (
        <div className="en-explain en-stack">
          <span>{t('classes.leave.confirm', { name: entry.name })}</span>
          <div className="en-actions">
            <button type="button" disabled={busy} onClick={() => void leave()}>{busy ? t('common.saving') : t('classes.leave.yes')}</button>
            <button type="button" className="quiet" onClick={() => setConfirming(false)}>{t('classes.leave.no')}</button>
          </div>
        </div>
      ) : (
        <div className="en-actions">
          <button type="button" className="is-link" onClick={() => setConfirming(true)}>{t('classes.leave.cta')}</button>
        </div>
      )}
      {error ? <ErrorState error={error} /> : null}
    </Panel>
  );
};

export const ClassesPage = () => {
  const t = useT();
  const { locale } = useI18n();
  const classes = useResource((signal) => getClasses(locale, signal), [locale]);
  const [notice, setNotice] = useState<string | null>(null);
  const data = classes.data;

  if (!data) {
    return (
      <>
        <PageHeader eyebrow={t('classes.eyebrow')} title={t('classes.title')} lead={t('classes.lead')} />
        {classes.error ? <ErrorState error={classes.error} onRetry={classes.reload} /> : <section className="en-panel"><Loading lines={5} /></section>}
      </>
    );
  }

  if (!data.enabled) {
    return (
      <>
        <PageHeader eyebrow={t('classes.eyebrow')} title={t('classes.title')} />
        <section className="en-panel"><EmptyState title={t('classes.paused.title')} body={t('classes.paused.body')} /></section>
      </>
    );
  }

  const activeTeaching = data.teaching.filter((entry) => entry.status === 'active');
  const archived = data.teaching.filter((entry) => entry.status === 'archived');

  return (
    <>
      <PageHeader eyebrow={t('classes.eyebrow')} title={t('classes.title')} lead={t('classes.lead')} />
      {notice ? <p className="en-notice" role="status">{notice}</p> : null}
      {classes.error ? <ErrorState error={classes.error} onRetry={classes.reload} /> : null}

      <div className="en-grid-2">
        <div className="en-stack">
          {data.joined.length ? (
            data.joined.map((entry) => (
              <JoinedClass key={entry.id} entry={entry} onLeft={() => { setNotice(t('classes.leave.done', { name: entry.name })); classes.reload(); }} />
            ))
          ) : (
            <Panel title={t('classes.mine.title')}>
              <EmptyState title={t('classes.mine.emptyTitle')} body={t('classes.mine.emptyBody')} />
            </Panel>
          )}
        </div>

        <div className="en-stack">
          <JoinPanel onJoined={(name) => { setNotice(t('classes.join.done', { name })); classes.reload(); }} />

          <Panel title={t('classes.teaching.title')}>
            {activeTeaching.length ? (
              <ul className="en-list">
                {activeTeaching.map((entry) => (
                  <li key={entry.id}>
                    <Link className="en-item" to={`/classes/${entry.id}`}>
                      <span className="en-item-main">
                        <strong>{entry.name}</strong>
                        <span>{t('classes.teaching.students', { count: entry.students })}{entry.school_name ? ` · ${entry.school_name}` : ''}</span>
                      </span>
                      <span className="en-item-meta">
                        {entry.level ? <LevelBadge level={entry.level} muted /> : null}
                        {entry.join_code ? <span className="en-tag en-class-code-tag">{entry.join_code}</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="hint">{t('classes.teaching.empty')}</p>}
            <CreateClassForm caps={data.caps} teachingCount={activeTeaching.length} onCreated={() => { setNotice(t('classes.create.done')); classes.reload(); }} />
            {archived.length ? (
              <details className="en-class-done">
                <summary>{t('classes.teaching.archived', { count: archived.length })}</summary>
                <ul className="en-list">
                  {archived.map((entry) => (
                    <li key={entry.id}>
                      <Link className="en-item is-done" to={`/classes/${entry.id}`}>
                        <span className="en-item-main"><strong>{entry.name}</strong></span>
                        <span className="en-item-meta"><Tag>{t('classes.archived')}</Tag></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="hint">{t('classes.teaching.academyNote')}</p>
          </Panel>
        </div>
      </div>
    </>
  );
};
