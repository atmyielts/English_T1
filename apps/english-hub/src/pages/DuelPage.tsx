import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ShareCardButton } from '../components/ShareCardButton';
import { useI18n, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { clockOffset, secondsLeftOn } from '../lib/duelClock';
import {
  answerDuel,
  createDuel,
  type DuelInvite,
  type DuelSummary,
  type DuelView,
  duelUrl,
  getDuel,
  joinDuel,
  listDuels,
  rematchDuel,
  startDuel,
} from '../lib/social';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, Loading, PageHeader, Panel } from '../ui/kit';
import '../components/social.css';

/** Learner-facing text for a duel error code from the hub. */
const useDuelError = () => {
  const t = useT();
  return (error: unknown): string | null => {
    if (!(error instanceof ApiError)) return null;
    switch (error.code) {
      case 'duel_paused': return t('social.duel.error.paused');
      case 'duel_limit': return t('social.duel.error.limit');
      case 'duel_no_words': return t('social.duel.error.noWords');
      case 'duel_not_found': return t('social.duel.error.notFound');
      case 'duel_expired': return t('social.duel.join.expired');
      case 'duel_taken': return t('social.duel.join.taken');
      case 'duel_own_duel': return t('social.duel.join.own');
      default: return null;
    }
  };
};

const DuelProblem = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => {
  const message = useDuelError()(error);
  return message ? <p className="en-error" role="alert">{message}</p> : <ErrorState error={error} onRetry={onRetry} />;
};

const SummaryLine = ({ duel }: { duel: DuelSummary }) => {
  const t = useT();
  const name = duel.opponent_name || t('social.duel.friend');
  if (duel.status === 'finished' && duel.outcome) {
    return <small>{t(`social.duel.outcome.${duel.outcome}`)}</small>;
  }
  if (duel.status === 'expired') return <small>{t('social.duel.status.expired')}</small>;
  return <small>{duel.next ? t(`social.duel.next.${duel.next}`, { name }) : ''}</small>;
};

/** /duel — challenge a friend, and the learner's last duels. */
export const DuelsPage = () => {
  const t = useT();
  const { locale, date } = useI18n();
  const navigate = useNavigate();
  const duels = useResource((signal) => listDuels(signal), []);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const created = await createDuel(locale);
      navigate(`/duel/${created.code}`);
    } catch (cause) {
      setError(cause);
      setCreating(false);
    }
  };

  const list = duels.data?.duels ?? [];
  return (
    <>
      <PageHeader
        eyebrow={t('social.duel.eyebrow')}
        title={t('social.duel.title')}
        lead={t('social.duel.lead')}
        actions={<button type="button" className="is-large" onClick={() => void create()} disabled={creating}>{creating ? t('social.duel.creating') : t('social.duel.create')}</button>}
      />
      {error ? <DuelProblem error={error} /> : null}
      <div className="en-grid-2">
        <Panel title={t('social.duel.history')}>
          {duels.loading && !duels.data ? <Loading lines={3} /> : duels.error ? <ErrorState error={duels.error} onRetry={duels.reload} /> : list.length ? (
            <ul className="en-duel-list">
              {list.map((duel) => (
                <li key={duel.code} className="en-duel-item">
                  <div>
                    <strong>{duel.opponent_name ? t('social.duel.vs', { name: duel.opponent_name }) : t('social.duel.next.wait_join')}</strong>
                    <SummaryLine duel={duel} />
                    <small>{date(duel.created_at, { dateStyle: 'medium' })}</small>
                  </div>
                  <div className="en-row">
                    {duel.status === 'finished' && duel.my_correct !== null ? (
                      <span className="en-duel-score" aria-label={`${duel.my_correct} : ${duel.their_correct ?? '–'}`}>{duel.my_correct} : {duel.their_correct ?? '–'}</span>
                    ) : null}
                    <Link className="en-button-quiet" to={`/duel/${duel.code}`}>{duel.next === 'play' ? t('social.duel.next.play') : t('social.duel.open')}</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t('social.duel.empty')} />}
        </Panel>
        <Panel>
          <ul className="en-duel-rules">
            <li>{t('social.duel.rule1')}</li>
            <li>{t('social.duel.rule2')}</li>
            <li>{t('social.duel.rule3')}</li>
            <li>{t('social.duel.rule4')}</li>
          </ul>
          <p className="hint">{t('social.duel.invite.bot')}</p>
        </Panel>
      </div>
    </>
  );
};

const InvitePanel = ({ code }: { code: string }) => {
  const t = useT();
  const url = duelUrl(code);
  const text = t('social.duel.invite.shareText');
  const field = useRef<HTMLInputElement>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopy('copied');
    } catch {
      field.current?.select();
      setCopy('failed');
    }
  };
  return (
    <Panel title={t('social.duel.invite.title')} tone="lime">
      <p>{t('social.duel.invite.body')}</p>
      <label htmlFor="en-duel-link">{t('social.duel.invite.link')}</label>
      <input id="en-duel-link" ref={field} className="en-duel-link" readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
      <div className="en-actions">
        <button type="button" onClick={() => void copyLink()}>{t('social.duel.invite.copy')}</button>
        <a className="en-button-quiet" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          {t('social.duel.invite.telegram')}
        </a>
        {canShare ? <button type="button" className="quiet" onClick={() => void navigator.share({ text, url }).catch(() => undefined)}>{t('social.duel.invite.native')}</button> : null}
      </div>
      <p className="hint" role="status" aria-live="polite">{copy === 'copied' ? t('social.duel.invite.copied') : copy === 'failed' ? t('social.duel.invite.copyFailed') : ''}</p>
    </Panel>
  );
};

