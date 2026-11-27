import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { ServicePaused } from '../components/ServicePaused';
import { useI18n, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { invalidateNext } from '../lib/engine';
import { articleTransfer, getTransfer, submitTransfer, timeReferenceTransfer, type TransferPath, type TransferTask } from '../lib/transfer';
import { useResource } from '../lib/useResource';
import { ErrorState, LevelBadge, Loading, LockedPanel, PageHeader, Panel, Tag } from '../ui/kit';
import { SpeakingTransferBrief } from './SpeakingTransferBrief';
import './mastery.css';

const WriteBrief = ({ task, onSubmit, busy }: {
  task: TransferTask;
  onSubmit: (responses: string[]) => void;
  busy: boolean;
}) => {
  const t = useT();
  const [responses, setResponses] = useState<string[]>(() => task.prompts.map(() => ''));
  return (
    <Panel title={<span lang="en">{task.title}</span>}>
      <p lang="en">{task.brief}</p>
      <form onSubmit={(event) => { event.preventDefault(); if (!busy) onSubmit(responses); }}>
        {task.prompts.map((prompt, position) => (
          <label className="mastery-answer mastery-question" key={prompt}>
            <strong lang="en">{prompt}</strong>
            <textarea rows={2} lang="en" spellCheck={false} minLength={4} maxLength={400}
              required disabled={busy} value={responses[position] ?? ''}
              onChange={(event) => setResponses((list) => list.map((text, index) => index === position ? event.target.value : text))} />
          </label>
        ))}
        <button className="en-button" disabled={busy || responses.some((text) => text.trim().length < 4)}>
          {t(busy ? 'common.loading' : 'transfer.submit')}
        </button>
      </form>
    </Panel>
  );
};

const WritingEvidence = ({ data, receipt }: { data: TransferPath; receipt: string | null }) => {
  const { t, date } = useI18n();
  const baseline = data.history.find((entry) => entry.stage === 1 && entry.opportunities === 3);
  const retained = data.history.filter((entry) => entry.stage > 1 && entry.opportunities === 3);
  const spoken = data.skill === 'speaking';
  if (!data.history.length) return null;
  return (
    <Panel title={t('mastery.history')}>
      {baseline && retained.length ? (
        <table className="mastery-transfer-comparison">
          <thead><tr><th scope="col">{t(spoken ? 'transfer.speech.sample' : 'transfer.sample')}</th><th scope="col">{t(spoken ? 'transfer.speech.errors' : 'transfer.observedErrors')}</th></tr></thead>
          <tbody>
            {[baseline, ...retained].map((row) => (
              <tr key={row.family}><th scope="row">{t(`${spoken ? 'transfer.speech.stage' : 'transfer.stage'}.${row.stage}`)}</th><td>{row.errors} / {row.opportunities}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {[...data.history].reverse().map((entry) => (
        <details className="mastery-evidence" key={entry.family} open={entry.family === receipt || undefined}>
          <summary>
            <strong lang="en">{entry.title}</strong>{' · '}{t(`${spoken ? 'transfer.speech.stage' : 'transfer.stage'}.${entry.stage}`)}
            <time dateTime={entry.checked_at}>{date(entry.checked_at)}</time>
          </summary>
          <p>{entry.opportunities === 3
            ? t(spoken ? 'transfer.speech.result' : 'transfer.result', { errors: entry.errors, total: entry.opportunities })
            : t('transfer.inconclusive', { total: entry.opportunities })}</p>
          <ol className="mastery-feedback">
            {entry.feedback.map((row) => (
              <li key={row.prompt}>
                <strong lang="en">{row.prompt}</strong>
                <span lang="en">{row.response}</span>
                <span>{t(`${spoken ? 'transfer.speech.verdict' : 'transfer.verdict'}.${row.verdict}`)}</span>
                {row.model ? <span>{t('mastery.model')}{' '}<span lang="en">{row.model}</span></span> : null}
                {row.explanation ? <p lang="en">{row.explanation}</p> : null}
              </li>
            ))}
          </ol>
        </details>
      ))}
    </Panel>
  );
};

const TransferWorkspace = ({ slug }: { slug: string }) => {
  const { t, date } = useI18n();
  const { pricingHref } = useEnglish();
  const resource = useResource((signal) => getTransfer(slug, signal), [slug]);
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof getTransfer>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const sent = useRef<Parameters<typeof submitTransfer>[1] | null>(null);
  const display = saved ?? resource.data;
  const path = display?.pathway;
  const spoken = path?.skill === 'speaking' || slug === timeReferenceTransfer.slug;
  const openLabel = spoken ? 'transfer.speech.open' : 'transfer.open';
  const returnHref = spoken ? timeReferenceTransfer.href : articleTransfer.href;
  const stageKey = spoken ? 'transfer.speech.stage' : 'transfer.stage';
  const stageChanged = failure instanceof ApiError && failure.status === 409;

  const reload = () => {
    setSaved(null);
    setFailure(null);
    sent.current = null;
    resource.reload();
  };

  const submit = async (responses: string[]) => {
    if (busy || !path?.task) return;
    const previous = sent.current;
    const request = previous?.responses.every((response, index) => response === responses[index])
      ? previous
      : {
        request_id: crypto.randomUUID(), responses, family: path.task.family,
        input_mode: spoken ? 'confirmed_transcript' as const : 'text' as const,
      };
    sent.current = request;
    setBusy(true);
    setFailure(null);
    try {
      setSaved(await submitTransfer(slug, request));
      sent.current = null;
      invalidateNext();
    } catch (cause) {
      setFailure(cause);
    } finally {
      setBusy(false);
    }
  };

  const errorCode = resource.error instanceof ApiError ? resource.error.code : null;
  const locked = errorCode === 'writing_entitlement' ? 'writing' : errorCode === 'speaking_entitlement' ? 'speaking'
    : errorCode === 'mastery_entitlement' ? 'grammar' : null;
  const paused = errorCode === 'writing_paused' ? 'writing' : errorCode === 'speaking_paused' ? 'speaking'
    : errorCode === 'service_paused' ? 'grammar' : null;
  const last = path?.history.at(-1);
  return (
    <>
      <PageHeader
        back={{ to: '/mastery', label: t('mastery.title') }}
        title={path ? <span lang="en">{path.title}</span> : t(openLabel)}
        lead={path ? <span lang="en">{path.goal}</span> : undefined}
        actions={path ? <><LevelBadge level={path.level} /><Tag>{t(`${stageKey}.${path.stage}`)}</Tag></> : undefined}
      />
      {locked ? <LockedPanel skillName={t(`skill.${locked}`)} pricingHref={pricingHref(locked)} />
        : paused ? <ServicePaused service={paused} />
          : resource.error ? <ErrorState error={resource.error} onRetry={reload} /> : null}
      {resource.loading && !path ? <Loading lines={4} /> : null}
      {!resource.error && path ? (
        <>
          {path.source ? (
            <Panel title={t('transfer.source')}>
              <p>{t('transfer.sourceLead')}</p>
              <p lang="en"><q>{path.source.original}</q>{' → '}<q>{path.source.suggestion}</q></p>
            </Panel>
          ) : null}
          {path.status === 'grammar' ? (
            <Panel title={t('transfer.grammar')}>
              <p>{t(spoken ? 'transfer.speech.grammarLead' : 'transfer.grammarLead')}</p>
              <div className="en-actions">
                <Link className="en-button" to={`/mastery/${path.competency_slug}`} state={{ transferHref: returnHref }}>{t('mastery.openTopic')}</Link>
                <Link className="en-button-quiet" to={path.practice_path}>{t('mastery.lesson')}</Link>
                <button className="en-button-quiet" onClick={reload}>{t('mastery.refresh')}</button>
              </div>
            </Panel>
          ) : null}
          {path.status === 'waiting' && path.due_at ? (
            <Panel title={t('mastery.status.waiting', { date: date(path.due_at) })}>
              <p>{t('transfer.waiting')}</p>
              <button className="en-button-quiet" onClick={reload}>{t('mastery.refresh')}</button>
            </Panel>
          ) : null}
          {path.status === 'complete' ? <Panel title={t(spoken ? 'transfer.speech.complete' : 'transfer.complete')}>
            <p>{t(spoken ? 'transfer.speech.completeLead' : 'transfer.completeLead')}</p>
          </Panel> : null}
          {path.status === 'insufficient_evidence' ? (
            <Panel title={t('transfer.insufficient')}>
              <p>{t(spoken ? 'transfer.speech.insufficientLead' : 'transfer.insufficientLead')}</p>
              <Link className="en-button-quiet" to={path.practice_path}>{t('mastery.lesson')}</Link>
            </Panel>
          ) : null}
          {last && last.opportunities < 3 && path.task ? <p className="en-notice" role="status">{t(spoken ? 'transfer.speech.tryAnother' : 'transfer.tryAnother')}</p> : null}
          {path.task && !stageChanged ? (
            spoken ? <SpeakingTransferBrief key={path.task.family} task={path.task} onSubmit={submit} busy={busy} />
              : <WriteBrief key={path.task.family} task={path.task} onSubmit={submit} busy={busy} />
          ) : null}
          {failure ? <ErrorState error={failure} onRetry={stageChanged ? reload : undefined} /> : null}
          <WritingEvidence data={path} receipt={display?.receipt ?? null} />
        </>
      ) : null}
    </>
  );
};

export const TransferPage = () => {
  const { slug = '' } = useParams();
  const { session } = useEnglish();
  return <TransferWorkspace key={`${session?.user.id}/${slug}`} slug={slug} />;
};
