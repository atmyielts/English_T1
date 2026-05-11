import { useEffect, useMemo, useState } from 'react';
import {
  getCoachSummary,
  getEcosystemDashboard,
  type CefrEstimate,
  type CoachInsight,
  type CoachSummary,
  type EcosystemDashboard,
  type EnglishSkillKey,
} from '../lib/ecosystemInsightsClient';

// EcosystemSnapshot — the cross-skill command center for english-hub.
// Renders CEFR per skill, a 53-week activity heatmap, and an AI coach
// summary in one consolidated view. All data comes from the new
// /hub/dashboard + /hub/insights/coach-summary endpoints (single round-trip
// per fetch). Designed to mount alongside the existing hub UI.

interface Props {
  accessToken: string | null;
}

const SKILL_LABEL: Record<EnglishSkillKey, string> = {
  reading: 'Reading',
  writing: 'Writing',
  listening: 'Listening',
  speaking: 'Speaking',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  immersion: 'Immersion',
};

const SKILL_TONE: Record<EnglishSkillKey, string> = {
  reading: '#1f3a8a',
  writing: '#8a5a1b',
  listening: '#0f5752',
  speaking: '#7c2d12',
  grammar: '#581c87',
  vocabulary: '#9c2c1a',
  immersion: '#365314',
};

