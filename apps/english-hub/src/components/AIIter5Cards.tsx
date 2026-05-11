import { useMemo, useState } from 'react';
import {
  calibrateWritingRubric,
  generateGoalTemplate,
  generateThemedWeek,
  type CefrTargetLevel,
  type EnglishGoalKey,
  type GoalTemplateResponse,
  type RubricCalibrateResponse,
  type ThemedWeekResponse,
} from '../lib/ecosystemInsightsClient';

interface Props {
  accessToken: string | null;
}

const CARD: React.CSSProperties = {
  margin: '24px 0',
  padding: 28,
  borderRadius: 24,
  background: 'rgba(253, 248, 241, 0.92)',
  border: '1px solid rgba(52, 38, 27, 0.2)',
  display: 'grid',
  gap: 16,
};

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#9c2c1a',
  margin: 0,
};

const TITLE: React.CSSProperties = {
  fontFamily: 'Outfit, sans-serif',
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '-0.015em',
  margin: '4px 0 6px',
};

const SOLID_BTN: React.CSSProperties = {
  padding: '10px 18px',
  border: 'none',
  borderRadius: 8,
  background: '#9c2c1a',
  color: 'white',
  fontWeight: 600,
};

const GHOST_BTN: React.CSSProperties = {
  padding: '10px 18px',
  border: '1px solid #c9c0a8',
  borderRadius: 8,
  background: '#ffffff',
  color: '#1a1814',
  fontWeight: 600,
};

const CEFR_LEVELS: CefrTargetLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const SKILL_TONE: Record<string, string> = {
  reading: '#1f3a8a',
  writing: '#8a5a1b',
  listening: '#0f5752',
  speaking: '#7c2d12',
  grammar: '#581c87',
  vocabulary: '#9c2c1a',
};

const aiNote = (status: string, provider?: string, error?: string | null) => {
  if (status === 'ok') return null;
  return (
    <p style={{ marginTop: 8, fontSize: 12, color: '#9b2c2c' }}>
      {status === 'unconfigured'
        ? `${provider ?? 'AI'} provider not configured.`
        : `AI call failed (${provider ?? 'AI'}): ${error ?? 'unknown'}`}
    </p>
  );
};

// === Tier D #20 — Goal templates ===

const GOALS: { key: EnglishGoalKey; label: string; tagline: string }[] = [
  { key: 'study_abroad', label: 'Study abroad', tagline: 'University admissions, IELTS / TOEFL / Duolingo' },
  { key: 'business', label: 'Business English', tagline: 'Meetings, email, negotiation, presentations' },
  { key: 'immigration', label: 'Immigration', tagline: 'Citizenship test, settlement interviews, daily life' },
  { key: 'academic', label: 'Academic', tagline: 'Lectures, papers, conferences, research talk' },
  { key: 'conversational', label: 'Conversational', tagline: 'Confident travel + social conversation' },
  { key: 'exam_prep', label: 'Exam prep', tagline: 'IELTS, TOEFL, SAT, ITEP, Cambridge' },
];

