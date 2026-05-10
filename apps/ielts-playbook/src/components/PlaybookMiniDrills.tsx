import React, { useState } from 'react';
import { Sparkles, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { playbookDrillsGenerate, playbookDrillSubmit, type PlaybookDrill } from '../lib/api';

interface Props {
  accessToken: string | null;
  pageSlug: string;
}

type Answer = { drill_id: string; selected_index: number; is_correct: boolean };

export const PlaybookMiniDrills: React.FC<Props> = ({ accessToken, pageSlug }) => {
  const [drills, setDrills] = useState<PlaybookDrill[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const load = async () => {
    if (!accessToken) return;
    setBusy(true);
    setAiNotice(null);
    try {
      const res = await playbookDrillsGenerate(accessToken, pageSlug);
      setDrills(res.drills);
      setAnswers({});
      if (res.ai_status === 'unconfigured') setAiNotice('AI is not configured — showing fallback prompts.');
      else if (res.ai_status === 'failed') setAiNotice('AI call failed — showing fallback prompts.');
    } catch (err) {
      setAiNotice(err instanceof Error ? err.message : 'Could not load drills');
    } finally {
      setBusy(false);
    }
  };

  const choose = (drill: PlaybookDrill, idx: number) => {
    if (!accessToken) return;
    if (answers[drill.id]) return;
    const isCorrect = idx === drill.correct_index;
    setAnswers((prev) => ({ ...prev, [drill.id]: { drill_id: drill.id, selected_index: idx, is_correct: isCorrect } }));
    void playbookDrillSubmit(accessToken, pageSlug, {
      drill_id: drill.id,
      is_correct: isCorrect,
      response: { selected_index: idx },
    }).catch(() => null);
  };

  if (!accessToken) return null;

  const total = drills?.length ?? 0;
  const completed = Object.keys(answers).length;
  const correctCount = Object.values(answers).filter((a) => a.is_correct).length;

  return (
    <section
      style={{
        margin: '32px 0',
        padding: 22,
        borderRadius: 14,
        border: '1px solid color-mix(in srgb, #b6512c 22%, transparent)',
        background: 'color-mix(in srgb, #b6512c 4%, white)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow" style={{ color: '#b6512c', marginBottom: 4 }}>Check yourself</p>
          <strong style={{ display: 'block', fontFamily: 'Fraunces, serif', fontSize: 19, fontWeight: 600 }}>
            Mini-drill on this strategy
          </strong>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#3b352a', maxWidth: 540 }}>
            Four questions grounded in the article you just read. We'll log your answers so the dashboard
            can show progress.
          </p>
        </div>
        {drills ? (
          <button type="button" className="button button-secondary" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={14} /> {busy ? 'Generating…' : 'New set'}
          </button>
        ) : (
          <button type="button" className="button button-primary" onClick={() => void load()} disabled={busy}>
            {busy ? 'Generating…' : 'Generate drill'} <Sparkles size={14} style={{ marginLeft: 4 }} />
          </button>
        )}
      </div>

      {aiNotice ? <p style={{ color: '#9b2c2c', margin: '10px 0 0', fontSize: 13.5 }}>{aiNotice}</p> : null}

      {drills && drills.length > 0 ? (
        <>
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            {drills.map((drill, drillIndex) => {
              const answer = answers[drill.id];
              return (
                <article
                  key={drill.id}
                  style={{
                    padding: 16,
                    background: '#ffffff',
                    border: '1px solid #e8e2d0',
                    borderRadius: 10,
                  }}
                >
                  <p style={{ margin: '0 0 12px', fontSize: 14.5, fontWeight: 600, color: '#1a1814' }}>
                    {drillIndex + 1}. {drill.prompt}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                    {drill.options.map((option, idx) => {
                      const picked = answer?.selected_index === idx;
                      const isCorrect = idx === drill.correct_index;
                      const showResult = !!answer;
                      const bg = !showResult
                        ? '#fafaf7'
                        : isCorrect
                          ? 'color-mix(in srgb, #1f8a55 12%, white)'
                          : picked
                            ? 'color-mix(in srgb, #b6512c 12%, white)'
                            : '#fafaf7';
                      const borderColor = !showResult
                        ? '#e8e2d0'
                        : isCorrect
                          ? '#1f8a55'
                          : picked
                            ? '#b6512c'
                            : '#e8e2d0';
                      return (
                        <li key={idx}>
                          <button
                            type="button"
                            disabled={!!answer}
                            onClick={() => choose(drill, idx)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: `1px solid ${borderColor}`,
                              background: bg,
                              textAlign: 'left',
                              cursor: answer ? 'default' : 'pointer',
                              fontSize: 14,
                              color: '#1a1814',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <span style={{ width: 18, display: 'inline-flex' }}>
                              {showResult && isCorrect ? <CheckCircle2 size={16} color="#1f8a55" /> : null}
                              {showResult && picked && !isCorrect ? <XCircle size={16} color="#b6512c" /> : null}
                            </span>
                            <span>{option}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {answer ? (
                    <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#3b352a', lineHeight: 1.5 }}>
                      {drill.explanation}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>

          {completed === total && total > 0 ? (
            <p style={{ marginTop: 14, fontSize: 14, color: '#1f8a55', fontWeight: 600 }}>
              {correctCount}/{total} correct — {correctCount === total ? 'mastery looks solid.' : 'review the misses above.'}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
};