const CEFR_TONE: Record<string, string> = {
  A1: '#94a3b8',
  A2: '#64748b',
  B1: '#9c2c1a',
  B2: '#166534',
  C1: '#b08020',
  C2: '#7c2d12',
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const EcosystemSnapshot = ({ accessToken }: Props) => {
  const [dashboard, setDashboard] = useState<EcosystemDashboard | null>(null);
  const [coach, setCoach] = useState<CoachSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    Promise.all([
      getEcosystemDashboard(accessToken).catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load ecosystem snapshot');
        return null;
      }),
      getCoachSummary(accessToken).catch(() => null),
    ]).then(([dash, coachRes]) => {
      if (cancelled) return;
      setDashboard(dash);
      setCoach(coachRes);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const heatmapWeeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const lastSunday = new Date(today.getTime() - day * 24 * 60 * 60 * 1000);
    const dayMap = new Map<string, number>();
    (dashboard?.activity?.days ?? []).forEach((d) => dayMap.set(d.date, d.events));
    const weeks: Array<Array<{ date: string; events: number }>> = [];
    for (let w = 52; w >= 0; w -= 1) {
      const col: Array<{ date: string; events: number }> = [];
      for (let d = 0; d < 7; d += 1) {
        const date = new Date(lastSunday.getTime() - (w * 7 - d) * 24 * 60 * 60 * 1000);
        const iso = isoDate(date);
        col.push({ date: iso, events: dayMap.get(iso) ?? 0 });
      }
      weeks.push(col);
    }
    return weeks;
  }, [dashboard]);

  const heatShade = (events: number): string => {
    if (events === 0) return '#efeadb';
    if (events <= 2) return '#c4d2c8';
    if (events <= 5) return '#7faa92';
    if (events <= 9) return '#3f7d5e';
    return '#9c2c1a';
  };

  if (!accessToken) return null;

  return (
    <section
      style={{
        margin: '24px 0',
        padding: 28,
        borderRadius: 16,
        background: '#ffffff',
        border: '1px solid #e8e2d0',
        display: 'grid',
        gap: 24,
      }}
    >
      {/* Header */}
      <header>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9c2c1a', margin: 0 }}>
          Ecosystem snapshot
        </p>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em', margin: '4px 0 6px' }}>
          {dashboard?.cefr?.overall
            ? <>You're at <span style={{ color: CEFR_TONE[dashboard.cefr.overall.level] ?? '#9c2c1a' }}>{dashboard.cefr.overall.level}</span> overall</>
            : 'Your English at a glance'}
        </h2>
        <p style={{ margin: 0, color: '#7a7263', fontSize: 14 }}>
          Live picture across reading, writing, listening, speaking, grammar, and vocabulary. Updated in real time as you practice.
        </p>
        {error ? <p style={{ color: '#9b2c2c', margin: '8px 0 0', fontSize: 13 }}>{error}</p> : null}
      </header>

      {/* CEFR per skill grid */}
      {dashboard?.cefr?.estimates && dashboard.cefr.estimates.length > 0 ? (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 12px' }}>
            Skill levels
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {dashboard.cefr.estimates.map((est: CefrEstimate) => {
              const tone = SKILL_TONE[est.skill] ?? '#9c2c1a';
              return (
                <article
                  key={est.skill}
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    border: '1px solid #e8e2d0',
                    borderLeft: `3px solid ${tone}`,
                    background: '#fbfaf6',
                  }}
                >
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tone, margin: 0 }}>
                    {SKILL_LABEL[est.skill]}
                  </p>
                  <strong style={{ display: 'block', fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 28, marginTop: 2 }}>
                    {est.level}
                  </strong>
                  <p style={{ fontSize: 11, color: '#7a7263', margin: '4px 0 0' }}>
                    {est.sample_count > 0
                      ? `${est.sample_count} signal${est.sample_count === 1 ? '' : 's'} · ${est.confidence}`
                      : 'No data yet'}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Activity heatmap + streak */}
      {dashboard?.activity ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a7263', margin: 0 }}>
              Activity · last year
            </p>
            <p style={{ margin: 0, fontSize: 14 }}>
              <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, color: '#b15a1e' }}>
                {dashboard.activity.streak.current_days}
              </strong>{' '}
              <span style={{ color: '#7a7263' }}>day streak · {dashboard.activity.totals.last_30_days} sessions in 30 days</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 3, overflowX: 'auto' }}>
            {heatmapWeeks.map((week, wi) => (
              <div key={wi} style={{ display: 'grid', gap: 3 }}>
                {week.map((cell) => (
                  <div
                    key={cell.date}
                    title={`${cell.date}: ${cell.events} session${cell.events === 1 ? '' : 's'}`}
                    style={{ width: 11, height: 11, borderRadius: 2, background: heatShade(cell.events) }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* AI coach insights */}
      {coach && (coach.summary || coach.insights.length > 0) ? (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9c2c1a', margin: '0 0 8px' }}>
            AI coach · {coach.ai_provider}
          </p>
          {coach.summary ? (
            <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 17, fontWeight: 500, lineHeight: 1.45, margin: '0 0 14px' }}>
              {coach.summary}
            </p>
          ) : null}
          {coach.insights.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {coach.insights.map((ins: CoachInsight, i) => (
                <li
                  key={i}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #e8e2d0',
                    borderLeft: '3px solid #9c2c1a',
                    background: '#fbfaf6',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: 13.5, marginBottom: 4 }}>{ins.title}</strong>
                  <p style={{ margin: 0, fontSize: 13, color: '#3b352a', lineHeight: 1.5 }}>{ins.body}</p>
                  {ins.action_label && ins.action_route ? (
                    <a
                      href={ins.action_route}
                      style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 600, color: '#9c2c1a' }}
                    >
                      {ins.action_label} →
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {coach.ai_status !== 'ok' ? (
            <p style={{ marginTop: 10, fontSize: 12, color: '#9b2c2c' }}>
              {coach.ai_status === 'unconfigured'
                ? `${coach.ai_provider} provider not configured — set ENGLISH_AI_PROVIDER + the matching API key on Supabase.`
                : `AI call failed (${coach.ai_provider}): ${coach.ai_error ?? 'unknown'}`}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Mistake notebook surface */}
      {dashboard?.mistakes && dashboard.mistakes.length > 0 ? (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 8px' }}>
            Recent gaps
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {dashboard.mistakes.slice(0, 8).map((m, i) => (
              <li
                key={i}
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  background: '#fbfaf6',
                  border: '1px solid #e8e2d0',
                  fontSize: 12.5,
                }}
              >
                <strong style={{ color: SKILL_TONE[m.service] ?? '#9c2c1a', marginRight: 6, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {m.service}
                </strong>
                {m.pattern}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
