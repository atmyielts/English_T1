import { useEffect, useState, type FormEvent } from 'react';
import {
  prepareShadowing,
  recommendContent,
  type CefrLevel,
  type ContentRecommendResponse,
  type ShadowingPrepResponse,
} from '../lib/ecosystemInsightsClient';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';
import { useT } from '../i18n';
import { FeedbackList, Segmented, Tag } from '../ui/kit';
import { LevelPicker, ToolError, optionalLabel, useLearnerLevel, useToolRequest } from './aiToolShared';

const FORMAT_OPTIONS = ['book', 'podcast', 'youtube', 'film', 'article'] as const;

// === Real-world English ideas ===

export const ContentRecommendCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const [interests, setInterests] = useState('');
  const [formats, setFormats] = useState<string[]>([]);
  const { data, busy, error, run } = useToolRequest<ContentRecommendResponse>();

  const toggleFormat = (format: string) =>
    setFormats((prev) => (prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const list = interests.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
    void run(() => recommendContent({ interests: list, formats: formats.length ? formats : undefined }));
  };

  if (!accessToken) return null;

  const unavailable = data && (data.ai_status !== 'ok' || data.items.length === 0);

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.content.intro')}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="content-interests" style={{ gap: '0.35rem' }}>
          {t('ai.content.interestsLabel')}
          <input
            id="content-interests"
            type="text"
            maxLength={300}
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder={t('ai.content.interestsPlaceholder')}
          />
        </label>
        <div className="en-row">
          <span className="hint" aria-hidden="true">{t('ai.content.formatsLabel')}</span>
          <div className="en-segmented" role="group" aria-label={t('ai.content.formatsLabel')}>
            {FORMAT_OPTIONS.map((format) => (
              <button
                key={format}
                type="button"
                aria-pressed={formats.includes(format)}
                className={formats.includes(format) ? 'is-on' : 'quiet'}
                onClick={() => toggleFormat(format)}
              >
                {t(`ai.content.type.${format}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.content.busy') : t('ai.content.submit')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {unavailable ? <p className="en-explain">{t('ai.shared.unavailable')}</p> : null}
        {data && !unavailable ? (
          <>
            <p className="hint">{t('ai.content.verifyNote')}</p>
            <ul className="en-list">
              {data.items.map((item, index) => (
                <li key={index} className="en-explain">
                  <div className="en-stack" style={{ gap: '0.4rem' }}>
                    <span className="en-row">
                      {optionalLabel(t, `ai.content.type.${item.type}`) ? <Tag>{optionalLabel(t, `ai.content.type.${item.type}`)}</Tag> : null}
                      <strong>{item.title}</strong>
                      {item.creator ? <span className="hint">{item.creator}</span> : null}
                    </span>
                    <span>{item.why_for_you}</span>
                    {item.where_to_find ? <span><strong>{t('ai.content.find')}</strong> {item.where_to_find}</span> : null}
                    {item.difficulty_note ? <span><strong>{t('ai.content.fit')}</strong> {item.difficulty_note}</span> : null}
                    {item.first_step ? <span><strong>{t('ai.content.firstStep')}</strong> {item.first_step}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
            {data.immersion_tip ? (
              <div className="en-feedback is-good">
                <h3>{t('ai.content.tipHeading')}</h3>
                <p>{data.immersion_tip}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};

// === Shadowing (listen and repeat) ===

export const ShadowingPracticeCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const learnerLevel = useLearnerLevel();
  const [sourceText, setSourceText] = useState('');
  const [level, setLevel] = useState<CefrLevel>(learnerLevel);
  const [speed, setSpeed] = useState<'normal' | 'slow'>('normal');
  const [active, setActive] = useState('0');
  const [said, setSaid] = useState<Record<number, boolean>>({});
  const { data, busy, error, run, setError } = useToolRequest<ShadowingPrepResponse>();
  const speechOk = canSpeak();

  useEffect(() => () => stopSpeaking(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sourceText.trim().length < 30) {
      setError(t('ai.shadow.tooShort'));
      return;
    }
    stopSpeaking();
    setActive('0');
    setSaid({});
    void run(() => prepareShadowing({ source_text: sourceText.trim(), target_level: level }));
  };

  if (!accessToken) return null;

  const chunks = data?.chunks ?? [];
  const activeIndex = Number(active);
  const chunk = chunks[activeIndex];
  const saidCount = Object.values(said).filter(Boolean).length;
  const unavailable = data && chunks.length === 0;

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.shadow.intro')}</p>
      <form onSubmit={submit}>
        <LevelPicker label={t('ai.shadow.levelLabel')} value={level} onChange={setLevel} />
        <label className="en-stack" htmlFor="shadow-source" style={{ gap: '0.35rem' }}>
          {t('ai.shadow.label')}
          <textarea
            id="shadow-source"
            rows={5}
            maxLength={4000}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={t('ai.shadow.placeholder')}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.shadow.busy') : data ? t('ai.shadow.again') : t('ai.shadow.submit')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {unavailable ? <p className="en-explain">{t('ai.shared.unavailable')}</p> : null}
        {data && chunks.length ? (
          <>
            {data.fallback ? <p className="en-explain">{t('ai.shadow.fallbackNote')}</p> : null}
            {data.warm_up ? <p className="hint">{data.warm_up}</p> : null}
            {!speechOk ? <p className="en-explain">{t('ai.shadow.noSpeech')}</p> : null}

            <Segmented
              label={t('ai.shadow.partsLabel')}
              value={active}
              onChange={setActive}
              options={chunks.map((_, index) => ({ value: String(index), label: `${index + 1}${said[index] ? ' ✓' : ''}` }))}
            />

            {chunk ? (
              <div className="en-stack">
                <p className="hint">{t('ai.shadow.part', { current: activeIndex + 1, total: chunks.length })}</p>
                <p className="en-passage">{chunk.text}</p>
                {chunk.focus_label ? (
                  <p className="en-explain">
                    <strong>{t('ai.shadow.focus')}</strong> {chunk.focus_label}
                    {chunk.focus_explanation ? <><br />{chunk.focus_explanation}</> : null}
                  </p>
                ) : null}
                {chunk.watch_for.length ? (
                  <div className="en-row">
                    <span className="hint">{t('ai.shadow.watch')}</span>
                    {chunk.watch_for.map((w, i) => <Tag key={`${w}-${i}`}>{w}</Tag>)}
                  </div>
                ) : null}
                <div className="en-row">
                  {speechOk ? (
                    <button type="button" onClick={() => void speak(chunk.text, { rate: speed === 'slow' ? 0.8 : 0.95 })}>{t('ai.shadow.listen')}</button>
                  ) : null}
                  <button
                    type="button"
                    className="quiet"
                    aria-pressed={Boolean(said[activeIndex])}
                    onClick={() => setSaid((prev) => ({ ...prev, [activeIndex]: !prev[activeIndex] }))}
                  >
                    {said[activeIndex] ? t('ai.shadow.saidDone') : t('ai.shadow.said')}
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    disabled={activeIndex >= chunks.length - 1}
                    onClick={() => setActive(String(Math.min(chunks.length - 1, activeIndex + 1)))}
                  >
                    {t('ai.shadow.next')}
                  </button>
                </div>
                {speechOk ? (
                  <div className="en-row">
                    <span className="hint" aria-hidden="true">{t('ai.shadow.speedLabel')}</span>
                    <Segmented
                      label={t('ai.shadow.speedLabel')}
                      value={speed}
                      onChange={setSpeed}
                      options={[{ value: 'normal', label: t('ai.shadow.speedNormal') }, { value: 'slow', label: t('ai.shadow.speedSlow') }]}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="hint">{t('ai.shadow.progress', { done: saidCount, total: chunks.length })}</p>
            <FeedbackList title={t('ai.shadow.tipsHeading')} items={data.global_tips} tone="good" />
          </>
        ) : null}
      </div>
    </div>
  );
};
