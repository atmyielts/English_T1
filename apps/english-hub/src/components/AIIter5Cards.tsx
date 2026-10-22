import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  calibrateWritingRubric,
  generateThemedWeek,
  type CefrLevel,
  type RubricCalibrateResponse,
  type ThemedWeekResponse,
} from '../lib/ecosystemInsightsClient';
import { CEFR_LEVELS, nextLevel } from '../lib/skills';
import { FeedbackList, Segmented, Tag } from '../ui/kit';
import { SHARED_COPY, ToolError, skillHref, useLearnerLevel, useToolRequest, wordCount } from './aiToolShared';

const COPY = {
  rubric: {
    intro: 'Write a task. See example answers at three levels and what changes between them.',
    label: 'Writing task',
    placeholder: 'For example: Some people prefer to live in a big city, others in a small town. What do you think?',
    lower: 'Lower level',
    middle: 'Middle level',
    higher: 'Higher level',
    submit: 'Show examples',
    busy: 'Writing examples…',
    tooShort: 'Please write a longer task (at least 20 characters).',
    examplesLabel: 'Example answers',
    example: (level: string) => `${level} example`,
    words: (n: number) => `${n} words`,
    teacherNote: "Teacher's note:",
    changesHeading: 'What changes between levels',
    axes: {
      task: 'Task',
      coherence: 'Organisation',
      range: 'Words and grammar',
      accuracy: 'Accuracy',
      register: 'Style',
    },
    practiseHeading: 'Practise this week',
  },
  week: {
    intro: 'Plan a week of practice around one theme. The same words come back every day.',
    themeLabel: 'Theme (optional)',
    themePlaceholder: 'For example: food, travel, city life',
    minutesLabel: 'Minutes a day',
    minutes: (n: number) => `${n} min`,
    submit: 'Plan my week',
    again: 'Plan another week',
    busy: 'Planning…',
    todayHint: 'Your Today page always has a plan for you.',
    todayLink: 'Go to Today',
    wordsHeading: 'Words for this week',
    progress: (done: number, total: number) => `${done} of ${total} days done`,
    useWords: 'Words to use:',
    open: (skill: string) => `Open ${skill}`,
    done: 'Done',
    endHeading: 'By the end of the week',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
  skills: {
    reading: 'Reading',
    writing: 'Writing',
    listening: 'Listening',
    speaking: 'Speaking',
    grammar: 'Grammar',
    vocabulary: 'Vocabulary',
  } as Record<string, string>,
};

const LevelSelect = ({ id, label, value, onChange }: { id: string; label: string; value: CefrLevel; onChange: (level: CefrLevel) => void }) => (
  <label className="en-stack" htmlFor={id} style={{ gap: '0.35rem' }}>
    {label}
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as CefrLevel)}>
      {CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
    </select>
  </label>
);

// === Level examples (writing rubric calibration) ===

