import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, FileText, Play } from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { IELTS_PRODUCT_ID } from '../lib/constants';
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
        .eq('product_id', IELTS_PRODUCT_ID)
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
      <div className="space-y-8 max-w-6xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Full Exam</h1>
          <p className="text-gray-600 mt-1">
            Start a full-length mock test. Practice single sections in <span className="font-semibold">Practice</span>.
          </p>
        </div>

        {loading ? <div className="text-gray-600">Loading full mock tests...</div> : null}
        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Available mock tests</h2>
            {totalMinutes ? (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <Clock size={16} /> Typical duration: {totalMinutes} min
              </div>
            ) : (
              <div className="text-sm text-gray-500">{experiences.length} tests</div>
            )}
          </div>

          {experiences.length === 0 && !loading ? (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-gray-700">
              No tests found. Import one in <span className="font-mono">/admin/import</span>.
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {experiences.map((exp) => {
              const duration = (exp.metadata as any)?.duration_seconds as number | undefined;
              const resume = resumeByExperience[exp.id] ?? null;
              const currentSectionId = resume ? String((resume.metadata as any)?.current_section_id ?? '') : '';

              return (
                <div key={exp.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <FileText size={16} />
                        <span>Full mock test</span>
                        {typeof duration === 'number' ? (
                          <span className="flex items-center gap-1">
                            <span className="text-gray-300">|</span>
                            <Clock size={16} /> {Math.round(duration / 60)} min
                          </span>
                        ) : null}
                        {resume ? (
                          <span className="ml-2 text-xs font-semibold bg-emerald-600/10 text-emerald-800 border border-emerald-700/10 rounded-full px-2 py-0.5">
                            Resume available
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mt-2 truncate">{exp.name}</h3>
                    </div>

                    <div className="shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
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
                        className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-gray-900 hover:bg-black text-white font-semibold"
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
