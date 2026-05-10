import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ListChecks, PenSquare, Sparkles, Wand2 } from 'lucide-react';
import {
  practiceWritingOutline,
  practiceWritingSample,
  type WritingOutlineResponse,
  type WritingSampleResponse,
} from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { PracticeShell } from '../components/PracticeShell';

const CRITERION_TONES: Record<string, string> = {
  TR: '#1e40af',
  CC: '#0e4955',
  LR: '#8a5a1b',
  GRA: '#9b2c2c',
};

export const WritingPrepPage = () => {
  const { accessToken } = useAccess();
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState<'task1' | 'task2'>('task2');
  const [targetBand, setTargetBand] = useState(8);
  const [outline, setOutline] = useState<WritingOutlineResponse | null>(null);
  const [sample, setSample] = useState<WritingSampleResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!accessToken || prompt.trim().length < 20) {
      setError('Paste a real IELTS prompt (at least 20 characters).');
      return;
    }
    setBusy(true);
    setError(null);
    setOutline(null);
    setSample(null);
    try {
      const [outlineRes, sampleRes] = await Promise.all([
        practiceWritingOutline(accessToken, { prompt, task_type: taskType }),
        practiceWritingSample(accessToken, { prompt, task_type: taskType, target_band: targetBand }),
      ]);
      setOutline(outlineRes);
      setSample(sampleRes);
      if (!outlineRes.ai_available || !sampleRes.ai_available) {
        setError('AI is offline right now — the outline and sample shown are placeholders.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate plan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PracticeShell>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">AI Writing prep</span>
          <h1>Plan before you write. See good before you do good.</h1>
          <p>
            Paste any IELTS Writing prompt and get a structured plan (thesis, paragraphs, vocabulary) plus a
            target-band model answer with rubric-anchored annotations. Treat it as a north star, not a template
            to copy.
          </p>
        </div>
      </header>

      <section className="glass" style={{ padding: 24, display: 'grid', gap: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 6px' }}>Task</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['task1', 'task2'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn compact ${taskType === t ? 'solid' : 'ghost'}`}
                  onClick={() => setTaskType(t)}
                >
                  {t === 'task1' ? 'Task 1' : 'Task 2'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 6px' }}>Target band</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                min={6}
                max={9}
                step={0.5}
                value={targetBand}
                onChange={(e) => setTargetBand(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 22, minWidth: 36 }}>{targetBand.toFixed(1)}</strong>
            </div>
          </div>
        </div>

        <div>
          <p className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 6px' }}>Prompt</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={taskType === 'task1'
              ? 'Paste the Task 1 task description here (e.g., "The chart below shows…")'
              : 'Paste the Task 2 essay question here (e.g., "Some people think that universities should accept equal numbers of male and female students…")'}
            rows={5}
            style={{ width: '100%', fontSize: 14, lineHeight: 1.6, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Generates two things in parallel: the outline you should plan with, and a model response at your target band.
          </span>
          <button
            type="button"
            className="btn solid"
            onClick={() => void generate()}
            disabled={busy || prompt.trim().length < 20}
          >
            {busy ? 'Generating…' : 'Generate plan + sample'} <Wand2 size={14} style={{ marginLeft: 6 }} />
          </button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {outline ? (
        <section className="glass" style={{ padding: 24, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ListChecks size={16} />
            <h2 style={{ margin: 0 }}>Your outline</h2>
          </div>
          {outline.thesis ? (
            <div style={{ background: 'var(--accent-soft)', padding: 14, borderRadius: 8, marginBottom: 14, borderLeft: '3px solid var(--accent)' }}>
              <p className="eyebrow" style={{ margin: '0 0 4px', color: 'var(--accent)' }}>Thesis</p>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{outline.thesis}</p>
            </div>
          ) : null}
          {outline.body_outline.length > 0 ? (
            <ol style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {outline.body_outline.map((p, i) => (
                <li key={i} style={{ padding: 14, border: '1px solid var(--card-border)', borderRadius: 8 }}>
                  <p className="eyebrow" style={{ margin: '0 0 4px' }}>{p.label}</p>
                  <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{p.topic_sentence}</p>
                  {p.supporting_points.length > 0 ? (
                    <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13.5, color: 'var(--ink-2)' }}>
                      {p.supporting_points.map((s, j) => <li key={j} style={{ marginBottom: 3 }}>{s}</li>)}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          {outline.key_vocabulary.length > 0 ? (
            <div>
              <p className="eyebrow" style={{ margin: '0 0 8px' }}>Key vocabulary to consider</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {outline.key_vocabulary.map((v, i) => (
                  <span
                    key={i}
                    style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--card-subtle)', border: '1px solid var(--card-border)', fontSize: 13 }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <p className="muted" style={{ margin: '14px 0 0', fontSize: 13 }}>⏱ {outline.time_management}</p>
        </section>
      ) : null}

      {sample && sample.response_text ? (
        <section className="glass" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PenSquare size={16} />
              <h2 style={{ margin: 0 }}>Band {sample.target_band.toFixed(1)} model response</h2>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>{sample.word_count} words</span>
          </div>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.75, color: 'var(--ink-2)' }}>{sample.response_text}</p>

          {sample.annotations.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <p className="eyebrow"><Sparkles size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Why this scores band {sample.target_band.toFixed(1)}</p>
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {sample.annotations.map((a, i) => {
                  const tone = CRITERION_TONES[a.criterion] ?? '#0e4955';
                  return (
                    <li key={i} style={{ padding: 12, borderLeft: `3px solid ${tone}`, background: 'var(--card-subtle)', borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 11, letterSpacing: '0.14em', color: tone }}>{a.criterion}</strong>
                        <span style={{ fontStyle: 'italic', fontSize: 14 }}>&ldquo;{a.phrase}&rdquo;</span>
                      </div>
                      <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>{a.why_band}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {sample.rubric_notes && Object.values(sample.rubric_notes).some(Boolean) ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--card-border)' }}>
              {(['TR', 'CC', 'LR', 'GRA'] as const).map((key) => {
                const note = sample.rubric_notes[key];
                if (!note) return null;
                const tone = CRITERION_TONES[key] ?? '#0e4955';
                return (
                  <div key={key}>
                    <p className="eyebrow" style={{ margin: '0 0 4px', color: tone }}>{key}</p>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{note}</p>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
            <Link to="/dashboard" className="btn ghost compact">
              Back to dashboard <ArrowRight size={12} style={{ marginLeft: 4 }} />
            </Link>
            <Link to="/plan" className="btn ghost compact">
              <BookOpen size={12} style={{ marginRight: 4 }} /> Practice writing labs
            </Link>
          </div>
        </section>
      ) : null}
    </PracticeShell>
  );
};