const JoinPanel = ({ code, invite, onJoined }: { code: string; invite: DuelInvite; onJoined: (view: DuelView) => void }) => {
  const t = useT();
  const { locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (invite.status !== 'open') {
    return <Panel><p>{invite.status === 'expired' ? t('social.duel.join.expired') : t('social.duel.join.taken')}</p><Link className="en-button" to="/duel">{t('social.duel.create')}</Link></Panel>;
  }
  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      onJoined((await joinDuel(code, locale)).view);
    } catch (cause) {
      setError(cause);
      setBusy(false);
    }
  };
  return (
    <Panel tone="lime">
      <p className="eyebrow">{t('social.duel.eyebrow')}</p>
      <h2>{invite.inviter_name ? t('social.duel.join.title', { name: invite.inviter_name }) : t('social.duel.join.titleAnon')}</h2>
      <p>{t('social.duel.join.body')}</p>
      <div className="en-actions"><button type="button" className="is-large" onClick={() => void accept()} disabled={busy}>{t('social.duel.join.accept')}</button></div>
      {error ? <DuelProblem error={error} /> : null}
    </Panel>
  );
};

/** The running question with the server-driven timer. */
const PlayPanel = ({ view, onView }: { view: DuelView; onView: (view: DuelView) => void }) => {
  const t = useT();
  const offset = useRef(clockOffset(view.server_now));
  const [left, setLeft] = useState(() => secondsLeftOn(view.me.deadline_at, offset.current));
  const [picked, setPicked] = useState<{ choice: number; correctIndex: number | null; correct: boolean | null } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const question = view.question!;
  const settling = useRef(false);

  useEffect(() => {
    offset.current = clockOffset(view.server_now);
  }, [view.server_now]);

  useEffect(() => {
    const timer = window.setInterval(() => setLeft(secondsLeftOn(view.me.deadline_at, offset.current)), 250);
    return () => window.clearInterval(timer);
  }, [view.me.deadline_at]);

  // When the clock runs out, ask the server where things stand (it decides).
  useEffect(() => {
    if (left > 0 || settling.current) return;
    settling.current = true;
    const timer = window.setTimeout(() => {
      getDuel(view.code).then((response) => { if (response.duel) onView(response.duel); }).catch(setError);
    }, 2_800);
    return () => window.clearTimeout(timer);
  }, [left, onView, view.code]);

  const answer = async (choice: number) => {
    if (picked) return;
    setPicked({ choice, correctIndex: null, correct: null });
    setError(null);
    try {
      const response = await answerDuel(view.code, question.index, choice);
      setPicked({ choice, correctIndex: response.correct_index, correct: response.correct });
      window.setTimeout(() => {
        setPicked(null);
        onView(response.view);
      }, response.accepted ? 450 : 0);
    } catch (cause) {
      setPicked(null);
      setError(cause);
    }
  };

  return (
    <Panel>
      <div className="en-duel-stage">
        <div className="en-duel-bar">
          <span className="hint">{t('social.duel.play.progress', { index: question.index + 1, total: question.total })}</span>
          <span className={`en-duel-timer ${left <= 10 ? 'is-low' : ''}`.trim()} role="timer" aria-label={t('social.duel.play.timerLabel')}>
            {left > 0 ? t('social.duel.play.timer', { count: left }) : t('social.duel.play.timeUp')}
          </span>
        </div>
        <div>
          <p className="hint" style={{ margin: 0 }}>{t('social.duel.play.prompt')}</p>
          <p className="en-duel-prompt" lang="en">{question.prompt}</p>
        </div>
        <div className="en-duel-options">
          {question.options.map((option, index) => {
            const state = picked?.correctIndex === null || !picked ? '' : index === picked.correctIndex ? 'is-right' : index === picked.choice ? 'is-wrong' : '';
            return (
              <button key={`${question.index}-${index}`} type="button" lang="en" className={state} disabled={Boolean(picked) || left <= 0} onClick={() => void answer(index)}>
                {option}
              </button>
            );
          })}
        </div>
        <p className="en-duel-feedback" role="status" aria-live="polite">
          {picked?.correct === true ? t('social.duel.play.right') : picked?.correct === false && picked.correctIndex !== null ? t('social.duel.play.wrong', { word: question.options[picked.correctIndex] ?? '' }) : ''}
        </p>
        {error ? <ErrorState error={error} /> : null}
      </div>
    </Panel>
  );
};