export const GoalTemplateCard = ({ accessToken }: Props) => {
  const [goal, setGoal] = useState<EnglishGoalKey>('study_abroad');
  const [horizonWeeks, setHorizonWeeks] = useState(12);
  const [minutesPerDay, setMinutesPerDay] = useState(30);
  const [data, setData] = useState<GoalTemplateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await generateGoalTemplate(accessToken, {
        goal,
        horizon_weeks: horizonWeeks,
        minutes_per_day: minutesPerDay,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate plan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>Goal templates · AI</p>
        <h3 style={TITLE}>Pick a goal — get a 12-week plan shape</h3>
        <p style={{ margin: 0, color: '#5b5547' }}>
          Tell us why you're learning English, and we'll mix the six skills into a weekly schedule that
          actually serves that goal — not a generic curriculum.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {GOALS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGoal(g.key)}
            style={{
              textAlign: 'left',
              padding: 14,
              borderRadius: 10,
              border: goal === g.key ? '2px solid #9c2c1a' : '1px solid #d6cfb8',
              background: goal === g.key ? '#f3f1ea' : '#fff',
              cursor: 'pointer',
              display: 'grid',
              gap: 4,
            }}
          >
            <strong style={{ fontSize: 15 }}>{g.label}</strong>
            <span style={{ fontSize: 12, color: '#6f685a' }}>{g.tagline}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
          Horizon (weeks)
          <input
            type="number"
            min={2}
            max={52}
            value={horizonWeeks}
            onChange={(e) => setHorizonWeeks(Math.max(2, Math.min(52, Number(e.target.value) || 12)))}
            style={{ width: 100, padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8 }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
          Minutes / day
          <input
            type="number"
            min={10}
            max={180}
            value={minutesPerDay}
            onChange={(e) => setMinutesPerDay(Math.max(10, Math.min(180, Number(e.target.value) || 30)))}
            style={{ width: 100, padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8 }}
          />
        </label>
        <button type="button" disabled={!accessToken || busy} onClick={run} style={SOLID_BTN}>
          {busy ? 'Drafting…' : 'Generate plan'}
        </button>
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

      {data ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <h4 style={{ ...TITLE, fontSize: 18, margin: '0 0 4px' }}>{data.plan_title || 'Your plan'}</h4>
            <p style={{ margin: 0, color: '#3d3a32', whiteSpace: 'pre-wrap' }}>{data.narrative}</p>
          </div>

          <div>
            <p style={{ ...EYEBROW, marginBottom: 6 }}>Weekly hours</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {Object.entries(data.weekly_hours).map(([skill, hours]) => (
                <div
                  key={skill}
                  style={{
                    border: '1px solid #e6dfca',
                    borderRadius: 8,
                    padding: '8px 10px',
                    display: 'grid',
                    gap: 2,
                    background: '#faf7ee',
                  }}
                >
                  <strong style={{ fontSize: 13, textTransform: 'capitalize', color: SKILL_TONE[skill] ?? '#1a1814' }}>{skill}</strong>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{hours}h</span>
                </div>
              ))}
            </div>
          </div>

          {data.priorities.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Top priorities</p>
              <ol style={{ margin: 0, paddingLeft: 18, color: '#3d3a32', display: 'grid', gap: 4 }}>
                {data.priorities.map((p, idx) => (
                  <li key={idx}>
                    <strong style={{ textTransform: 'capitalize', color: SKILL_TONE[p.skill] ?? '#1a1814' }}>{p.skill}</strong>
                    {' — '}
                    {p.why}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {Object.keys(data.skill_focus).length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Per-skill micro-focus</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#3d3a32', display: 'grid', gap: 4 }}>
                {Object.entries(data.skill_focus).map(([skill, focus]) => (
                  focus ? (
                    <li key={skill}>
                      <strong style={{ textTransform: 'capitalize', color: SKILL_TONE[skill] ?? '#1a1814' }}>{skill}:</strong>{' '}
                      {focus}
                    </li>
                  ) : null
                ))}
              </ul>
            </div>
          ) : null}

          {data.recommended_routes.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Where to start</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.recommended_routes.map((r, idx) => (
                  <a
                    key={idx}
                    href={r.route}
                    style={{
                      display: 'grid',
                      gap: 2,
                      padding: '10px 12px',
                      border: '1px solid #d6cfb8',
                      borderRadius: 8,
                      textDecoration: 'none',
                      color: '#1a1814',
                    }}
                  >
                    <strong style={{ color: '#9c2c1a' }}>{r.label}</strong>
                    <span style={{ fontSize: 13, color: '#6f685a' }}>{r.why}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {data.success_criteria.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>"Done" looks like</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#3d3a32', display: 'grid', gap: 4 }}>
                {data.success_criteria.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ) : null}

          {data.risks.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6, color: '#7c2d12' }}>Risks to watch</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#3d3a32', display: 'grid', gap: 4 }}>
                {data.risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          ) : null}

          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};

// === Tier D #21 — Writing rubric calibration ===

export const RubricCalibrationCard = ({ accessToken }: Props) => {
  const [prompt, setPrompt] = useState('');
  const [lower, setLower] = useState<CefrTargetLevel>('A2');
  const [mid, setMid] = useState<CefrTargetLevel>('B2');
  const [upper, setUpper] = useState<CefrTargetLevel>('C1');
  const [data, setData] = useState<RubricCalibrateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSampleIdx, setActiveSampleIdx] = useState(0);

  const run = async () => {
    if (!accessToken || prompt.trim().length < 20) return;
    setBusy(true);
    setError(null);
    try {
      const res = await calibrateWritingRubric(accessToken, {
        prompt: prompt.trim(),
        lower_level: lower,
        mid_level: mid,
        upper_level: upper,
      });
      setData(res);
      setActiveSampleIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to calibrate rubric');
    } finally {
      setBusy(false);
    }
  };

  const activeSample = data?.samples[activeSampleIdx];

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>Rubric calibration · AI</p>
        <h3 style={TITLE}>See what one level higher actually looks like</h3>
        <p style={{ margin: 0, color: '#5b5547' }}>
          Drop a writing prompt; AI writes the same answer at three CEFR levels and explains exactly
          what changes between them.
        </p>
      </div>

      <textarea
        rows={4}
        placeholder='e.g. "Some people prefer to live in big cities, others in small towns. Discuss both views and give your opinion."'
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{
          padding: 12,
          border: '1px solid #d6cfb8',
          borderRadius: 10,
          fontFamily: 'inherit',
          fontSize: 14,
          resize: 'vertical',
        }}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { label: 'Lower', val: lower, setter: setLower },
          { label: 'Mid', val: mid, setter: setMid },
          { label: 'Upper', val: upper, setter: setUpper },
        ].map((row) => (
          <label key={row.label} style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
            {row.label} level
            <select
              value={row.val}
              onChange={(e) => row.setter(e.target.value as CefrTargetLevel)}
              style={{ padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8 }}
            >
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
        ))}
        <button type="button" disabled={!accessToken || busy || prompt.trim().length < 20} onClick={run} style={SOLID_BTN}>
          {busy ? 'Calibrating…' : 'Calibrate'}
        </button>
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

      {data && data.samples.length ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.samples.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveSampleIdx(idx)}
                style={{
                  ...GHOST_BTN,
                  border: idx === activeSampleIdx ? '2px solid #9c2c1a' : '1px solid #c9c0a8',
                  background: idx === activeSampleIdx ? '#9c2c1a' : '#fff',
                  color: idx === activeSampleIdx ? '#fff' : '#1a1814',
                  padding: '8px 14px',
                }}
              >
                {s.level} sample
              </button>
            ))}
          </div>

          {activeSample ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#6f685a' }}>
                <span>Target words: {activeSample.word_count_target}</span>
                <span>Actual words: {activeSample.text.split(/\s+/).filter(Boolean).length}</span>
              </div>
              <div
                style={{
                  background: '#faf7ee',
                  border: '1px solid #e6dfca',
                  borderRadius: 10,
                  padding: 16,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  fontSize: 15,
                  color: '#1a1814',
                }}
              >
                {activeSample.text}
              </div>
              {activeSample.examiner_note ? (
                <p style={{ margin: 0, fontSize: 13, color: '#5b5547', fontStyle: 'italic' }}>
                  Examiner: {activeSample.examiner_note}
                </p>
              ) : null}
            </div>
          ) : null}

          {data.deltas.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>What changes between levels</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.deltas.map((d, idx) => (
                  <div key={idx} style={{ border: '1px solid #e6dfca', borderRadius: 10, padding: 12 }}>
                    <strong style={{ color: '#9c2c1a' }}>{d.from_level} → {d.to_level}</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4, color: '#3d3a32', fontSize: 14 }}>
                      <li><strong>Task:</strong> {d.axes.task}</li>
                      <li><strong>Coherence:</strong> {d.axes.coherence}</li>
                      <li><strong>Range:</strong> {d.axes.range}</li>
                      <li><strong>Accuracy:</strong> {d.axes.accuracy}</li>
                      <li><strong>Register:</strong> {d.axes.register}</li>
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.what_to_practise.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>This week, practise</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#3d3a32', display: 'grid', gap: 4 }}>
                {data.what_to_practise.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          ) : null}

          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};

