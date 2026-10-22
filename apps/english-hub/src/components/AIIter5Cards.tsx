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
import { useT } from '../i18n';
import { FeedbackList, Segmented, Tag } from '../ui/kit';
import { ToolError, optionalLabel, skillHref, useLearnerLevel, useToolRequest, wordCount } from './aiToolShared';

const RUBRIC_AXES = ['task', 'coherence', 'range', 'accuracy', 'register'] as const;
const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

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
  const t = useT();
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
      setError(t('ai.rubric.tooShort'));
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
      <p className="hint">{t('ai.rubric.intro')}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="rubric-prompt" style={{ gap: '0.35rem' }}>
          {t('ai.rubric.label')}
          <textarea id="rubric-prompt" rows={3} maxLength={800} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('ai.rubric.placeholder')} />
        </label>
        <div className="en-grid-cards">
          <LevelSelect id="rubric-lower" label={t('ai.rubric.lower')} value={lower} onChange={setLower} />
          <LevelSelect id="rubric-mid" label={t('ai.rubric.middle')} value={mid} onChange={setMid} />
          <LevelSelect id="rubric-upper" label={t('ai.rubric.higher')} value={upper} onChange={setUpper} />
        </div>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.rubric.busy') : t('ai.rubric.submit')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {unavailable ? <p className="en-explain">{t('ai.shared.unavailable')}</p> : null}
        {data && !unavailable ? (
          <>
            <Segmented
              label={t('ai.rubric.examplesLabel')}
              value={active}
              onChange={setActive}
              options={data.samples.map((s, index) => ({ value: String(index), label: t('ai.rubric.example', { level: s.level }) }))}
            />
            {sample ? (
              <div className="en-stack">
                <p className="hint">{t('ai.rubric.words', { count: wordCount(sample.text) })}</p>
                <div className="en-passage">
                  {sample.text.split(/\n+/).filter(Boolean).map((para, index) => <p key={index}>{para}</p>)}
                </div>
                {sample.examiner_note ? (
                  <p className="en-explain"><strong>{t('ai.rubric.teacherNote')}</strong> {sample.examiner_note}</p>
                ) : null}
              </div>
            ) : null}

            {data.deltas.length ? (
              <>
                <h3>{t('ai.rubric.changesHeading')}</h3>
                <ul className="en-list">
                  {data.deltas.map((d, index) => (
                    <li key={index} className="en-explain">
                      <strong>{d.from_level} → {d.to_level}</strong>
                      <ul>
                        {RUBRIC_AXES.map((axis) =>
                          d.axes[axis] ? <li key={axis}><strong>{t(`ai.rubric.axis.${axis}`)}:</strong> {d.axes[axis]}</li> : null,
                        )}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <FeedbackList title={t('ai.rubric.practiseHeading')} items={data.what_to_practise} tone="good" />
          </>
        ) : null}
      </div>
    </div>
  );
};

// === Themed week ===

const WEEK_MINUTES = ['15', '25', '40'] as const;

export const ThemedWeekCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
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
      <p className="hint">{t('ai.week.intro')}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="week-theme" style={{ gap: '0.35rem' }}>
          {t('ai.week.themeLabel')}
          <input id="week-theme" type="text" maxLength={120} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={t('ai.week.themePlaceholder')} />
        </label>
        <div className="en-row">
          <span className="hint" aria-hidden="true">{t('ai.week.minutesLabel')}</span>
          <Segmented
            label={t('ai.week.minutesLabel')}
            value={minutes}
            onChange={setMinutes}
            options={WEEK_MINUTES.map((m) => ({ value: m, label: t('ai.week.minutes', { count: Number(m) }) }))}
          />
        </div>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.week.busy') : data ? t('ai.week.again') : t('ai.week.submit')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {unavailable ? (
          <div className="en-empty">
            <p>{t('ai.shared.unavailable')} {t('ai.week.todayHint')}</p>
            <Link className="en-button-quiet" to="/today">{t('ai.week.todayLink')}</Link>
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
                <h3>{t('ai.week.wordsHeading')}</h3>
                <div className="en-row">{data.anchor_vocabulary.map((w, i) => <Tag key={`${w}-${i}`}>{w}</Tag>)}</div>
              </>
            ) : null}
            <p className="hint">{t('ai.week.progress', { done: doneCount, total: data.days.length })}</p>
            <ol className="en-list">
              {data.days.map((day, index) => {
                const skillName = optionalLabel(t, `ai.skills.${day.skill}`);
                const weekDay = WEEK_DAYS[day.day_index] ?? WEEK_DAYS[index];
                const href = skillHref(day.skill);
                return (
                  <li key={index} className="en-explain">
                    <div className="en-stack" style={{ gap: '0.5rem' }}>
                      <span className="en-row">
                        <strong>{weekDay ? t(`ai.week.day.${weekDay}`) : ''}</strong>
                        {skillName ? <Tag>{skillName}</Tag> : null}
                      </span>
                      <strong>{day.activity_label}</strong>
                      <span>{day.instruction}</span>
                      {day.recycles_words.length ? (
                        <span className="hint">{t('ai.week.useWords')} {day.recycles_words.join(', ')}</span>
                      ) : null}
                      <span className="en-row">
                        {href && skillName ? <Link className="en-button-quiet" to={href}>{t('ai.week.open', { skill: skillName })}</Link> : null}
                        <label className="en-row">
                          <input
                            type="checkbox"
                            style={{ width: 'auto' }}
                            checked={Boolean(done[index])}
                            onChange={(e) => setDone((prev) => ({ ...prev, [index]: e.target.checked }))}
                          />
                          {t('ai.week.done')}
                        </label>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            {data.weekend_review ? (
              <div className="en-feedback is-good">
                <h3>{t('ai.week.endHeading')}</h3>
                <p>{data.weekend_review}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};
