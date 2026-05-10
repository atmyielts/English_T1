import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Calendar, CheckCircle2, Flame, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import { useLazyVisible } from '../lib/useLazyVisible';
import {
  playbookCatalogGet,
  playbookRecommendationGenerate,
  practiceActivityGet,
  practiceMasteryOverviewGet,
  practiceTrajectoryGet,
  type ActivityDay,
  type BandPredictorEntry,
  type MasteryRow,
  type PracticeActivityResponse,
  type PracticeMasteryOverviewResponse,
  type PracticeTrajectoryResponse,
  type TrajectoryPoint,
} from '../lib/api';

// ============================================================
// Module progress — visited modules out of full catalog
// ============================================================

interface ProgressProps {
  visitedSlugs: string[];
  onOpenModule?: (slug: string) => void;
}

export const PlaybookModuleProgress = ({ visitedSlugs }: ProgressProps) => {
  const [modules, setModules] = useState<Array<{ slug: string; title: string }> | null>(null);
  useEffect(() => {
    playbookCatalogGet()
      .then((res) => setModules(res.modules.map((m) => ({ slug: m.slug, title: m.title }))))
      .catch(() => setModules([]));
  }, []);

  if (modules == null) {
    return (
      <section className="glass" style={{ padding: 22 }}>
        <p className="muted">Loading curriculum…</p>
      </section>
    );
  }

  const visitedSet = new Set(visitedSlugs);
  const total = modules.length;
  const completed = modules.filter((m) => visitedSet.has(m.slug)).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <section className="glass" style={{ padding: 22, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>
            <BookOpen size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
            Curriculum progress
          </p>
          <h2 style={{ margin: '4px 0 4px' }}>
            {completed} <span className="muted" style={{ fontSize: '0.6em', fontWeight: 400 }}>of {total} modules</span>
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Modules you’ve opened from your playbook plan.
          </p>
        </div>
        <span
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: pct >= 80 ? '#166534' : pct >= 40 ? '#0e4955' : '#7a7263',
            color: 'white',
            fontFamily: 'Fraunces, serif',
            fontWeight: 600,
            fontSize: 18,
          }}
        >
          {pct}%
        </span>
      </div>
      <div className="progress-track" style={{ height: 8, background: 'var(--card-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: pct >= 80 ? '#166534' : pct >= 40 ? '#0e4955' : '#b08020',
            transition: 'width 240ms ease',
          }}
        />
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        {modules.slice(0, 8).map((m) => {
          const done = visitedSet.has(m.slug);
          return (
            <li
              key={m.slug}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 6,
                background: done ? 'color-mix(in srgb, #166534 6%, white)' : 'var(--card-subtle)',
                border: `1px solid ${done ? '#b5cdb5' : 'var(--card-border)'}`,
                fontSize: 13,
              }}
            >
              {done ? (
                <CheckCircle2 size={14} style={{ color: '#166534', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid var(--card-border)', flexShrink: 0 }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.title}>
                {m.title}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

// ============================================================
// Stale-plan banner — evidence_updated_at vs recommendation.created_at
// ============================================================

interface StalePlanProps {
  accessToken: string | null;
  evidenceUpdatedAt: string | null | undefined;
  recommendationCreatedAt: string | null | undefined;
  onRegenerated: () => void;
}

export const PlaybookStalePlanBanner = ({
  accessToken,
  evidenceUpdatedAt,
  recommendationCreatedAt,
  onRegenerated,
}: StalePlanProps) => {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stale = useMemo(() => {
    if (!evidenceUpdatedAt) return false;
    if (!recommendationCreatedAt) return true;
    return new Date(evidenceUpdatedAt).getTime() > new Date(recommendationCreatedAt).getTime();
  }, [evidenceUpdatedAt, recommendationCreatedAt]);

  if (!stale) return null;

  const regenerate = async () => {
    if (!accessToken) return;
    setRunning(true);
    setError(null);
    try {
      await playbookRecommendationGenerate(accessToken, {});
      onRegenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not regenerate plan');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        padding: '14px 20px',
        background: 'color-mix(in srgb, #b08020 8%, white)',
        border: '1px solid color-mix(in srgb, #b08020 30%, transparent)',
        borderRadius: 12,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AlertCircle size={20} style={{ color: '#b08020' }} />
        <div>
          <strong style={{ color: '#7a5810' }}>Fresh mock results since your plan was generated</strong>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            Regenerate so your strategy plan reflects what you actually need now.
          </p>
        </div>
      </div>
      <button
        type="button"
        className="btn solid compact"
        onClick={() => void regenerate()}
        disabled={running}
        style={{ background: '#b08020', borderColor: '#b08020' }}
      >
        {running ? 'Regenerating…' : 'Regenerate plan'} <RefreshCw size={12} style={{ marginLeft: 4 }} />
      </button>
      {error ? <p className="error-text" style={{ flexBasis: '100%', margin: 0 }}>{error}</p> : null}
    </div>
  );
};

// ============================================================
// Cross-app band trajectory (mirrors the practice version)
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
): { d: string; points: Array<{ x: number; y: number }> } => {
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
  const range = Math.max(1, new Date(last.date).getTime() - firstDate);
  const x = (date: string) => ((new Date(date).getTime() - firstDate) / range) * width;
  const y = (band: number) => height - ((band - yMin) / (yMax - yMin)) * height;
  let d = '';
  const points: Array<{ x: number; y: number }> = [];
  valid.forEach((p, i) => {
    const cx = x(p.date);
    const cy = y(p.value);
    d += i === 0 ? `M${cx.toFixed(1)},${cy.toFixed(1)}` : ` L${cx.toFixed(1)},${cy.toFixed(1)}`;
    points.push({ x: cx, y: cy });
  });
  return { d, points };
};

interface InsightsProps {
  accessToken: string | null;
}

export const PlaybookTrajectoryCard = ({ accessToken }: InsightsProps) => {
  const [data, setData] = useState<PracticeTrajectoryResponse | null>(null);
  type ChartKey = 'overall' | 'reading' | 'listening' | 'writing';
  const [activeKey, setActiveKey] = useState<ChartKey>('overall');
  const bandKey: BandKey = activeKey === 'overall' ? 'overall_band' : activeKey;
  const { ref, visible } = useLazyVisible();

  useEffect(() => {
    if (!accessToken || !visible || data) return;
    practiceTrajectoryGet(accessToken).then((res) => setData(res)).catch(() => null);
  }, [accessToken, visible, data]);

  const w = 640;
  const h = 180;
  const { d: pathD, points } = useMemo(
    () => (data ? drawTrajectoryPath(data.series, bandKey, w, h) : { d: '', points: [] }),
    [data, bandKey],
  );
  const predictor: BandPredictorEntry | undefined = data?.predictor?.[activeKey];

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
      <svg width="100%" viewBox={`0 0 ${w} ${h + 20}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {[5, 6, 7, 8].map((band) => {
          const y = h - ((band - 4) / 5) * h;
          return (
            <g key={band}>
              <line x1={0} y1={y} x2={w} y2={y} stroke="#e8e2d0" strokeDasharray="3 3" />
              <text x={4} y={y - 4} fontSize="10" fill="#7a7263">{band}.0</text>
            </g>
          );
        })}
        {pathD ? <path d={pathD} fill="none" stroke={SECTION_COLORS[activeKey]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((p, idx) => <circle key={idx} cx={p.x} cy={p.y} r={3} fill={SECTION_COLORS[activeKey]} />)}
      </svg>
      {!data || data.series.length < 2 ? (
        <p className="muted" style={{ margin: '8px 0 0', textAlign: 'center' }}>
          Complete two or more attempts in the practice or simulator app to draw a trajectory.
        </p>
      ) : null}
    </section>
  );
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const PlaybookActivityCard = ({ accessToken }: InsightsProps) => {
  const [data, setData] = useState<PracticeActivityResponse | null>(null);
  const { ref, visible } = useLazyVisible();
  useEffect(() => {
    if (!accessToken || !visible || data) return;
    practiceActivityGet(accessToken).then((res) => setData(res)).catch(() => null);
  }, [accessToken, visible, data]);

  const grid = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const lastSunday = new Date(today.getTime() - day * 24 * 60 * 60 * 1000);
    const dayMap = new Map<string, ActivityDay>();
    (data?.days ?? []).forEach((d) => dayMap.set(d.date, d));
    const weeks: Array<Array<{ date: string; attempts: number }>> = [];
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
      <div style={{ marginBottom: 14 }}>
        <p className="eyebrow"><Calendar size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Activity</p>
        <h2 style={{ margin: '4px 0 4px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <Flame size={24} style={{ color: '#b15a1e' }} />
          {data?.streak.current_days ?? 0}
          <span className="muted" style={{ fontSize: '0.55em', fontWeight: 400 }}>day streak</span>
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {data?.totals.last_30_days ?? 0} practice + simulator attempts in the last 30 days
        </p>
      </div>
      <div style={{ display: 'flex', gap: 3, overflowX: 'auto' }}>
        {grid.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gap: 3 }}>
            {week.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.attempts} attempt${cell.attempts === 1 ? '' : 's'}`}
                style={{ width: 11, height: 11, borderRadius: 2, background: shade(cell.attempts) }}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  weak: { label: 'Repair', tone: '#9b2c2c' },
  building: { label: 'Building', tone: '#b08020' },
  stable: { label: 'Stable', tone: '#0e4955' },
  mastered: { label: 'Graduated', tone: '#166534' },
};

export const PlaybookMasteryCard = ({ accessToken }: InsightsProps) => {
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
          <p className="eyebrow"><Sparkles size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Mastery</p>
          <span className="p2-skeleton p2-skeleton-line medium" style={{ marginTop: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {[0, 1, 2, 3].map((i) => <span key={i} className="p2-skeleton p2-skeleton-block" style={{ height: 80 }} />)}
        </div>
      </section>
    );
  }

  const order = ['weak', 'building', 'stable', 'mastered'];

  return (
    <section ref={ref} className="glass" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <p className="eyebrow"><Sparkles size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Mastery</p>
        <h2 style={{ margin: '4px 0 4px' }}>
          {data.totals.mastered} <span className="muted" style={{ fontSize: '0.55em', fontWeight: 400 }}>of {data.totals.tracked} graduated</span>
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          From your practice submissions — question types you’ve drilled into mastery.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {order.map((status) => {
          const rows: MasteryRow[] = data.by_status[status] ?? [];
          const copy = STATUS_COPY[status] ?? { label: status, tone: '#7a7263' };
          return (
            <div
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
            </div>
          );
        })}
      </div>
      {data.recent_graduations.length > 0 ? (
        <div>
          <p className="eyebrow" style={{ margin: '0 0 8px', color: '#166534' }}>Recent graduations</p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.recent_graduations.slice(0, 8).map((row) => (
              <li
                key={`${row.section_type}::${row.question_type}`}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid #b5cdb5',
                  background: 'color-mix(in srgb, #166534 6%, white)',
                  color: '#166534',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {row.question_type.replace(/^question_/, '').replace(/_/g, ' ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

// ============================================================
// Section title for the playbook dashboard
// ============================================================

interface SectionTitleProps {
  eyebrow: string;
  title: string;
  hint?: string;
}

export const PlaybookSectionTitle = ({ eyebrow, title, hint }: SectionTitleProps) => (
  <header style={{ marginTop: 32, marginBottom: 16 }}>
    <p className="eyebrow" style={{ margin: 0 }}>{eyebrow}</p>
    <h2 style={{ margin: '6px 0 4px' }}>{title}</h2>
    {hint ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>{hint}</p> : null}
  </header>
);