// === Tier C #5 — Coordinated themed week ===

export const ThemedWeekCard = ({ accessToken }: Props) => {
  const [themeHint, setThemeHint] = useState('');
  const [minutesPerDay, setMinutesPerDay] = useState(25);
  const [data, setData] = useState<ThemedWeekResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, boolean>>({});

  const run = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await generateThemedWeek(accessToken, {
        theme: themeHint.trim() || undefined,
        minutes_per_day: minutesPerDay,
      });
      setData(res);
      setDone({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build themed week');
    } finally {
      setBusy(false);
    }
  };

  const completedCount = useMemo(
    () => Object.values(done).filter(Boolean).length,
    [done],
  );

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>Themed week · AI</p>
        <h3 style={TITLE}>One theme. Seven days. Six skills.</h3>
        <p style={{ margin: 0, color: '#5b5547' }}>
          A week built around a single theme — what you read on Monday you'll write about Wednesday and
          discuss on Friday. The same vocabulary recycles across skills, which is how words actually stick.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Optional theme hint (e.g. urban transport, food culture)"
          value={themeHint}
          onChange={(e) => setThemeHint(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: '10px 12px', border: '1px solid #d6cfb8', borderRadius: 8 }}
        />
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
          Minutes / day
          <input
            type="number"
            min={10}
            max={120}
            value={minutesPerDay}
            onChange={(e) => setMinutesPerDay(Math.max(10, Math.min(120, Number(e.target.value) || 25)))}
            style={{ width: 100, padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8 }}
          />
        </label>
        <button type="button" disabled={!accessToken || busy} onClick={run} style={SOLID_BTN}>
          {busy ? 'Designing…' : 'Plan my week'}
        </button>
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

      {data ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <h4 style={{ ...TITLE, fontSize: 18, margin: '0 0 4px' }}>{data.theme}</h4>
            {data.why_this_theme ? (
              <p style={{ margin: 0, color: '#5b5547', fontStyle: 'italic' }}>{data.why_this_theme}</p>
            ) : null}
          </div>

          {data.anchor_vocabulary.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Anchor vocabulary</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {data.anchor_vocabulary.map((w, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: '4px 10px',
                      border: '1px solid #d6cfb8',
                      borderRadius: 999,
                      fontSize: 13,
                      background: '#faf7ee',
                      color: '#3d3a32',
                    }}
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p style={{ ...EYEBROW, marginBottom: 6 }}>
              Schedule {data.days.length ? `· ${completedCount}/${data.days.length} done` : null}
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {data.days.map((d, idx) => {
                const isDone = !!done[idx];
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr auto',
                      gap: 12,
                      alignItems: 'start',
                      padding: 12,
                      border: '1px solid #e6dfca',
                      borderRadius: 10,
                      background: isDone ? '#f0eee2' : '#fff',
                      opacity: isDone ? 0.7 : 1,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#1a1814' }}>{d.day_label}</div>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', color: SKILL_TONE[d.skill] ?? '#9c2c1a', fontWeight: 700, letterSpacing: '0.1em' }}>
                        {d.skill}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4, textDecoration: isDone ? 'line-through' : 'none' }}>
                        {d.activity_label}
                      </div>
                      <div style={{ fontSize: 14, color: '#3d3a32' }}>{d.instruction}</div>
                      {d.recycles_words.length ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#6f685a' }}>
                          Recycles: {d.recycles_words.join(' · ')}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <a href={d.route_hint} style={{ ...GHOST_BTN, textAlign: 'center', textDecoration: 'none', padding: '6px 12px', fontSize: 13 }}>
                        Open
                      </a>
                      <button
                        type="button"
                        onClick={() => setDone((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                        style={{ ...GHOST_BTN, padding: '6px 12px', fontSize: 13, background: isDone ? '#9c2c1a' : '#fff', color: isDone ? '#fff' : '#1a1814' }}
                      >
                        {isDone ? 'Done' : 'Mark'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {data.weekend_review ? (
            <div style={{ background: '#faf7ee', border: '1px solid #e6dfca', borderRadius: 10, padding: 12 }}>
              <p style={{ ...EYEBROW, marginBottom: 4 }}>Sunday check-in</p>
              <p style={{ margin: 0, color: '#3d3a32' }}>{data.weekend_review}</p>
            </div>
          ) : null}

          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};
