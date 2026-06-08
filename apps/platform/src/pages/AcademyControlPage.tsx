import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  academyBulkInvite,
  academyCreateAssignment,
  academyExportGradebook,
  academyGradebook,
  academyGradeSubmission,
  academyListAssignments,
  academyListAttendance,
  academyMarkAttendance,
  academyStudentProgress,
  academyUpdateAssignment,
  academyUpdateClassroomSettings,
  teacherStudioStudentDashboard,
  type AcademyAssignment,
  type AcademyGradebook,
  type AcademyStudentProgress,
  type TeacherStudioStudentClassroom,
  type TeacherStudioStudentContact,
  type TeacherStudioStudentDashboard,
} from '../lib/platformClient';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'director' | 'classrooms' | 'students' | 'announcements';
type ClassroomTab = 'students' | 'assignments' | 'gradebook' | 'attendance' | 'schedule' | 'billing' | 'settings';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtScore = (score: number | null, maxScore: number | null): string => {
  if (score === null) return '—';
  if (maxScore && maxScore > 0) return `${score}/${maxScore} (${Math.round((score / maxScore) * 100)}%)`;
  return String(score);
};

const statusBadge = (status: string): React.ReactNode => {
  const map: Record<string, string> = {
    present: 'bg-emerald-100 text-emerald-800',
    late: 'bg-amber-100 text-amber-800',
    absent: 'bg-red-100 text-red-800',
    excused: 'bg-gray-100 text-gray-700',
    submitted: 'bg-blue-100 text-blue-800',
    graded: 'bg-emerald-100 text-emerald-800',
    missing: 'bg-red-100 text-red-800',
    active: 'bg-emerald-100 text-emerald-800',
    inactive: 'bg-gray-100 text-gray-700',
    trial: 'bg-amber-100 text-amber-800',
    draft: 'bg-gray-100 text-gray-600',
    archived: 'bg-gray-100 text-gray-400',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
};

// ─── Small modal wrapper ──────────────────────────────────────────────────────

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      <div className="overflow-y-auto p-6">{children}</div>
    </div>
  </div>
);

// ─── Overview Tab ─────────────────────────────────────────────────────────────

