import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, PieChart } from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { getItepComposite } from '../lib/itepScores';
import { ITEP_PRODUCT_ID } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

type ExperienceLink = {
  id: string;
  name: string;
  product_id: string;
};

type SessionRow = {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metadata: Json | null;
  experience_id: string;
  experience?: ExperienceLink | ExperienceLink[] | null;
};

type EvaluationRow = {
  session_id: string;
  evaluated_at: string;
  result: any;
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return 'n/a';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const getExperience = (session: SessionRow): { id: string; name: string } | null => {
  const linked: any = session.experience;
  if (!linked) return null;
  return Array.isArray(linked) ? (linked[0] ?? null) : linked;
};

const classifySession = (session: SessionRow): 'full' | 'practice' | 'section_only' => {
  const metadata: any = session.metadata ?? {};
  const mode = String(metadata.mode ?? '').toLowerCase();
  if (mode === 'practice') return 'practice';
  if (mode === 'section_only') return 'section_only';
  const allowedSectionIds = metadata.allowed_section_ids;
  if (Array.isArray(allowedSectionIds) && allowedSectionIds.length > 0) return 'section_only';
  return 'full';
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const scoreBucketLabel = (score: number): string => {
  const start = Math.floor(score * 2) / 2;
  const end = Math.min(6, start + 0.4);
  return `${start.toFixed(1)}-${end.toFixed(1)}`;
};

export const StatsPage: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, EvaluationRow>>({});

  useEffect(() => {
    const run = async () => {
      if (!userId) {
        setLoading(true);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: sessionRows, error: sessionError } = await supabase
        .from('sessions')
        .select('id,status,created_at,started_at,completed_at,metadata,experience_id,experience:experiences!inner(id,name,product_id)')
        .eq('user_id', userId)
        .eq('experience.product_id', ITEP_PRODUCT_ID)
        .order('created_at', { ascending: false })
        .limit(50);

      if (sessionError) {
        setError(sessionError.message);
        setSessions([]);
        setEvaluations({});
        setLoading(false);
        return;
      }

      const visibleSessions = (sessionRows ?? []) as SessionRow[];
      setSessions(visibleSessions);

      const sessionIds = visibleSessions.map((session) => session.id);
      if (sessionIds.length === 0) {
        setEvaluations({});
        setLoading(false);
        return;
      }

      const { data: evaluationRows, error: evaluationError } = await supabase
        .from('evaluations')
        .select('session_id,evaluated_at,result')
        .in('session_id', sessionIds)
        .order('evaluated_at', { ascending: false });

      if (evaluationError) {
        setEvaluations({});
        setLoading(false);
        return;
      }

      const grouped: Record<string, EvaluationRow> = {};
      for (const row of (evaluationRows ?? []) as EvaluationRow[]) {
        if (!grouped[row.session_id]) grouped[row.session_id] = row;
      }
      setEvaluations(grouped);
      setLoading(false);
    };

    void run();
  }, [userId]);

  const completed = useMemo(() => sessions.filter((session) => session.status === 'completed'), [sessions]);
  const inProgress = useMemo(() => sessions.filter((session) => session.status !== 'completed'), [sessions]);

  const overview = useMemo(() => {
    const total = sessions.length;
    const completedCount = completed.length;
    const inProgressCount = inProgress.length;

    const scoreValues = completed
      .map((session) => (evaluations[session.id] ? getItepComposite(evaluations[session.id].result) : null))
      .filter((value): value is number => value != null);

    const avgMetric =
      scoreValues.length > 0
        ? Math.round((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) * 10) / 10
        : null;

    const modes = { full: 0, practice: 0, section_only: 0 };
    for (const session of sessions) modes[classifySession(session)] += 1;

    return { total, completedCount, inProgressCount, avgMetric, modes };
  }, [completed, evaluations, inProgress, sessions]);

  const donut = useMemo(() => {
    const total = overview.total || 1;
    const fullPercent = clampPercent((overview.modes.full / total) * 100);
    const practicePercent = clampPercent((overview.modes.practice / total) * 100);
    const sectionPercent = clampPercent(100 - fullPercent - practicePercent);
    const secondStop = fullPercent + practicePercent;

    return {
      total,
      fullPercent,
      practicePercent,
      sectionPercent,
      backgroundImage: `conic-gradient(
        rgba(16,185,129,0.95) 0 ${fullPercent}%,
        rgba(56,189,248,0.95) ${fullPercent}% ${secondStop}%,
        rgba(251,191,36,0.95) ${secondStop}% 100%
      )`,
    };
  }, [overview.modes.full, overview.modes.practice, overview.total]);

  const scoreDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of completed) {
      const score = evaluations[session.id] ? getItepComposite(evaluations[session.id].result) : null;
      if (score == null) continue;
      const label = scoreBucketLabel(score);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    const entries = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => Number(left.label.split('-')[0]) - Number(right.label.split('-')[0]));

    return { entries, max: Math.max(1, ...entries.map((entry) => entry.count)) };
  }, [completed, evaluations]);

  const openContinue = (session: SessionRow) => {
    const currentSectionId = String((session.metadata as any)?.current_section_id ?? '');
    if (currentSectionId) {
      navigate(`/session/${session.id}/${currentSectionId}`);
      return;
    }
    navigate(`/test/${session.experience_id}`);
  };

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Performance</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-2">Stats</h1>
          <p className="text-[#475569] mt-2">Your recent iTEP sessions and estimated score profile.</p>
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
                <div className="absolute inset-0 rounded-full shadow-sm" style={{ backgroundImage: donut.backgroundImage }} />
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
                    {overview.modes.full} ({donut.fullPercent.toFixed(0)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                    <span className="text-gray-800 font-semibold">Practice</span>
                  </div>
                  <div className="text-gray-600 font-mono text-xs">
                    {overview.modes.practice} ({donut.practicePercent.toFixed(0)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-gray-800 font-semibold">Single section</span>
                  </div>
                  <div className="text-gray-600 font-mono text-xs">
                    {overview.modes.section_only} ({donut.sectionPercent.toFixed(0)}%)
                  </div>
                </div>

                <div className="pt-2 text-xs text-gray-500">
                  This view only uses your own iTEP sessions and does not mix in other products.
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white/75 backdrop-blur border border-[#151d2b]/12 rounded-3xl shadow-sm ring-1 ring-black/5 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-[#64748b]">Score distribution</div>
                <div className="text-lg font-semibold text-[#0f172a] mt-1">
                  Average composite
                  {overview.avgMetric !== null ? <span className="text-emerald-700"> {overview.avgMetric}/6.0</span> : ' n/a'}
                </div>
              </div>
              <div className="w-9 h-9 rounded-2xl bg-sky-500/10 border border-sky-600/10 flex items-center justify-center text-sky-800">
                <BarChart3 size={18} />
              </div>
            </div>

            {scoreDistribution.entries.length === 0 ? (
              <div className="mt-6 text-sm text-gray-600">No scored sessions yet. Complete a test to see score distribution.</div>
            ) : (
              <div className="mt-6">
                <div className="flex items-end gap-3 h-28">
                  {scoreDistribution.entries.map((entry) => {
                    const percent = (entry.count / scoreDistribution.max) * 100;
                    return (
                      <div key={entry.label} className="flex flex-col items-center justify-end gap-2 w-14">
                        <div className="text-[11px] text-gray-600 font-mono">{entry.count}</div>
                        <div className="w-full h-20 flex items-end">
                          <div
                            className="w-full rounded-2xl bg-gradient-to-t from-emerald-600 via-emerald-500 to-emerald-300 shadow-sm"
                            style={{ height: `${Math.max(6, percent)}%` }}
                            title={`Composite ${entry.label}: ${entry.count}`}
                          />
                        </div>
                        <div className="text-[11px] text-gray-600 font-mono">{entry.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-xs text-gray-500">Composite scores are grouped into 0.5-point ranges for display.</div>
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#0f172a]">In progress</h2>
          <div className="mt-4 space-y-3">
            {inProgress.map((session) => (
              <div key={session.id} className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Session</div>
                  <div className="font-bold text-gray-900 mt-1 truncate">{getExperience(session)?.name ?? 'Test'}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Status: <span className="font-semibold">{session.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Created: {formatDateTime(session.created_at)}</div>
                </div>
                <div className="shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                  <button
                    onClick={() => openContinue(session)}
                    className="w-full sm:w-auto px-4 py-2 rounded-2xl bg-[#0f172a] text-white font-semibold hover:bg-black transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => navigate(`/test/${session.experience_id}`)}
                    className="w-full sm:w-auto px-4 py-2 rounded-2xl border border-[#151d2b]/15 bg-white/80 text-gray-900 font-semibold hover:bg-white transition-colors"
                  >
                    Overview
                  </button>
                </div>
              </div>
            ))}
            {inProgress.length === 0 && !loading ? (
              <div className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-6 text-gray-600">No in-progress sessions.</div>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#0f172a]">Completed</h2>
          <div className="mt-4 space-y-3">
            {completed.map((session) => {
              const score = evaluations[session.id] ? getItepComposite(evaluations[session.id].result) : null;
              return (
                <div key={session.id} className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Completed session</div>
                    <div className="font-bold text-gray-900 mt-1 truncate">{getExperience(session)?.name ?? 'Test'}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Completed: <span className="font-semibold">{formatDateTime(session.completed_at)}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{score !== null ? `Estimated composite: ${score}/6.0` : 'Estimated composite: n/a'}</div>
                  </div>
                  <div className="shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                    <button
                      onClick={() => navigate(`/session/${session.id}/results`)}
                      className="w-full sm:w-auto px-4 py-2 rounded-2xl bg-[#0f172a] text-white font-semibold hover:bg-black transition-colors"
                    >
                      Results
                    </button>
                    <button
                      onClick={() => navigate(`/review/${session.id}`)}
                      className="w-full sm:w-auto px-4 py-2 rounded-2xl border border-[#151d2b]/15 bg-white/80 text-gray-900 font-semibold hover:bg-white transition-colors"
                    >
                      Review
                    </button>
                  </div>
                </div>
              );
            })}
            {completed.length === 0 && !loading ? (
              <div className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-6 text-gray-600">No completed sessions yet.</div>
            ) : null}
          </div>
        </section>
      </div>
    </MainLayout>
  );
};
