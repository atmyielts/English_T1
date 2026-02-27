import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../components/layout/MainLayout';
import { supabase } from '../lib/supabase';

type SessionRow = {
  id: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  experience_id: string;
  experience?: { id: string; name: string } | { id: string; name: string }[] | null;
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const getExperience = (s: SessionRow): { id: string; name: string } | null => {
  const e: any = s.experience;
  if (!e) return null;
  return Array.isArray(e) ? (e[0] ?? null) : e;
};

export const ReviewPage: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const { data, error: sessError } = await supabase
        .from('sessions')
        .select('id,status,completed_at,created_at,experience_id,experience:experiences(id,name)')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(50);

      if (sessError) {
        setError(sessError.message);
        setSessions([]);
        setLoading(false);
        return;
      }

      setSessions((data ?? []) as SessionRow[]);
      setLoading(false);
    };

    run();
  }, []);

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Session analysis</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-2">Review</h1>
          <p className="text-[#475569] mt-2">Open a completed session and review your answers.</p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#151d2b]/12 bg-white/70 px-4 py-3 text-[#475569]">Loading completed sessions...</div>
        ) : null}
        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3">{error}</div> : null}

        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="rounded-[26px] border border-[#151d2b]/12 bg-white/75 backdrop-blur p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-wider uppercase text-[#64748b]">Completed</div>
                <div className="font-semibold text-[#0f172a] mt-1 truncate">{getExperience(s)?.name ?? 'Test'}</div>
                <div className="text-sm text-[#475569] mt-1">Completed: {formatDateTime(s.completed_at)}</div>
                <div className="text-xs text-[#64748b] mt-1">Session id: {s.id}</div>
              </div>
              <div className="shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                <button
                  onClick={() => navigate(`/session/${s.id}/results`)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-[#151d2b]/15 bg-white/80 text-[#111827] font-semibold hover:bg-white transition-colors"
                >
                  Results
                </button>
                <button
                  onClick={() => navigate(`/review/${s.id}`)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#0f172a] text-white font-semibold hover:bg-black transition-colors"
                >
                  Open review
                </button>
              </div>
            </div>
          ))}

          {sessions.length === 0 && !loading ? (
            <div className="rounded-[26px] border border-[#151d2b]/12 bg-white/75 p-6 text-[#475569]">
              No completed sessions to review yet.
            </div>
          ) : null}
        </div>
      </div>
    </MainLayout>
  );
};
