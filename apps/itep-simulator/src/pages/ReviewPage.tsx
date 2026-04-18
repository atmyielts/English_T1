import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../components/layout/MainLayout';
import { ITEP_PRODUCT_ID } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/useAccess';

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
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const getExperience = (session: SessionRow): { id: string; name: string } | null => {
  const linked: any = session.experience;
  if (!linked) return null;
  return Array.isArray(linked) ? (linked[0] ?? null) : linked;
};

export const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  useEffect(() => {
    const run = async () => {
      if (!userId) {
        setLoading(true);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: sessionError } = await supabase
        .from('sessions')
        .select('id,status,completed_at,created_at,experience_id,experience:experiences!inner(id,name,product_id)')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .eq('experience.product_id', ITEP_PRODUCT_ID)
        .order('completed_at', { ascending: false })
        .limit(50);

      if (sessionError) {
        setError(sessionError.message);
        setSessions([]);
        setLoading(false);
        return;
      }

      setSessions((data ?? []) as SessionRow[]);
      setLoading(false);
    };

    void run();
  }, [userId]);

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Session analysis</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-2">Review</h1>
          <p className="text-[#475569] mt-2">Open one of your completed iTEP sessions and inspect the answers.</p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#151d2b]/12 bg-white/70 px-4 py-3 text-[#475569]">Loading completed sessions...</div>
        ) : null}
        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3">{error}</div> : null}

        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-[26px] border border-[#151d2b]/12 bg-white/75 backdrop-blur p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-wider uppercase text-[#64748b]">Completed</div>
                <div className="font-semibold text-[#0f172a] mt-1 truncate">{getExperience(session)?.name ?? 'Test'}</div>
                <div className="text-sm text-[#475569] mt-1">Completed: {formatDateTime(session.completed_at)}</div>
                <div className="text-xs text-[#64748b] mt-1">Session id: {session.id}</div>
              </div>
              <div className="shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                <button
                  onClick={() => navigate(`/session/${session.id}/results`)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-[#151d2b]/15 bg-white/80 text-[#111827] font-semibold hover:bg-white transition-colors"
                >
                  Results
                </button>
                <button
                  onClick={() => navigate(`/review/${session.id}`)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#0f172a] text-white font-semibold hover:bg-black transition-colors"
                >
                  Open review
                </button>
              </div>
            </div>
          ))}

          {sessions.length === 0 && !loading ? (
            <div className="rounded-[26px] border border-[#151d2b]/12 bg-white/75 p-6 text-[#475569]">
              No completed iTEP sessions to review yet.
            </div>
          ) : null}
        </div>
      </div>
    </MainLayout>
  );
};
