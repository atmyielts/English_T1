import { useState } from 'react';
import { AlertCircle, CheckCircle2, MessageSquare, RefreshCw, ScrollText, Send, XCircle } from 'lucide-react';
import {
  practiceCoachAsk,
  practiceGeneratePlan,
  practiceLabCoachChat,
  practiceModelAnswer,
  practiceNotebookRetest,
  type CoachChatTurn,
  type CoachLang,
  type ModelAnswerTask,
  type NotebookRetestResponse,
} from '../lib/api';

const COACH_LANGS: Array<{ id: CoachLang; label: string }> = [
  { id: 'en', label: 'EN' },
  { id: 'uz', label: 'UZ' },
  { id: 'ru', label: 'RU' },
];

// ============================================================
// 1. Plan stale banner — reactive replanning prompt
// ============================================================

interface PlanStaleProps {
  accessToken: string | null;
  visible: boolean;
  onRegenerated: () => void;
}

export const PlanStaleBanner = ({ accessToken, visible, onRegenerated }: PlanStaleProps) => {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!visible) return null;
  const regenerate = async () => {
    if (!accessToken) return;
    setRunning(true);
    setError(null);
    try {
      await practiceGeneratePlan(accessToken, { refresh_diagnostics: true });
      onRegenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh plan');
    } finally {
      setRunning(false);
    }
  };
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        padding: '12px 18px',
        background: 'color-mix(in srgb, #b08020 8%, white)',
        border: '1px solid color-mix(in srgb, #b08020 30%, transparent)',
        borderRadius: 10,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <AlertCircle size={18} style={{ color: '#b08020' }} />
        <div>
          <strong style={{ color: '#7a5810' }}>Plan is stale</strong>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            Your latest attempts changed the diagnostic. Regenerate to fold them into today’s tasks.
          </p>
        </div>
      </div>
      <button
        type="button"
        className="btn solid compact"
        onClick={() => void regenerate()}
        disabled={running}
        style={{ background: '#b08020', borderColor: '#b08020' }}
      >
        {running ? 'Regenerating…' : 'Refresh plan'} <RefreshCw size={12} style={{ marginLeft: 4 }} />
      </button>
      {error ? <p className="error-text" style={{ flexBasis: '100%', margin: 0 }}>{error}</p> : null}
    </div>
  );
};

// ============================================================
// 2. Conversational coach — chat extending the one-shot summary
// ============================================================

interface CoachChatProps {
  accessToken: string | null;
  practiceSessionId: string;
}

