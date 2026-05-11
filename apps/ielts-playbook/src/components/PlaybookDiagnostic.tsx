import React, { useState } from 'react';
import { Sparkles, FastForward, ChevronDown, ChevronUp } from 'lucide-react';
import {
  playbookDiagnosticGenerate,
  playbookDiagnosticSubmit,
  type PlaybookDiagnosticQuestion,
} from '../lib/api';

interface Props {
  accessToken: string | null;
  pageSlug: string;
}

type Outcome = { score: number; total: number; recommended_skip: boolean };

export const PlaybookDiagnostic: React.FC<Props> = ({ accessToken, pageSlug }) => {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<PlaybookDiagnosticQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDiagnostic = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setOpen(true);
    try {
      const res = await playbookDiagnosticGenerate(accessToken, pageSlug);
      setQuestions(res.questions);
      setAnswers({});
      setOutcome(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start diagnostic');
    } finally {
      setBusy(false);
    }
  };

  const submitAnswers = async () => {
    if (!accessToken || !questions) return;
    const score = questions.filter((q) => answers[q.id] === q.correct_index).length;
    const total = questions.length;
    setBusy(true);
    try {
      const res = await playbookDiagnosticSubmit(accessToken, pageSlug, {
        score,
        total,
        detail: { answers },
      });
      setOutcome(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record diagnostic');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  const allAnswered = questions && Object.keys(answers).length === questions.length;

  return (
    <section
      style={{
        margin: '24px 0',
        padding: 18,
        borderRadius: 12,
        border: '1px solid color-mix(in srgb, #7b6a3d 25%, transparent)',
        background: 'color-mix(in srgb, #7b6a3d 5%, white)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FastForward size={18} color="#7b6a3d" />
          <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 16 }}>
            Do you need this module?
          </strong>
        </div>
        {!open ? (
          <button type="button" className="button button-secondary" onClick={() => void startDiagnostic()} disabled={busy}>
            {busy ? 'Loading…' : 'Take 3-question check'} <Sparkles size={13} style={{ marginLeft: 4 }} />
          </button>
        ) : (
          <button type="button" className="button button-secondary" onClick={() => setOpen(false)}>
            Hide <ChevronUp size={13} />
          </button>
        )}
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: '8px 0 0', fontSize: 13 }}>{error}</p> : null}

      {open && questions && !outcome ? (
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          {questions.map((q, i) => (
            <div
              key={q.id}
              style={{
                padding: 12,
                background: '#fff',
                border: '1px solid #e8e2d0',
                borderRadius: 8,
              }}
            >
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>
                {i + 1}. {q.prompt}
              </p>
              <div style={{ display: 'grid', gap: 4 }}>
                {q.options.map((opt, idx) => (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === idx}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div>
            <button type="button" className="button button-primary" onClick={() => void submitAnswers()} disabled={!allAnswered || busy}>
              {busy ? 'Submitting…' : 'See if you can skip'}
            </button>
          </div>
        </div>
      ) : null}

      {open && outcome ? (
        <div style={{ marginTop: 14, padding: 12, background: '#fff', border: '1px solid #e8e2d0', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            You scored {outcome.score} / {outcome.total}.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#3b352a', lineHeight: 1.5 }}>
            {outcome.recommended_skip
              ? "You've got the basics — skim this module or skip it and head to a drill instead."
              : 'Take the module — there are gaps worth filling. Then come back and re-run this check.'}
          </p>
          <button
            type="button"
            className="button button-secondary"
            style={{ marginTop: 10 }}
            onClick={() => {
              setQuestions(null);
              setOutcome(null);
              setAnswers({});
              setOpen(false);
            }}
          >
            Close <ChevronDown size={13} />
          </button>
        </div>
      ) : null}
    </section>
  );
};
