import { useEffect, useMemo, useState } from 'react';
import { Calendar, Flame, GraduationCap, Sparkles, TrendingUp } from 'lucide-react';
import { useLazyVisible } from '../lib/useLazyVisible';
import {
  practiceActivityGet,
  practiceMasteryOverviewGet,
  practiceNarrativeGet,
  practiceTrajectoryGet,
  type ActivityDay,
  type MasteryRow,
  type PracticeActivityResponse,
  type PracticeMasteryOverviewResponse,
  type PracticeNarrativeResponse,
  type PracticeTrajectoryResponse,
  type TrajectoryPoint,
} from '../lib/api';
import { formatPracticeLabel } from '../lib/practiceExperience';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ============================================================
// Plan narrative banner: "Day 14 of 90 toward 7.5"
// ============================================================

const PACE_COPY: Record<PracticeNarrativeResponse['pace_label'], { label: string; tone: string }> = {
  ahead: { label: 'Ahead of pace', tone: '#166534' },
  on_track: { label: 'On track', tone: '#0e4955' },
  behind: { label: 'Below pace — adjust', tone: '#9b2c2c' },
  unknown: { label: 'Pace forming', tone: '#7a7263' },
};

interface PlanNarrativeProps {
  accessToken: string | null;
}

export const PlanNarrativeBanner = ({ accessToken }: PlanNarrativeProps) => {
  const [data, setData] = useState<PracticeNarrativeResponse | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    practiceNarrativeGet(accessToken).then((res) => { if (!cancelled) setData(res); }).catch(() => null);
    return () => { cancelled = true; };
  }, [accessToken]);
  if (!data) return null;

  const pct = data.total_days ? Math.min(100, Math.round((data.day_n / data.total_days) * 100)) : null;
  const pace = PACE_COPY[data.pace_label];
  const subtitle = data.target_date
    ? `Target band ${data.target_band.toFixed(1)} by ${new Date(data.target_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : `Target band ${data.target_band.toFixed(1)}`;

  return (
    <section className="glass" style={{ padding: 22, marginBottom: 20, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow">Your study plan</p>
          <h2 style={{ margin: '4px 0 2px' }}>
            Day {data.day_n}
            {data.total_days ? <span className="muted" style={{ fontWeight: 400 }}> of {data.total_days}</span> : null}
          </h2>
          <p className="muted" style={{ margin: 0 }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              background: `color-mix(in srgb, ${pace.tone} 12%, transparent)`,
              color: pace.tone,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            {pace.label.toUpperCase()}
          </span>
          {data.weeks_remaining != null ? (
            <span className="muted" style={{ fontSize: 13 }}>
              {data.weeks_remaining} week{data.weeks_remaining === 1 ? '' : 's'} remaining
            </span>
          ) : null}
        </div>
      </div>
      {pct != null ? (
        <div className="progress-track" style={{ height: 6 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </section>
  );
};

// ============================================================
// Band trajectory chart (custom SVG) + predictor
// ============================================================

const SECTION_COLORS: Record<string, string> = {
  overall: '#0e4955',
  reading: '#1f3a8a',
  listening: '#0f5752',
  writing: '#8a5a1b',
};

type BandKey = 'overall_band' | 'reading' | 'listening' | 'writing' | 'speaking';

const drawTrajectoryPath = (
  series: TrajectoryPoint[],
  key: BandKey,
  width: number,
  height: number,
  yMin = 4,
  yMax = 9,
): { d: string; points: Array<{ x: number; y: number; band: number; date: string }> } => {
  const valid: Array<{ date: string; value: number }> = [];
  for (const p of series) {
    const v = p[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      valid.push({ date: p.date, value: v });
    }
  }
  if (valid.length < 2) return { d: '', points: [] };
  const first = valid[0]!;
  const last = valid[valid.length - 1]!;
  const firstDate = new Date(first.date).getTime();
  const lastDate = new Date(last.date).getTime();
  const range = Math.max(1, lastDate - firstDate);
  const x = (date: string) => ((new Date(date).getTime() - firstDate) / range) * width;
  const y = (band: number) => height - ((band - yMin) / (yMax - yMin)) * height;
  let d = '';
  const points: Array<{ x: number; y: number; band: number; date: string }> = [];
  valid.forEach((p, i) => {
    const cx = x(p.date);
    const cy = y(p.value);
    d += i === 0 ? `M${cx.toFixed(1)},${cy.toFixed(1)}` : ` L${cx.toFixed(1)},${cy.toFixed(1)}`;
    points.push({ x: cx, y: cy, band: p.value, date: p.date });
  });
  return { d, points };
};

interface TrajectoryProps {
  accessToken: string | null;
}

export const BandTrajectoryCard = ({ accessToken }: TrajectoryProps) => {
  const [data, setData] = useState<PracticeTrajectoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  type ChartKey = 'overall' | 'reading' | 'listening' | 'writing';
  const [activeKey, setActiveKey] = useState<ChartKey>('overall');
  const bandKey: BandKey = activeKey === 'overall' ? 'overall_band' : activeKey;
  const { ref, visible } = useLazyVisible();

  useEffect(() => {
    if (!accessToken || !visible || data || loading) return;
    setLoading(true);
    practiceTrajectoryGet(accessToken)
      .then((res) => setData(res))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [accessToken, visible, data, loading]);

  const w = 640;
  const h = 180;
  const { d: pathD, points } = useMemo(
    () => (data ? drawTrajectoryPath(data.series, bandKey, w, h) : { d: '', points: [] }),
    [data, bandKey],
  );

  const predictor = data?.predictor?.[activeKey];

  return (
    <section ref={ref} className="glass" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <p className="eyebrow"><TrendingUp size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Band trajectory</p>
          <h2 style={{ margin: '4px 0 4px' }}>
            {predictor?.band != null ? predictor.band.toFixed(1) : '—'}
            <span className="muted" style={{ fontSize: '0.6em', fontWeight: 400, marginLeft: 6 }}>
              predicted {activeKey}
            </span>
          </h2>
          {predictor ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {predictor.sample_count} sample{predictor.sample_count === 1 ? '' : 's'} ·{' '}
              {predictor.confidence === 'high' ? 'high confidence' : predictor.confidence === 'medium' ? 'moderate confidence' : 'low confidence — practice more'}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['overall', 'reading', 'listening', 'writing'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`btn compact ${activeKey === k ? 'solid' : 'ghost'}`}
              onClick={() => setActiveKey(k)}
              style={{ textTransform: 'capitalize' }}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <svg width="100%" viewBox={`0 0 ${w} ${h + 20}`} preserveAspectRatio="none" style={{ display: 'block' }}>
          {/* Horizontal band grid lines at 5, 6, 7, 8 */}
          {[5, 6, 7, 8].map((band) => {
            const y = h - ((band - 4) / 5) * h;
            return (
              <g key={band}>
                <line x1={0} y1={y} x2={w} y2={y} stroke="#e8e2d0" strokeDasharray="3 3" />
                <text x={4} y={y - 4} fontSize="10" fill="#7a7263">{band}.0</text>
              </g>
            );
          })}
          {/* Trajectory line */}
          {pathD ? (
            <path d={pathD} fill="none" stroke={SECTION_COLORS[activeKey]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
          {/* Sample dots */}
          {points.map((p, idx) => (
            <circle key={idx} cx={p.x} cy={p.y} r={3} fill={SECTION_COLORS[activeKey]} />
          ))}
        </svg>
        {loading ? <p className="muted" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>Loading…</p> : null}
        {!loading && (!data || data.series.length < 2) ? (
          <p className="muted" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 16 }}>
            Complete two or more attempts to draw a trajectory.
          </p>
        ) : null}
      </div>
    </section>
  );
};

// ============================================================
// Activity heatmap (52-week GitHub-style) + streak
// ============================================================

interface ActivityProps {
  accessToken: string | null;
}

export const ActivityHeatmapCard = ({ accessToken }: ActivityProps) => {
  const [data, setData] = useState<PracticeActivityResponse | null>(null);
  const { ref, visible } = useLazyVisible();
  useEffect(() => {
    if (!accessToken || !visible || data) return;
    practiceActivityGet(accessToken).then((res) => setData(res)).catch(() => null);
  }, [accessToken, visible, data]);

  // Build 53-week grid ending today
  const grid = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Roll back to last Sunday so columns are aligned weeks
    const day = today.getDay();
    const lastSunday = new Date(today.getTime() - day * 24 * 60 * 60 * 1000);
    const weeks: Array<Array<{ date: string; attempts: number }>> = [];
    const dayMap = new Map<string, ActivityDay>();
    (data?.days ?? []).forEach((d) => dayMap.set(d.date, d));
    for (let w = 52; w >= 0; w -= 1) {
      const col: Array<{ date: string; attempts: number }> = [];
      for (let d = 0; d < 7; d += 1) {
        const date = new Date(lastSunday.getTime() - (w * 7 - d) * 24 * 60 * 60 * 1000);
        const iso = isoDate(date);
        col.push({ date: iso, attempts: dayMap.get(iso)?.attempts ?? 0 });
      }
      weeks.push(col);
    }
    return weeks;
  }, [data]);

  const shade = (attempts: number): string => {
    if (attempts === 0) return '#efeadb';
    if (attempts === 1) return '#c4d2c8';
    if (attempts <= 3) return '#7faa92';
    if (attempts <= 6) return '#3f7d5e';
    return '#0e4955';
  };

  return (
    <section ref={ref} className="glass" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <p className="eyebrow"><Calendar size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Activity</p>
          <h2 style={{ margin: '4px 0 4px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <Flame size={24} style={{ color: '#b15a1e' }} />
            {data?.streak.current_days ?? 0}
            <span className="muted" style={{ fontSize: '0.55em', fontWeight: 400 }}>day streak</span>
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Longest {data?.streak.longest_days ?? 0} days · {data?.totals.last_30_days ?? 0} attempts in the last 30 days
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, overflowX: 'auto' }}>
        {grid.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gap: 3 }}>
            {week.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.attempts} attempt${cell.attempts === 1 ? '' : 's'}`}
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 2,
                  background: shade(cell.attempts),
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: '#7a7263' }}>
        <span>Less</span>
        {[0, 1, 2, 4, 7].map((n, i) => (
          <div
            key={i}
            style={{ width: 11, height: 11, borderRadius: 2, background: shade(n) }}
          />
        ))}
        <span>More</span>
      </div>
    </section>
  );
};