export const ConversationalCoach = ({ accessToken, practiceSessionId }: CoachChatProps) => {
  const [history, setHistory] = useState<CoachChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const send = async (text: string) => {
    if (!accessToken || !text.trim()) return;
    const userTurn: CoachChatTurn = { role: 'user', content: text.trim() };
    const newHistory = [...history, userTurn];
    setHistory(newHistory);
    setInput('');
    setBusy(true);
    setError(null);
    setFollowups([]);
    try {
      const res = await practiceLabCoachChat(accessToken, practiceSessionId, {
        messages: newHistory,
        question: text.trim(),
      });
      setHistory((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      setFollowups(res.suggested_followups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Coach is unavailable right now');
    } finally {
      setBusy(false);
    }
  };

  if (!started) {
    return (
      <section className="glass stat-card wide" style={{ padding: 24 }}>
        <div className="task-card-head">
          <div>
            <p className="eyebrow"><MessageSquare size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Coach chat</p>
            <h3 style={{ margin: '4px 0 0' }}>Have a follow-up conversation</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
              Ask the coach why a specific answer was wrong, push back on a critique, or request a strategy variation.
            </p>
          </div>
          <button
            type="button"
            className="btn solid compact"
            onClick={() => { setStarted(true); void send('Walk me through the most important takeaway from this attempt.'); }}
          >
            Start chat
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="glass stat-card wide" style={{ padding: 24, display: 'grid', gap: 12 }}>
      <p className="eyebrow"><MessageSquare size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Coach chat</p>
      <div style={{ display: 'grid', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
        {history.map((turn, i) => (
          <div
            key={i}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: turn.role === 'user' ? 'var(--accent-soft)' : 'var(--card-subtle)',
              border: '1px solid var(--card-border)',
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
            }}
          >
            <span className="muted" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              {turn.role === 'user' ? 'You' : 'Coach'}
            </span>
            {turn.content}
          </div>
        ))}
        {busy ? <p className="muted" style={{ fontSize: 13 }}>Coach is thinking…</p> : null}
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {followups.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {followups.map((f) => (
            <button
              key={f}
              type="button"
              className="btn ghost compact"
              onClick={() => void send(f)}
              disabled={busy}
              style={{ fontSize: 12 }}
            >
              {f}
            </button>
          ))}
        </div>
      ) : null}
      <form
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the coach a follow-up…"
          disabled={busy}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn solid compact" disabled={busy || !input.trim()}>
          <Send size={14} />
        </button>
      </form>
    </section>
  );
};

// ============================================================
// 2b. Always-available tutor — ask anything, grounded in your profile
// ============================================================

const ASK_STARTERS = [
  'Explain the difference between True/False/Not Given and Yes/No/Not Given.',
  'How do I improve Task 2 coherence and cohesion?',
  'What should I focus on this week to reach my target band?',
  'Give me a strategy for matching headings.',
];

export const AskCoachPanel = ({ accessToken }: { accessToken: string | null }) => {
  const [history, setHistory] = useState<CoachChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<CoachLang>('en');

  const send = async (text: string) => {
    if (!accessToken || !text.trim() || busy) return;
    const userTurn: CoachChatTurn = { role: 'user', content: text.trim() };
    const newHistory = [...history, userTurn];
    setHistory(newHistory);
    setInput('');
    setBusy(true);
    setError(null);
    setFollowups([]);
    try {
      const res = await practiceCoachAsk(accessToken, { messages: newHistory, question: text.trim(), lang });
      setHistory((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      setFollowups(res.suggested_followups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tutor is unavailable right now');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass stat-card wide" style={{ padding: 24, display: 'grid', gap: 12 }}>
      <div className="task-card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="eyebrow"><MessageSquare size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Ask your tutor</p>
          <h3 style={{ margin: '4px 0 0' }}>Stuck on something? Ask anything.</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            A question type, a grammar or vocabulary point, essay structure, or what to focus on next — grounded in your own results.
          </p>
        </div>
        <div style={{ display: 'inline-flex', gap: 2, border: '1px solid var(--card-border)', borderRadius: 999, padding: 2, flexShrink: 0 }} title="Answer language">
          {COACH_LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLang(l.id)}
              className="btn compact"
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 12,
                background: lang === l.id ? 'var(--accent-soft)' : 'transparent',
                fontWeight: lang === l.id ? 700 : 500,
              }}
              aria-pressed={lang === l.id}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {history.length > 0 ? (
        <div style={{ display: 'grid', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
          {history.map((turn, i) => (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: turn.role === 'user' ? 'var(--accent-soft)' : 'var(--card-subtle)',
                border: '1px solid var(--card-border)',
                fontSize: 14,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}
            >
              <span className="muted" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                {turn.role === 'user' ? 'You' : 'Tutor'}
              </span>
              {turn.content}
            </div>
          ))}
          {busy ? <p className="muted" style={{ fontSize: 13 }}>Tutor is thinking…</p> : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ASK_STARTERS.map((s) => (
            <button key={s} type="button" className="btn ghost compact" onClick={() => void send(s)} disabled={busy} style={{ fontSize: 12 }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error ? <p className="error-text">{error}</p> : null}

      {followups.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {followups.map((f) => (
            <button key={f} type="button" className="btn ghost compact" onClick={() => void send(f)} disabled={busy} style={{ fontSize: 12 }}>
              {f}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your tutor anything about IELTS…"
          disabled={busy}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn solid compact" disabled={busy || !input.trim()}>
          <Send size={14} />
        </button>
      </form>
    </section>
  );
};

// ============================================================
// 3. Model answer comparator
// ============================================================

interface ModelAnswerProps {
  accessToken: string | null;
  practiceSessionId: string;
}

export const ModelAnswerComparator = ({ accessToken, practiceSessionId }: ModelAnswerProps) => {
  const [tasks, setTasks] = useState<ModelAnswerTask[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await practiceModelAnswer(accessToken, practiceSessionId);
      setTasks(res.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate model answer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass stat-card wide" style={{ padding: 24 }}>
      <div className="task-card-head">
        <div>
          <p className="eyebrow"><ScrollText size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Model answer</p>
          <h3 style={{ margin: '4px 0 0' }}>See a band-8 response side-by-side</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            Same prompt, scored to the next band. Use it as a target rather than a copy-paste.
          </p>
        </div>
        {tasks == null ? (
          <button type="button" className="btn solid compact" onClick={() => void request()} disabled={busy}>
            {busy ? 'Generating…' : 'Show model'}
          </button>
        ) : null}
      </div>
      {error ? <p className="error-text" style={{ marginTop: 12 }}>{error}</p> : null}
      {tasks != null && tasks.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>No writing responses found for this session.</p>
      ) : null}
      {tasks != null && tasks.length > 0 ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 18 }}>
          {tasks.map((task, idx) => (
            <article key={task.task_id} className="feedback-panel">
              <div className="task-card-head" style={{ marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>
                  {task.task_type ? task.task_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : `Task ${idx + 1}`}
                </h4>
                <span className="muted" style={{ fontSize: 12 }}>
                  Model band {task.model_band.toFixed(1)}
                </span>
              </div>
              {task.prompt ? (
                <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 12px', borderLeft: '3px solid var(--card-border)', paddingLeft: 12 }}>
                  {task.prompt}
                </p>
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                <div>
                  <p className="eyebrow" style={{ margin: '0 0 8px', color: '#7a7263' }}>Your response</p>
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                    {task.student_text}
                  </p>
                </div>
                <div>
                  <p className="eyebrow" style={{ margin: '0 0 8px', color: '#166534' }}>Band-{task.model_band.toFixed(1)} model</p>
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 14, lineHeight: 1.6 }}>{task.model_text}</p>
                </div>
              </div>
              {task.notes.length > 0 ? (
                <ul style={{ margin: '14px 0 0', padding: '12px 0 0', borderTop: '1px solid var(--card-border)', listStyle: 'none', display: 'grid', gap: 4 }}>
                  {task.notes.map((note, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                      <CheckCircle2 size={12} style={{ verticalAlign: -1, marginRight: 6, color: '#166534' }} />
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
};

// ============================================================
// 4. Notebook re-test inline mini-quiz
// ============================================================

interface NotebookRetestButtonProps {
  accessToken: string | null;
  notebookId: string;
}

export const NotebookRetestButton = ({ accessToken, notebookId }: NotebookRetestButtonProps) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotebookRetestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const open_ = async () => {
    if (!accessToken) return;
    setOpen(true);
    setBusy(true);
    setData(null);
    setSelected(null);
    setSubmitted(false);
    try {
      const res = await practiceNotebookRetest(accessToken, notebookId);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn ghost compact"
        onClick={() => void open_()}
      >
        Quick retest
      </button>
      {open ? (
        <div
          role="dialog"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26, 24, 20, 0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass"
            style={{ maxWidth: 560, width: '100%', padding: 24, display: 'grid', gap: 14 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <p className="eyebrow" style={{ margin: 0 }}>Quick retest · 60 sec</p>
              <button type="button" className="btn ghost compact" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            {busy ? <p className="muted">Generating a fresh test…</p> : null}
            {!busy && data ? (
              <>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                  Trap: <strong style={{ color: 'var(--ink-2)' }}>{data.trap_type.replace(/_/g, ' ')}</strong> ·{' '}
                  {data.question_type.replace(/^question_/, '').replace(/_/g, ' ')}
                </p>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{data.question_text}</p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                  {data.options.map((opt, i) => {
                    const isPicked = selected === i;
                    const isCorrect = submitted && i === data.correct_index;
                    const isWrong = submitted && isPicked && i !== data.correct_index;
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => !submitted && setSelected(i)}
                          disabled={submitted}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 14px',
                            borderRadius: 8,
                            border: `1px solid ${isCorrect ? '#166534' : isWrong ? '#9b2c2c' : isPicked ? 'var(--accent)' : 'var(--card-border)'}`,
                            background: isCorrect ? 'color-mix(in srgb, #166534 8%, white)' : isWrong ? 'color-mix(in srgb, #9b2c2c 8%, white)' : isPicked ? 'var(--accent-soft)' : 'var(--card)',
                            color: 'var(--text)',
                            cursor: submitted ? 'default' : 'pointer',
                            fontSize: 14,
                          }}
                        >
                          {isCorrect ? <CheckCircle2 size={14} style={{ verticalAlign: -2, marginRight: 6, color: '#166534' }} /> : null}
                          {isWrong ? <XCircle size={14} style={{ verticalAlign: -2, marginRight: 6, color: '#9b2c2c' }} /> : null}
                          {opt}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!submitted ? (
                  <button
                    type="button"
                    className="btn solid compact"
                    disabled={selected == null}
                    onClick={() => setSubmitted(true)}
                  >
                    Submit
                  </button>
                ) : (
                  <div className="feedback-panel" style={{ padding: 14 }}>
                    <strong>{selected === data.correct_index ? 'Correct.' : 'Not quite.'}</strong>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{data.explanation}</p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
};
