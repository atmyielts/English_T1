import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, FileText, Play, Sparkles } from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { formatItepFamily, formatItepVariant, getItepComposite } from '../lib/itepScores';
import { supabase } from '../lib/supabase';
import { buildPlatformUrl, hasPlatformBase } from '../lib/platformUrls';
import { ITEP_PRODUCT_ID, ITEP_PRODUCT_SLUG } from '../lib/constants';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

type ExperienceLink = {
  id: string;
  name: string;
  product_id: string;
  metadata: Json | null;
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

type SectionLite = { id: string; name: string; metadata: Json | null } | null;

const getExperience = (session: SessionRow): ExperienceLink | null => {
  const linked: any = session.experience;
  if (!linked) return null;
  return Array.isArray(linked) ? (linked[0] ?? null) : linked;
};

const fmt = (iso: string | null): string => {
  if (!iso) return 'n/a';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const formatRemaining = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const sectionType = (section: SectionLite): string => String((section?.metadata as any)?.type ?? '');

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

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const goPlatform = (path: string) => {
    const url = buildPlatformUrl(path, undefined, { product: ITEP_PRODUCT_SLUG });
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
        const selectClause =
          'id,status,created_at,started_at,completed_at,metadata,experience_id,experience:experiences!inner(id,name,product_id,metadata)';

        const [activeRes, completedRes, mixRes] = await Promise.all([
          supabase
            .from('sessions')
            .select(selectClause)
            .eq('user_id', userId)
            .eq('experience.product_id', ITEP_PRODUCT_ID)
            .in('status', ['created', 'active', 'paused'])
            .order('created_at', { ascending: false })
            .limit(1),
          supabase
            .from('sessions')
            .select(selectClause)
            .eq('user_id', userId)
            .eq('experience.product_id', ITEP_PRODUCT_ID)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(4),
          supabase
            .from('sessions')
            .select(selectClause)
            .eq('user_id', userId)
            .eq('experience.product_id', ITEP_PRODUCT_ID)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        if (activeRes.error) throw activeRes.error;
        if (completedRes.error) throw completedRes.error;
        if (mixRes.error) throw mixRes.error;

        const active = ((activeRes.data ?? [])[0] ?? null) as SessionRow | null;
        setActiveSession(active);
        setRecentCompleted((completedRes.data ?? []) as SessionRow[]);

        const mixRows = (mixRes.data ?? []) as SessionRow[];
        if (mixRows.length > 0) {
          const summary = { total: mixRows.length, full: 0, practice: 0, section_only: 0 };
          for (const session of mixRows) summary[classifySession(session)] += 1;
          setMix(summary);
        } else {
          setMix(null);
        }

        const entitlement =
          me.entitlements.find((entry) => entry.resource_type === 'product' && entry.resource_id === ITEP_PRODUCT_ID) ?? null;
        setAccessEndsAt(entitlement?.ends_at ?? null);

        const currentSectionId = active ? String((active.metadata as any)?.current_section_id ?? '') : '';
        if (currentSectionId) {
          const { data: section, error: sectionError } = await supabase
            .from('sections')
            .select('id,name,metadata')
            .eq('id', currentSectionId)
            .maybeSingle();
          if (!sectionError) setActiveSection((section as any) ?? null);
        } else {
          setActiveSection(null);
        }

        const sessionIds = ((completedRes.data ?? []) as SessionRow[]).map((session) => session.id);
        if (sessionIds.length > 0) {
          const { data: evaluationRows, error: evaluationError } = await supabase
            .from('evaluations')
            .select('session_id,evaluated_at,result')
            .in('session_id', sessionIds)
            .order('evaluated_at', { ascending: false });

          if (!evaluationError) {
            const grouped: Record<string, EvaluationRow> = {};
            for (const row of (evaluationRows ?? []) as EvaluationRow[]) {
              if (!grouped[row.session_id]) grouped[row.session_id] = row;
            }
            setEvaluations(grouped);
          } else {
            setEvaluations({});
          }
        } else {
          setEvaluations({});
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to load dashboard');
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
    const date = new Date(accessEndsAt);
    if (Number.isNaN(date.getTime())) return `Active until ${accessEndsAt}`;
    return `Active until ${date.toLocaleString()}`;
  }, [accessEndsAt]);

  const activeDeadline = useMemo(() => {
    if (!activeSession) return null;
    const metadata: any = activeSession.metadata ?? {};
    const currentSectionId = String(metadata.current_section_id ?? '');
    const deadlines = metadata.deadlines ?? {};
    const deadlineIso = currentSectionId && typeof deadlines[currentSectionId] === 'string' ? String(deadlines[currentSectionId]) : null;
    if (!deadlineIso) return null;
    return { iso: deadlineIso, msLeft: Date.parse(deadlineIso) - Date.now() };
  }, [activeSession]);

  const donut = useMemo(() => {
    if (!mix || mix.total <= 0) return null;
    const total = mix.total || 1;
    const fullPercent = clampPercent((mix.full / total) * 100);
    const practicePercent = clampPercent((mix.practice / total) * 100);
    const sectionPercent = clampPercent(100 - fullPercent - practicePercent);
    const secondStop = fullPercent + practicePercent;

    return {
      fullPercent,
      practicePercent,
      sectionPercent,
      backgroundImage: `conic-gradient(
        rgba(234,88,12,0.95) 0 ${fullPercent}%,
        rgba(245,158,11,0.95) ${fullPercent}% ${secondStop}%,
        rgba(120,113,108,0.95) ${secondStop}% 100%
      )`,
    };
  }, [mix]);

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.12em] uppercase text-[#475569] bg-white/80 border border-[#151d2b]/12 rounded-full px-3 py-1">
              <Sparkles size={14} />
              iTEP
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-4">Dashboard</h1>
            <p className="text-[#475569] mt-2">Start a session, continue where you left off, or review your iTEP profile.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={() => navigate('/practice')}
              className="w-full sm:w-auto px-4 py-2 rounded-2xl border border-[#151d2b]/15 bg-white/80 hover:bg-white backdrop-blur font-semibold"
            >
              Practice section
            </button>
            <button
              onClick={() => navigate('/full-exam')}
              className="w-full sm:w-auto px-4 py-2 rounded-2xl border border-[#151d2b]/15 bg-white/80 hover:bg-white font-semibold"
            >
              Full exam
            </button>
            <button
              onClick={() => goPlatform('/pricing')}
              className="w-full sm:w-auto px-4 py-2 rounded-2xl bg-[#0f172a] hover:bg-black text-white font-semibold"
            >
              Pricing
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#151d2b]/12 bg-white/70 px-4 py-3 text-[#475569]">Loading dashboard...</div>
        ) : null}
        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">In progress</div>
                <div className="mt-2 text-lg font-bold text-gray-900">
                  {activeSession ? getExperience(activeSession)?.name ?? 'Test session' : 'No active session'}
                </div>
                {activeSession ? (
                  <>
                    <div className="text-sm text-gray-600 mt-1">
                      Status: <span className="font-semibold">{activeSession.status}</span> | Started: {fmt(activeSession.started_at)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                      <span className="rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1">
                        {formatItepFamily((getExperience(activeSession)?.metadata as any)?.family)}
                      </span>
                      <span className="rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1">
                        {formatItepVariant((getExperience(activeSession)?.metadata as any)?.variant)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-600 mt-1">Start a test to see progress here.</div>
                )}
              </div>

              {activeSession ? (
                <button
                  onClick={() => {
                    const currentSectionId = String((activeSession.metadata as any)?.current_section_id ?? '');
                    if (currentSectionId) {
                      navigate(`/session/${activeSession.id}/${currentSectionId}`);
                      return;
                    }
                    navigate(`/test/${activeSession.experience_id}`);
                  }}
                  className="w-full sm:w-auto shrink-0 px-4 py-2.5 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-semibold flex items-center gap-2 justify-center"
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
                <div className="rounded-2xl border border-[#151d2b]/12 bg-white/80 p-4">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Current section</div>
                  <div className="mt-1 font-bold text-gray-900">{activeSection?.name ?? 'n/a'}</div>
                  <div className="text-sm text-gray-600 mt-1">{sectionType(activeSection) ? `Type: ${sectionType(activeSection)}` : null}</div>
                </div>
                <div className="rounded-2xl border border-[#151d2b]/12 bg-white/80 p-4">
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

          <div className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-6">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Plan status</div>
            <div className="mt-2 text-lg font-bold text-gray-900">{accessLabel}</div>
            <p className="text-sm text-gray-600 mt-2">Manage your subscription or extend access anytime.</p>
            <button
              onClick={() => goPlatform('/pricing')}
              className="mt-5 w-full px-4 py-2.5 rounded-2xl border border-[#151d2b]/15 bg-white/80 hover:bg-white font-semibold"
            >
              Manage plans
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-6">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Quick start</div>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => navigate('/full-exam')}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#0f172a] hover:bg-black text-white font-semibold flex items-center gap-2"
              >
                <FileText size={16} />
                Full exam
              </button>
              <button
                onClick={() => navigate('/practice')}
                className="w-full px-4 py-2.5 rounded-2xl border border-[#151d2b]/15 bg-white/80 hover:bg-white font-semibold flex items-center gap-2"
              >
                <BookOpen size={16} />
                Practice section
              </button>
              <button
                onClick={() => navigate('/review')}
                className="w-full px-4 py-2.5 rounded-2xl border border-[#151d2b]/15 bg-white/80 hover:bg-white font-semibold flex items-center gap-2"
              >
                <Clock size={16} />
                View results
              </button>
            </div>
          </div>

          <div className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-6">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Session mix</div>
            {donut && mix ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  <div className="absolute inset-0 rounded-full shadow-sm" style={{ backgroundImage: donut.backgroundImage }} />
                  <div className="absolute inset-3 rounded-full bg-white/95 flex items-center justify-center">
                    <div className="text-sm font-bold text-gray-900">{mix.total}</div>
                  </div>
                </div>
                <div className="space-y-2 text-xs text-gray-600">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500" />Full exam</span>
                    <span>{mix.full}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400" />Practice</span>
                    <span>{mix.practice}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-stone-400" />Single section</span>
                    <span>{mix.section_only}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">Complete a few sessions to see your mix.</div>
            )}
            <button
              onClick={() => navigate('/stats')}
              className="mt-5 w-full px-4 py-2.5 rounded-2xl border border-[#151d2b]/15 bg-white/80 hover:bg-white font-semibold"
            >
              View stats
            </button>
          </div>

          <div className="bg-white/75 border border-[#151d2b]/12 rounded-3xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Recent results</div>
              <button onClick={() => navigate('/review')} className="text-sm font-semibold text-orange-700 hover:text-orange-900">
                View all
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {recentCompleted.map((session) => {
                const composite = evaluations[session.id] ? getItepComposite(evaluations[session.id].result) : null;
                const experience = getExperience(session);
                return (
                  <div key={session.id} className="p-3 rounded-2xl border border-[#151d2b]/10 bg-white/85">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{experience?.name ?? 'Test'}</div>
                        <div className="text-xs text-gray-500">{fmt(session.completed_at)}</div>
                      </div>
                      <div className="text-sm font-semibold text-orange-800 bg-orange-600/10 border border-orange-700/10 rounded-full px-3 py-1">
                        {composite != null ? `${composite}/6.0` : 'n/a'}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                      <span className="rounded-full border border-[#151d2b]/10 bg-white px-2.5 py-1">
                        {formatItepFamily((experience?.metadata as any)?.family)}
                      </span>
                      <span className="rounded-full border border-[#151d2b]/10 bg-white px-2.5 py-1">
                        {formatItepVariant((experience?.metadata as any)?.variant)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {recentCompleted.length === 0 && !loading ? <div className="text-sm text-gray-600">No completed sessions yet.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};
