import { useId, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { ServicePaused } from '../components/ServicePaused';
import { useI18n, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { getCompetencies, getCompetency, submitCheck, type Batch, type Competency, type Evidence } from '../lib/mastery';
import { useResource } from '../lib/useResource';
import { ErrorState, LevelBadge, Loading, LockedPanel, PageHeader, Panel, Tag } from '../ui/kit';
import './mastery.css';

const CheckStatus = ({ entry }: { entry: Competency }) => {
  const { t, date } = useI18n();
  return <Tag>{t(`mastery.status.${entry.status}`, { date: entry.due_at ? date(entry.due_at) : '' })}</Tag>;
};

const CheckError = ({ error, reload }: { error: unknown; reload: () => void }) => {
  const t = useT();
  const { pricingHref } = useEnglish();
  if (error instanceof ApiError && error.code === 'mastery_entitlement') {
    return <LockedPanel skillName={t('skill.grammar')} pricingHref={pricingHref('grammar')} />;
  }
  if (error instanceof ApiError && error.code === 'service_paused') return <ServicePaused service="grammar" />;
  return <ErrorState error={error} onRetry={reload} />;
};

const Catalog = () => {
  const t = useT();
  const list = useResource(getCompetencies, []);
  const entries = list.data?.competencies ?? [];
  return (
    <>
      <PageHeader back={{ to: '/grammar', label: t('skill.grammar') }} title={t('mastery.title')} lead={t('mastery.lead')} />
      {list.error ? <CheckError error={list.error} reload={list.reload} /> : null}
      {list.loading && !list.data ? <Loading lines={5} /> : null}
      <div className="en-grid-2">
        {entries.map((entry) => (
          <Panel key={entry.slug} title={<span lang="en">{entry.title}</span>} aside={<LevelBadge level={entry.level} />}>
            <p lang="en">{entry.goal}</p>
            <div className="en-actions">
              <CheckStatus entry={entry} />
              <Link className="en-button-quiet" to={`/mastery/${entry.slug}`} aria-label={`${t('mastery.openTopic')} · ${entry.title}`}>
                {t('mastery.openTopic')}
              </Link>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
};

const CheckForm = ({
  batch, submit, locked, busy,
}: {
  batch: Batch;
  submit: (answers: (string | number)[]) => void;
  locked: boolean;
  busy: boolean;
}) => {
  const t = useT();
  const id = useId();
  const [answers, setAnswers] = useState<(string | number | null)[]>(() => batch.questions.map(() => null));
  const canSubmit = answers.every((value) => typeof value === 'number' || Boolean(value?.trim()));
  const setAnswer = (position: number, answer: string | number) =>
    setAnswers((existing) => existing.map((value, index) => index === position ? answer : value));
  return (
    <form onSubmit={(event: FormEvent) => {
      event.preventDefault();
      if (!busy && canSubmit) submit(answers as (string | number)[]);
    }}>
      <Panel title={t(`mastery.phase.${batch.phase}`)}>
        {batch.questions.map((question, index) => (
          <fieldset className="mastery-question" key={question.prompt} disabled={locked || busy}>
            <legend lang="en">{question.prompt}</legend>
            {question.options ? question.options.map((option, choice) => (
              <label className="mastery-choice" key={option} lang="en">
                <input type="radio" name={`${id}-${index}`} value={choice} checked={answers[index] === choice}
                  onChange={() => setAnswer(index, choice)} />
                <span>{option}</span>
              </label>
            )) : (
              <label className="mastery-answer">
                <span>{t('mastery.answer')}</span>
                <input lang="en" value={String(answers[index] ?? '')} maxLength={160} autoComplete="off"
                  autoCapitalize="off" spellCheck={false} onChange={(event) => setAnswer(index, event.target.value)} />
              </label>
            )}
          </fieldset>
        ))}
        <button className="en-button" disabled={!canSubmit || busy} type="submit">
          {t(busy ? 'common.loading' : locked ? 'common.retry' : 'mastery.submit')}
        </button>
      </Panel>
    </form>
  );
};

const CheckEvidence = ({ history, expanded }: { history: Evidence[]; expanded: Evidence | undefined }) => {
  const { t, date } = useI18n();
  if (!history.length) return null;
  return (
    <Panel title={t('mastery.history')}>
      {[...history].reverse().map((entry) => (
        <details className="mastery-evidence" key={`${entry.phase}-${entry.round}`} open={entry === expanded || undefined}>
          <summary>
            <strong>{t('mastery.feedback', { phase: t(`mastery.phase.${entry.phase}`), correct: entry.correct, total: entry.total })}</strong>
            <time dateTime={entry.checked_at}>{date(entry.checked_at)}</time>
          </summary>
          <ol className="mastery-feedback">
            {entry.feedback.map((row) => (
              <li key={row.prompt}>
                <strong lang="en">{row.prompt}</strong>
                <span>{t('mastery.answer')}{' '}<span lang="en">{row.response}</span></span>
                {!row.correct ? <span>{t('mastery.model')}{' '}<span lang="en">{row.model}</span></span> : null}
                <p lang="en">{row.explanation}</p>
              </li>
            ))}
          </ol>
        </details>
      ))}
    </Panel>
  );
};

const Check = ({ slug }: { slug: string }) => {
  const t = useT();
  const resource = useResource((signal) => getCompetency(slug, signal), [slug]);
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof getCompetency>> | null>(null);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<Parameters<typeof submitCheck>[1] | null>(null);
  const [sending, setSending] = useState(false);
  const data = (saved ?? resource.data)?.competency;
  const batch = data?.batch;
  const result = saved?.receipt && data?.history.find((entry) =>
    entry.phase === saved.receipt?.phase && entry.round === saved.receipt.round);
  const changed = error instanceof ApiError && error.status === 409;
  const badAnswers = error instanceof ApiError && error.status === 422;
  const transferReady = batch?.phase === 'transfer' && !openTransfer;
  const lastCheck = data?.history.at(-1);
  const waitingAfterMiss = data?.status === 'waiting' && lastCheck?.phase === 'retention' && lastCheck.correct < lastCheck.total;

  const reload = () => {
    setSaved(null);
    setError(null);
    setOpenTransfer(false);
    setSending(false);
    pending.current = null;
    resource.reload();
  };

  const submit = async (answers: (number | string)[]) => {
    if (!batch || busy) return;
    const request = pending.current ?? { phase: batch.phase, round: batch.round, request_id: crypto.randomUUID(), answers };
    pending.current = request;
    setSending(true);
    setBusy(true);
    setError(null);
    try {
      setSaved(await submitCheck(slug, request));
      setOpenTransfer(false);
      pending.current = null;
      setSending(false);
    } catch (cause) {
      setError(cause);
      if (cause instanceof ApiError && cause.status === 422) {
        pending.current = null;
        setSending(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const showBatch = batch && !changed && !resource.loading && !transferReady;
  return (
    <>
      <PageHeader back={{ to: '/mastery', label: t('mastery.title') }} title={data ? <span lang="en">{data.title}</span> : t('mastery.title')}
        lead={data ? <span lang="en">{data.goal}</span> : undefined}
        actions={data ? <><LevelBadge level={data.level} /><CheckStatus entry={data} /></> : undefined} />
      {resource.error ? <CheckError error={resource.error} reload={reload} /> : null}
      {resource.loading && !data ? <Loading lines={4} /> : null}
      {!resource.error && !resource.loading && data ? (
        <>
          {data.status === 'waiting' ? (
            <Panel>
              <p>{t('mastery.early')}</p>
              <button className="en-button-quiet" onClick={reload}>{t('mastery.refresh')}</button>
            </Panel>
          ) : null}
          {data.status === 'demonstrated' ? <Panel tone="lime"><p>{t('mastery.demonstrated')}</p></Panel> : null}
          {result || transferReady || !batch ? <CheckEvidence history={data.history} expanded={result || (transferReady ? lastCheck : undefined)} /> : null}
          {data.guide && (transferReady || waitingAfterMiss || data.status === 'needs_practice') ? (
            <Panel title={t('mastery.focus')}>
              {data.status === 'needs_practice' ? <p>{t('mastery.exhausted')}</p> : null}
              <p lang="en">{data.guide}</p>
              <div className="en-actions">
                <Link className="en-button-quiet" to={data.practice_path} state={{ masterySlug: slug }}>{t('mastery.lesson')}</Link>
                {transferReady ? <button className="en-button" onClick={() => setOpenTransfer(true)}>{t('mastery.startTransfer')}</button> : null}
              </div>
            </Panel>
          ) : null}
          {showBatch ? <CheckForm key={`${batch.phase}-${batch.round}`} batch={batch} submit={submit} locked={sending} busy={busy} /> : null}
          {changed ? (
            <div className="error en-error" role="alert">
              <span>{t('mastery.changed')}</span>
              <button className="quiet" onClick={reload}>{t('mastery.refresh')}</button>
            </div>
          ) : badAnswers ? <p className="error en-error" role="alert">{t('mastery.badAnswers')}</p>
            : error ? <ErrorState error={error} /> : null}
        </>
      ) : null}
    </>
  );
};

export const MasteryPage = () => {
  const { slug } = useParams();
  const { session } = useEnglish();
  const user = session?.user.id;
  return slug ? <Check key={`${user}/${slug}`} slug={slug} /> : <Catalog key={user} />;
};
