import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, FileText, Play, Sparkles } from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { supabase } from '../lib/supabase';
import { buildPlatformUrl, hasPlatformBase } from '../lib/platformUrls';
import { IELTS_PRODUCT_ID, IELTS_PRODUCT_SLUG } from '../lib/constants';
import { useAccess } from '../lib/useAccess';

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

type SectionLite = { id: string; name: string; metadata: Json | null } | null;

const getExperience = (s: SessionRow): { id: string; name: string } | null => {
  const e: any = s.experience;
  if (!e) return null;
  return Array.isArray(e) ? (e[0] ?? null) : e;
};

const getOverallBand = (result: any): number | null => {
  const n = result?.overall_band;
  return typeof n === 'number' ? n : null;
};

const fmt = (iso: string | null): string => {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const sectionType = (s: SectionLite): string => String((s?.metadata as any)?.type ?? '');

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

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const goPlatform = (path: string) => {
    const url = buildPlatformUrl(path, undefined, { product: IELTS_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return;
    }
    navigate(url);
  };

  const { status, userId, accessToken, me } = useAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [activeSection, setActiveSection] = useState<SectionLite>(null);
  const [recentCompleted, setRecentCompleted] = useState<SessionRow[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, EvaluationRow>>({});
  const [mix, setMix] = useState<{ total: number; full: number; practice: number; section_only: number } | null>(null);

  const [accessEndsAt, setAccessEndsAt] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (status !== 'authenticated' || !userId || !accessToken || !me) {
        setLoading(status === 'loading');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [activeRes, completedRes, mixRes] = await Promise.all([
          supabase
            .from('sessions')
            .select('id,status,created_at,started_at,completed_at,metadata,experience_id,experience:experiences(id,name)')
            .eq('user_id', userId)
            .in('status', ['created', 'active', 'paused'])
            .order('created_at', { ascending: false })
            .limit(1),
          supabase
            .from('sessions')
            .select('id,status,created_at,started_at,completed_at,metadata,experience_id,experience:experiences(id,name)')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(3),
          supabase
            .from('sessions')
            .select('id,status,created_at,metadata')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        if (activeRes.error) throw activeRes.error;
        if (completedRes.error) throw completedRes.error;
        if (mixRes.error) throw mixRes.error;

        const active = ((activeRes.data ?? [])[0] ?? null) as SessionRow | null;
        setActiveSession(active);

        const completed = (completedRes.data ?? []) as SessionRow[];
        setRecentCompleted(completed);

        const mixRows = (mixRes.data ?? []) as SessionRow[];
        if (mixRows.length > 0) {
          const summary = { total: mixRows.length, full: 0, practice: 0, section_only: 0 };
          for (const s of mixRows) summary[classifySession(s)] += 1;
          setMix(summary);
        } else {
          setMix(null);
        }

        const ent = me.entitlements.find((e) => e.resource_type === 'product' && e.resource_id === IELTS_PRODUCT_ID) ?? null;
        setAccessEndsAt(ent?.ends_at ?? null);

        const currentSectionId = active ? String((active.metadata as any)?.current_section_id ?? '') : '';
        if (currentSectionId) {
          const { data: sec, error: secErr } = await supabase
            .from('sections')
            .select('id,name,metadata')
            .eq('id', currentSectionId)
            .maybeSingle();
          if (!secErr) setActiveSection((sec as any) ?? null);
        } else {
          setActiveSection(null);
        }

        const ids = completed.map((s) => s.id);
        if (ids.length > 0) {
          const { data: evalRows, error: evalErr } = await supabase
            .from('evaluations')
            .select('session_id,evaluated_at,result')
            .in('session_id', ids);
          if (!evalErr) {
            const by: Record<string, EvaluationRow> = {};
            for (const r of (evalRows ?? []) as EvaluationRow[]) by[r.session_id] = r;
            setEvaluations(by);
          } else {
            setEvaluations({});
          }
        } else {
          setEvaluations({});
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
        setActiveSession(null);
        setActiveSection(null);
        setRecentCompleted([]);
        setEvaluations({});
        setMix(null);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [status, userId, accessToken, me]);

  const accessLabel = useMemo(() => {
    if (!accessEndsAt) return 'Active (no expiry set)';
    const d = new Date(accessEndsAt);
    if (Number.isNaN(d.getTime())) return `Active until ${accessEndsAt}`;
    return `Active until ${d.toLocaleString()}`;
  }, [accessEndsAt]);

  const activeDeadline = useMemo(() => {
    if (!activeSession) return null;
    const meta: any = activeSession.metadata ?? {};
    const sectionId = String(meta.current_section_id ?? '');
    const deadlines: any = meta.deadlines ?? {};
    const deadlineIso = sectionId && typeof deadlines[sectionId] === 'string' ? String(deadlines[sectionId]) : null;
    if (!deadlineIso) return null;
    const msLeft = Date.parse(deadlineIso) - Date.now();
    return { iso: deadlineIso, msLeft };
  }, [activeSession]);

  const donut = useMemo(() => {
    if (!mix || mix.total <= 0) return null;
    const total = mix.total || 1;
    const fullPct = clampPct((mix.full / total) * 100);
    const practicePct = clampPct((mix.practice / total) * 100);
    const sectionPct = clampPct(100 - fullPct - practicePct);

    const seg1 = fullPct;
    const seg2 = fullPct + practicePct;

    return {
      fullPct,
      practicePct,
      sectionPct,
      backgroundImage: `conic-gradient(
        rgba(16,185,129,0.95) 0 ${seg1}%,
        rgba(56,189,248,0.95) ${seg1}% ${seg2}%,
        rgba(251,191,36,0.95) ${seg2}% 100%
      )`,
    };
  }, [mix]);

  return (
    <MainLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-emerald-900 bg-emerald-100/70 border border-emerald-200 rounded-full px-3 py-1">
              <Sparkles size={14} />
              IELTS Academic
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mt-4">Dashboard</h1>
            <p className="text-gray-600 mt-2">Start a session, continue where you left off, or review results.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={() => navigate('/practice')}
              className="w-full sm:w-auto px-4 py-2 rounded-2xl border border-gray-200 hover:bg-white/70 backdrop-blur font-semibold"
            >
              Practice section
            </button>
            <button
              onClick={() => navigate('/full-exam')}
              className="w-full sm:w-auto px-4 py-2 rounded-2xl border border-gray-200 hover:bg-white font-semibold"
            >
              Full exam
            </button>
            <button
              onClick={() => goPlatform('/pricing')}
              className="w-full sm:w-auto px-4 py-2 rounded-2xl bg-gray-900 hover:bg-black text-white font-semibold"
            >
              Pricing
            </button>
          </div>
        </div>

        {loading ? <div className="text-gray-600">Loading dashboard...</div> : null}
        {error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-3xl shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">In progress</div>
                <div className="mt-2 text-lg font-bold text-gray-900">
                  {activeSession ? getExperience(activeSession)?.name ?? 'Test session' : 'No active session'}
                </div>
                {activeSession ? (
                  <div className="text-sm text-gray-600 mt-1">
                    Status: <span className="font-semibold">{activeSession.status}</span> | Started: {fmt(activeSession.started_at)}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 mt-1">Start a test to see progress here.</div>
                )}
              </div>

              {activeSession ? (
                <button
                  onClick={() => {
                    const secId = String((activeSession.metadata as any)?.current_section_id ?? '');
                    if (secId) {
                      navigate(`/session/${activeSession.id}/${secId}`);
                      return;
                    }
                    navigate(`/test/${activeSession.experience_id}`);
                  }}
                  className="w-full sm:w-auto shrink-0 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 justify-center"
                >
                  <Play size={16} />
                  Continue
                </button>
              ) : (
                <button
                  onClick={() => navigate('/full-exam')}
                  className="w-full sm:w-auto shrink-0 px-4 py-2.5 rounded-2xl bg-gray-900 hover:bg-black text-white font-semibold flex items-center gap-2 justify-center"
                >
                  <FileText size={16} />
                  Start full exam
                </button>
              )}
            </div>

            {activeSession ? (
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Current section</div>
                  <div className="mt-1 font-bold text-gray-900">{activeSection?.name ?? 'n/a'}</div>
                  <div className="text-sm text-gray-600 mt-1">{sectionType(activeSection) ? `Type: ${sectionType(activeSection)}` : null}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Time remaining</div>
                  {activeDeadline ? (
                    <>
                      <div className="mt-1 font-bold text-gray-900 flex items-center gap-2">
                        <Clock size={16} />
                        {activeDeadline.msLeft > 0 ? `${formatRemaining(activeDeadline.msLeft)} left` : 'Overdue'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Deadline: {fmt(activeDeadline.iso)}</div>
                    </>
                  ) : (
                    <div className="mt-1 text-sm text-gray-600">Enter a section once to start its timer.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-6">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Plan status</div>
            <div className="mt-2 text-lg font-bold text-gray-900">{accessLabel}</div>
            <p className="text-sm text-gray-600 mt-2">Manage your subscription or extend access anytime.</p>
            <button
              onClick={() => goPlatform('/pricing')}
              className="mt-5 w-full px-4 py-2.5 rounded-2xl border border-gray-200 hover:bg-white font-semibold"
            >
              Manage plans
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-6">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Quick start</div>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => navigate('/full-exam')}
                className="w-full px-4 py-2.5 rounded-2xl bg-gray-900 hover:bg-black text-white font-semibold flex items-center gap-2"
              >
                <FileText size={16} />
                Full exam
              </button>
              <button
                onClick={() => navigate('/practice')}
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 hover:bg-white font-semibold flex items-center gap-2"
              >
                <BookOpen size={16} />
                Practice section
              </button>
              <button
                onClick={() => navigate('/review')}
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 hover:bg-white font-semibold flex items-center gap-2"
              >
                <Clock size={16} />
                View results
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-6">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Session mix</div>
            {donut ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  <div className="absolute inset-0 rounded-full shadow-sm" style={{ backgroundImage: donut.backgroundImage }} />
                  <div className="absolute inset-3 rounded-full bg-white flex items-center justify-center">
                    <div className="text-sm font-bold text-gray-900">{mix?.total}</div>
                  </div>
                </div>
                <div className="space-y-2 text-xs text-gray-600">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />Full exam</span>
                    <span>{mix?.full ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-sky-400" />Practice</span>
                    <span>{mix?.practice ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400" />Single section</span>
                    <span>{mix?.section_only ?? 0}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">Complete a few sessions to see your mix.</div>
            )}
            <button
              onClick={() => navigate('/stats')}
              className="mt-5 w-full px-4 py-2.5 rounded-2xl border border-gray-200 hover:bg-white font-semibold"
            >
              View stats
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Recent results</div>
              <button onClick={() => navigate('/review')} className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
                View all
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {recentCompleted.map((s) => {
                const band = evaluations[s.id] ? getOverallBand(evaluations[s.id].result) : null;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-gray-100 bg-gray-50">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{getExperience(s)?.name ?? 'Test'}</div>
                      <div className="text-xs text-gray-500">{fmt(s.completed_at)}</div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-800 bg-emerald-600/10 border border-emerald-700/10 rounded-full px-3 py-1">
                      {band ?? 'n/a'}
                    </div>
                  </div>
                );
              })}
              {recentCompleted.length === 0 && !loading ? (
                <div className="text-sm text-gray-600">No completed sessions yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};
