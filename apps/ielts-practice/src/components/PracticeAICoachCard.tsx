import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Brain, RefreshCw, Sparkles, TrendingUp, AlertTriangle, PartyPopper } from 'lucide-react';
import { practiceCoachSummaryGet, type CoachInsight, type CoachSummaryResponse } from '../lib/api';
import { useLazyVisible } from '../lib/useLazyVisible';

interface Props {
  accessToken: string | null;
}

const INSIGHT_TONES: Record<string, { color: string; Icon: typeof Sparkles }> = {
  progress: { color: '#166534', Icon: TrendingUp },
  risk: { color: '#9b2c2c', Icon: AlertTriangle },
  recommendation: { color: '#0e4955', Icon: Sparkles },
  celebration: { color: '#b15a1e', Icon: PartyPopper },
};

export const PracticeAICoachCard = ({ accessToken }: Props) => {
  const [data, setData] = useState<CoachSummaryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ref, visible } = useLazyVisible();

  const load = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await practiceCoachSummaryGet(accessToken);
      setData(res);
      if (!res.ai_available) {
        setError('AI coach is offline right now. Insights will resume when the model is reachable.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load coach insights');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!accessToken || !visible || data || busy) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, visible]);

  if (!data && !error) {
    return (
      <section ref={ref} className="glass" style={{ padding: 24, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={18} style={{ color: 'var(--accent)' }} />
          <p className="eyebrow" style={{ margin: 0 }}>Your AI coach</p>
        </div>
        <span className="p2-skeleton p2-skeleton-line long" />
        <span className="p2-skeleton p2-skeleton-line medium" />
        <span className="p2-skeleton p2-skeleton-block" />
      </section>
    );
  }

  return (
    <section ref={ref} className="glass" style={{ padding: 24, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={18} style={{ color: 'var(--accent)' }} />
          <p className="eyebrow" style={{ margin: 0 }}>Your AI coach</p>
        </div>
        <button
          type="button"
          className="btn ghost compact"
          onClick={() => void load()}
          disabled={busy || !accessToken}
        >
          {busy ? 'Thinking…' : 'Refresh'} <RefreshCw size={11} style={{ marginLeft: 4 }} />
        </button>
      </div>

      {data?.summary ? (
        <p style={{ margin: 0, fontFamily: 'Fraunces, serif', fontSize: '1.15rem', fontWeight: 500, lineHeight: 1.45, letterSpacing: '-0.01em' }}>
          {data.summary}
        </p>
      ) : null}

      {error ? <p className="error-text" style={{ margin: 0 }}>{error}</p> : null}

      {data && data.insights.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {data.insights.map((ins: CoachInsight, i) => {
            const tone = INSIGHT_TONES[ins.type] ?? INSIGHT_TONES.recommendation!;
            const Icon = tone.Icon;
            return (
              <li
                key={i}
                style={{
                  padding: 14,
                  border: '1px solid var(--card-border)',
                  borderRadius: 10,
                  borderLeft: `3px solid ${tone.color}`,
                  background: `color-mix(in srgb, ${tone.color} 4%, white)`,
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: tone.color }}>
                  <Icon size={13} />
                  <strong style={{ fontSize: 13.5 }}>{ins.title}</strong>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>{ins.body}</p>
                {ins.action_label && ins.action_route ? (
                  <Link
                    to={ins.action_route}
                    style={{
                      marginTop: 4,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: tone.color,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    {ins.action_label} <ArrowRight size={11} />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {data && data.insights.length === 0 && !error ? (
        <p className="muted" style={{ margin: 0 }}>
          The coach doesn’t have enough recent activity to write insights yet. Complete a lab or two and check back.
        </p>
      ) : null}

      {data?.generated_at ? (
        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
          Refreshed {new Date(data.generated_at).toLocaleTimeString()}
        </p>
      ) : null}
    </section>
  );
};
