import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, FileText, Play } from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { SAT_PRODUCT_ID } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

type ExperienceRow = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
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
};

const isFullSession = (s: SessionRow): boolean => {
  const meta: any = s.metadata ?? {};
  const allowed = meta.allowed_section_ids;
  return !(Array.isArray(allowed) && allowed.length > 0);
};

export const FullExamPage: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useAccess();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [resumeByExperience, setResumeByExperience] = useState<Record<string, SessionRow>>({});

  useEffect(() => {
    const run = async () => {
      if (!userId) {
        setLoading(true);
        return;
      }

      setLoading(true);
      setError(null);
      setExperiences([]);
      setResumeByExperience({});

      const { data: expRows, error: expError } = await supabase
        .from('experiences')
        .select('id, name, display_order, is_active, metadata')
        .eq('product_id', SAT_PRODUCT_ID)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (expError) {
        setError(expError.message);
        setLoading(false);
        return;
      }

      const exps = (expRows ?? []) as ExperienceRow[];
      setExperiences(exps);

      const expIds = exps.map((e) => e.id);
      if (expIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: sessRows, error: sessError } = await supabase
        .from('sessions')
        .select('id,status,created_at,started_at,completed_at,metadata,experience_id')
        .eq('user_id', userId)
        .in('experience_id', expIds)
        .in('status', ['created', 'active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (sessError) {
        // Not fatal; we can still show tests list.
        setLoading(false);
        return;
      }

      const by: Record<string, SessionRow> = {};
      for (const s of (sessRows ?? []) as SessionRow[]) {
        if (!isFullSession(s)) continue;
        if (!by[s.experience_id]) by[s.experience_id] = s;
      }
      setResumeByExperience(by);

      setLoading(false);
    };

    void run();
  }, [userId]);

  const totalMinutes = useMemo(() => {
    // Total time is per-experience metadata in our seed (duration_seconds).
    // Only used for display, safe if missing.
    if (experiences.length === 0) return null;
    const secs = Number((experiences[0]?.metadata as any)?.duration_seconds ?? NaN);
    if (!Number.isFinite(secs) || secs <= 0) return null;
    return Math.round(secs / 60);
  }, [experiences]);

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Simulation mode</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-2">Full SAT exam</h1>
          <p className="text-[#475569] mt-2">
            Start a full-length digital SAT mock. Practice single sections in <span className="font-semibold">Practice</span>.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#151d2b]/12 bg-white/70 px-4 py-3 text-[#475569]">Loading full mock tests...</div>
        ) : null}
        {error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3">{error}</div>
        ) : null}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#0f172a]">Available mock tests</h2>
            {totalMinutes ? (
              <div className="text-sm text-[#64748b] flex items-center gap-2">
                <Clock size={16} /> Typical duration: {totalMinutes} min
              </div>
            ) : (
              <div className="text-sm text-[#64748b]">{experiences.length} tests</div>
            )}
          </div>

          {experiences.length === 0 && !loading ? (
            <div className="rounded-[28px] border border-[#151d2b]/12 bg-white/75 shadow-sm p-8 text-[#334155]">
              No tests found. Import one in <span className="font-mono">/admin/import</span>.
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {experiences.map((exp) => {
              const duration = (exp.metadata as any)?.duration_seconds as number | undefined;
              const resume = resumeByExperience[exp.id] ?? null;
              const currentSectionId = resume ? String((resume.metadata as any)?.current_section_id ?? '') : '';

              return (
                <div
                  key={exp.id}
                  className="rounded-[28px] border border-[#151d2b]/12 bg-white/75 backdrop-blur shadow-[0_10px_28px_rgba(15,23,42,0.06)] p-6"
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-[#64748b] text-sm">
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1.5">
                        <FileText size={15} />
                        Full SAT mock
                      </span>
                      {typeof duration === 'number' ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1.5">
                          <Clock size={15} />
                          {Math.round(duration / 60)} min
                        </span>
                      ) : null}
                      {resume ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-700/10 bg-emerald-600/10 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                          Resume available
                        </span>
                      ) : null}
                    </div>

                    <h3 className="text-lg font-semibold text-[#0f172a] leading-snug break-words">{exp.name}</h3>

                    <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                      {resume ? (
                        <button
                          onClick={() => {
                            if (currentSectionId) {
                              navigate(`/session/${resume.id}/${currentSectionId}`);
                              return;
                            }
                            navigate(`/test/${exp.id}`);
                          }}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 justify-center"
                        >
                          <Play size={16} /> Continue
                        </button>
                      ) : null}
                      <button
                        onClick={() => navigate(`/test/${exp.id}`)}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-[#0f172a] hover:bg-black text-white font-semibold"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </MainLayout>
  );
};
