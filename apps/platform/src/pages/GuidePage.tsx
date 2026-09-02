import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Compass, Pencil, Sparkles } from "lucide-react";
import {
  type Answer,
  checkBank,
  type CheckQuestion,
  type GuideFlow,
  type Match,
  nextQuestion,
  type Question,
  visibleQuestions,
} from "../../../../supabase/functions/_shared/guide";
import {
  forgetGuideCredential,
  GuideError,
  guideRequest,
  type GuideSession,
  linkGuidePayment,
  readGuideCredential,
  type ResultResponse,
  resumeGuide,
} from "../lib/guideClient";
import { supabase } from "../lib/supabase";
import { readStoredLocale, useI18n } from "../i18n";
import { GuideQuestion, StudyRoute } from "../components/guide/GuideJourney";
import {
  GuideMatchCard,
  GuideSignals,
} from "../components/guide/GuideMatchCard";
import { guideCopy as c } from "../components/guide/copy";
import {
  type GoalChange,
  goalTarget,
} from "../../../../supabase/functions/_shared/guide-goals";

export function GuidePage() {
  const { locale, setLocale } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<GuideFlow | null>(null);
  const [session, setSession] = useState<GuideSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [learnerConfirmed, setLearnerConfirmed] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [goalReview, setGoalReview] = useState<
    { offerId: string; fingerprint: string; changes: GoalChange[] } | null
  >(null);
  const [goalsSaved, setGoalsSaved] = useState(false);
  const textError = error instanceof GuideError && error.status === 404
    ? c.expired[locale]
    : error instanceof GuideError && error.status === 409
    ? c.changed[locale]
    : c.error[locale];
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await resumeGuide(readStoredLocale());
      setFlow(response.flow);
      setSession(response.session);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("guide_request_failed"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    document.title = `${c.guide[locale]} · Schood`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const original = meta?.content;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.append(meta);
    }
    meta.content = "noindex, nofollow";
    return () => {
      if (original !== undefined) meta!.content = original;
      else meta?.remove();
    };
  }, [locale]);
  const pending = flow && session
    ? nextQuestion(flow, session.answers)
    : undefined;
  const question = flow && session
    ? (editing
      ? visibleQuestions(flow, session.answers).find((q) => q.id === editing)
      : undefined) ?? pending
    : undefined;
  const bank = session ? checkBank(session.answers) : null;
  const questionId = question?.id;
  useEffect(() => {
    if (questionId) {
      void guideRequest("/view", {
        method: "POST",
        credential: readGuideCredential(),
        body: { questionId },
      }).catch(() => {});
    }
  }, [questionId]);
  const checks = flow?.checks.filter((q) => q.reviewed && q.bank === bank) ??
    [];
  const currentCheck = session?.check_status === "started"
    ? checks.find((q) => !Object.hasOwn(session.check_answers, q.id))
    : undefined;
  const needsCheckChoice = !question && checks.length > 0 &&
    session?.check_status === "undecided";
  const showResult = !!session && !!flow && !question && !needsCheckChoice &&
    !currentCheck;
  useEffect(() => {
    if (!showResult || !session) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void guideRequest<ResultResponse>("/result", {
      credential: readGuideCredential(),
    }).then((value) => {
      if (cancelled) return;
      setResult(value);
      setError(null);
      if (location.pathname !== "/start/result") {
        navigate("/start/result", { replace: true });
      }
      try {
        const payment = sessionStorage.getItem("schood.guide.pendingPayment");
        if (payment) void linkGuidePayment(payment);
      } catch { /* Storage unavailable. */ }
    }).catch((err) => {
      if (!cancelled) setError(err);
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [showResult, session, location.pathname, navigate]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err : new Error("guide_request_failed"));
    } finally {
      setBusy(false);
    }
  };
  const answer = (value: Answer) =>
    void run(async () => {
      if (!session || !question) return;
      const response = await guideRequest<{ session: GuideSession }>(
        "/session",
        {
          method: "PATCH",
          credential: readGuideCredential(),
          body: {
            revision: session.revision,
            questionId: question.id,
            answer: value,
            locale,
          },
        },
      );
      setSession(response.session);
      setEditing(null);
      setLearnerConfirmed(false);
      window.scrollTo({ top: 0, behavior: "instant" });
      setGoalReview(null);
      setGoalsSaved(false);
    });
  const edit = (id: string) => {
    if (busy) return;
    setEditing(id);
    setResult(null);
    navigate("/start", { replace: true });
  };
  const check = (
    status: "started" | "completed" | "skipped",
    responses = session?.check_answers ?? {},
  ) =>
    void run(async () => {
      if (!session) return;
      const response = await guideRequest<{ session: GuideSession }>("/check", {
        method: "POST",
        credential: readGuideCredential(),
        body: { revision: session.revision, status, answers: responses },
      });
      setSession(response.session);
      setAudioUnavailable(false);
    });
  const checkAnswer = (q: CheckQuestion, value: Answer) => {
    const responses = {
      ...(session?.check_answers ?? {}),
      [q.id]: typeof value === "string" ? value : null,
    };
    check(
      checks.every((item) => Object.hasOwn(responses, item.id))
        ? "completed"
        : "started",
      responses,
    );
  };
  const authReturn = () =>
    navigate(`/auth?returnTo=${encodeURIComponent("/start/result")}`);
  const claim = async () => {
    if (!session) return false;
    if (!(await supabase.auth.getSession()).data.session) {
      authReturn();
      return false;
    }
    if (
      session.answers.audience === "parent" &&
      session.answers.parent_intent !== "progress" &&
      !learnerConfirmed
    ) return false;
    if (!session.user_id) {
      const response = await guideRequest<{ session: GuideSession }>("/claim", {
        method: "POST",
        credential: readGuideCredential(),
        body: { confirm: true, learnerAccount: learnerConfirmed },
      });
      setSession(response.session);
    }
    return true;
  };
  const open = (match: Match) =>
    void run(async () => {
      if (match.plan && !match.owned && !(await claim())) return;
      const response = await guideRequest<{ href: string; offerId: string }>(
        "/open",
        {
          method: "POST",
          credential: readGuideCredential(),
          body: { offerId: match.rule.id },
        },
      );
      if (response.href.startsWith("/checkout")) {
        try {
          sessionStorage.setItem(
            "schood.guide.checkoutOffer",
            response.offerId,
          );
        } catch { /* Payment still works without tracking. */ }
      }
      if (response.href.startsWith("https://")) {
        window.location.assign(response.href);
      } else navigate(response.href);
    });
  const restart = () =>
    void run(async () => {
      if (!window.confirm(c.restartConfirm[locale])) return;
      const credential = readGuideCredential();
      if (credential) {
        try {
          await guideRequest("/session", { method: "DELETE", credential });
        } catch (err) {
          if (
            !(err instanceof GuideError && [401, 403, 404].includes(err.status))
          ) throw err;
        }
      }
      forgetGuideCredential();
      setEditing(null);
      setResult(null);
      setSession(null);
      setLearnerConfirmed(false);
      navigate("/start", { replace: true });
      await load();
    });
  const parent = session?.answers.audience === "parent" &&
    session.answers.parent_intent !== "progress";
  const matchCard = (match: Match) => (
    <GuideMatchCard
      match={match}
      locale={locale}
      key={match.rule.id}
      disabled={busy ||
        (!!match.plan && !match.owned && !!parent && !learnerConfirmed)}
      onOpen={() => open(match)}
    >
      {match.owned && match.product && goalTarget(match.product) && (
        <button
          type="button"
          className="guide-text-button"
          disabled={busy || (!!parent && !learnerConfirmed)}
          onClick={() =>
            void run(async () => {
              if (!(await claim())) return;
              const review = await guideRequest<
                { fingerprint: string; changes: GoalChange[] }
              >(
                "/goals/preview",
                {
                  method: "POST",
                  credential: readGuideCredential(),
                  body: { offerId: match.rule.id },
                },
              );
              setGoalReview({ ...review, offerId: match.rule.id });
              setGoalsSaved(false);
            })}
        >
          {c.reviewGoals[locale]}
        </button>
      )}
    </GuideMatchCard>
  );
  return (
    <div
      className="guide-shell"
      data-accent={flow?.appearance.accent}
      data-motion={flow?.appearance.motion}
    >
      <header className="guide-header">
        <Link to="/" className="guide-brand">
          schood<span>.</span>
        </Link>
        <div className="guide-header-tools">
          <select
            aria-label="Language / Til / Язык"
            value={locale}
            onChange={(event) => {
              const value = event.target.value as typeof locale;
              void setLocale(value);
              if (session && !busy) {
                void run(async () => {
                  const r = await guideRequest<{ session: GuideSession }>(
                    "/session",
                    {
                      method: "PATCH",
                      credential: readGuideCredential(),
                      body: { revision: session.revision, locale: value },
                    },
                  );
                  setSession(r.session);
                });
              }
            }}
            disabled={busy}
          >
            <option value="en">English</option>
            <option value="uz">O‘zbekcha</option>
            <option value="ru">Русский</option>
          </select>
          <Link to="/">{c.exit[locale]}</Link>
        </div>
      </header>
      {loading
        ? (
          <div className="guide-empty" role="status">
            <Compass size={38} />
            <p>{c.loading[locale]}</p>
          </div>
        )
        : !flow || !session
        ? (
          <main className="guide-empty">
            <Compass size={40} />
            <h1>{c.unavailable[locale]}</h1>
            {error && (
              <p role="alert">
                {error instanceof GuideError && error.status === 404
                  ? c.expired[locale]
                  : error instanceof GuideError && error.status === 401
                  ? c.login[locale]
                  : c.error[locale]}
              </p>
            )}
            <button
              className="guide-primary"
              onClick={() => void load()}
            >
              {c.retry[locale]}
            </button>
            <Link className="guide-secondary" to="/plans">
              {c.browse[locale]}
            </Link>
            {error instanceof GuideError && [401, 403].includes(error.status) &&
              (
                <button className="guide-text-button" onClick={authReturn}>
                  {c.login[locale]}
                </button>
              )}
            {readGuideCredential() && (
              <button className="guide-text-button" onClick={restart}>
                {c.restart[locale]}
              </button>
            )}
          </main>
        )
        : (
          <main className="guide-layout">
            <StudyRoute
              flow={flow}
              answers={session.answers}
              locale={locale}
              chapter={question?.chapter ?? "result"}
              onEdit={edit}
            />
            <div className="guide-content">
              {error && (
                <div role="alert" className="guide-error">
                  {textError}
                  {error instanceof GuideError &&
                    [401, 403].includes(error.status) && (
                    <button type="button" onClick={authReturn}>
                      {c.login[locale]}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void load()}
                  >
                    {c.retry[locale]}
                  </button>
                </div>
              )}
              {question && (
                <GuideQuestion
                  key={`${question.id}:${session.revision}`}
                  question={question}
                  initial={session.answers[question.id]}
                  locale={locale}
                  busy={busy}
                  onAnswer={answer}
                  onBack={(() => {
                    const list = visibleQuestions(flow, session.answers);
                    const at = list.findIndex((q) => q.id === question.id);
                    return at > 0 ? () => edit(list[at - 1].id) : undefined;
                  })()}
                />
              )}
              {needsCheckChoice && (
                <section className="guide-question guide-enter">
                  <div className="guide-eyebrow">
                    <Sparkles size={16} />
                    {c.optional[locale]}
                  </div>
                  <h1>{c.checkTitle[locale]}</h1>
                  <p className="guide-result-intro">{c.checkBody[locale]}</p>
                  <p className="guide-hint">
                    {checks.length} {c.question[locale].toLowerCase()}
                  </p>
                  <div className="guide-actions">
                    <button
                      className="guide-primary"
                      disabled={busy}
                      onClick={() => check("started")}
                    >
                      {c.checkStart[locale]}
                      <ArrowRight size={18} />
                    </button>
                  </div>
                  <button
                    className="guide-text-button"
                    disabled={busy}
                    onClick={() => check("skipped")}
                  >
                    {c.checkSkip[locale]}
                  </button>
                </section>
              )}
              {currentCheck && (
                <section className="guide-check">
                  <p className="guide-hint">
                    {c.checkProgress[locale]} ·{" "}
                    {checks.indexOf(currentCheck) + 1} / {checks.length}
                  </p>
                  {currentCheck.skill === "listening"
                    ? (
                      <>
                        <audio
                          className="guide-audio"
                          key={currentCheck.id}
                          controls
                          preload="none"
                          src={currentCheck.audioUrl?.replace(
                            /^https:\/\/schood\.online\/guide-audio\//,
                            "/guide-audio/",
                          )}
                          onError={() => setAudioUnavailable(true)}
                        />
                        {audioUnavailable && (
                          <p className="guide-note">{c.skipAudio[locale]}</p>
                        )}
                      </>
                    )
                    : currentCheck.passage && (
                      <p className="guide-check-passage">
                        {currentCheck.passage}
                      </p>
                    )}
                  <GuideQuestion
                    key={currentCheck.id}
                    question={{
                      id: currentCheck.id,
                      title: currentCheck.prompt,
                      help: c.checkBody,
                      kind: "single",
                      required: true,
                      options: currentCheck.options,
                      chapter: "starting",
                      when: { any: [] },
                    } satisfies Question}
                    locale={locale}
                    busy={busy}
                    onAnswer={(value) => checkAnswer(currentCheck, value)}
                  />
                  <button
                    className="guide-text-button"
                    disabled={busy}
                    onClick={() => checkAnswer(currentCheck, null)}
                  >
                    {currentCheck.skill === "listening"
                      ? c.skipAudio[locale]
                      : c.skip[locale]}
                  </button>
                </section>
              )}
              {showResult && (
                <section className="guide-result guide-enter">
                  <div className="guide-eyebrow">
                    <Compass size={16} />
                    {c.based[locale]}
                  </div>
                  <h1>{c.result[locale]}</h1>
                  <p className="guide-result-intro">{flow.intro[locale]}</p>
                  <button
                    className="guide-text-button"
                    onClick={() => edit(flow.questions[0].id)}
                  >
                    <Pencil
                      size={13}
                      style={{ display: "inline", marginRight: 7 }}
                    />
                    {c.edit[locale]}
                  </button>
                  {parent && (
                    <div className="guide-note">
                      <p>{c.parentNote[locale]}</p>
                      <label>
                        <input
                          type="checkbox"
                          checked={learnerConfirmed}
                          onChange={(event) =>
                            setLearnerConfirmed(event.target.checked)}
                        />
                        {c.learnerAccount[locale]}
                      </label>
                    </div>
                  )}
                  {!result && !error && (
                    <p role="status">{c.loading[locale]}</p>
                  )}
                  {result && (
                    <GuideSignals signals={result.signals} locale={locale} />
                  )}
                  {result?.primary
                    ? matchCard(result.primary)
                    : result && (
                      <article className="guide-match">
                        <h2>{result.fallback.title[locale]}</h2>
                        <p>{result.fallback.body[locale]}</p>
                        <Link
                          className="guide-primary"
                          to={result.fallback.destination}
                        >
                          {result.fallback.action[locale]}
                          <ArrowRight size={18} />
                        </Link>
                      </article>
                    )}
                  {result?.alternative && (
                    <details className="guide-alternative">
                      <summary>{c.alternative[locale]}</summary>
                      {matchCard(result.alternative)}
                    </details>
                  )}
                  {goalReview && (
                    <section className="guide-match">
                      <h2>{c.saveGoals[locale]}</h2>
                      <p>{c.goalConsent[locale]}</p>
                      {goalReview.changes.length
                        ? (
                          <ul>
                            {goalReview.changes.map((change) => (
                              <li key={change.field}>
                                <span>
                                  <strong>{change.label[locale]}:</strong>{" "}
                                  {change.previous === null
                                    ? c.notSet[locale]
                                    : String(change.previous)} →{" "}
                                  {String(change.next)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )
                        : <p>{c.noGoals[locale]}</p>}
                      {goalReview.changes.length > 0 && !goalsSaved && (
                        <button
                          className="guide-primary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await guideRequest("/goals/apply", {
                                method: "POST",
                                credential: readGuideCredential(),
                                body: {
                                  offerId: goalReview.offerId,
                                  fingerprint: goalReview.fingerprint,
                                  confirm: true,
                                },
                              });
                              setGoalsSaved(true);
                            })}
                        >
                          {c.saveGoals[locale]}
                        </button>
                      )}
                      {goalsSaved && (
                        <p role="status">{c.goalsApplied[locale]}</p>
                      )}
                    </section>
                  )}
                  <button
                    type="button"
                    className="guide-secondary"
                    disabled={busy || !!session.user_id ||
                      (!!parent && !learnerConfirmed)}
                    onClick={() =>
                      void run(async () => {
                        await claim();
                      })}
                  >
                    {session.user_id ? c.claimed[locale] : c.claim[locale]}
                  </button>
                </section>
              )}
            </div>
          </main>
        )}
      {session && (
        <footer className="guide-footer">
          <p>{c.privacy[locale]}</p>
          <button
            className="guide-text-button"
            disabled={busy}
            onClick={restart}
          >
            {c.restart[locale]}
          </button>
        </footer>
      )}
    </div>
  );
}
