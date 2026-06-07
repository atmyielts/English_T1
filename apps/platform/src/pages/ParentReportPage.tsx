import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

type ReportData = {
  contact: { id: string; first_name: string; last_name: string; email: string | null; status: string };
  academy: { id: string; name: string; logo_url: string | null };
  classrooms: Array<{ id: string; name: string; is_active: boolean }>;
  stats: { avg_score: number | null; attendance_rate: number | null; total_submissions: number; graded_submissions: number; present_days: number; total_attendance_days: number };
  recent_submissions: Array<{ id: string; score: number | null; max_score: number | null; status: string; submitted_at: string | null; graded_at: string | null; notes: string | null; academy_assignments: { title: string; assignment_type: string; due_at: string | null; max_score: number | null } | null }>;
  recent_attendance: Array<{ session_date: string; status: string }>;
  trend: Array<{ date: string | null; label: string; score_pct: number | null }>;
  report_label: string | null;
};

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
const attendanceColor = (s: string) => s === 'present' ? 'bg-emerald-400' : s === 'late' ? 'bg-amber-400' : s === 'excused' ? 'bg-gray-300' : 'bg-red-400';

const StatCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({ label, value, sub, color = 'text-gray-900' }) => (
  <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
    <div className={`text-3xl font-bold ${color}`}>{value}</div>
    <div className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wide">{label}</div>
    {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
  </div>
);

const TrendBar: React.FC<{ points: ReportData['trend'] }> = ({ points }) => {
  if (points.length < 2) return null;
  const valid = points.filter((p) => p.score_pct !== null);
  if (valid.length < 2) return null;
  const maxH = 60;
  const maxVal = Math.max(...valid.map((p) => p.score_pct!), 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
      <div className="text-sm font-semibold text-gray-700 mb-4">Score Trend</div>
      <div className="flex items-end gap-2 h-16">
        {valid.map((p, i) => {
          const h = Math.max(4, Math.round((p.score_pct! / maxVal) * maxH));
          const isLast = i === valid.length - 1;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-xs text-gray-500 font-medium">{p.score_pct}%</div>
              <div className={`w-full rounded-t-lg ${isLast ? 'bg-emerald-500' : 'bg-gray-300'}`} style={{ height: `${h}px` }} />
              <div className="text-xs text-gray-400 truncate w-full text-center">{p.date?.slice(5) ?? ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ParentReportPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setError('No report token provided.'); return; }
    fetch(`${edgeBase}/parent-report?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => { if (d.contact) setReport(d as ReportData); else setError(d.error ?? 'Report not found'); })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400">Loading report…</div>
    </div>
  );

  if (error || !report) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">📋</div>
        <div className="text-xl font-semibold text-gray-900 mb-2">Report unavailable</div>
        <div className="text-gray-500 text-sm">{error ?? 'This report link may have expired.'}</div>
      </div>
    </div>
  );

  const { contact, academy, stats, recent_submissions, recent_attendance, trend, classrooms } = report;
  const name = `${contact.first_name} ${contact.last_name}`.trim();
  const classroomNames = classrooms.map((c) => c.name).join(', ');

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          {academy.logo_url && <img src={academy.logo_url} alt={academy.name} className="h-10 object-contain" />}
          <div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">{academy.name}</div>
            <div className="text-lg font-bold text-gray-900">Progress Report: {name}</div>
            {classroomNames && <div className="text-xs text-gray-500 mt-0.5">{classroomNames}</div>}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Avg Score"
            value={stats.avg_score !== null ? `${stats.avg_score}%` : '—'}
            sub={`${stats.graded_submissions} graded`}
            color={stats.avg_score !== null && stats.avg_score >= 70 ? 'text-emerald-600' : stats.avg_score !== null && stats.avg_score >= 50 ? 'text-amber-600' : 'text-red-600'}
          />
          <StatCard
            label="Attendance"
            value={stats.attendance_rate !== null ? `${stats.attendance_rate}%` : '—'}
            sub={`${stats.present_days}/${stats.total_attendance_days} days`}
            color={stats.attendance_rate !== null && stats.attendance_rate >= 80 ? 'text-emerald-600' : 'text-amber-600'}
          />
          <StatCard
            label="Assignments"
            value={`${stats.graded_submissions}/${stats.total_submissions}`}
            sub="graded / total"
            color="text-blue-600"
          />
        </div>

        {/* Trend */}
        <TrendBar points={trend} />

        {/* Recent Assignments */}
        {recent_submissions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="text-sm font-semibold text-gray-700 mb-3">Recent Assignments</div>
            <div className="space-y-2">
              {recent_submissions.slice(0, 8).map((s, i) => {
                const maxS = s.academy_assignments?.max_score ?? s.max_score ?? 100;
                const pct = s.score !== null && Number(maxS) > 0 ? Math.round((Number(s.score) / Number(maxS)) * 100) : null;
                return (
                  <div key={s.id ?? i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{s.academy_assignments?.title ?? 'Assignment'}</div>
                      <div className="text-xs text-gray-400">{s.academy_assignments?.assignment_type} · {fmtDate(s.submitted_at)}</div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      {pct !== null ? (
                        <div>
                          <div className="font-semibold text-gray-900">{s.score}/{maxS}</div>
                          <div className={`text-xs ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">{s.status}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attendance Calendar */}
        {recent_attendance.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="text-sm font-semibold text-gray-700 mb-3">Recent Attendance (last {recent_attendance.length} sessions)</div>
            <div className="flex flex-wrap gap-1.5">
              {recent_attendance.map((a) => (
                <div key={a.session_date} title={`${a.session_date}: ${a.status}`} className="flex flex-col items-center gap-1">
                  <div className={`w-4 h-4 rounded ${attendanceColor(a.status)}`} />
                  <div className="text-xs text-gray-400">{a.session_date.slice(8)}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-gray-400">
              {[{ color: 'bg-emerald-400', label: 'Present' }, { color: 'bg-amber-400', label: 'Late' }, { color: 'bg-red-400', label: 'Absent' }, { color: 'bg-gray-300', label: 'Excused' }].map((l) => (
                <div key={l.label} className="flex items-center gap-1"><div className={`w-3 h-3 rounded ${l.color}`} />{l.label}</div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-2">
          Report generated by Schood · For questions, contact the academy directly.
        </div>
      </div>
    </div>
  );
};

// ─── Teacher: Generate Link Widget (embedded in AcademyControlPage) ───────────

export const GenerateParentLinkButton: React.FC<{
  academyId: string;
  contactId: string;
  contactName: string;
  token: string;
}> = ({ academyId, contactId, contactName, token: accessToken }) => {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${edgeBase}/parent-report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_token', academy_id: academyId, contact_id: contactId }),
      });
      if (res.ok) { const d = await res.json(); setLink(d.share_url); }
    } finally {
      setLoading(false);
    }
  };

  const copy = () => { if (link) { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } };

  if (link) return (
    <div className="text-xs text-gray-500 space-y-1">
      <div className="font-medium text-gray-700">Parent link for {contactName}</div>
      <div className="flex gap-2">
        <input readOnly value={link} className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs font-mono bg-gray-50" />
        <button onClick={copy} className="px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-xs">{copied ? '✓' : 'Copy'}</button>
      </div>
    </div>
  );

  return (
    <button onClick={generate} disabled={loading} className="text-xs px-2.5 py-1.5 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50">
      {loading ? '…' : '👨‍👩‍👧 Parent link'}
    </button>
  );
};
