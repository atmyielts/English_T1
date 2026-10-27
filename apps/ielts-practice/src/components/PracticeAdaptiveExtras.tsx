import { useState } from 'react';
import { AlertCircle, CheckCircle2, MessageSquare, RefreshCw, ScrollText, Send, XCircle } from 'lucide-react';
import {
  getCoachLang,
  practiceCoachAsk,
  practiceGeneratePlan,
  practiceLabCoachChat,
  practiceModelAnswer,
  practiceNotebookRetest,
  setCoachLang,
  type CoachChatTurn,
  type CoachLang,
  type ModelAnswerTask,
  type NotebookRetestResponse,
} from '../lib/api';
import { useAppT, useErrorText, useFormat, type AppKey } from '../i18n';

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
  const t = useAppT();
  const errorText = useErrorText();
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
      setError(errorText(err));
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
          <strong style={{ color: '#7a5810' }}>{t('adapt.stale.title')}</strong>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{t('adapt.stale.lead')}</p>
        </div>
      </div>
      <button
        type="button"
        className="btn solid compact"
        onClick={() => void regenerate()}
        disabled={running}
        style={{ background: '#b08020', borderColor: '#b08020' }}
      >
        {running ? t('adapt.stale.refreshing') : t('adapt.stale.refresh')} <RefreshCw size={12} style={{ marginLeft: 4 }} />
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
  const t = useAppT();
  const errorText = useErrorText();
  const [history, setHistory] = useState<CoachChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [lang, setLang] = useState<CoachLang>(() => getCoachLang());

  const chooseLang = (next: CoachLang) => { setLang(next); setCoachLang(next); };

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
        lang,
      });
      setHistory((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      setFollowups(res.suggested_followups ?? []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (!started) {
    return (
      <section className="glass stat-card wide" style={{ padding: 24 }}>
        <div className="task-card-head">
          <div>
            <p className="eyebrow"><MessageSquare size={11} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" /> {t('adapt.chat.eyebrow')}</p>
            <h3 style={{ margin: '4px 0 0' }}>{t('adapt.chat.title')}</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>{t('adapt.chat.lead')}</p>
          </div>
          <button
            type="button"
            className="btn solid compact"
            onClick={() => { setStarted(true); void send(t('adapt.chat.opener')); }}
          >
            {t('adapt.chat.start')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="glass stat-card wide" style={{ padding: 24, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <p className="eyebrow" style={{ margin: 0 }}><MessageSquare size={11} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" /> {t('adapt.chat.eyebrow')}</p>
        <div style={{ display: 'inline-flex', gap: 2, border: '1px solid var(--card-border)', borderRadius: 999, padding: 2, flexShrink: 0 }} title={t('adapt.lang')} role="group" aria-label={t('adapt.lang')}>
          {COACH_LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => chooseLang(l.id)}
              className="btn compact"
              style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, background: lang === l.id ? 'var(--accent-soft)' : 'transparent', fontWeight: lang === l.id ? 700 : 500 }}
              aria-pressed={lang === l.id}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
        {history.map((turn, i) => (
          <div
            key={i}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              overflowWrap: 'anywhere',
              background: turn.role === 'user' ? 'var(--accent-soft)' : 'var(--card-subtle)',
              border: '1px solid var(--card-border)',
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
            }}
          >
            <span className="muted" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              {turn.role === 'user' ? t('adapt.chat.you') : t('adapt.chat.coach')}
            </span>
            {turn.content}
          </div>
        ))}
        {busy ? <p className="muted" style={{ fontSize: 13 }}>{t('adapt.chat.thinking')}</p> : null}
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
          placeholder={t('adapt.chat.placeholder')}
          aria-label={t('adapt.chat.placeholder')}
          disabled={busy}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" className="btn solid compact" disabled={busy || !input.trim()}>
          <Send size={14} aria-hidden="true" /><span className="visually-hidden">{t('adapt.chat.send')}</span>
        </button>
      </form>
    </section>
  );
};

// ============================================================
// 2b. Always-available tutor — ask anything, grounded in your profile
// ============================================================

const ASK_STARTERS: AppKey[] = ['adapt.ask.starter1', 'adapt.ask.starter2', 'adapt.ask.starter3', 'adapt.ask.starter4'];

export const AskCoachPanel = ({ accessToken }: { accessToken: string | null }) => {
  const t = useAppT();
  const errorText = useErrorText();
  const [history, setHistory] = useState<CoachChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<CoachLang>(() => getCoachLang());

  const chooseLang = (next: CoachLang) => { setLang(next); setCoachLang(next); };

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
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass dash-card">
      <div className="task-card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="eyebrow"><MessageSquare size={11} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" /> {t('adapt.ask.eyebrow')}</p>
          <h3 style={{ margin: '4px 0 0' }}>{t('adapt.ask.title')}</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>{t('adapt.ask.lead')}</p>
        </div>
        <div style={{ display: 'inline-flex', gap: 2, border: '1px solid var(--card-border)', borderRadius: 999, padding: 2, flexShrink: 0 }} title={t('adapt.lang')} role="group" aria-label={t('adapt.lang')}>
          {COACH_LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => chooseLang(l.id)}
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
              overflowWrap: 'anywhere',
                background: turn.role === 'user' ? 'var(--accent-soft)' : 'var(--card-subtle)',
                border: '1px solid var(--card-border)',
                fontSize: 14,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}
            >
              <span className="muted" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                {turn.role === 'user' ? t('adapt.chat.you') : t('adapt.ask.tutor')}
              </span>
              {turn.content}
            </div>
          ))}
          {busy ? <p className="muted" style={{ fontSize: 13 }}>{t('adapt.ask.thinking')}</p> : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ASK_STARTERS.map((key) => (
            <button key={key} type="button" className="btn ghost compact" onClick={() => void send(t(key))} disabled={busy} style={{ fontSize: 12, whiteSpace: 'normal', textAlign: 'left' }}>
              {t(key)}
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
          placeholder={t('adapt.ask.placeholder')}
          aria-label={t('adapt.ask.placeholder')}
          disabled={busy}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" className="btn solid compact" disabled={busy || !input.trim()}>
          <Send size={14} aria-hidden="true" /><span className="visually-hidden">{t('adapt.chat.send')}</span>
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
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
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
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass stat-card wide" style={{ padding: 24 }}>
      <div className="task-card-head">
        <div>
          <p className="eyebrow"><ScrollText size={11} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" /> {t('adapt.model.eyebrow')}</p>
          <h3 style={{ margin: '4px 0 0' }}>{t('adapt.model.title')}</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>{t('adapt.model.lead')}</p>
        </div>
        {tasks == null ? (
          <button type="button" className="btn solid compact" onClick={() => void request()} disabled={busy}>
            {busy ? t('adapt.model.generating') : t('adapt.model.show')}
          </button>
        ) : null}
      </div>
      {error ? <p className="error-text" style={{ marginTop: 12 }}>{error}</p> : null}
      {tasks != null && tasks.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>{t('adapt.model.none')}</p>
      ) : null}
      {tasks != null && tasks.length > 0 ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 18 }}>
          {tasks.map((task, idx) => (
            <article key={task.task_id} className="feedback-panel">
              <div className="task-card-head" style={{ marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>
                  {task.task_type ? task.task_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : t('adapt.model.task', { n: idx + 1 })}
                </h4>
                <span className="muted" style={{ fontSize: 12 }}>
                  {t('adapt.model.band', { band: fmt.band(task.model_band) })}
                </span>
              </div>
              {task.prompt ? (
                <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 12px', borderLeft: '3px solid var(--card-border)', paddingLeft: 12 }}>
                  {task.prompt}
                </p>
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 14 }}>
                <div>
                  <p className="eyebrow" style={{ margin: '0 0 8px', color: '#7a7263' }}>{t('adapt.model.yours')}</p>
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                    {task.student_text}
                  </p>
                </div>
                <div>
                  <p className="eyebrow" style={{ margin: '0 0 8px', color: '#166534' }}>{t('adapt.model.model', { band: fmt.band(task.model_band) })}</p>
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
  const t = useAppT();
  const [failed, setFailed] = useState(false);
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
    setFailed(false);
    try {
      const res = await practiceNotebookRetest(accessToken, notebookId);
      setData(res);
    } catch {
      setData(null);
      setFailed(true);
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
        {t('adapt.retest.open')}
      </button>
      {open ? (
        <div
          role="presentation"
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
            role="dialog"
            aria-modal="true"
            aria-label={t('adapt.retest.eyebrow')}
            style={{ maxWidth: 560, width: '100%', padding: 24, display: 'grid', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <p className="eyebrow" style={{ margin: 0 }}>{t('adapt.retest.eyebrow')}</p>
              <button type="button" className="btn ghost compact" onClick={() => setOpen(false)} aria-label={t('common.close')}>
                ✕
              </button>
            </div>
            {busy ? <p className="muted">{t('adapt.retest.loading')}</p> : null}
            {!busy && failed ? <p className="error-text" role="alert">{t('adapt.retest.failed')}</p> : null}
            {!busy && data ? (
              <>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                  {t('adapt.retest.trap', { trap: data.trap_type.replace(/_/g, ' ') })} ·{' '}
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
                            overflowWrap: 'anywhere',
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
                    {t('adapt.retest.submit')}
                  </button>
                ) : (
                  <div className="feedback-panel" style={{ padding: 14 }}>
                    <strong>{selected === data.correct_index ? t('adapt.retest.correct') : t('adapt.retest.wrong')}</strong>
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