const AtRiskPanel: React.FC<{ academyId: string; token: string }> = ({ academyId, token }) => {
  const [scanning, setScanning] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [result, setResult] = useState<Array<{ contact_id: string; name: string; attendance_rate: number | null; missing: number; severity: string; reasons: string[] }> | null>(null);
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);

  const scan = async () => {
    setScanning(true);
    setDispatchMsg(null);
    const res = await callAcademyCtrl(token, { action: 'compute_at_risk', academy_id: academyId });
    setResult(res.at_risk ?? []);
    setScanning(false);
  };

  const dispatch = async () => {
    setDispatching(true);
    const res = await callAcademyCtrl(token, { action: 'dispatch_notifications', academy_id: academyId });
    setDispatchMsg(`${res.sent ?? 0} sent · ${res.failed ?? 0} failed · ${res.skipped ?? 0} skipped`);
    setDispatching(false);
  };

  return (
    <div className="border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">At-Risk Students</h3>
        <div className="flex gap-2">
          <button onClick={() => void scan()} disabled={scanning} className="px-3 py-1.5 border border-gray-300 text-sm rounded-xl hover:bg-gray-50 disabled:opacity-50">
            {scanning ? 'Scanning…' : 'Scan now'}
          </button>
          <button onClick={() => void dispatch()} disabled={dispatching} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-black disabled:opacity-50">
            {dispatching ? 'Sending…' : 'Send nudges'}
          </button>
        </div>
      </div>
      {dispatchMsg && <div className="text-xs text-gray-500 mb-2">{dispatchMsg}</div>}
      {result === null ? (
        <p className="text-sm text-gray-400">Run a scan to flag students with low attendance or stacked missing assignments. Flagged students get a teacher alert and an optional Telegram nudge.</p>
      ) : result.length === 0 ? (
        <p className="text-sm text-emerald-600">No at-risk students 🎉</p>
      ) : (
        <div className="space-y-2">
          {result.map((r) => (
            <div key={r.contact_id} className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${r.severity === 'high' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div>
                <div className="font-medium text-gray-900 text-sm">{r.name}</div>
                <div className="text-xs text-gray-500">{r.reasons.join(' · ')}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{r.severity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const OverviewTab: React.FC<{ dashboard: TeacherStudioStudentDashboard; academyId: string; token: string }> = ({ dashboard, academyId, token }) => {
  const totalContacts = dashboard.contacts?.length ?? 0;
  const totalClassrooms = dashboard.classrooms?.length ?? 0;
  const activeEntitlements = (dashboard.entitlements ?? []).filter((e) => (e as any).status === 'active').length;
  const openAlerts = (dashboard.alerts ?? []).filter((a) => !(a as any).resolved).length;
  const recentAnnouncements = (dashboard.announcements ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Students', value: totalContacts, color: 'text-blue-700 bg-blue-50' },
          { label: 'Classrooms', value: totalClassrooms, color: 'text-emerald-700 bg-emerald-50' },
          { label: 'Active Entitlements', value: activeEntitlements, color: 'text-violet-700 bg-violet-50' },
          { label: 'Open Alerts', value: openAlerts, color: 'text-amber-700 bg-amber-50' },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-2xl p-5 ${stat.color}`}>
            <div className="text-3xl font-bold">{stat.value}</div>
            <div className="text-sm font-medium mt-1 opacity-80">{stat.label}</div>
          </div>
        ))}
      </div>

      <AtRiskPanel academyId={academyId} token={token} />

      {recentAnnouncements.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Recent Announcements</h3>
          <div className="space-y-2">
            {recentAnnouncements.map((a) => (
              <div key={(a as any).id} className="border border-gray-200 rounded-xl p-4">
                <div className="font-medium text-sm text-gray-900">{(a as any).title}</div>
                <div className="text-xs text-gray-500 mt-1">{(a as any).body?.slice(0, 120)}{((a as any).body?.length ?? 0) > 120 ? '…' : ''}</div>
                <div className="text-xs text-gray-400 mt-1">{fmtDate((a as any).created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(dashboard.alerts ?? []).filter((a) => !(a as any).resolved).length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Open Alerts</h3>
          <div className="space-y-2">
            {(dashboard.alerts ?? []).filter((a) => !(a as any).resolved).slice(0, 5).map((a) => (
              <div key={(a as any).id} className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">
                <span className="font-semibold">[{(a as any).severity}]</span> {(a as any).message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Student Progress Modal ───────────────────────────────────────────────────

const StudentProgressModal: React.FC<{
  academyId: string;
  contact: TeacherStudioStudentContact;
  token: string;
  onClose: () => void;
  classroomId?: string;
}> = ({ academyId, contact, token, onClose, classroomId }) => {
  const [progress, setProgress] = useState<AcademyStudentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [certUrl, setCertUrl] = useState<string | null>(null);
  const [issuingCert, setIssuingCert] = useState(false);
  const [copied, setCopied] = useState<'report' | 'cert' | null>(null);
  const [placementScore, setPlacementScore] = useState('');
  const [placementResult, setPlacementResult] = useState<{ level: string; suggested_classrooms: Array<{ name: string }> } | null>(null);
  const [recordingPlacement, setRecordingPlacement] = useState(false);

  const recordPlacement = async () => {
    if (placementScore === '') return;
    setRecordingPlacement(true);
    const res = await callAcademyCtrl(token, { action: 'record_placement', academy_id: academyId, contact_id: contact.id, diagnostic_score: Number(placementScore) });
    if (res.level) setPlacementResult({ level: res.level, suggested_classrooms: res.suggested_classrooms ?? [] });
    setRecordingPlacement(false);
  };

  const generateReport = async () => {
    setGeneratingReport(true);
    const res = await callAcademyCtrl(token, { action: 'generate_parent_report', academy_id: academyId, contact_id: contact.id, expires_in_days: 180 });
    setReportUrl(res.share_url ?? null);
    setGeneratingReport(false);
  };

  const issueCert = async () => {
    setIssuingCert(true);
    const res = await callAcademyCtrl(token, { action: 'issue_academy_certificate', academy_id: academyId, contact_id: contact.id, classroom_id: classroomId ?? null });
    setCertUrl(res.share_url ?? null);
    setIssuingCert(false);
  };

  const copy = (url: string, type: 'report' | 'cert') => {
    navigator.clipboard.writeText(url);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  useEffect(() => {
    academyStudentProgress(token, academyId, contact.id)
      .then(setProgress)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token, academyId, contact.id]);

  return (
    <Modal title={`${contact.first_name} ${contact.last_name} — Progress`} onClose={onClose}>
      {loading ? <div className="text-center text-gray-500 py-8">Loading…</div> : !progress ? (
        <div className="text-sm text-red-600">Failed to load progress</div>
      ) : (<>
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Avg Score', value: progress.stats.avg_score !== null ? `${progress.stats.avg_score}%` : '—' },
              { label: 'Submissions', value: `${progress.stats.graded_submissions}/${progress.stats.total_submissions}` },
              { label: 'Attendance', value: progress.stats.attendance_rate !== null ? `${progress.stats.attendance_rate}%` : '—' },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-3">
                <div className="text-xl font-bold text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {progress.submissions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Submissions</div>
              <div className="space-y-1.5">
                {(progress.submissions as any[]).slice(0, 8).map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2">
                    <span className="text-gray-700 truncate max-w-[55%]">{s.academy_assignments?.title ?? 'Assignment'}</span>
                    <span className="text-gray-500">{fmtScore(s.score, s.max_score ?? s.academy_assignments?.max_score)}</span>
                    {statusBadge(s.status)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {progress.attendance.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Attendance</div>
              <div className="flex flex-wrap gap-1.5">
                {(progress.attendance as any[]).slice(0, 15).map((a) => (
                  <div key={a.session_date} className={`text-xs rounded-lg px-2 py-1 ${a.status === 'present' || a.status === 'late' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                    {a.session_date} · {a.status}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Placement / diagnostic */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Placement</div>
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="100" value={placementScore} onChange={(e) => setPlacementScore(e.target.value)} className="w-28 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="Score /100" />
            <button onClick={() => void recordPlacement()} disabled={recordingPlacement || placementScore === ''} className="px-3 py-2 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 disabled:opacity-50">
              {recordingPlacement ? 'Saving…' : 'Record placement'}
            </button>
          </div>
          {placementResult && (
            <div className="mt-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
              Suggested level: <strong>{placementResult.level}</strong>
              {placementResult.suggested_classrooms.length > 0 && (
                <span> · Classrooms: {placementResult.suggested_classrooms.map((c) => c.name).join(', ')}</span>
              )}
            </div>
          )}
        </div>

        {/* Parent report + certificate actions */}
        <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</div>
          <div className="flex flex-wrap gap-2">
            {!reportUrl ? (
              <button onClick={() => void generateReport()} disabled={generatingReport} className="px-3 py-2 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 disabled:opacity-50">
                {generatingReport ? 'Generating…' : '📋 Generate Parent Report Link'}
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <span className="text-xs text-blue-700 font-medium">Report link ready</span>
                <button onClick={() => copy(reportUrl, 'report')} className="text-xs text-blue-600 underline">
                  {copied === 'report' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
            {!certUrl ? (
              <button onClick={() => void issueCert()} disabled={issuingCert} className="px-3 py-2 border border-amber-200 bg-amber-50 text-amber-900 text-sm rounded-xl hover:bg-amber-100 disabled:opacity-50">
                {issuingCert ? 'Issuing…' : '🏆 Issue Certificate'}
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <span className="text-xs text-amber-700 font-medium">Certificate issued</span>
                <button onClick={() => copy(certUrl, 'cert')} className="text-xs text-amber-600 underline">
                  {copied === 'cert' ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            )}
          </div>
        </div>
      </>)}
    </Modal>
  );
};

// ─── Assignments Tab ──────────────────────────────────────────────────────────

const AssignmentsTab: React.FC<{
  academyId: string;
  classroomId: string;
  token: string;
}> = ({ academyId, classroomId, token }) => {
  const [assignments, setAssignments] = useState<AcademyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AcademyAssignment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '', description: '', assignment_type: 'task', due_at: '', max_score: '', score_weight: '1', status: 'active', experience_url: '',
  });

  const refresh = useCallback(() => {
    setLoading(true);
    academyListAssignments(token, academyId, classroomId)
      .then((r) => setAssignments(r.assignments))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token, academyId, classroomId]);

  useEffect(() => { refresh(); }, [refresh]);

  const openCreate = () => { setForm({ title: '', description: '', assignment_type: 'task', due_at: '', max_score: '', score_weight: '1', status: 'active', experience_url: '' }); setShowCreate(true); setEditTarget(null); };
  const openEdit = (a: AcademyAssignment) => {
    setForm({ title: a.title, description: a.description ?? '', assignment_type: a.assignment_type, due_at: a.due_at ? a.due_at.slice(0, 16) : '', max_score: a.max_score !== null ? String(a.max_score) : '', score_weight: String(a.score_weight), status: a.status, experience_url: (a as any).experience_url ?? '' });
    setEditTarget(a);
    setShowCreate(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true); setError(null);
    try {
      const payload = {
        academy_id: academyId, classroom_id: classroomId, title: form.title.trim(),
        description: form.description || null, assignment_type: form.assignment_type,
        due_at: form.due_at || null, max_score: form.max_score ? Number(form.max_score) : null,
        score_weight: form.score_weight ? Number(form.score_weight) : 1, status: form.status,
        experience_url: form.experience_url || null,
      };
      if (editTarget) {
        await academyUpdateAssignment(token, { ...payload, assignment_id: editTarget.id });
      } else {
        await academyCreateAssignment(token, payload);
      }
      setShowCreate(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (a: AcademyAssignment) => {
    if (!confirm(`Archive "${a.title}"?`)) return;
    await academyUpdateAssignment(token, { academy_id: academyId, assignment_id: a.id, status: 'archived' });
    refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Assignments ({assignments.length})</h3>
        <button onClick={openCreate} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">+ New</button>
      </div>

      {loading ? <div className="text-center text-gray-400 py-8">Loading…</div> : assignments.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
          No assignments yet. Create the first one.
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <div key={a.id} className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">{a.title}</span>
                  {statusBadge(a.status)}
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{a.assignment_type}</span>
                </div>
                {a.description && <div className="text-xs text-gray-500 mt-1 truncate">{a.description}</div>}
                <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                  {a.due_at && <span>Due {fmtDate(a.due_at)}</span>}
                  {a.max_score !== null && <span>Max {a.max_score} pts</span>}
                  <span>Weight {a.score_weight}×</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(a)} className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Edit</button>
                <button onClick={() => archive(a)} className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-400">Archive</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title={editTarget ? 'Edit Assignment' : 'New Assignment'} onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" placeholder="e.g. IELTS Writing Practice #1" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                <select value={form.assignment_type} onChange={(e) => setForm((f) => ({ ...f, assignment_type: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
                  {['task', 'test', 'lab', 'reading', 'writing', 'listening', 'speaking', 'custom'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
                  {['draft', 'active', 'archived'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Due</label>
                <input type="datetime-local" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Max Score</label>
                <input type="number" value={form.max_score} onChange={(e) => setForm((f) => ({ ...f, max_score: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="e.g. 100" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Weight</label>
                <input type="number" step="0.1" min="0" value={form.score_weight} onChange={(e) => setForm((f) => ({ ...f, score_weight: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Schood Practice Link (optional)</label>
              <input value={form.experience_url} onChange={(e) => setForm((f) => ({ ...f, experience_url: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="https://practice.ielts.schood.online/…" />
              <p className="text-xs text-gray-400 mt-1">Students will see a direct link to this Schood resource alongside the assignment.</p>
            </div>
            <button onClick={save} disabled={saving || !form.title.trim()} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold hover:bg-black disabled:bg-gray-300 text-sm">
              {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Assignment'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Gradebook Tab ────────────────────────────────────────────────────────────

const GradebookTab: React.FC<{ academyId: string; classroomId: string; token: string }> = ({ academyId, classroomId, token }) => {
  const [gb, setGb] = useState<AcademyGradebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [gradeTarget, setGradeTarget] = useState<{ row: AcademyGradebook['rows'][0]; assignment: AcademyGradebook['assignments'][0] } | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeNotes, setGradeNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    academyGradebook(token, academyId, classroomId)
      .then(setGb).catch(() => null).finally(() => setLoading(false));
  }, [token, academyId, classroomId]);

  useEffect(() => { refresh(); }, [refresh]);

  const openGrade = (row: AcademyGradebook['rows'][0], asgn: AcademyGradebook['assignments'][0]) => {
    const sub = row.submissions[asgn.id];
    setGradeScore(sub?.score !== null && sub?.score !== undefined ? String(sub.score) : '');
    setGradeNotes(sub?.notes ?? '');
    setGradeTarget({ row, assignment: asgn });
  };

  const saveGrade = async () => {
    if (!gradeTarget || gradeScore === '') return;
    setSaving(true);
    try {
      await academyGradeSubmission(token, {
        academy_id: academyId,
        assignment_id: gradeTarget.assignment.id,
        contact_id: gradeTarget.row.contact_id,
        score: Number(gradeScore),
        max_score: gradeTarget.assignment.max_score,
        notes: gradeNotes || null,
      });
      setGradeTarget(null);
      refresh();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await academyExportGradebook(token, academyId, classroomId);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'gradebook.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExporting(false);
  };

  if (loading) return <div className="text-center text-gray-400 py-8">Loading gradebook…</div>;
  if (!gb) return <div className="text-center text-gray-400 py-8">Failed to load.</div>;
  if (gb.assignments.length === 0) return (
    <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
      No assignments yet. Add assignments first, then grades will appear here.
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Gradebook — {gb.rows.length} students</h3>
        <button onClick={handleExport} disabled={exporting} className="px-3 py-1.5 border border-gray-300 text-sm rounded-xl hover:bg-gray-50 disabled:opacity-50">
          {exporting ? 'Exporting…' : '⬇ Export CSV'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap sticky left-0 bg-gray-50 min-w-[160px]">Student</th>
              {gb.assignments.map((a) => (
                <th key={a.id} className="px-3 py-3 font-medium text-gray-600 text-center whitespace-nowrap max-w-[120px]">
                  <div className="truncate text-xs">{a.title}</div>
                  {a.due_at && <div className="text-xs text-gray-400">{fmtDate(a.due_at)}</div>}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold text-gray-700 text-center whitespace-nowrap">Composite</th>
            </tr>
          </thead>
          <tbody>
            {gb.rows.map((row) => (
              <tr key={row.contact_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 sticky left-0 bg-white font-medium text-gray-900 whitespace-nowrap">
                  {row.first_name} {row.last_name}
                  <div className="text-xs text-gray-400">{row.email ?? ''}</div>
                </td>
                {gb.assignments.map((a) => {
                  const sub = row.submissions[a.id];
                  return (
                    <td key={a.id} className="px-3 py-2 text-center">
                      <button
                        onClick={() => openGrade(row, a)}
                        className={`text-xs rounded-lg px-2 py-1 w-full hover:bg-gray-100 transition-colors ${sub?.status === 'graded' ? 'text-emerald-700 bg-emerald-50' : sub?.status === 'submitted' ? 'text-blue-700 bg-blue-50' : 'text-gray-400'}`}
                      >
                        {sub?.score !== null && sub?.score !== undefined
                          ? `${sub.score}${a.max_score ? `/${a.max_score}` : ''}`
                          : sub?.status === 'submitted' ? '(in)' : '—'}
                      </button>
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-center font-semibold text-gray-700">
                  {row.composite_score !== null ? `${row.composite_score}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending submission review queue */}
      {(() => {
        const pending = gb.rows.flatMap((row) =>
          gb.assignments
            .filter((a) => {
              const sub = row.submissions[a.id] as any;
              return sub?.status === 'submitted';
            })
            .map((a) => {
              const sub = row.submissions[a.id] as any;
              return { row, assignment: a, sub };
            }),
        );
        if (pending.length === 0) return null;
        return (
          <div className="mt-5">
            <div className="text-sm font-semibold text-gray-700 mb-2">Pending Review ({pending.length})</div>
            <div className="space-y-2">
              {pending.map(({ row, assignment, sub }) => (
                <div key={`${assignment.id}-${row.contact_id}`} className="border border-blue-200 bg-blue-50 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{row.first_name} {row.last_name} — {assignment.title}</div>
                    {sub.submission_content && (
                      <div className="text-xs text-gray-600 mt-1 line-clamp-3 bg-white rounded-lg px-2 py-1.5 border border-gray-200">{sub.submission_content}</div>
                    )}
                    {sub.submission_url && (
                      <a href={sub.submission_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline mt-1 block">View attached file</a>
                    )}
                  </div>
                  <button onClick={() => openGrade(row, assignment)} className="shrink-0 text-xs px-2.5 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-black">Grade</button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {gradeTarget && (
        <Modal title={`Grade: ${gradeTarget.assignment.title}`} onClose={() => setGradeTarget(null)}>
          <div className="space-y-4">
            <div className="text-sm text-gray-600">Student: <strong>{gradeTarget.row.first_name} {gradeTarget.row.last_name}</strong></div>
            {(() => {
              const sub = gradeTarget.row.submissions[gradeTarget.assignment.id] as any;
              if (!sub) return null;
              return (
                <div className="space-y-2">
                  {sub.submission_content && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Student's answer</div>
                      <div className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 border border-gray-200 max-h-40 overflow-y-auto whitespace-pre-wrap">{sub.submission_content}</div>
                    </div>
                  )}
                  {sub.submission_url && (
                    <a href={sub.submission_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline block">View attached file</a>
                  )}
                </div>
              );
            })()}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Score{gradeTarget.assignment.max_score ? ` (out of ${gradeTarget.assignment.max_score})` : ''}</label>
              <input type="number" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Feedback (optional)</label>
              <textarea value={gradeNotes} onChange={(e) => setGradeNotes(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="Optional feedback for student…" />
            </div>
            <button onClick={saveGrade} disabled={saving || gradeScore === ''} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm disabled:bg-gray-300 hover:bg-black">
              {saving ? 'Saving…' : 'Save Grade'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Attendance Tab ───────────────────────────────────────────────────────────

const AttendanceTab: React.FC<{
  academyId: string;
  classroomId: string;
  token: string;
  members: TeacherStudioStudentContact[];
}> = ({ academyId, classroomId, token, members }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoadingHistory(true);
    academyListAttendance(token, academyId, classroomId)
      .then((r) => setHistory(r.attendance))
      .catch(() => null)
      .finally(() => setLoadingHistory(false));
  }, [token, academyId, classroomId]);

  // Pre-fill from history when date changes
  useEffect(() => {
    const dayRecords = history.filter((r) => r.session_date === date);
    const prefill: Record<string, string> = {};
    for (const r of dayRecords) prefill[r.contact_id] = r.status;
    // Default all members to 'present' if no record
    for (const m of members) if (!prefill[m.id]) prefill[m.id] = 'present';
    setStatuses(prefill);
    setNotes({});
    setSaved(false);
  }, [date, history, members]);

  const save = async () => {
    setSaving(true);
    try {
      const records = members.map((m) => ({ contact_id: m.id, status: statuses[m.id] ?? 'present', notes: notes[m.id] ?? null }));
      await academyMarkAttendance(token, { academy_id: academyId, classroom_id: classroomId, session_date: date, records });
      setSaved(true);
      // Refresh history
      const r = await academyListAttendance(token, academyId, classroomId);
      setHistory(r.attendance);
    } catch { /* ignore */ }
    setSaving(false);
  };

  // Build a summary calendar (last 7 dates with records)
  const attendanceDates = Array.from(new Set(history.map((r) => r.session_date as string))).sort().reverse().slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Session Date</label>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
        </div>
        {saved && <div className="text-sm text-emerald-600 font-medium">Saved ✓</div>}
      </div>

      {members.length === 0 ? (
        <div className="text-center text-gray-400 py-8">No students enrolled.</div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-0 text-xs font-semibold text-gray-500 bg-gray-50 px-4 py-2.5 border-b">
              <span>Student</span><span>Status</span><span>Note</span>
            </div>
            {members.map((m) => (
              <div key={m.id} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-2.5 border-b border-gray-100 last:border-0">
                <span className="text-sm font-medium text-gray-800">{m.first_name} {m.last_name}</span>
                <select
                  value={statuses[m.id] ?? 'present'}
                  onChange={(e) => setStatuses((s) => ({ ...s, [m.id]: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none"
                >
                  {['present', 'late', 'absent', 'excused'].map((s) => <option key={s}>{s}</option>)}
                </select>
                <input
                  value={notes[m.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none"
                  placeholder="note…"
                />
              </div>
            ))}
          </div>
          <button onClick={save} disabled={saving} className="px-6 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-black disabled:bg-gray-300 font-semibold">
            {saving ? 'Saving…' : 'Save Attendance'}
          </button>
        </>
      )}

      {attendanceDates.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-700 text-sm mb-3">Recent Sessions</h4>
          {loadingHistory ? <div className="text-gray-400 text-sm">Loading…</div> : (
            <div className="space-y-2">
              {attendanceDates.map((d) => {
                const dayRecs = history.filter((r) => r.session_date === d);
                const present = dayRecs.filter((r) => r.status === 'present' || r.status === 'late').length;
                return (
                  <div key={d} className="flex items-center gap-3 text-sm">
                    <button onClick={() => setDate(d)} className="text-blue-600 hover:underline font-mono">{d}</button>
                    <span className="text-gray-500">{present}/{dayRecs.length} present</span>
                    <div className="flex gap-1">
                      {dayRecs.slice(0, 8).map((r) => (
                        <span key={r.contact_id} className={`w-2 h-2 rounded-full ${r.status === 'present' ? 'bg-emerald-400' : r.status === 'late' ? 'bg-amber-400' : 'bg-red-400'}`} title={r.status} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Settings Tab ─────────────────────────────────────────────────────────────

const SettingsTab: React.FC<{
  academyId: string;
  classroom: TeacherStudioStudentClassroom;
  token: string;
  onSaved: () => void;
}> = ({ academyId, classroom, token, onSaved }) => {
  const [name, setName] = useState(classroom.name);
  const [description, setDescription] = useState(classroom.description ?? '');
  const [isActive, setIsActive] = useState(classroom.is_active);
  const [weights, setWeights] = useState(() => {
    const w = (classroom as any).score_weights ?? {};
    return { reading: w.reading ?? '', writing: w.writing ?? '', listening: w.listening ?? '', speaking: w.speaking ?? '' };
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const sw: Record<string, number> = {};
      for (const [k, v] of Object.entries(weights)) { if (v !== '') sw[k] = Number(v); }
      await academyUpdateClassroomSettings(token, {
        academy_id: academyId, classroom_id: classroom.id,
        name: name.trim() || classroom.name, description: description || null, is_active: isActive,
        score_weights: Object.keys(sw).length > 0 ? sw : null,
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</div>}
      {saved && <div className="text-sm text-emerald-600 bg-emerald-50 rounded-xl p-3">Settings saved.</div>}

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Classroom Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
        <span className="text-gray-700">Active (visible to students)</span>
      </label>

      <div>
        <div className="text-xs font-semibold text-gray-600 mb-2">Score Weights (Feature 9 — composite score)</div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(weights).map(([k, v]) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-1 capitalize">{k}</label>
              <input type="number" step="0.05" min="0" max="1" value={v}
                onChange={(e) => setWeights((w) => ({ ...w, [k]: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="e.g. 0.25" />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Weights used to compute a composite score in the gradebook. Leave blank to use equal weight.</p>
      </div>

      <button onClick={save} disabled={saving} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300">
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
};

// ─── Students Tab (classroom-level) ──────────────────────────────────────────

const ClassroomStudentsTab: React.FC<{
  academyId: string;
  classroom: TeacherStudioStudentClassroom;
  contacts: TeacherStudioStudentContact[];
  token: string;
  onRefresh: () => void;
}> = ({ academyId, classroom, contacts, token, onRefresh }) => {
  const [showBulkInvite, setShowBulkInvite] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: number; failed: number } | null>(null);
  const [progressContact, setProgressContact] = useState<TeacherStudioStudentContact | null>(null);

  // Find enrolled contacts for this classroom from dashboard
  const enrolled = contacts; // parent already filters by classroom if needed

  const doBulkInvite = async () => {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed = lines.map((line) => {
      const parts = line.split(/[\t,]/).map((p) => p.trim());
      const email = parts.find((p) => p.includes('@')) ?? parts[0];
      const firstName = parts[0] !== email ? parts[0] : '';
      const lastName = parts[1] !== email ? parts[1] : '';
      return { email, first_name: firstName, last_name: lastName };
    }).filter((e) => e.email.includes('@'));

    if (parsed.length === 0) return;
    setInviting(true);
    try {
      const res = await academyBulkInvite(token, { academy_id: academyId, classroom_id: classroom.id, contacts: parsed });
      setInviteResult(res.summary);
      onRefresh();
    } catch { /* ignore */ }
    setInviting(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Students ({enrolled.length})</h3>
        <button onClick={() => setShowBulkInvite(true)} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">+ Bulk Add</button>
      </div>

      {enrolled.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
          No students yet. Use Bulk Add to invite them.
        </div>
      ) : (
        <div className="space-y-1.5">
          {enrolled.map((c) => (
            <div key={c.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3">
              <div>
                <div className="font-medium text-gray-900 text-sm">{c.first_name} {c.last_name}</div>
                <div className="text-xs text-gray-400">{c.email ?? '(no email)'}</div>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(c.status)}
                <button onClick={() => setProgressContact(c)} className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Progress</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBulkInvite && (
        <Modal title="Bulk Add Students" onClose={() => { setShowBulkInvite(false); setInviteResult(null); setBulkText(''); }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">One per line. Formats accepted:</p>
            <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-600">{`email@example.com\nFirst Last, email@example.com\nFirst\tLast\temail@example.com`}</pre>
            <textarea
              value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={10}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none font-mono"
              placeholder="paste student emails here…"
            />
            {inviteResult && (
              <div className={`text-sm rounded-xl p-3 ${inviteResult.failed > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {inviteResult.ok} added, {inviteResult.failed} failed
              </div>
            )}
            <button onClick={doBulkInvite} disabled={inviting || !bulkText.trim()} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300">
              {inviting ? 'Adding…' : 'Add Students'}
            </button>
          </div>
        </Modal>
      )}

      {progressContact && (
        <StudentProgressModal academyId={academyId} contact={progressContact} token={token} onClose={() => setProgressContact(null)} classroomId={classroom.id} />
      )}
    </div>
  );
};

// ─── Schedule Tab ─────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SUPABASE_URL_CTRL = import.meta.env.VITE_SUPABASE_URL as string;

const callAcademyCtrl = (token: string, body: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL_CTRL}/functions/v1/academy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

type ScheduleSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string | null;
  timezone: string;
  label: string | null;
  is_active: boolean;
};

const ScheduleTab: React.FC<{ academyId: string; classroomId: string; token: string }> = ({ academyId, classroomId, token }) => {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSlot, setEditSlot] = useState<ScheduleSlot | null>(null);
  const [form, setForm] = useState({ day_of_week: '1', start_time: '09:00', end_time: '', label: '', timezone: 'Asia/Tashkent' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAcademyCtrl(token, { action: 'schedule', academy_id: academyId, classroom_id: classroomId });
    setSlots((res.schedule ?? []) as ScheduleSlot[]);
    setLoading(false);
  }, [token, academyId, classroomId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setForm({ day_of_week: '1', start_time: '09:00', end_time: '', label: '', timezone: 'Asia/Tashkent' }); setEditSlot(null); setShowForm(true); };
  const openEdit = (s: ScheduleSlot) => { setForm({ day_of_week: String(s.day_of_week), start_time: s.start_time, end_time: s.end_time ?? '', label: s.label ?? '', timezone: s.timezone }); setEditSlot(s); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    const payload: Record<string, unknown> = {
      action: 'upsert_schedule', academy_id: academyId, classroom_id: classroomId,
      day_of_week: Number(form.day_of_week), start_time: form.start_time,
      end_time: form.end_time || null, label: form.label || null, timezone: form.timezone,
    };
    if (editSlot) payload.id = editSlot.id;
    await callAcademyCtrl(token, payload);
    setSaving(false);
    setShowForm(false);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this session slot?')) return;
    await callAcademyCtrl(token, { action: 'delete_schedule', academy_id: academyId, id });
    void load();
  };

  const byDay = DAY_NAMES.map((day, idx) => ({ day, idx, slots: slots.filter((s) => s.day_of_week === idx) })).filter((d) => d.slots.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Class Schedule</h3>
        <button onClick={openCreate} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">+ Add Slot</button>
      </div>

      {loading ? <div className="text-center text-gray-400 py-8">Loading…</div> : slots.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
          No schedule set. Add recurring session slots.
        </div>
      ) : (
        <div className="space-y-3">
          {byDay.map(({ day, slots: daySlots }) => (
            <div key={day}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{day}</div>
              <div className="space-y-1.5">
                {daySlots.map((s) => (
                  <div key={s.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-2.5">
                    <div>
                      <span className="font-medium text-gray-900 text-sm">
                        {s.start_time}{s.end_time ? ` – ${s.end_time}` : ''}
                      </span>
                      {s.label && <span className="ml-2 text-xs text-gray-500">{s.label}</span>}
                      <div className="text-xs text-gray-400">{s.timezone}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(s)} className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Edit</button>
                      <button onClick={() => remove(s.id)} className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-red-400">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editSlot ? 'Edit Session Slot' : 'New Session Slot'} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Day</label>
                <select value={form.day_of_week} onChange={(e) => setForm((f) => ({ ...f, day_of_week: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
                  {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Timezone</label>
                <input value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Start Time</label>
                <input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">End Time (optional)</label>
                <input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Label (optional)</label>
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="e.g. Speaking practice" />
            </div>
            <button onClick={save} disabled={saving} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300">
              {saving ? 'Saving…' : editSlot ? 'Save Changes' : 'Add Slot'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Classroom Billing Tab ────────────────────────────────────────────────────

type BillingOffer = { id: string; name: string; price_amount: number; currency: string; duration_days: number | null; is_active: boolean };
type BillingStudent = {
  contact_id: string; first_name: string; last_name: string; email: string | null;
  paid: boolean; last_payment: { amount: number; currency: string; status: string; created_at: string } | null;
};

const ClassroomBillingTab: React.FC<{ academyId: string; classroomId: string; token: string }> = ({ academyId, classroomId, token }) => {
  const [data, setData] = useState<{ has_tuition: boolean; offers: BillingOffer[]; students: BillingStudent[]; paid_count: number; unpaid_count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', price_amount: '', currency: 'UZS', duration_days: '30', description: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAcademyCtrl(token, { action: 'classroom_billing', academy_id: academyId, classroom_id: classroomId });
    setData(res?.classroom_id ? res : { has_tuition: false, offers: [], students: [], paid_count: 0, unpaid_count: 0 });
    setLoading(false);
  }, [token, academyId, classroomId]);

  useEffect(() => { void load(); }, [load]);

  const createOffer = async () => {
    if (!form.name.trim() || !form.price_amount) return;
    setSaving(true);
    await callAcademyCtrl(token, {
      action: 'create_offer', academy_id: academyId, classroom_id: classroomId,
      name: form.name.trim(), type: 'cohort', price_amount: Number(form.price_amount),
      currency: form.currency, duration_days: form.duration_days ? Number(form.duration_days) : null,
      description: form.description || null,
    });
    setSaving(false);
    setShowCreate(false);
    setForm({ name: '', price_amount: '', currency: 'UZS', duration_days: '30', description: '' });
    void load();
  };

  if (loading) return <div className="text-center text-gray-400 py-8">Loading…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Tuition & Billing</h3>
        <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">+ Tuition Offer</button>
      </div>

      {!data?.has_tuition ? (
        <div className="text-center text-gray-400 py-10 border-2 border-dashed border-gray-200 rounded-2xl">
          This classroom is free. Add a tuition offer to bill students and gate access on payment.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-2xl p-4 bg-emerald-50 text-emerald-700">
              <div className="text-2xl font-bold">{data.paid_count}</div>
              <div className="text-xs font-medium opacity-75 mt-1">Paid</div>
            </div>
            <div className="rounded-2xl p-4 bg-amber-50 text-amber-700">
              <div className="text-2xl font-bold">{data.unpaid_count}</div>
              <div className="text-xs font-medium opacity-75 mt-1">Outstanding</div>
            </div>
            <div className="rounded-2xl p-4 bg-blue-50 text-blue-700">
              <div className="text-2xl font-bold">{data.offers.length}</div>
              <div className="text-xs font-medium opacity-75 mt-1">Offers</div>
            </div>
          </div>

          <div className="mb-4 space-y-1.5">
            {data.offers.map((o) => (
              <div key={o.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-2.5 text-sm">
                <span className="font-medium text-gray-900">{o.name}</span>
                <span className="text-gray-600">{new Intl.NumberFormat().format(o.price_amount)} {o.currency}{o.duration_days ? ` / ${o.duration_days}d` : ''}</span>
              </div>
            ))}
          </div>

          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Students</div>
          <div className="space-y-1.5">
            {data.students.map((s) => (
              <div key={s.contact_id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-2.5">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{s.first_name} {s.last_name}</div>
                  <div className="text-xs text-gray-400">{s.email ?? ''}</div>
                </div>
                {s.paid ? (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">Paid</span>
                ) : (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">Outstanding</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {showCreate && (
        <Modal title="New Tuition Offer" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="e.g. Monthly tuition — June" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Price *</label>
                <input type="number" value={form.price_amount} onChange={(e) => setForm((f) => ({ ...f, price_amount: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="e.g. 500000" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Currency</label>
                <input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Access duration (days)</label>
              <input type="number" value={form.duration_days} onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="30 (blank = lifetime)" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            </div>
            <button onClick={createOffer} disabled={saving || !form.name.trim() || !form.price_amount} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300">
              {saving ? 'Creating…' : 'Create Tuition Offer'}
            </button>
            <p className="text-xs text-gray-400">Once created, students see a Pay button in their portal. Paying unlocks classroom access automatically via Click.uz.</p>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Classroom Detail ─────────────────────────────────────────────────────────

const ClassroomDetail: React.FC<{
  academyId: string;
  classroom: TeacherStudioStudentClassroom;
  contacts: TeacherStudioStudentContact[];
  token: string;
  onBack: () => void;
  onRefresh: () => void;
}> = ({ academyId, classroom, contacts, token, onBack, onRefresh }) => {
  const [tab, setTab] = useState<ClassroomTab>('students');

  const tabs: { key: ClassroomTab; label: string }[] = [
    { key: 'students', label: 'Students' },
    { key: 'assignments', label: 'Assignments' },
    { key: 'gradebook', label: 'Gradebook' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'billing', label: 'Billing' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div>
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800 mb-4">← Back to classrooms</button>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{classroom.name}</h2>
          {classroom.description && <p className="text-sm text-gray-500 mt-0.5">{classroom.description}</p>}
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${classroom.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          {classroom.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'students' && <ClassroomStudentsTab academyId={academyId} classroom={classroom} contacts={contacts} token={token} onRefresh={onRefresh} />}
      {tab === 'assignments' && <AssignmentsTab academyId={academyId} classroomId={classroom.id} token={token} />}
      {tab === 'gradebook' && <GradebookTab academyId={academyId} classroomId={classroom.id} token={token} />}
      {tab === 'attendance' && <AttendanceTab academyId={academyId} classroomId={classroom.id} token={token} members={contacts} />}
      {tab === 'schedule' && <ScheduleTab academyId={academyId} classroomId={classroom.id} token={token} />}
      {tab === 'billing' && <ClassroomBillingTab academyId={academyId} classroomId={classroom.id} token={token} />}
      {tab === 'settings' && <SettingsTab academyId={academyId} classroom={classroom} token={token} onSaved={onRefresh} />}
    </div>
  );
};

// ─── Classrooms Tab ───────────────────────────────────────────────────────────

const ClassroomsTab: React.FC<{
  academyId: string;
  dashboard: TeacherStudioStudentDashboard;
  token: string;
  onRefresh: () => void;
}> = ({ academyId, dashboard, token, onRefresh }) => {
  const [selected, setSelected] = useState<TeacherStudioStudentClassroom | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const classrooms = dashboard.classrooms ?? [];

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/academy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_classroom', academy_id: academyId, name: newName.trim(), description: newDesc || null }),
      });
      setShowCreate(false); setNewName(''); setNewDesc('');
      onRefresh();
    } catch { /* ignore */ }
    setCreating(false);
  };

  if (selected) {
    const classroomContacts = (dashboard.contacts ?? []).filter((c) => {
      const membership = (dashboard.classroom_memberships ?? []).find((m) => m.classroom_id === selected.id && m.contact_id === c.id);
      return !!membership;
    });
    return <ClassroomDetail academyId={academyId} classroom={selected} contacts={classroomContacts as TeacherStudioStudentContact[]} token={token} onBack={() => setSelected(null)} onRefresh={onRefresh} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Classrooms ({classrooms.length})</h3>
        <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">+ New Classroom</button>
      </div>

      {classrooms.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
          No classrooms yet. Create your first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {classrooms.map((c) => {
            const memberCount = (dashboard.classroom_memberships ?? []).filter((m) => m.classroom_id === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c as TeacherStudioStudentClassroom)}
                className="border border-gray-200 rounded-2xl p-5 text-left hover:border-gray-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-gray-900">{c.name}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${(c as any).is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {(c as any).is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {c.description && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{c.description}</p>}
                <div className="text-xs text-gray-400 mt-3">{memberCount} {memberCount === 1 ? 'student' : 'students'} · Created {fmtDate(c.created_at)}</div>
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="New Classroom" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Name *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="e.g. IELTS Band 7 — Summer 2026" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
              <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            </div>
            <button onClick={create} disabled={creating || !newName.trim()} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300">
              {creating ? 'Creating…' : 'Create Classroom'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── All Students Tab ─────────────────────────────────────────────────────────

const StudentsTab: React.FC<{
  academyId: string;
  dashboard: TeacherStudioStudentDashboard;
  token: string;
  onRefresh: () => void;
}> = ({ academyId, dashboard, token, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [progressContact, setProgressContact] = useState<TeacherStudioStudentContact | null>(null);
  const [showBulkInvite, setShowBulkInvite] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: number; failed: number } | null>(null);

  const contacts = (dashboard.contacts ?? []) as TeacherStudioStudentContact[];
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.email ?? ''}`.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const doBulkInvite = async () => {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed = lines.map((line) => {
      const parts = line.split(/[\t,]/).map((p) => p.trim());
      const email = parts.find((p) => p.includes('@')) ?? parts[0];
      const firstName = parts[0] !== email ? parts[0] : '';
      const lastName = parts[1] !== email ? parts[1] : '';
      return { email, first_name: firstName, last_name: lastName };
    }).filter((e) => e.email.includes('@'));
    if (parsed.length === 0) return;
    setInviting(true);
    try {
      const res = await academyBulkInvite(token, { academy_id: academyId, contacts: parsed });
      setInviteResult(res.summary);
      onRefresh();
    } catch { /* ignore */ }
    setInviting(false);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none"
          placeholder="Search students…"
        />
        <button onClick={() => setShowBulkInvite(true)} className="px-3 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black whitespace-nowrap">+ Bulk Add</button>
      </div>

      <div className="text-xs text-gray-400 mb-3">{filtered.length} students</div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
          {search ? 'No results.' : 'No students in this academy yet.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((c) => {
            const classroomNames = (dashboard.classroom_memberships ?? [])
              .filter((m) => m.contact_id === c.id)
              .map((m) => (dashboard.classrooms ?? []).find((cl) => cl.id === m.classroom_id)?.name)
              .filter(Boolean).join(', ');
            return (
              <div key={c.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{c.first_name} {c.last_name}</div>
                  <div className="text-xs text-gray-400">{c.email ?? '(no email)'}{classroomNames ? ` · ${classroomNames}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(c.status)}
                  <button onClick={() => setProgressContact(c)} className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Progress</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showBulkInvite && (
        <Modal title="Bulk Add Students to Academy" onClose={() => { setShowBulkInvite(false); setInviteResult(null); setBulkText(''); }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">One per line. Email required.</p>
            <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-600">{`email@example.com\nFirst Last, email@example.com`}</pre>
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={10} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none font-mono" placeholder="paste emails…" />
            {inviteResult && (
              <div className={`text-sm rounded-xl p-3 ${inviteResult.failed > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {inviteResult.ok} added, {inviteResult.failed} failed
              </div>
            )}
            <button onClick={doBulkInvite} disabled={inviting || !bulkText.trim()} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300">
              {inviting ? 'Adding…' : 'Add Students'}
            </button>
          </div>
        </Modal>
      )}

      {progressContact && (
        <StudentProgressModal academyId={academyId} contact={progressContact} token={token} onClose={() => setProgressContact(null)} />
      )}
    </div>
  );
};

// ─── Announcements Tab ────────────────────────────────────────────────────────

const AnnouncementsTab: React.FC<{
  academyId: string;
  dashboard: TeacherStudioStudentDashboard;
  token: string;
  onRefresh: () => void;
}> = ({ academyId, dashboard, token, onRefresh }) => {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', classroom_id: '' });
  const [saving, setSaving] = useState(false);

  const announcements = (dashboard.announcements ?? []) as any[];
  const classrooms = dashboard.classrooms ?? [];

  const create = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/academy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_announcement', academy_id: academyId,
          title: form.title.trim(), body: form.body.trim(),
          classroom_id: form.classroom_id || null,
        }),
      });
      setShowCreate(false); setForm({ title: '', body: '', classroom_id: '' });
      onRefresh();
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Announcements ({announcements.length})</h3>
        <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">+ Post</button>
      </div>

      {announcements.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">No announcements yet.</div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const classroom = classrooms.find((c) => c.id === a.classroom_id);
            return (
              <div key={a.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">{a.title}</div>
                    {classroom && <div className="text-xs text-blue-600 mt-0.5">📚 {classroom.name}</div>}
                  </div>
                  <div className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(a.created_at)}</div>
                </div>
                <p className="text-sm text-gray-600 mt-2">{a.body}</p>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="Post Announcement" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Target</label>
              <select value={form.classroom_id} onChange={(e) => setForm((f) => ({ ...f, classroom_id: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
                <option value="">Center-wide (all students)</option>
                {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Message *</label>
              <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={5} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            </div>
            <button onClick={create} disabled={saving || !form.title.trim() || !form.body.trim()} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300">
              {saving ? 'Posting…' : 'Post Announcement'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Director Dashboard Tab ───────────────────────────────────────────────────

type OwnerDashboard = {
  revenue: { currency: string; collected_total: number; collected_this_month: number; outstanding: number; paid_count: number };
  funnel: Record<string, number>;
  total_students: number;
  total_classrooms: number;
  classroom_stats: Array<{ classroom_id: string; name: string; is_active: boolean; students: number; assignments: number; avg_score: number | null; attendance_rate: number | null }>;
  attendance_trend: Array<{ date: string; rate: number | null }>;
};

type StaffRow = { id: string; email: string; display_name: string | null; role: string; classroom_ids: string[]; is_active: boolean; user_id: string | null };

const money = (amount: number, currency: string) => `${new Intl.NumberFormat().format(amount)} ${currency}`;

const DirectorTab: React.FC<{ academyId: string; dashboard: TeacherStudioStudentDashboard; token: string }> = ({ academyId, dashboard, token }) => {
  const [data, setData] = useState<OwnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<Array<{ contact_id: string; name: string; referrals: number; enrolled: number }>>([]);
  const [showStaff, setShowStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({ email: '', name: '', role: 'teacher', classroom_ids: [] as string[] });
  const [savingStaff, setSavingStaff] = useState(false);

  const classrooms = dashboard.classrooms ?? [];

  const load = useCallback(async () => {
    setLoading(true);
    const [d, s, lb] = await Promise.all([
      callAcademyCtrl(token, { action: 'owner_dashboard', academy_id: academyId }),
      callAcademyCtrl(token, { action: 'staff', academy_id: academyId }),
      callAcademyCtrl(token, { action: 'referral_leaderboard', academy_id: academyId }),
    ]);
    setData(d?.revenue ? d : null);
    setStaff((s.staff ?? []) as StaffRow[]);
    setLeaderboard((lb.leaderboard ?? []) as Array<{ contact_id: string; name: string; referrals: number; enrolled: number }>);
    setLoading(false);
  }, [token, academyId]);

  useEffect(() => { void load(); }, [load]);

  const saveStaff = async () => {
    if (!staffForm.email.trim()) return;
    setSavingStaff(true);
    await callAcademyCtrl(token, {
      action: 'upsert_staff', academy_id: academyId,
      staff_email: staffForm.email.trim(), name: staffForm.name || null,
      staff_role: staffForm.role, classroom_ids: staffForm.classroom_ids,
    });
    setSavingStaff(false);
    setShowStaff(false);
    setStaffForm({ email: '', name: '', role: 'teacher', classroom_ids: [] });
    void load();
  };

  const removeStaff = async (id: string) => {
    if (!confirm('Remove this staff member?')) return;
    await callAcademyCtrl(token, { action: 'remove_staff', academy_id: academyId, id });
    void load();
  };

  if (loading) return <div className="text-center text-gray-400 py-8">Loading director view…</div>;
  if (!data) return <div className="text-center text-gray-400 py-8">No data available.</div>;

  const maxTrend = Math.max(100, ...data.attendance_trend.map((t) => t.rate ?? 0));

  return (
    <div className="space-y-6">
      {/* Revenue */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Revenue</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl p-5 bg-emerald-50 text-emerald-700">
            <div className="text-2xl font-bold">{money(data.revenue.collected_this_month, data.revenue.currency)}</div>
            <div className="text-xs font-medium opacity-75 mt-1">This Month</div>
          </div>
          <div className="rounded-2xl p-5 bg-blue-50 text-blue-700">
            <div className="text-2xl font-bold">{money(data.revenue.collected_total, data.revenue.currency)}</div>
            <div className="text-xs font-medium opacity-75 mt-1">Collected (all time)</div>
          </div>
          <div className="rounded-2xl p-5 bg-amber-50 text-amber-700">
            <div className="text-2xl font-bold">{money(data.revenue.outstanding, data.revenue.currency)}</div>
            <div className="text-xs font-medium opacity-75 mt-1">Outstanding</div>
          </div>
          <div className="rounded-2xl p-5 bg-violet-50 text-violet-700">
            <div className="text-2xl font-bold">{data.revenue.paid_count}</div>
            <div className="text-xs font-medium opacity-75 mt-1">Paid Transactions</div>
          </div>
        </div>
      </div>

      {/* Enrollment funnel */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Enrollment</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Trial', value: data.funnel.trial ?? 0, color: 'text-amber-700 bg-amber-50' },
            { label: 'Active', value: data.funnel.active ?? 0, color: 'text-emerald-700 bg-emerald-50' },
            { label: 'Paused', value: data.funnel.paused ?? 0, color: 'text-gray-700 bg-gray-100' },
            { label: 'Inactive', value: data.funnel.inactive ?? 0, color: 'text-red-700 bg-red-50' },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-medium opacity-75 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Attendance trend */}
      {data.attendance_trend.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Attendance Trend (academy-wide)</h3>
          <div className="flex items-end gap-2 h-24 border border-gray-100 rounded-2xl p-4">
            {data.attendance_trend.map((t) => (
              <div key={t.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-xs text-gray-500">{t.rate !== null ? `${t.rate}%` : '—'}</div>
                <div className="w-full bg-emerald-400 rounded-t" style={{ height: t.rate !== null ? `${Math.max(4, (t.rate / maxTrend) * 60)}px` : '4px', opacity: t.rate !== null ? 1 : 0.15 }} />
                <div className="text-xs text-gray-400">{t.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Classroom performance */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Classroom Performance</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-2.5 font-semibold text-gray-700">Classroom</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-center">Students</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-center">Assignments</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-center">Avg Score</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-center">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {data.classroom_stats.map((c) => (
                <tr key={c.classroom_id} className="border-b border-gray-100">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}{!c.is_active && <span className="text-xs text-gray-400 ml-1">(inactive)</span>}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{c.students}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{c.assignments}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{c.avg_score !== null ? `${c.avg_score}%` : '—'}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{c.attendance_rate !== null ? `${c.attendance_rate}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Referral leaderboard */}
      {leaderboard.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Top Referrers</h3>
          <div className="space-y-1.5">
            {leaderboard.slice(0, 10).map((r, i) => (
              <div key={r.contact_id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold w-6 text-center ${i < 3 ? 'text-amber-500' : 'text-gray-400'}`}>#{i + 1}</span>
                  <span className="font-medium text-gray-900 text-sm">{r.name}</span>
                </div>
                <div className="text-xs text-gray-500">{r.referrals} referred{r.enrolled > 0 ? ` · ${r.enrolled} enrolled` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Staff & Teachers</h3>
          <button onClick={() => setShowStaff(true)} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">+ Add Staff</button>
        </div>
        {staff.length === 0 ? (
          <div className="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded-2xl text-sm">
            No staff added. Assign teachers to classrooms here.
          </div>
        ) : (
          <div className="space-y-1.5">
            {staff.map((s) => {
              const assigned = (s.classroom_ids ?? []).map((id) => classrooms.find((c) => c.id === id)?.name).filter(Boolean).join(', ');
              return (
                <div key={s.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-2.5">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{s.display_name || s.email}</div>
                    <div className="text-xs text-gray-400">
                      {s.role}{assigned ? ` · ${assigned}` : ' · no classrooms'}{!s.user_id ? ' · (not registered yet)' : ''}
                    </div>
                  </div>
                  <button onClick={() => removeStaff(s.id)} className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-red-400">Remove</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showStaff && (
        <Modal title="Add Staff Member" onClose={() => setShowStaff(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
              <input value={staffForm.email} onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="teacher@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
                <input value={staffForm.name} onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Role</label>
                <select value={staffForm.role} onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
                  {['teacher', 'manager', 'assistant'].map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Assigned Classrooms</label>
              <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-2">
                {classrooms.length === 0 ? <div className="text-xs text-gray-400 px-1">No classrooms yet.</div> : classrooms.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={staffForm.classroom_ids.includes(c.id)}
                      onChange={(e) => setStaffForm((f) => ({
                        ...f,
                        classroom_ids: e.target.checked ? [...f.classroom_ids, c.id] : f.classroom_ids.filter((id) => id !== c.id),
                      }))}
                    />
                    <span className="text-gray-700">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <button onClick={saveStaff} disabled={savingStaff || !staffForm.email.trim()} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300">
              {savingStaff ? 'Saving…' : 'Save Staff'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const AcademyControlPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<TeacherStudioStudentDashboard | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [academies, setAcademies] = useState<{ id: string; name: string; role: string }[]>([]);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const loadDashboard = useCallback(async (tok: string, _aid: string) => {
    const seq = ++loadSeq.current;
    try {
      // Load academies list
      const ares = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/academy?action=academies`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (ares.ok) {
        const aj = await ares.json();
        setAcademies((aj.academies ?? []) as any[]);
      }

      const d = await teacherStudioStudentDashboard(tok);
      if (seq === loadSeq.current) setDashboard(d);
    } catch (e) {
      if (seq === loadSeq.current) setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { navigate('/auth?returnTo=/academy-control', { replace: true }); return; }
        const tok = data.session.access_token;
        setToken(tok);

        // Get academies
        const ares = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/academy?action=academies`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (!ares.ok) { setError('Failed to load academies'); return; }
        const aj = await ares.json();
        const acads = (aj.academies ?? []) as { id: string; name: string; role: string }[];
        setAcademies(acads);

        if (acads.length === 0) { setError('No academy found. Create one first.'); return; }

        const firstId = acads[0].id;
        setAcademyId(firstId);
        await loadDashboard(tok, firstId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [navigate, loadDashboard]);

  const refresh = useCallback(async () => {
    if (!token || !academyId) return;
    await loadDashboard(token, academyId);
  }, [token, academyId, loadDashboard]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400">Loading Academy…</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="text-red-600 font-semibold mb-2">Error</div>
        <div className="text-gray-600 text-sm">{error}</div>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-gray-500 underline">Go back</button>
      </div>
    </div>
  );

  if (!dashboard || !academyId || !token) return null;

  const currentAcademy = academies.find((a) => a.id === academyId);

  const topTabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'director', label: 'Director' },
    { key: 'classrooms', label: 'Classrooms' },
    { key: 'students', label: 'Students' },
    { key: 'announcements', label: 'Announcements' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs font-semibold tracking-wider uppercase text-emerald-700 mb-1">LMS Control Panel</div>
            <h1 className="text-2xl font-bold text-gray-900">
              {currentAcademy?.name ?? 'Academy'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {academies.length > 1 && (
              <select
                value={academyId}
                onChange={(e) => { setAcademyId(e.target.value); void loadDashboard(token, e.target.value); }}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <button onClick={() => navigate(-1)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-100">← Back</button>
          </div>
        </div>

        {/* Top nav */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {topTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {tab === 'overview' && <OverviewTab dashboard={dashboard} academyId={academyId} token={token} />}
          {tab === 'director' && <DirectorTab academyId={academyId} dashboard={dashboard} token={token} />}
          {tab === 'classrooms' && <ClassroomsTab academyId={academyId} dashboard={dashboard} token={token} onRefresh={refresh} />}
          {tab === 'students' && <StudentsTab academyId={academyId} dashboard={dashboard} token={token} onRefresh={refresh} />}
          {tab === 'announcements' && <AnnouncementsTab academyId={academyId} dashboard={dashboard} token={token} onRefresh={refresh} />}
        </div>
      </div>
    </div>
  );
};
