import React, { useEffect, useState } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type ReportData = {
  contact: { first_name: string; last_name: string; email: string; status: string };
  academy: { name: string; logo_url: string | null };
  classrooms: Array<{ name: string }>;
  stats: {
    avg_score: number | null;
    attendance_rate: number | null;
    total_submissions: number;
    graded_submissions: number;
    present_days: number;
    total_attendance_days: number;
  };
  recent_submissions: Array<{
    status: string;
    score: number | null;
    submitted_at: string;
    academy_assignments: { title: string; max_score: number | null };
  }>;
  recent_attendance: Array<{ session_date: string; status: string }>;
  trend: Array<{ date: string | null; label: string; score_pct: number | null }>;
  report_label: string | null;
};

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const pct = (v: number | null) => (v !== null ? `${v}%` : '—');

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const color =
    status === 'present' ? 'bg-emerald-400' : status === 'late' ? 'bg-amber-400' : 'bg-red-400';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} title={status} />;
};

export const ParentReportPage: React.FC = () => {
  const token = new URLSearchParams(window.location.search).get('token');
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('No report token provided.');
      setLoading(false);
      return;
    }
    fetch(`${SUPABASE_URL}/functions/v1/parent-report?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? 'Failed to load report');
        setData(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading report…</div>
      </div>
    );

  if (error || !data)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-2xl mb-3">📋</div>
          <div className="text-gray-700 font-semibold">Report not available</div>
          <div className="text-gray-500 text-sm mt-1">
            {error ?? 'The link may have expired or been revoked.'}
          </div>
        </div>
      </div>
    );

  const { contact, academy, classrooms, stats, recent_submissions, recent_attendance, trend, report_label } =
    data;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-4">
          {academy.logo_url && (
            <img
              src={academy.logo_url}
              alt={academy.name}
              className="w-14 h-14 rounded-xl object-contain border border-gray-100"
            />
          )}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {academy.name}
            </div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">
              {contact.first_name} {contact.last_name}
            </div>
            {classrooms.length > 0 && (
              <div className="text-sm text-gray-500 mt-0.5">
                {classrooms.map((c) => c.name).join(' · ')}
              </div>
            )}
            {report_label && <div className="text-xs text-blue-600 mt-1">{report_label}</div>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Avg Score', value: pct(stats.avg_score), color: 'text-blue-700 bg-blue-50' },
            { label: 'Attendance', value: pct(stats.attendance_rate), color: 'text-emerald-700 bg-emerald-50' },
            {
              label: 'Assignments',
              value: `${stats.graded_submissions}/${stats.total_submissions}`,
              color: 'text-violet-700 bg-violet-50',
            },
            {
              label: 'Present Days',
              value: `${stats.present_days}/${stats.total_attendance_days}`,
              color: 'text-amber-700 bg-amber-50',
            },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl p-5 ${s.color}`}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-medium opacity-75 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Score trend */}
        {trend.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="text-sm font-semibold text-gray-700 mb-4">Score Trend</div>
            <div className="flex items-end gap-2 h-24">
              {trend.map((t, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs text-gray-500">
                    {t.score_pct !== null ? `${t.score_pct}%` : '—'}
                  </div>
                  <div
                    className="w-full bg-blue-400 rounded-t"
                    style={{
                      height:
                        t.score_pct !== null ? `${Math.max(4, t.score_pct * 0.7)}px` : '4px',
                      opacity: t.score_pct !== null ? 1 : 0.15,
                    }}
                  />
                  <div className="text-xs text-gray-400 truncate w-full text-center">
                    {t.date ? fmtDate(t.date) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent submissions */}
        {recent_submissions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="text-sm font-semibold text-gray-700 mb-3">Recent Assignments</div>
            <div className="space-y-2">
              {recent_submissions.slice(0, 8).map((s, i) => {
                const maxS = s.academy_assignments?.max_score ?? null;
                const scoreLabel =
                  s.score !== null ? (maxS ? `${s.score}/${maxS}` : String(s.score)) : '—';
                const statusColor =
                  s.status === 'graded'
                    ? 'text-emerald-600'
                    : s.status === 'submitted'
                      ? 'text-blue-600'
                      : 'text-gray-400';
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 truncate max-w-[55%]">
                      {s.academy_assignments?.title ?? 'Assignment'}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-gray-500">{scoreLabel}</span>
                      <span className={`text-xs font-medium ${statusColor}`}>{s.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attendance dots */}
        {recent_attendance.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="text-sm font-semibold text-gray-700 mb-3">Recent Attendance</div>
            <div className="flex flex-wrap gap-2">
              {recent_attendance.map((a, i) => (
                <div key={i} className="flex items-center gap-1 text-xs text-gray-500">
                  <StatusDot status={a.status} />
                  <span>{fmtDate(a.session_date)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-3 text-xs text-gray-400">
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />
                Present
              </span>
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
                Late
              </span>
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />
                Absent
              </span>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 pb-4">
          Report by <span className="font-medium">{academy.name}</span> via Schood
        </div>
      </div>
    </div>
  );
};