// ============================================================
// Mastery overview: taxonomy + graduation
// ============================================================

interface MasteryOverviewProps {
  accessToken: string | null;
}

const STATUS_ORDER: Array<MasteryRow['mastery_status']> = ['weak', 'building', 'stable', 'mastered'];
const STATUS_COPY: Record<string, { label: string; tone: string; description: string }> = {
  weak: { label: 'Repair', tone: '#9b2c2c', description: 'Below 60% rolling accuracy' },
  building: { label: 'Building', tone: '#b08020', description: 'Reaching consistency' },
  stable: { label: 'Stable', tone: '#0e4955', description: 'Above 75% across attempts' },
  mastered: { label: 'Graduated', tone: '#166534', description: '90%+ for 3+ attempts in a row' },
};

export const MasteryOverviewCard = ({ accessToken }: MasteryOverviewProps) => {
  const [data, setData] = useState<PracticeMasteryOverviewResponse | null>(null);
  const { ref, visible } = useLazyVisible();
  useEffect(() => {
    if (!accessToken || !visible || data) return;
    practiceMasteryOverviewGet(accessToken).then((res) => setData(res)).catch(() => null);
  }, [accessToken, visible, data]);

  if (!data) {
    return (
      <section ref={ref} className="glass" style={{ padding: 24, display: 'grid', gap: 14 }}>
        <div>
          <p className="eyebrow"><GraduationCap size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Mastery taxonomy</p>
          <span className="p2-skeleton p2-skeleton-line medium" style={{ marginTop: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[0, 1, 2, 3].map((i) => <span key={i} className="p2-skeleton p2-skeleton-block" />)}
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="glass" style={{ padding: 24, display: 'grid', gap: 18 }}>
      <div>
        <p className="eyebrow"><GraduationCap size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Mastery taxonomy</p>
        <h2 style={{ margin: '4px 0 4px' }}>
          {data.totals.mastered} of {data.totals.tracked}
          <span className="muted" style={{ fontSize: '0.55em', fontWeight: 400, marginLeft: 6 }}>graduated</span>
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {STATUS_ORDER.map((status) => {
          const rows = data.by_status[status] ?? [];
          const copy = STATUS_COPY[status] ?? { label: status, tone: '#7a7263', description: '' };
          return (
            <article
              key={status}
              style={{
                padding: 14,
                border: '1px solid var(--card-border)',
                borderRadius: 10,
                background: `color-mix(in srgb, ${copy.tone} 4%, white)`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: copy.tone }}>
                  {copy.label}
                </span>
                <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 22 }}>{rows.length}</strong>
              </div>
              <p className="muted" style={{ margin: '6px 0 10px', fontSize: 12 }}>{copy.description}</p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                {rows.slice(0, 4).map((row) => (
                  <li key={`${row.section_type}::${row.question_type}`} style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                    <span className={`chip ${row.section_type}`} style={{ marginRight: 6, fontSize: 9 }}>
                      {row.section_type[0]?.toUpperCase()}
                    </span>
                    {formatPracticeLabel(row.question_type)}
                  </li>
                ))}
                {rows.length > 4 ? (
                  <li className="muted" style={{ fontSize: 12 }}>+ {rows.length - 4} more</li>
                ) : null}
              </ul>
            </article>
          );
        })}
      </div>

      {data.trap_patterns.length > 0 ? (
        <div>
          <p className="eyebrow" style={{ margin: '0 0 8px' }}>Trap pattern fingerprint</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.trap_patterns.map((trap) => (
              <span
                key={trap.trap_type}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: 'var(--card-subtle)',
                  border: '1px solid var(--card-border)',
                  fontSize: 13,
                }}
              >
                <strong style={{ marginRight: 6 }}>{trap.trap_type.replace(/_/g, ' ')}</strong>
                <span className="muted">×{trap.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {data.recent_graduations.length > 0 ? (
        <div>
          <p className="eyebrow" style={{ margin: '0 0 8px', color: '#166534' }}>
            <Sparkles size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
            Recent graduations
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.recent_graduations.map((row) => (
              <li
                key={`${row.section_type}::${row.question_type}`}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid #b5cdb5',
                  background: 'color-mix(in srgb, #166534 6%, white)',
                  fontSize: 12.5,
                  color: '#166534',
                  fontWeight: 600,
                }}
              >
                <span className={`chip ${row.section_type}`} style={{ marginRight: 6, fontSize: 9, background: 'transparent', color: '#166534', border: 'none' }}>
                  {row.section_type[0]?.toUpperCase()}
                </span>
                {formatPracticeLabel(row.question_type)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