const ResultPanel = ({ view }: { view: DuelView }) => {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const name = view.opponent_name || t('social.duel.friend');
  const outcome = view.me.outcome ?? 'draw';
  const theirs = view.opponent?.correct;

  const rematch = async () => {
    setBusy(true);
    setError(null);
    try {
      navigate(`/duel/${(await rematchDuel(view.code, locale)).code}`);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel tone={outcome === 'win' || outcome === 'walkover' ? 'lime' : undefined}>
        <h2 style={{ marginTop: 0 }}>{t(`social.duel.result.${outcome}`, { name })}</h2>
        <div className="en-duel-vs">
          <div><strong>{view.me.correct}</strong><small>{t('social.duel.result.you')}</small></div>
          <span aria-hidden="true">:</span>
          <div><strong>{theirs ?? '–'}</strong><small>{name}</small></div>
        </div>
        {view.me.xp > 0 ? <p className="en-notice">{t('social.duel.result.xp', { xp: view.me.xp })}</p> : null}
        <div className="en-actions">
          {view.rematch_code ? (
            <Link className="en-button" to={`/duel/${view.rematch_code}`}>{t('social.duel.result.openRematch')}</Link>
          ) : view.can_rematch ? (
            <button type="button" onClick={() => void rematch()} disabled={busy}>{t('social.duel.result.rematch')}</button>
          ) : null}
          <Link className="en-button-quiet" to="/duel">{t('social.duel.result.new')}</Link>
          {view.me.answered > 0 ? (
            <ShareCardButton
              card={{
                kind: 'duel',
                label: t('social.card.duel.label'),
                big: `${view.me.correct}/10`,
                headline: outcome === 'win' || outcome === 'walkover' ? t('social.card.duel.win') : outcome === 'draw' ? t('social.card.duel.draw') : t('social.card.duel.played'),
                detail: t('social.card.duel.detail', { count: view.me.correct }),
              }}
            />
          ) : null}
        </div>
        {error ? <DuelProblem error={error} /> : null}
      </Panel>
      {view.review?.length ? (
        <Panel title={t('social.duel.review.title')}>
          <ol className="en-duel-review">
            {view.review.map((item, index) => (
              <li key={index}>
                <span lang="en">{item.prompt}</span>
                <strong lang="en">{item.options[item.correct_index]}</strong>
                <small>
                  {t('social.duel.result.you')}:{' '}
                  <span className={item.mine === item.correct_index ? 'en-duel-mark-right' : 'en-duel-mark-wrong'}>{item.mine === null ? '—' : item.options[item.mine]}</span>
                  {' · '}{t('social.duel.review.theirs', { name })}:{' '}
                  <span className={item.theirs === item.correct_index ? 'en-duel-mark-right' : 'en-duel-mark-wrong'}>{item.theirs === null ? '—' : item.options[item.theirs]}</span>
                </small>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </>
  );
};

/** /duel/:code — invite, join, play and result for one duel. */
export const DuelPage = () => {
  const t = useT();
  const { locale } = useI18n();
  const { code = '' } = useParams();
  const [view, setView] = useState<DuelView | null>(null);
  const [invite, setInvite] = useState<DuelInvite | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await getDuel(code, signal);
      setView(response.duel);
      setInvite(response.invite ?? null);
      setError(null);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    setLoading(true);
    setView(null);
    setInvite(null);
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // While waiting for the friend, check now and then.
  const waiting = Boolean(view && ((view.status === 'open' && view.role === 'creator') || (view.status === 'active' && view.me.finished)));
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 6_000);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      setView((await startDuel(code, locale)).view);
    } catch (cause) {
      setError(cause);
    } finally {
      setStarting(false);
    }
  };

  const name = view?.opponent_name || t('social.duel.friend');
  let body: ReactNode = null;
  if (loading && !view && !invite) body = <Panel><Loading lines={4} /></Panel>;
  else if (!view && invite) body = <JoinPanel code={code} invite={invite} onJoined={setView} />;
  else if (view?.status === 'open') body = <InvitePanel code={view.code} />;
  else if (view?.status === 'expired') body = <Panel><p>{t('social.duel.join.expired')}</p><Link className="en-button" to="/duel">{t('social.duel.create')}</Link></Panel>;
  else if (view?.status === 'finished') body = <ResultPanel view={view} />;
  else if (view && view.question) body = <PlayPanel key={view.me.deadline_at ?? 'play'} view={view} onView={setView} />;
  else if (view && view.me.finished) {
    body = (
      <Panel>
        <h2 style={{ marginTop: 0 }}>{t('social.duel.done.title', { count: view.me.correct })}</h2>
        <p>{t('social.duel.done.waiting', { name })}</p>
        <Link className="en-button-quiet" to="/duel">{t('social.duel.back')}</Link>
      </Panel>
    );
  } else if (view) {
    body = (
      <Panel tone="lime">
        <h2 style={{ marginTop: 0 }}>{t('social.duel.ready.title', { name })}</h2>
        <p>{t('social.duel.ready.body')}</p>
        <div className="en-actions"><button type="button" className="is-large" onClick={() => void start()} disabled={starting}>{t('social.duel.ready.start')}</button></div>
      </Panel>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={t('social.duel.eyebrow')}
        title={view?.opponent_name ? t('social.duel.ready.title', { name: view.opponent_name }) : t('social.duel.title')}
        back={{ to: '/duel', label: t('social.duel.back') }}
      />
      {error && !view && !invite ? <DuelProblem error={error} onRetry={() => void load()} /> : null}
      {body}
      {error && (view || invite) ? <DuelProblem error={error} /> : null}
    </>
  );
};
