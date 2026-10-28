import { Bookmark, BookmarkCheck, Calculator, ChevronLeft, ChevronRight, Eye, EyeOff, Grid3x3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CalculatorPanel } from "../components/CalculatorPanel";
import { PracticeTopNav } from "../components/PracticeTopNav";
import { isAnswered, QuestionCard } from "../components/QuestionCard";
import { type Attempt, attemptGet, attemptSubmit, type SatQuestion, type Selection } from "../lib/api";
import { useAccess } from "../lib/useAccess";
import { supabase } from "../lib/supabase";
import { acknowledgeStart } from '../lib/start-requests';
import { sectionLabel } from "../lib/labels";
import { useAppT, useErrorText } from "../i18n";

export const LabPage = () => {
  const t = useAppT();
  const { attemptId } = useParams<{ attemptId: string }>();
  const { accessToken, userId } = useAccess();
  if (!accessToken || !userId || !attemptId) {
    return (
      <div className="app-shell">
        <PracticeTopNav />
        <main className="workspace narrow">
          <p role="status">{t('lab.signIn')}</p>
        </main>
      </div>
    );
  }
  return <LabWorkspace key={userId + ":" + attemptId} accessToken={accessToken} userId={userId} attemptId={attemptId} />;
};

const readJson = <T,>(key: string, fallback: T): T => {
  try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
};
const writeJson = (key: string, value: unknown) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* best effort only */ } };
const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const LabWorkspace = ({ accessToken, userId, attemptId }: { accessToken: string; userId: string; attemptId: string }) => {
  const t = useAppT();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const location = useLocation();
  const selection = (location.state as { selection?: Selection | null } | null)?.selection ?? null;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<SatQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [pending, setPending] = useState(false), [reload, setReload] = useState(0);
  const [current, setCurrent] = useState(() => readJson<number>("schood.sat-attempt.index." + attemptId, 0));
  const [flags, setFlags] = useState<string[]>(() => readJson<string[]>("schood.sat-attempt.flags." + attemptId, []));
  const [showNavigator, setShowNavigator] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const busy = useRef(false), pendingAnswers = useRef<Record<string, unknown> | null>(null), token = useRef(accessToken), mounted = useRef(true), autoSubmitted = useRef(false);
  token.current = accessToken;
  const storageKey = "schood.sat-attempt.pending." + userId + "." + attemptId;
  const isDone = attempt?.status === "scored";
  const filters = (attempt?.filters_used ?? {}) as Record<string, unknown>;
  const isModule = filters.mode === "module";
  const timeLimit = isModule && typeof filters.time_limit_seconds === "number" ? filters.time_limit_seconds : null;
  const requested = typeof filters.requested_count === "number" ? filters.requested_count : null;
  const hasMath = questions.some(q => q.section_type === "math");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { writeJson("schood.sat-attempt.index." + attemptId, current); }, [attemptId, current]);
  useEffect(() => { writeJson("schood.sat-attempt.flags." + attemptId, flags); }, [attemptId, flags]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    attemptGet(token.current, attemptId).then((res) => {
      if (cancelled) return;
      try { acknowledgeStart(sessionStorage, userId, res.attempt.id); } catch {
        // Browser privacy settings may deny even obtaining the storage object.
      }
      setAttempt(res.attempt);
      setQuestions(res.questions);
      let saved: Record<string, unknown> | null = null;
      if (res.attempt.status === "scored") {
        try { sessionStorage.removeItem(storageKey); } catch { /* A saved server receipt remains authoritative. */ }
        pendingAnswers.current = null; setPending(false);
      } else {
        saved = readJson<Record<string, unknown> | null>(storageKey, null);
        if (saved && (typeof saved !== "object" || Array.isArray(saved))) saved = null;
        pendingAnswers.current = saved; setPending(saved !== null);
      }
      setAnswers(saved ?? readJson<Record<string, unknown>>("schood.sat-attempt.draft." + attemptId, res.attempt.answers ?? {}));
    }).catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attemptId, userId, reload, storageKey]);
  // Unsent answers survive a reload of this tab.
  useEffect(() => { if (!isDone && !pendingAnswers.current && Object.keys(answers).length) writeJson("schood.sat-attempt.draft." + attemptId, answers); }, [answers, attemptId, isDone]);
  useEffect(() => {
    if (!timeLimit || isDone) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timeLimit, isDone]);
  const remaining = timeLimit && attempt ? timeLimit - (now - Date.parse(attempt.started_at)) / 1000 : null;
  const answered = useMemo(() => questions.filter(q => isAnswered(answers[q.id])).length, [answers, questions]);

  const submit = async (force = false) => {
    if (busy.current || isDone || !attempt || questions.length === 0) return;
    if (!force && answered < questions.length && !confirming && !pendingAnswers.current) { setConfirming(true); return; }
    setConfirming(false);
    busy.current = true; setSending(true); setError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session || session.user.id !== userId) throw new Error("account_changed");
      if (!pendingAnswers.current) {
        // Persist the exact payload before sending so an uncertain reply can be
        // retried after a reload without changing the request's meaning.
        sessionStorage.setItem(storageKey, JSON.stringify(answers));
        pendingAnswers.current = structuredClone(answers);
      }
      if (!mounted.current) return;
      setPending(true);
      const res = await attemptSubmit(session.access_token, { attempt_id: attemptId, answers: pendingAnswers.current });
      if (!mounted.current) return;
      try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem("schood.sat-attempt.draft." + attemptId); } catch { /* Completed receipt is recoverable from the server. */ }
      setAttempt(res.attempt); setQuestions(res.questions);
      pendingAnswers.current = null; setPending(false);
      navigate("/results/" + res.attempt.id);
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      busy.current = false;
      if (mounted.current) setSending(false);
    }
  };
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && !isDone && !autoSubmitted.current && !loading && attempt) {
      autoSubmitted.current = true;
      void submit(true);
    }
  });

  const setAnswer = (id: string, value: unknown) => {
    if (!busy.current && !pendingAnswers.current) setAnswers(prev => ({ ...prev, [id]: value }));
  };
  const toggleFlag = (id: string) => setFlags(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const readOnly = isDone || sending || pending;
  const total = questions.length;
  const index = Math.min(Math.max(0, current), Math.max(0, total - 1));
  const q = questions[index];
  const section = questions[0]?.section_type ?? (filters.module_section as string | undefined);

  const navigator = <div className="question-navigator" role="group" aria-label={t('lab.navigator')}>
    <p className="navigator-legend"><span className="nav-dot answered" />{t('lab.legend.answered')} <span className="nav-dot" />{t('lab.legend.unanswered')} <span className="nav-dot flagged" />{t('lab.legend.flagged')}</p>
    <div className="navigator-grid">
      {questions.map((question, i) => {
        const done = isAnswered(answers[question.id]), flagged = flags.includes(question.id);
        return <button key={question.id} type="button" className={`nav-cell${done ? ' answered' : ''}${flagged ? ' flagged' : ''}${isModule && i === index ? ' current' : ''}`}
          aria-label={t('lab.goTo', { n: i + 1 }) + (done ? ` · ${t('lab.legend.answered')}` : ` · ${t('lab.legend.unanswered')}`) + (flagged ? ` · ${t('lab.legend.flagged')}` : '')}
          aria-current={isModule && i === index ? 'step' : undefined}
          onClick={() => {
            if (isModule) { setCurrent(i); setShowNavigator(false); }
            else document.getElementById('q-' + question.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>{i + 1}</button>;
      })}
    </div>
  </div>;

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className={`workspace ${showCalc && hasMath ? 'with-calculator' : 'narrow'}`}>
        <div className="lab-main">
          <header className="page-header lab-header">
            <div>
              <p className="eyebrow">{t(isModule ? 'lab.eyebrow.module' : 'lab.eyebrow.drill')}</p>
              <h1>{isModule ? t('lab.title.module', { section: sectionLabel(t, section) }) : t(isDone ? 'lab.title.done' : 'lab.title.drill')}</h1>
              <p>{loading ? t('lab.loading') : t('lab.answered', { answered, total })}</p>
            </div>
            <div className="lab-tools">
              {remaining !== null && !isDone ? <div className={`module-timer${remaining <= 300 ? ' warning' : ''}`} role="timer" aria-live="off">
                {timerHidden ? null : <><span className="visually-hidden">{t('lab.timer')}: </span><strong>{clock(remaining)}</strong></>}
                <button type="button" className="icon-button" onClick={() => setTimerHidden(v => !v)} aria-label={timerHidden ? t('lab.timerShow') : t('lab.timerHide')} title={timerHidden ? t('lab.timerShow') : t('lab.timerHide')}>
                  {timerHidden ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
                </button>
              </div> : null}
              {hasMath ? <button type="button" className="btn ghost" aria-pressed={showCalc} onClick={() => setShowCalc(v => !v)}><Calculator size={17} aria-hidden="true" />{showCalc ? t('calc.hide') : t('calc.show')}</button> : null}
              {!isModule ? <Link className="btn ghost" to="/bank">{t('lab.backToBank')}</Link> : null}
            </div>
          </header>
          {remaining !== null && remaining <= 300 && remaining > 0 && !isDone ? <p className="alert" role="status">{t('lab.fiveMinutes')}</p> : null}
          {remaining !== null && remaining <= 0 && !isDone ? <p className="alert" role="status">{t('lab.timeUp')}</p> : null}
          {attempt && requested && attempt.question_ids.length < requested ? <div className="alert" role="status">
            {isModule ? t('lab.shortModule', { available: attempt.question_ids.length, requested, minutes: Math.round((timeLimit ?? 0) / 60) }) : t('lab.short', { available: attempt.question_ids.length, requested })}
          </div> : null}
          {selection?.widened?.length ? <div className="alert" role="status">{t('lab.widened')}</div> : null}
          {error ? (
            <div className="alert error" role="alert">
              {error instanceof Error && error.message === 'account_changed' ? t('error.account_changed') : errorText(error, attempt ? 'error.submit_unconfirmed' : 'error.generic')}
              {!attempt ? <button type="button" className="btn ghost" onClick={() => setReload(v => v + 1)}>{t('lab.retryLoad')}</button> : null}
            </div>
          ) : null}
          {pending && !isDone ? <div className="alert" role="status">{t('lab.pending')} <Link to={"/results/" + attemptId}>{t('lab.checkResults')}</Link>.</div> : null}
          {loading ? <p role="status">{t('lab.loadingQuestions')}</p> : isModule && q ? (
            <section className="module-view">
              <div className="module-question-bar">
                <strong>{t('lab.questionOf', { n: index + 1, total })}</strong>
                <button type="button" className={`btn ghost compact${flags.includes(q.id) ? ' flag-on' : ''}`} aria-pressed={flags.includes(q.id)} onClick={() => toggleFlag(q.id)}>
                  {flags.includes(q.id) ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}{flags.includes(q.id) ? t('lab.flagged') : t('lab.flag')}
                </button>
              </div>
              <QuestionCard key={q.id} question={q} value={answers[q.id]} readOnly={readOnly} onChange={value => setAnswer(q.id, value)} />
              <div className="module-nav">
                <button type="button" className="btn ghost" disabled={index === 0} onClick={() => setCurrent(index - 1)}><ChevronLeft size={17} aria-hidden="true" />{t('lab.prev')}</button>
                <button type="button" className="btn ghost" aria-expanded={showNavigator} onClick={() => setShowNavigator(v => !v)}><Grid3x3 size={17} aria-hidden="true" />{t('lab.questionOf', { n: index + 1, total })}</button>
                {index < total - 1
                  ? <button type="button" className="btn solid" onClick={() => setCurrent(index + 1)}>{t('lab.next')}<ChevronRight size={17} aria-hidden="true" /></button>
                  : <button type="button" className="btn solid" onClick={() => setShowNavigator(true)}>{t('lab.review')}</button>}
              </div>
              {showNavigator ? <section className="panel review-panel"><h2>{t('lab.review')}</h2><p>{t('lab.reviewBody')}</p>{navigator}</section> : null}
            </section>
          ) : (
            <>
              {total > 1 ? <section className="panel compact-panel">{navigator}</section> : null}
              <section className="question-stack">
                {questions.map((question, i) => (
                  <div key={question.id} id={'q-' + question.id} className="question-shell">
                    <div className="module-question-bar">
                      <span className="question-number">{t('lab.question', { n: i + 1 })}</span>
                      {!isDone ? <button type="button" className={`btn ghost compact${flags.includes(question.id) ? ' flag-on' : ''}`} aria-pressed={flags.includes(question.id)} onClick={() => toggleFlag(question.id)}>
                        {flags.includes(question.id) ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}{flags.includes(question.id) ? t('lab.flagged') : t('lab.flag')}
                      </button> : null}
                    </div>
                    <QuestionCard question={question} value={answers[question.id]} readOnly={readOnly} onChange={value => setAnswer(question.id, value)} />
                  </div>
                ))}
              </section>
            </>
          )}
          {confirming ? <div className="alert" role="alertdialog" aria-live="assertive">
            <p>{t('lab.confirmSubmit', { count: total - answered })}</p>
            <div className="row-actions"><button type="button" className="btn solid" onClick={() => void submit(true)}>{isModule ? t('lab.submitModule') : t('lab.submit')}</button>
              <button type="button" className="btn ghost" onClick={() => setConfirming(false)}>{t('common.close')}</button></div>
          </div> : null}
          {!isDone && attempt ? (
            <div className="sticky-actions">
              <button type="button" className="btn solid" onClick={() => void submit()} disabled={loading || sending || questions.length === 0}>
                {sending ? t('lab.submitting') : pending ? t('lab.retrySubmit') : isModule ? t('lab.submitModule') : t('lab.submit')}
              </button>
            </div>
          ) : null}
          {isDone ? <Link className="btn solid" to={"/results/" + attemptId}>{t('lab.openResults')}</Link> : null}
        </div>
        {showCalc && hasMath ? <CalculatorPanel onClose={() => setShowCalc(false)} /> : null}
      </main>
    </div>
  );
};
