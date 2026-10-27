import React, { useState } from 'react';
import { Sparkles, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { playbookWorkedExampleGenerate, type PlaybookWorkedExampleStep } from '../lib/api';
import { useT } from '../i18n';

interface Props {
  accessToken: string | null;
  pageSlug: string;
}

export const PlaybookWorkedExample: React.FC<Props> = ({ accessToken, pageSlug }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<string | null>(null);
  const [steps, setSteps] = useState<PlaybookWorkedExampleStep[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const generate = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await playbookWorkedExampleGenerate(accessToken, pageSlug);
      setSetup(res.setup);
      setSteps(res.steps);
      setRevealedCount(0);
      setOpen(true);
    } catch (err) {
      setError(t('worked.error'));
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
        border: '1px solid color-mix(in srgb, #1f5a4d 22%, transparent)',
        background: 'color-mix(in srgb, #1f5a4d 4%, white)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow" style={{ color: '#1f5a4d', marginBottom: 4 }}>{t('worked.eyebrow')}</p>
          <strong style={{ display: 'block', fontFamily: 'Fraunces, serif', fontSize: 19, fontWeight: 600 }}>
            {t('worked.title')}
          </strong>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#3b352a', maxWidth: 540 }}>
            {t('worked.lead')}
          </p>
        </div>
        {!setup ? (
          <button type="button" className="button button-primary" onClick={() => void generate()} disabled={busy}>
            {busy ? t('common.generating') : t('common.generate')} <Sparkles size={14} style={{ marginLeft: 4 }} />
          </button>
        ) : (
          <button type="button" className="button button-secondary" onClick={() => setOpen((o) => !o)}>
            {open ? <>{t('common.hide')} <ChevronUp size={13} /></> : <>{t('common.show')} <ChevronDown size={13} /></>}
          </button>
        )}
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: '10px 0 0', fontSize: 13.5 }}>{error}</p> : null}

      {setup && open ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
          <div
            style={{
              padding: 14,
              background: '#fff',
              border: '1px solid #e8e2d0',
              borderRadius: 10,
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1f5a4d', margin: '0 0 8px' }}>
              {t('worked.setup')}
            </p>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: '#1a1814', whiteSpace: 'pre-wrap' }}>
              {setup}
            </p>
          </div>

          {steps.slice(0, revealedCount).map((step, idx) => (
            <div
              key={idx}
              style={{
                padding: 14,
                background: '#fff',
                border: '1px solid #e8e2d0',
                borderRadius: 10,
                borderLeft: '3px solid #1f5a4d',
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1f5a4d', margin: '0 0 6px' }}>
                {t('worked.step', { n: idx + 1 })}: {step.reveal_label}
              </p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#1a1814' }}>
                {step.explanation}
              </p>
              {step.evidence ? (
                <blockquote
                  style={{
                    margin: '10px 0 0',
                    padding: '8px 12px',
                    background: 'color-mix(in srgb, #1f5a4d 6%, white)',
                    borderLeft: '2px solid #1f5a4d',
                    fontSize: 13.5,
                    fontStyle: 'italic',
                    color: '#3b352a',
                  }}
                >
                  {step.evidence}
                </blockquote>
              ) : null}
            </div>
          ))}

          {revealedCount < steps.length ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setRevealedCount((n) => Math.min(steps.length, n + 1))}
            >
              {t('worked.next')} <ChevronRight size={14} />
            </button>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: '#7a7263' }}>
              {t('worked.allRevealed', { count: steps.length })}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
};