export const RubricCalibrationCard = ({ accessToken }: { accessToken?: string | null }) => {
  const learnerLevel = useLearnerLevel();
  const [prompt, setPrompt] = useState('');
  const [lower, setLower] = useState<CefrLevel>(learnerLevel);
  const [mid, setMid] = useState<CefrLevel>(nextLevel(learnerLevel));
  const [upper, setUpper] = useState<CefrLevel>(nextLevel(nextLevel(learnerLevel)));
  const [active, setActive] = useState('0');
  const { data, busy, error, run, setError } = useToolRequest<RubricCalibrateResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (prompt.trim().length < 20) {
      setError(COPY.rubric.tooShort);
      return;
    }
    setActive('0');
    void run(() => calibrateWritingRubric({ prompt: prompt.trim(), lower_level: lower, mid_level: mid, upper_level: upper }));
  };

  if (!accessToken) return null;

  const unavailable = data && (data.ai_status !== 'ok' || data.samples.length === 0);
  const sample = data?.samples[Number(active)];

  return (
    <div className="en-stack">
      <p className="hint">{COPY.rubric.intro}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="rubric-prompt" style={{ gap: '0.35rem' }}>
          {COPY.rubric.label}
          <textarea id="rubric-prompt" rows={3} maxLength={800} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={COPY.rubric.placeholder} />
        </label>
        <div className="en-grid-cards">
          <LevelSelect id="rubric-lower" label={COPY.rubric.lower} value={lower} onChange={setLower} />
          <LevelSelect id="rubric-mid" label={COPY.rubric.middle} value={mid} onChange={setMid} />
          <LevelSelect id="rubric-upper" label={COPY.rubric.higher} value={upper} onChange={setUpper} />
        </div>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? COPY.rubric.busy : COPY.rubric.submit}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {unavailable ? <p className="en-explain">{SHARED_COPY.unavailable}</p> : null}
        {data && !unavailable ? (
          <>
            <Segmented
              label={COPY.rubric.examplesLabel}
              value={active}
              onChange={setActive}
              options={data.samples.map((s, index) => ({ value: String(index), label: COPY.rubric.example(s.level) }))}
            />
            {sample ? (
              <div className="en-stack">
                <p className="hint">{COPY.rubric.words(wordCount(sample.text))}</p>
                <div className="en-passage">
                  {sample.text.split(/\n+/).filter(Boolean).map((para, index) => <p key={index}>{para}</p>)}
                </div>
                {sample.examiner_note ? (
                  <p className="en-explain"><strong>{COPY.rubric.teacherNote}</strong> {sample.examiner_note}</p>
                ) : null}
              </div>
            ) : null}

            {data.deltas.length ? (
              <>
                <h3>{COPY.rubric.changesHeading}</h3>
                <ul className="en-list">
                  {data.deltas.map((d, index) => (
                    <li key={index} className="en-explain">
                      <strong>{d.from_level} → {d.to_level}</strong>
                      <ul>
                        {(Object.keys(COPY.rubric.axes) as Array<keyof typeof COPY.rubric.axes>).map((axis) =>
                          d.axes[axis] ? <li key={axis}><strong>{COPY.rubric.axes[axis]}:</strong> {d.axes[axis]}</li> : null,
                        )}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <FeedbackList title={COPY.rubric.practiseHeading} items={data.what_to_practise} tone="good" />
          </>
        ) : null}
      </div>
    </div>
  );
};

// === Themed week ===

const WEEK_MINUTES = ['15', '25', '40'] as const;

export const ThemedWeekCard = ({ accessToken }: { accessToken?: string | null }) => {
  const [theme, setTheme] = useState('');
  const [minutes, setMinutes] = useState<(typeof WEEK_MINUTES)[number]>('25');
  const [done, setDone] = useState<Record<number, boolean>>({});
  const { data, busy, error, run } = useToolRequest<ThemedWeekResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setDone({});
    void run(() => generateThemedWeek({ theme: theme.trim() || undefined, minutes_per_day: Number(minutes) }));
  };

  if (!accessToken) return null;

  const unavailable = data && (data.ai_status !== 'ok' || data.days.length === 0);
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <div className="en-stack">
      <p className="hint">{COPY.week.intro}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="week-theme" style={{ gap: '0.35rem' }}>
          {COPY.week.themeLabel}
          <input id="week-theme" type="text" maxLength={120} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={COPY.week.themePlaceholder} />
        </label>
        <div className="en-row">
          <span className="hint" aria-hidden="true">{COPY.week.minutesLabel}</span>
          <Segmented
            label={COPY.week.minutesLabel}
            value={minutes}
            onChange={setMinutes}
            options={WEEK_MINUTES.map((m) => ({ value: m, label: COPY.week.minutes(Number(m)) }))}
          />
        </div>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? COPY.week.busy : data ? COPY.week.again : COPY.week.submit}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {unavailable ? (
          <div className="en-empty">
            <p>{SHARED_COPY.unavailable} {COPY.week.todayHint}</p>
            <Link className="en-button-quiet" to="/today">{COPY.week.todayLink}</Link>
          </div>
        ) : null}
        {data && !unavailable ? (
          <>
            <div>
              {data.theme ? <h3>{data.theme}</h3> : null}
              {data.why_this_theme ? <p className="hint">{data.why_this_theme}</p> : null}
            </div>
            {data.anchor_vocabulary.length ? (
              <>
                <h3>{COPY.week.wordsHeading}</h3>
                <div className="en-row">{data.anchor_vocabulary.map((w, i) => <Tag key={`${w}-${i}`}>{w}</Tag>)}</div>
              </>
            ) : null}
            <p className="hint">{COPY.week.progress(doneCount, data.days.length)}</p>
            <ol className="en-list">
              {data.days.map((day, index) => {
                const skillName = COPY.skills[day.skill] ?? '';
                const href = skillHref(day.skill);
                return (
                  <li key={index} className="en-explain">
                    <div className="en-stack" style={{ gap: '0.5rem' }}>
                      <span className="en-row">
                        <strong>{COPY.week.days[day.day_index] ?? COPY.week.days[index] ?? ''}</strong>
                        {skillName ? <Tag>{skillName}</Tag> : null}
                      </span>
                      <strong>{day.activity_label}</strong>
                      <span>{day.instruction}</span>
                      {day.recycles_words.length ? (
                        <span className="hint">{COPY.week.useWords} {day.recycles_words.join(', ')}</span>
                      ) : null}
                      <span className="en-row">
                        {href && skillName ? <Link className="en-button-quiet" to={href}>{COPY.week.open(skillName)}</Link> : null}
                        <label className="en-row">
                          <input
                            type="checkbox"
                            style={{ width: 'auto' }}
                            checked={Boolean(done[index])}
                            onChange={(e) => setDone((prev) => ({ ...prev, [index]: e.target.checked }))}
                          />
                          {COPY.week.done}
                        </label>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            {data.weekend_review ? (
              <div className="en-feedback is-good">
                <h3>{COPY.week.endHeading}</h3>
                <p>{data.weekend_review}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};
