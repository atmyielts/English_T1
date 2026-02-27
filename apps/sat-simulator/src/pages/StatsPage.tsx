import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, PieChart } from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { supabase } from '../lib/supabase';

type Json = Record<string, unknown>;

type SessionRow = {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metadata: Json | null;
  experience_id: string;
  experience?: { id: string; name: string } | { id: string; name: string }[] | null;
};

type EvaluationRow = {
  session_id: string;
  evaluated_at: string;
  result: any;
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const getOverallBand = (result: any): number | null => {
  const n = result?.overall_band;
  return typeof n === 'number' ? n : null;
};

const getSatTotal = (result: any): number | null => {
  const n = result?.sat?.total_score;
  return typeof n === 'number' ? n : null;
};

const getExperience = (s: SessionRow): { id: string; name: string } | null => {
  const e: any = s.experience;
  if (!e) return null;
  return Array.isArray(e) ? (e[0] ?? null) : e;
};

const classifySession = (s: SessionRow): 'full' | 'practice' | 'section_only' => {
  const meta: any = s.metadata ?? {};
  const mode = String(meta.mode ?? '').toLowerCase();
  if (mode === 'practice') return 'practice';
  if (mode === 'section_only') return 'section_only';

  const allowed = meta.allowed_section_ids;
  if (Array.isArray(allowed) && allowed.length > 0) return 'section_only';

  return 'full';
};

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

export const StatsPage: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, EvaluationRow>>({});

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const { data: sessRows, error: sessError } = await supabase
        .from('sessions')
        .select('id,status,created_at,started_at,completed_at,metadata,experience_id,experience:experiences(id,name)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (sessError) {
        setError(sessError.message);
        setSessions([]);
        setEvaluations({});
        setLoading(false);
        return;
      }

      const list = (sessRows ?? []) as SessionRow[];
      setSessions(list);

      const ids = list.map((s) => s.id);
      if (ids.length === 0) {
        setEvaluations({});
        setLoading(false);
        return;
      }

      const { data: evalRows, error: evalError } = await supabase
        .from('evaluations')
        .select('session_id,evaluated_at,result')
        .in('session_id', ids);

      if (evalError) {
        setEvaluations({});
        setLoading(false);
        return;
      }

      const bySession: Record<string, EvaluationRow> = {};
      for (const r of (evalRows ?? []) as EvaluationRow[]) bySession[r.session_id] = r;
      setEvaluations(bySession);
      setLoading(false);
    };

    run();
  }, []);

  const completed = useMemo(() => sessions.filter((s) => s.status === 'completed'), [sessions]);
  const inProgress = useMemo(() => sessions.filter((s) => s.status !== 'completed'), [sessions]);

  const overview = useMemo(() => {
    const total = sessions.length;
    const completedCount = completed.length;
    const inProgressCount = inProgress.length;

    const satValues: number[] = [];
    const bandValues: number[] = [];
    for (const s of completed) {
      const ev = evaluations[s.id];
      const sat = ev ? getSatTotal(ev.result) : null;
      if (typeof sat === 'number' && Number.isFinite(sat)) satValues.push(sat);
      const band = ev ? getOverallBand(ev.result) : null;
      if (typeof band === 'number' && Number.isFinite(band)) bandValues.push(band);
    }

    const scoreMode: 'sat' | 'band' = satValues.length > 0 ? 'sat' : 'band';
    const avgMetric =
      scoreMode === 'sat'
        ? satValues.length > 0
          ? Math.round(satValues.reduce((a, b) => a + b, 0) / satValues.length)
          : null
        : bandValues.length > 0
          ? Math.round(((bandValues.reduce((a, b) => a + b, 0) / bandValues.length) * 2)) / 2
          : null;

    const modes = { full: 0, practice: 0, section_only: 0 };
    for (const s of sessions) modes[classifySession(s)] += 1;

    return { total, completedCount, inProgressCount, avgMetric, scoreMode, modes };
  }, [completed, evaluations, inProgress, sessions]);

  const donut = useMemo(() => {
    const total = overview.total || 1;
    const fullPct = clampPct((overview.modes.full / total) * 100);
    const practicePct = clampPct((overview.modes.practice / total) * 100);
    const sectionPct = clampPct(100 - fullPct - practicePct);

    const seg1 = fullPct;
    const seg2 = fullPct + practicePct;

    const backgroundImage = `conic-gradient(
      rgba(16,185,129,0.95) 0 ${seg1}%,
      rgba(56,189,248,0.95) ${seg1}% ${seg2}%,
      rgba(251,191,36,0.95) ${seg2}% 100%
    )`;

    return {
      total,
      fullPct,
      practicePct,
      sectionPct,
      backgroundImage,
    };
  }, [overview.modes.full, overview.modes.practice, overview.total]);

  const scoreDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of completed) {
      const ev = evaluations[s.id];
      if (overview.scoreMode === 'sat') {
        const sat = ev ? getSatTotal(ev.result) : null;
        if (typeof sat !== 'number' || !Number.isFinite(sat)) continue;
        const bucket = String(Math.round(sat / 50) * 50);
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
        continue;
      }
      const band = ev ? getOverallBand(ev.result) : null;
      if (typeof band !== 'number' || !Number.isFinite(band)) continue;
      const bucket = (Math.round(band * 2) / 2).toFixed(1);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    const entries = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => Number(a.label) - Number(b.label));

    const max = Math.max(1, ...entries.map((e) => e.count));
    return { entries, max };
  }, [completed, evaluations, overview.scoreMode]);

  const openContinue = (s: SessionRow) => {
    const currentSection = String((s.metadata as any)?.current_section_id ?? '');
    if (currentSection) {
      navigate(`/session/${s.id}/${currentSection}`);
      return;
    }
    navigate(`/test/${s.experience_id}`);
  };

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Performance</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-2">Stats</h1>
          <p className="text-[#475569] mt-2">Your recent sessions and scores.</p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#151d2b]/12 bg-white/70 px-4 py-3 text-[#475569]">Loading sessions...</div>
        ) : null}
        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white/75 backdrop-blur border border-[#151d2b]/12 rounded-3xl shadow-sm ring-1 ring-black/5 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-[#64748b]">Mode breakdown</div>
                <div className="text-lg font-semibold text-[#0f172a] mt-1">How you practice</div>
              </div>
              <div className="w-9 h-9 rounded-2xl bg-emerald-600/10 border border-emerald-700/10 flex items-center justify-center text-emerald-800">
                <PieChart size={18} />
              </div>
            </div>

            <div className="mt-5 flex items-center gap-6">
              <div className="relative w-32 h-32 shrink-0">
                <div
                  className="absolute inset-0 rounded-full shadow-sm"
                  style={{
                    backgroundImage: donut.backgroundImage,
                  }}
                />
                <div className="absolute inset-4 rounded-full bg-white/85 backdrop-blur border border-white/70 shadow-inner flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-black text-gray-900">{overview.total}</div>
                    <div className="text-[11px] text-gray-600 font-semibold uppercase tracking-wider">Sessions</div>
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-gray-800 font-semibold">Full exam</span>
                  </div>
                  <div className="text-gray-600 font-mono text-xs">
                    {overview.modes.full} ({donut.fullPct.toFixed(0)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                    <span className="text-gray-800 font-semibold">Practice</span>
                  </div>
                  <div className="text-gray-600 font-mono text-xs">
                    {overview.modes.practice} ({donut.practicePct.toFixed(0)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-gray-800 font-semibold">Single section</span>
                  </div>
                  <div className="text-gray-600 font-mono text-xs">
                    {overview.modes.section_only} ({donut.sectionPct.toFixed(0)}%)
                  </div>
                </div>

                <div className="pt-2 text-xs text-gray-500">
                  No extra tracking needed: this is derived from existing session metadata.
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white/75 backdrop-blur border border-[#151d2b]/12 rounded-3xl shadow-sm ring-1 ring-black/5 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-[#64748b]">Score distribution</div>
                <div className="text-lg font-semibold text-[#0f172a] mt-1">
                  {overview.scoreMode === 'sat' ? 'Average total score ' : 'Overall band '}
                  {overview.avgMetric !== null ? (
                    <span className="text-emerald-700">
                      {overview.scoreMode === 'sat' ? overview.avgMetric : overview.avgMetric.toFixed(1)}
                    </span>
                  ) : (
                    'n/a'
                  )}
                </div>
              </div>
              <div className="w-9 h-9 rounded-2xl bg-sky-500/10 border border-sky-600/10 flex items-center justify-center text-sky-800">
                <BarChart3 size={18} />
              </div>
            </div>

            {scoreDistribution.entries.length === 0 ? (
              <div className="mt-6 text-sm text-gray-600">
                No scored sessions yet. Complete a test to see score distribution.
              </div>
            ) : (
              <div className="mt-6">
                <div className="flex items-end gap-3 h-28">
                  {scoreDistribution.entries.map((e) => {
                    const pct = (e.count / scoreDistribution.max) * 100;
                    return (
                      <div key={e.label} className="flex flex-col items-center justify-end gap-2 w-10">
                        <div className="text-[11px] text-gray-600 font-mono">{e.count}</div>
                        <div className="w-full h-20 flex items-end">
                          <div
                            className="w-full rounded-2xl bg-gradient-to-t from-emerald-600 via-emerald-500 to-emerald-300 shadow-sm"
                            style={{ height: `${Math.max(6, pct)}%` }}
                            title={`${overview.scoreMode === 'sat' ? 'Score' : 'Band'} ${e.label}: ${e.count}`}
                          />
                        </div>
                        <div className="text-[11px] text-gray-600 font-mono">{e.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  {overview.scoreMode === 'sat'
                    ? 'Scores are grouped to the nearest 50 points for display.'
                    : 'Bands are rounded to the nearest 0.5 for display.'}
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#0f172a]">In progress</h2>
          <div className="mt-4 space-y-3">
            {inProgress.map((s) => (
              <div key={s.id} className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Session</div>
                  <div className="font-bold text-gray-900 mt-1 truncate">{getExperience(s)?.name ?? 'Test'}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Status: <span className="font-semibold">{s.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Created: {formatDateTime(s.created_at)}</div>
                </div>
                <div className="shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                  <button
                    onClick={() => openContinue(s)}
                    className="w-full sm:w-auto px-4 py-2 rounded-2xl bg-[#0f172a] text-white font-semibold hover:bg-black transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => navigate(`/test/${s.experience_id}`)}
                    className="w-full sm:w-auto px-4 py-2 rounded-2xl border border-[#151d2b]/15 bg-white/80 text-gray-900 font-semibold hover:bg-white transition-colors"
                  >
                    Overview
                  </button>
                </div>
              </div>
            ))}
            {inProgress.length === 0 && !loading ? (
              <div className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-6 text-gray-600">
                No in-progress sessions.
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#0f172a]">Completed</h2>
          <div className="mt-4 space-y-3">
            {completed.map((s) => {
              const ev = evaluations[s.id];
              const band = ev ? getOverallBand(ev.result) : null;
              const sat = ev ? getSatTotal(ev.result) : null;
              return (
                <div key={s.id} className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Completed session</div>
                    <div className="font-bold text-gray-900 mt-1 truncate">{getExperience(s)?.name ?? 'Test'}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Completed: <span className="font-semibold">{formatDateTime(s.completed_at)}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {sat !== null ? `Total score: ${sat}` : `Overall band: ${band ?? 'n/a'}`}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                    <button
                      onClick={() => navigate(`/session/${s.id}/results`)}
                      className="w-full sm:w-auto px-4 py-2 rounded-2xl bg-[#0f172a] text-white font-semibold hover:bg-black transition-colors"
                    >
                      Results
                    </button>
                    <button
                      onClick={() => navigate(`/review/${s.id}`)}
                      className="w-full sm:w-auto px-4 py-2 rounded-2xl border border-[#151d2b]/15 bg-white/80 text-gray-900 font-semibold hover:bg-white transition-colors"
                    >
                      Review
                    </button>
                  </div>
                </div>
              );
            })}
            {completed.length === 0 && !loading ? (
              <div className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-6 text-gray-600">
                No completed sessions yet.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </MainLayout>
  );
};
