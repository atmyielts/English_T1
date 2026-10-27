import React, { useState } from 'react';
import { BrainCog, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { playbookPageExplain, type PlaybookExplainResponse } from '../lib/api';
import { useT } from '../i18n';

interface Props {
  accessToken: string | null;
  pageSlug: string;
}

export const PlaybookStrategyExplainer: React.FC<Props> = ({ accessToken, pageSlug }) => {
  const t = useT();
  const [data, setData] = useState<PlaybookExplainResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const explain = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await playbookPageExplain(accessToken, pageSlug);
      setData(res);
      setOpen(true);
      // Surface a precise diagnostic so the user knows whether they're
      // looking at a real AI response or a fallback string.
      if (res.ai_status === 'unconfigured') {
        setError(t('ai.unconfigured'));
      } else if (res.ai_status === 'failed') {
        setError(t('ai.failed'));
      } else if (res.ai_status === 'ok' && res.recent_mistake_count === 0) {
        setError(t('explain.noMistakes'));
      }
    } catch (err) {
      setError(t('explain.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  return (
    <section
      style={{
        margin: '32px 0',
        padding: 22,
        borderRadius: 14,
        border: '1px solid color-mix(in srgb, #0e4955 20%, transparent)',
        background: 'color-mix(in srgb, #0e4955 4%, white)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <BrainCog size={20} style={{ color: '#0e4955', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ display: 'block', fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
              {t('explain.title')}
            </strong>
            <p style={{ margin: 0, fontSize: 14, color: '#3b352a', lineHeight: 1.5 }}>
              {t('explain.lead')}
            </p>
          </div>
        </div>
        {data ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <>{t('common.hide')} <ChevronUp size={14} /></> : <>{t('common.show')} <ChevronDown size={14} /></>}
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={() => void explain()}
            disabled={busy}
          >
            {busy ? t('common.generating') : t('common.generate')} <Sparkles size={14} style={{ marginLeft: 4 }} />
          </button>
        )}
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: '10px 0 0', fontSize: 13.5 }}>{error}</p> : null}

      {data && open ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: '#1a1814' }}>
            {data.explanation}
          </p>

          {data.examples.length > 0 ? (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#0e4955', margin: '0 0 8px' }}>
                {t('explain.tied')}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                {data.examples.map((ex, i) => (
                  <li
                    key={i}
                    style={{
                      padding: 12,
                      background: '#ffffff',
                      border: '1px solid #e8e2d0',
                      borderRadius: 8,
                      borderLeft: '3px solid #0e4955',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: 13.5, marginBottom: 4 }}>
                      {ex.mistake_pattern}
                    </strong>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: '#3b352a' }}>
                      {ex.how_strategy_applies}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p style={{ margin: 0, fontSize: 11, color: '#7a7263' }}>
            {t('common.generatedAt', { time: new Date(data.generated_at).toLocaleTimeString() })}
          </p>
        </div>
      ) : null}
    </section>
  );
};
