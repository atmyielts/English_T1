import { useState } from 'react';
import { CheckCircle2, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { practiceMockGenerate, type MockGeneratorResponse } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { PracticeShell } from '../components/PracticeShell';

export const MockGeneratorPage = () => {
  const { accessToken } = useAccess();
  const [sectionType, setSectionType] = useState<'reading' | 'listening'>('reading');
  const [targetBand, setTargetBand] = useState(7);
  const [topicHint, setTopicHint] = useState('');
  const [questionType, setQuestionType] = useState('matching_headings');
  const [data, setData] = useState<MockGeneratorResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setSubmitted(false);
    setAnswers({});
    setData(null);
    try {
      const res = await practiceMockGenerate(accessToken, {
        section_type: sectionType,
        target_band: targetBand,
        topic_hint: topicHint.trim() || undefined,
        question_type: questionType,
      });
      setData(res);
      if (!res.ai_available || !res.passage) {
        setError(res.message ?? 'Mock generation unavailable right now.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a mock');
    } finally {
      setBusy(false);
    }
  };

  const score = data?.questions.reduce((acc, q, i) => {
    if (!submitted) return acc;
    const correct = String(q.correct_answer).trim().toLowerCase();
    const given = (answers[i] ?? '').trim().toLowerCase();
    if (!given) return acc;
    return correct === given ? acc + 1 : acc;
  }, 0) ?? 0;

  return (
    <PracticeShell>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">AI mock generator</span>
          <h1>Fresh IELTS-style passage on demand</h1>
          <p>
            Generate an unseen passage + five questions calibrated to your target band. Practice for variety
            and stamina — but use a curated lab from your plan when you want diagnostic-quality scoring.
          </p>
        </div>
      </header>

      <section className="glass" style={{ padding: 24, display: 'grid', gap: 14, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <p className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 6px' }}>Section</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['reading', 'listening'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn compact ${sectionType === s ? 'solid' : 'ghost'}`}
                  onClick={() => setSectionType(s)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 6px' }}>Target band</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                min={5}
                max={9}
                step={0.5}
                value={targetBand}
                onChange={(e) => setTargetBand(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 22 }}>{targetBand.toFixed(1)}</strong>
            </div>
          </div>
          <div>
            <p className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 6px' }}>Question style</p>
            <select value={questionType} onChange={(e) => setQuestionType(e.target.value)} style={{ width: '100%' }}>
              <option value="matching_headings">Matching headings</option>
              <option value="true_false_not_given">True / False / Not Given</option>
              <option value="multiple_choice">Multiple choice</option>
              <option value="gap_fill">Gap fill</option>
            </select>
          </div>
        </div>
        <div>
          <p className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 6px' }}>Topic hint (optional)</p>
          <input
            type="text"
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder="e.g., climate adaptation, urban transportation, public health"
            style={{ width: '100%' }}
          />
        </div>
        <button type="button" className="btn solid" onClick={() => void generate()} disabled={busy}>
          {busy ? 'Generating…' : 'Generate fresh mock'} <Sparkles size={14} style={{ marginLeft: 6 }} />
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {data?.passage ? (
        <section className="glass" style={{ padding: 24, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div>
              <p className="eyebrow">Passage · estimated band {data.estimated_band.toFixed(1)}</p>
              <h2 style={{ margin: '4px 0 0' }}>{data.passage.title}</h2>
            </div>
            <button type="button" className="btn ghost compact" onClick={() => void generate()} disabled={busy}>
              <RefreshCw size={12} style={{ marginRight: 4 }} /> Regenerate
            </button>
          </div>
          <article style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.75, color: 'var(--ink-2)' }}>
            {data.passage.body}
          </article>
        </section>
      ) : null}

      {data && data.questions.length > 0 ? (
        <section className="glass" style={{ padding: 24 }}>
          <h2 style={{ margin: '0 0 14px' }}>Questions</h2>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
            {data.questions.map((q, i) => {
              const correct = String(q.correct_answer).trim().toLowerCase();
              const given = (answers[i] ?? '').trim().toLowerCase();
              const isCorrect = submitted && given && given === correct;
              const isWrong = submitted && given && given !== correct;
              return (
                <li
                  key={i}
                  style={{
                    padding: 16,
                    border: `1px solid ${isCorrect ? '#166534' : isWrong ? '#9b2c2c' : 'var(--card-border)'}`,
                    borderRadius: 10,
                    background: isCorrect ? 'color-mix(in srgb, #166534 5%, white)' : isWrong ? 'color-mix(in srgb, #9b2c2c 5%, white)' : 'var(--card)',
                  }}
                >
                  <p style={{ margin: '0 0 10px', fontWeight: 600 }}>
                    {i + 1}. {q.prompt}
                    {isCorrect ? <CheckCircle2 size={14} style={{ marginLeft: 6, verticalAlign: -2, color: '#166534' }} /> : null}
                    {isWrong ? <XCircle size={14} style={{ marginLeft: 6, verticalAlign: -2, color: '#9b2c2c' }} /> : null}
                  </p>
                  {q.options.length > 0 ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {q.options.map((opt, j) => {
                        const picked = answers[i] === opt;
                        return (
                          <label key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: submitted ? 'default' : 'pointer' }}>
                            <input
                              type="radio"
                              name={`q-${i}`}
                              value={opt}
                              checked={picked}
                              disabled={submitted}
                              onChange={() => setAnswers({ ...answers, [i]: opt })}
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={answers[i] ?? ''}
                      disabled={submitted}
                      onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                      placeholder="Your answer"
                      style={{ width: '100%', maxWidth: 320 }}
                    />
                  )}
                  {submitted ? (
                    <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                      <strong>Correct: {q.correct_answer}.</strong> {q.explanation}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            {!submitted ? (
              <button type="button" className="btn solid" onClick={() => setSubmitted(true)}>
                Submit answers
              </button>
            ) : (
              <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 20 }}>
                Score: {score} / {data.questions.length}
              </strong>
            )}
          </div>
        </section>
      ) : null}
    </PracticeShell>
  );
};
