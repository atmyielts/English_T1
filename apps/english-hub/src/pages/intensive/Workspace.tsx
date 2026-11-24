import { useEffect, useId, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { ApiError } from '../../lib/api';
import { skillByKey } from '../../lib/skills';
import { useResource } from '../../lib/useResource';
import { ErrorState, LevelBadge, Loading, LockedPanel, PageHeader, Panel, SkillDot, Tag } from '../../ui/kit';
import { intensiveBlocks, sessionMinutes, workFields, type IntensiveSkill, type Progress, type SaveAction } from '../../../../../supabase/functions/_shared/english-intensive';
import { loadIntensiveSession, saveIntensive, type Session } from './api';
import { MaterialPanels, Questions } from './StudyMaterial';
import './intensive.css';

const Studio = ({ data, skill, reload, reloading, reloadError }: {
  data: Session; skill: IntensiveSkill; reload: () => void; reloading: boolean; reloadError: unknown;
}) => {
  const t = useT();
  const [working, setWorking] = useState<Progress>(() => ({
    ...data.progress,
    answers: 'questions' in data.material ? data.material.questions.map((_, index) => data.progress.answers[index] ?? null) : [],
  }));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const workId = useId();
  const conflict = error instanceof ApiError && error.code === 'draft_conflict';
  const fields = workFields[skill];
  const isComplete = fields.every((field) => working.work[field]?.trim()) && working.answers.every((answer) => answer !== null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async (action: SaveAction) => {
    if (busy || conflict) return;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const response = await saveIntensive(data.unit.slug, skill, action, working);
      setWorking(response.progress);
      setDirty(false);
      setNotice(action === 'complete' ? 'intensive.complete' : 'intensive.saved');
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: `/intensive?level=${data.unit.level}&skill=${skill}`, label: t('intensive.title') }}
        eyebrow={<span className="en-row"><SkillDot skill={skill} />{t(`skill.${skill}`)}</span>}
        title={<span lang="en">{data.unit.title}</span>}
        lead={<span lang="en">{data.unit.summary}</span>}
        actions={<><LevelBadge level={data.unit.level} /><Tag>{t('intensive.suggested', { count: sessionMinutes(skill) })}</Tag></>}
      />
      <div className="intensive-studio">
        <Panel className="intensive-agenda" title={t('intensive.agenda')}>
          <ol>
            {intensiveBlocks[skill].map((minutes, index) => (
              <li key={index}>
                <strong>{t('common.minutesShort', { count: minutes })}</strong>
                <span>{t(`intensive.stage.${skill}.${index}`)}</span>
              </li>
            ))}
          </ol>
          <p className="hint">{t('intensive.ownPace')}</p>
        </Panel>
        <div className="intensive-studio-main">
          {data.guide ? <Panel title={t('intensive.focusTask')}><p lang="en">{data.guide}</p></Panel> : null}
          <MaterialPanels material={data.material} />
          {'questions' in data.material ? <Questions questions={data.material.questions} answers={working.answers}
            feedback={working.feedback} busy={busy || conflict} onCheck={() => void save('check')}
            onChange={(index, option) => {
              setWorking((previous) => ({ ...previous, answers: previous.answers.map((value, position) => position === index ? option : value), feedback: [] }));
              setDirty(true);
              setNotice('');
            }} /> : null}
          <Panel title={t('intensive.yourWork')}>
            <p className="hint">{t('intensive.saveHelp')}</p>
            {fields.map((field, index) => {
              const id = `${workId}-${field}`;
              return (
                <div className="intensive-field" key={field}>
                  <label htmlFor={id}>{t(`intensive.field.${skill}.${index}`)}</label>
                  <textarea className="en-writing" id={id} lang="en" value={working.work[field] ?? ''} disabled={busy}
                    maxLength={6000} rows={5} onChange={(event) => {
                      const value = event.currentTarget.value;
                      setWorking((previous) => ({ ...previous, work: { ...previous.work, [field]: value } }));
                      setDirty(true);
                      setNotice('');
                    }} />
                </div>
              );
            })}
            {conflict ? (
              <div className="error" role="alert">
                <p>{t('intensive.conflict')}</p>
                <button type="button" className="quiet" onClick={reload} disabled={reloading}>{t('intensive.loadSaved')}</button>
              </div>
            ) : error ? <ErrorState error={error} /> : null}
            {reloadError ? <ErrorState error={reloadError} /> : null}
            <div className="en-actions">
              <button type="button" className="quiet" disabled={busy || conflict || !dirty} onClick={() => void save('save')}>{t('intensive.save')}</button>
              <button type="button" disabled={busy || conflict || !isComplete || (working.completed && !dirty)} onClick={() => void save('complete')}>
                {t(working.completed ? 'intensive.finishRevision' : 'intensive.finish')}
              </button>
              <span className="hint" role="status">{notice ? t(notice) : dirty ? t('intensive.unsaved') : working.completed ? t('intensive.complete') : ''}</span>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
};

const Activity = ({ slug, skill }: { slug: string; skill: IntensiveSkill }) => {
  const t = useT();
  const { pricingHref, isPaused } = useEnglish();
  const resource = useResource((signal) => loadIntensiveSession(slug, skill, signal), [slug, skill]);
  const locked = resource.error instanceof ApiError && resource.error.code === 'intensive_entitlement';
  const paused = isPaused(skill) || (resource.error instanceof ApiError && resource.error.code === 'service_paused');
  const comingSoon = resource.error instanceof ApiError && resource.error.code === 'intensive_audio_soon';
  if (comingSoon) return <>
    <PageHeader back={{ to: '/intensive?skill=listening', label: t('intensive.title') }} title={t('intensive.audioSoon')} />
    <Panel><p>{t('intensive.audioSoonBody')}</p></Panel>
  </>;
  if (locked || paused) {
    return (
      <>
        <PageHeader back={{ to: '/intensive', label: t('intensive.title') }} title={t(`skill.${skill}`)} />
        {paused ? <Panel><p>{t('intensive.paused')}</p></Panel> : <LockedPanel skillName={t(`skill.${skill}`)} pricingHref={pricingHref(skill)} />}
      </>
    );
  }
  if (resource.data) return <Studio key={resource.data.progress.revision} data={resource.data} skill={skill}
    reload={resource.reload} reloading={resource.loading} reloadError={resource.error} />;
  if (resource.loading) return <Panel><Loading lines={5} /></Panel>;
  return resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : null;
};

export const IntensiveWorkspace = () => {
  const { slug, skill: segment } = useParams();
  const skill = skillByKey(segment)?.key;
  const { session } = useEnglish();
  if (!slug || !skill) return <Navigate to="/intensive" replace />;
  return <Activity key={`${session?.user.id}/${slug}/${skill}`} slug={slug} skill={skill} />;
};
