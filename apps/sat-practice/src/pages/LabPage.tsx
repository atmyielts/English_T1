import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PracticeTopNav } from "../components/PracticeTopNav";
import { QuestionCard } from "../components/QuestionCard";
import {
  type Attempt,
  attemptGet,
  attemptSubmit,
  type SatQuestion,
} from "../lib/api";
import { useAccess } from "../lib/useAccess";
import { supabase } from "../lib/supabase";

export const LabPage = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { accessToken, userId } = useAccess();
  if (!accessToken || !userId || !attemptId) {
    return (
      <div className="app-shell">
        <PracticeTopNav />
        <main className="workspace narrow">
          <p role="status">Sign in to load this drill.</p>
        </main>
      </div>
    );
  }
  return (
    <LabWorkspace
      key={userId + ":" + attemptId}
      accessToken={accessToken}
      userId={userId}
      attemptId={attemptId}
    />
  );
};

const LabWorkspace = (
  { accessToken, userId, attemptId }: {
    accessToken: string;
    userId: string;
    attemptId: string;
  },
) => {
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<SatQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [sending, setSending] = useState(false),
    [pending, setPending] = useState(false),
    [reload, setReload] = useState(0);
  const busy = useRef(false),
    pendingAnswers = useRef<Record<string, unknown> | null>(null),
    token = useRef(accessToken),
    mounted = useRef(true);
  token.current = accessToken;
  const storageKey = "schood.sat-attempt.pending." + userId + "." + attemptId;
  const isDone = attempt?.status === "scored";
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    attemptGet(token.current, attemptId).then((res) => {
      if (cancelled) return;
      setAttempt(res.attempt);
      setQuestions(res.questions);
      let saved: Record<string, unknown> | null = null;
      if (res.attempt.status === "scored") {
        try {
          sessionStorage.removeItem(storageKey);
        } catch { /* A saved server receipt remains authoritative. */ }
        pendingAnswers.current = null;
        setPending(false);
      } else {
        try {
          const raw = sessionStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            saved = parsed;
          }
        } catch {
          /* Continue with server answers if storage is unavailable. */
        }
        pendingAnswers.current = saved;
        setPending(saved !== null);
      }
      setAnswers(saved ?? res.attempt.answers ?? {});
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Attempt failed to load");
      }
    })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId, userId, reload, storageKey]);
  const answered = useMemo(() =>
    questions.filter((q) => {
      const v = answers[q.id];
      if (v == null) return false;
      const value = typeof v === "object"
        ? (v as Record<string, unknown>).selected_option ??
          (v as Record<string, unknown>).option_id ??
          (v as Record<string, unknown>).text ??
          (v as Record<string, unknown>).value
        : v;
      return (typeof value === "string" && value.trim() !== "") ||
        (typeof value === "number" && Number.isFinite(value));
    }).length, [answers, questions]);
  const submit = async () => {
    if (busy.current || isDone || !attempt || questions.length === 0) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session || session.user.id !== userId) {
        throw new Error("Sign in again to submit this drill.");
      }
      if (!pendingAnswers.current) {
        // Persist the exact payload before sending so an uncertain reply can be
        // retried after a reload without changing the request's meaning.
        sessionStorage.setItem(storageKey, JSON.stringify(answers));
        pendingAnswers.current = structuredClone(answers);
      }
      if (!mounted.current) return;
      setPending(true);
      const res = await attemptSubmit(session.access_token, {
        attempt_id: attemptId,
        answers: pendingAnswers.current,
      });
      if (!mounted.current) return;
      try {
        sessionStorage.removeItem(storageKey);
      } catch { /* Completed receipt is recoverable from the server. */ }
      setAttempt(res.attempt);
      setQuestions(res.questions);
      pendingAnswers.current = null;
      setPending(false);
      navigate("/results/" + res.attempt.id);
    } catch (err) {
      if (mounted.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Submission could not be confirmed. Retry with the same answers.",
        );
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSending(false);
    }
  };
  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">Practice Lab</p>
            <h1>{isDone ? "Scored drill" : "Focused drill"}</h1>
            <p>
              {loading
                ? "Loading your drill…"
                : answered + "/" + questions.length + " answered"}
            </p>
          </div>
          <Link className="btn ghost" to="/bank">Back to bank</Link>
        </header>
        {error
          ? (
            <div className="alert error" role="alert">
              {error}
              {!attempt
                ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setReload((v) => v + 1)}
                  >
                    Retry loading drill
                  </button>
                )
                : null}
            </div>
          )
          : null}
        {pending && !isDone
          ? (
            <div className="alert" role="status">
              Your answers are saved in this tab. Retry the same submission or
              {" "}
              <Link to={"/results/" + attemptId}>check saved results</Link>.
            </div>
          )
          : null}
        {!loading
          ? (
            <section className="question-stack">
              {questions.map((question, index) => (
                <div key={question.id} className="question-shell">
                  <div className="question-number">Question {index + 1}</div>
                  <QuestionCard
                    question={question}
                    value={answers[question.id]}
                    readOnly={isDone || sending || pending}
                    onChange={(value) => {
                      if (!busy.current && !pendingAnswers.current) {
                        setAnswers((prev) => ({
                          ...prev,
                          [question.id]: value,
                        }));
                      }
                    }}
                  />
                </div>
              ))}
            </section>
          )
          : <p role="status">Loading questions…</p>}
        {!isDone && attempt
          ? (
            <div className="sticky-actions">
              <button
                type="button"
                className="btn solid"
                onClick={() => void submit()}
                disabled={loading || sending || questions.length === 0}
              >
                {sending
                  ? "Submitting…"
                  : pending
                  ? "Retry submission"
                  : "Submit drill"}
              </button>
            </div>
          )
          : null}
        {isDone
          ? (
            <Link className="btn solid" to={"/results/" + attemptId}>
              Open saved results
            </Link>
          )
          : null}
      </main>
    </div>
  );
};
