import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'home' | 'assignments' | 'grades' | 'attendance' | 'billing' | 'chat';

export type BillingItem = {
  academy_id: string;
  classroom_id: string;
  contact_id: string;
  paid: boolean;
  offer: { id: string; name: string; price_amount: number; currency: string; description: string | null };
  last_payment: { status: string; created_at: string } | null;
};

type Academy = { id: string; name: string; slug: string; metadata: Record<string, unknown> };
type Classroom = { id: string; name: string; description: string | null; is_active: boolean; member_count: number };
type Announcement = { id: string; title: string; body: string; classroom_id: string | null; created_at: string };
type Offer = { id: string; name: string; price_amount: number; currency: string; description: string | null };
type ClassroomMembership = { classroom_id: string; contact_id: string };

type Assignment = {
  id: string;
  classroom_id: string;
  title: string;
  description: string | null;
  assignment_type: string;
  experience_url: string | null;
  due_at: string | null;
  max_score: number | null;
  status: string;
  created_at: string;
  submission: Submission | null;
};

type Submission = {
  id: string;
  score: number | null;
  max_score: number | null;
  status: string;
  submitted_at: string | null;
  graded_at: string | null;
  notes: string | null;
  submission_content: string | null;
  submission_url: string | null;
};

type AttendanceRecord = { session_date: string; status: string; notes: string | null };

type ChatMessage = {
  id: string;
  sender_type: string;
  message_type: string;
  content: string;
  created_at: string;
  sender_label: string;
};

type StudentDashboard = {
  academies: Academy[];
  contacts: Array<{ id: string; academy_id: string; first_name: string; last_name: string; status: string }>;
  classrooms: Classroom[];
  classroom_memberships: ClassroomMembership[];
  announcements: Announcement[];
  messages: unknown[];
  alerts: unknown[];
  entitlements: unknown[];
  payments: unknown[];
  offers: Offer[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const callAcademy = async (token: string, body: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/functions/v1/academy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    present: 'bg-emerald-100 text-emerald-700',
    late: 'bg-amber-100 text-amber-700',
    absent: 'bg-red-100 text-red-700',
    excused: 'bg-gray-100 text-gray-600',
    submitted: 'bg-blue-100 text-blue-700',
    graded: 'bg-emerald-100 text-emerald-700',
    missing: 'bg-red-100 text-red-700',
    active: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

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

// ─── Submit Assignment Modal ──────────────────────────────────────────────────

const SubmitModal: React.FC<{
  assignment: Assignment;
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ assignment, token, onClose, onSuccess }) => {
  const existing = assignment.submission;
  const [content, setContent] = useState(existing?.submission_content ?? '');
  const [url, setUrl] = useState(existing?.submission_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await callAcademy(token, {
        action: 'submit_assignment',
        assignment_id: assignment.id,
        content: content || null,
        url: url || null,
      });
      if (res.error) throw new Error(res.error);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  const alreadySubmitted = existing?.status === 'submitted' || existing?.status === 'graded';

  return (
    <Modal title={assignment.title} onClose={onClose}>
      <div className="space-y-4">
        {assignment.description && (
          <p className="text-sm text-gray-600">{assignment.description}</p>
        )}
        {assignment.due_at && (
          <div className="text-xs text-gray-500">Due: {fmtDate(assignment.due_at)}</div>
        )}
        {assignment.experience_url && (
          <a
            href={assignment.experience_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-600 hover:underline border border-blue-200 bg-blue-50 rounded-xl px-3 py-2"
          >
            <span>🔗</span>
            <span>Open Schood practice resource</span>
          </a>
        )}

        {existing?.status === 'graded' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="font-semibold text-emerald-800 text-sm">
              Graded: {existing.score !== null ? `${existing.score}${existing.max_score ? `/${existing.max_score}` : ''}` : '—'}
            </div>
            {existing.notes && <div className="text-sm text-emerald-700 mt-1">{existing.notes}</div>}
          </div>
        )}

        {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</div>}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Your answer (text)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none"
            placeholder="Write your answer here…"
            disabled={existing?.status === 'graded'}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">File / recording URL (optional)</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none"
            placeholder="https://…"
            disabled={existing?.status === 'graded'}
          />
        </div>

        {existing?.status !== 'graded' && (
          <button
            onClick={submit}
            disabled={saving || (!content.trim() && !url.trim())}
            className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300"
          >
            {saving ? 'Submitting…' : alreadySubmitted ? 'Update Submission' : 'Submit'}
          </button>
        )}
      </div>
    </Modal>
  );
};

// ─── Chat Tab ─────────────────────────────────────────────────────────────────

const ChatTab: React.FC<{
  token: string;
  academyId: string;
  classroomId: string;
  classroomName: string;
}> = ({ token, academyId, classroomId, classroomName }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await callAcademy(token, { action: 'classroom-chat', academy_id: academyId, classroom_id: classroomId });
    setMessages((res.messages ?? []) as ChatMessage[]);
    setLoading(false);
  }, [token, academyId, classroomId]);

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setSending(true);
    setInput('');
    await callAcademy(token, { action: 'classroom-chat-send', academy_id: academyId, classroom_id: classroomId, content: text });
    await load();
    setSending(false);
  };

  if (loading) return <div className="text-center text-gray-400 py-8">Loading…</div>;

  return (
    <div className="flex flex-col h-[60vh]">
      <div className="text-xs font-semibold text-gray-500 mb-3">{classroomName} — Class Chat</div>
      <div className="flex-1 overflow-y-auto space-y-2 mb-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">No messages yet.</div>
        ) : (
          messages.map((m) => {
            const isStudent = m.sender_type === 'student';
            return (
              <div key={m.id} className={`flex ${isStudent ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isStudent ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  {!isStudent && (
                    <div className="text-xs font-medium mb-0.5 opacity-60">{m.sender_label || 'Teacher'}</div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                  <div className={`text-xs mt-1 ${isStudent ? 'text-gray-400' : 'text-gray-400'}`}>{fmtTime(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none"
          placeholder="Type a message…"
          disabled={sending}
        />
        <button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black disabled:bg-gray-300"
        >
          Send
        </button>
      </div>
    </div>
  );
};

// ─── Billing Tab ──────────────────────────────────────────────────────────────

const fmtMoney = (amount: number, currency: string) =>
  `${new Intl.NumberFormat().format(amount)} ${currency}`;

const BillingTab: React.FC<{
  token: string;
  classroomNames: Record<string, string>;
}> = ({ token, classroomNames }) => {
  const [items, setItems] = useState<BillingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingOfferId, setPayingOfferId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAcademy(token, { action: 'student_billing' });
    setItems((res.items ?? []) as BillingItem[]);
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const pay = async (item: BillingItem) => {
    setPayingOfferId(item.offer.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/click/create-transaction`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: `Tuition: ${item.offer.name}`,
          purchase_type: 'academy_tuition',
          redirect_url: `${window.location.origin}/my-academy`,
          metadata: { academy_id: item.academy_id, offer_id: item.offer.id, contact_id: item.contact_id },
        }),
      }).then((r) => r.json());
      if (res.payment_url) {
        window.location.href = res.payment_url;
      } else {
        alert(res.error ?? 'Could not start payment');
        setPayingOfferId(null);
      }
    } catch {
      setPayingOfferId(null);
    }
  };

  if (loading) return <div className="text-center text-gray-400 py-8">Loading…</div>;

  if (items.length === 0)
    return (
      <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
        No tuition due. Your classrooms are all set.
      </div>
    );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-800 mb-1">Tuition & Payments</h3>
      {items.map((item) => (
        <div
          key={`${item.classroom_id}-${item.offer.id}`}
          className={`border rounded-2xl p-5 ${item.paid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {classroomNames[item.classroom_id] ?? 'Classroom'}
              </div>
              <div className="font-semibold text-gray-900 mt-0.5">{item.offer.name}</div>
              {item.offer.description && (
                <div className="text-sm text-gray-600 mt-1">{item.offer.description}</div>
              )}
              <div className="text-lg font-bold text-gray-900 mt-2">
                {fmtMoney(item.offer.price_amount, item.offer.currency)}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {item.paid ? (
                <span className="inline-block px-3 py-1.5 rounded-xl text-sm font-medium bg-emerald-100 text-emerald-700">
                  ✓ Paid
                </span>
              ) : (
                <button
                  onClick={() => void pay(item)}
                  disabled={payingOfferId === item.offer.id}
                  className="px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-black disabled:bg-gray-300"
                >
                  {payingOfferId === item.offer.id ? 'Redirecting…' : 'Pay with Click'}
                </button>
              )}
              {item.last_payment && item.last_payment.status === 'pending' && !item.paid && (
                <div className="text-xs text-amber-600 mt-1.5">Payment pending…</div>
              )}
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-400 mt-2">
        Payments are processed securely by Click.uz. Access unlocks automatically once confirmed.
      </p>
    </div>
  );
};

// ─── Referral Card ────────────────────────────────────────────────────────────

const ReferralCard: React.FC<{ token: string }> = ({ token }) => {
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Array<{ status: string }>>([]);
  const [copied, setCopied] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    const res = await callAcademy(token, { action: 'student_referral' });
    setCode(res.code ?? null);
    setReferrals(res.referrals ?? []);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const claim = async () => {
    if (!claimCode.trim()) return;
    setClaiming(true);
    setClaimMsg(null);
    const res = await callAcademy(token, { action: 'claim_referral', referral_code: claimCode.trim().toUpperCase() });
    setClaimMsg(res.error ? res.error : 'Thanks! Your referral was recorded.');
    setClaiming(false);
    if (!res.error) { setClaimCode(''); void load(); }
  };

  return (
    <div className="border border-gray-200 rounded-2xl p-5 bg-gradient-to-br from-violet-50 to-blue-50">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">Invite friends</div>
          <div className="text-xs text-gray-500 mt-0.5">Share your code — earn recognition when they join.</div>
        </div>
        {referrals.length > 0 && (
          <div className="text-right">
            <div className="text-2xl font-bold text-violet-700">{referrals.length}</div>
            <div className="text-xs text-gray-500">referred</div>
          </div>
        )}
      </div>
      {code && (
        <div className="flex items-center gap-2 mt-3">
          <code className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono font-semibold tracking-wider text-gray-900">{code}</code>
          <button onClick={copy} className="px-3 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">{copied ? 'Copied!' : 'Copy'}</button>
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-white/60">
        <div className="text-xs font-semibold text-gray-600 mb-1.5">Were you referred? Enter their code:</div>
        <div className="flex items-center gap-2">
          <input value={claimCode} onChange={(e) => setClaimCode(e.target.value)} className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none font-mono" placeholder="FRIEND CODE" />
          <button onClick={() => void claim()} disabled={claiming || !claimCode.trim()} className="px-3 py-2 border border-gray-300 bg-white text-sm rounded-xl hover:bg-gray-50 disabled:opacity-50">
            {claiming ? '…' : 'Apply'}
          </button>
        </div>
        {claimMsg && <div className="text-xs text-gray-600 mt-1.5">{claimMsg}</div>}
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const StudentAcademyPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [submitTarget, setSubmitTarget] = useState<Assignment | null>(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);

  const loadAssignments = useCallback(async (tok: string) => {
    const res = await callAcademy(tok, { action: 'student_assignments' });
    setAssignments((res.assignments ?? []) as Assignment[]);
  }, []);

  const loadAttendance = useCallback(async (tok: string, academyId: string, classroomId: string) => {
    const res = await callAcademy(tok, { action: 'attendance', academy_id: academyId, classroom_id: classroomId });
    setAttendance((res.attendance ?? []) as AttendanceRecord[]);
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          navigate('/auth?returnTo=/my-academy', { replace: true });
          return;
        }
        const tok = data.session.access_token;
        setToken(tok);

        const res = await callAcademy(tok, { action: 'student-dashboard' });
        if (res.error) throw new Error(res.error);
        setDashboard(res as StudentDashboard);

        const memberships = (res.classroom_memberships ?? []) as ClassroomMembership[];
        const firstClassroomId = memberships[0]?.classroom_id ?? null;
        setSelectedClassroomId(firstClassroomId);

        await loadAssignments(tok);

        if (firstClassroomId && res.contacts?.[0]?.academy_id) {
          await loadAttendance(tok, String(res.contacts[0].academy_id), firstClassroomId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [navigate, loadAssignments, loadAttendance]);

  const academyId = useMemo(() => dashboard?.contacts?.[0]?.academy_id ?? null, [dashboard]);
  const contact = useMemo(() => dashboard?.contacts?.[0] ?? null, [dashboard]);
  const academy = useMemo(() => dashboard?.academies?.find((a) => a.id === academyId) ?? null, [dashboard, academyId]);
  const myClassrooms = useMemo(() => {
    if (!dashboard) return [];
    const enrolled = new Set((dashboard.classroom_memberships ?? []).map((m) => m.classroom_id));
    return (dashboard.classrooms ?? []).filter((c) => enrolled.has(c.id));
  }, [dashboard]);

  const selectedClassroom = useMemo(
    () => myClassrooms.find((c) => c.id === selectedClassroomId) ?? myClassrooms[0] ?? null,
    [myClassrooms, selectedClassroomId],
  );

  const classroomAssignments = useMemo(
    () => (selectedClassroom ? assignments.filter((a) => a.classroom_id === selectedClassroom.id) : assignments),
    [assignments, selectedClassroom],
  );

  const pendingCount = useMemo(
    () => assignments.filter((a) => !a.submission || a.submission.status === 'missing').length,
    [assignments],
  );

  if (loading)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-red-600 font-semibold mb-2">Couldn't load your academy</div>
          <div className="text-gray-500 text-sm mb-4">{error}</div>
          <button onClick={() => navigate('/')} className="text-sm text-gray-500 underline">Go home</button>
        </div>
      </div>
    );

  if (!dashboard || !contact)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-3xl mb-3">🎓</div>
          <div className="text-gray-800 font-semibold">You're not enrolled in any academy</div>
          <div className="text-gray-500 text-sm mt-2">Ask your teacher to add your email to their classroom.</div>
          <button onClick={() => navigate('/')} className="mt-4 text-sm text-gray-500 underline">Go home</button>
        </div>
      </div>
    );

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'home', label: 'Home' },
    { key: 'assignments', label: 'Assignments', badge: pendingCount || undefined },
    { key: 'grades', label: 'Grades' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'billing', label: 'Billing' },
    { key: 'chat', label: 'Chat' },
  ];

  const classroomNames: Record<string, string> = {};
  for (const c of myClassrooms) classroomNames[c.id] = c.name;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xs font-semibold tracking-wider uppercase text-blue-700 mb-0.5">
              {academy?.name ?? 'My Academy'}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {contact.first_name} {contact.last_name}
            </h1>
          </div>
          <button onClick={() => navigate(-1)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-100">
            ← Back
          </button>
        </div>

        {/* Classroom selector */}
        {myClassrooms.length > 1 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {myClassrooms.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedClassroomId(c.id);
                  if (token && academyId) void loadAttendance(token, academyId, c.id);
                }}
                className={`px-3 py-1.5 text-sm rounded-xl border transition-colors ${selectedClassroomId === c.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Tab nav */}
        <div className="flex gap-0 mb-6 border-b border-gray-200 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors relative ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
              {t.badge ? (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          {/* ── Home ── */}
          {tab === 'home' && (
            <div className="space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Classrooms', value: myClassrooms.length, color: 'text-blue-700 bg-blue-50' },
                  { label: 'Pending', value: pendingCount, color: 'text-red-700 bg-red-50' },
                  {
                    label: 'Graded',
                    value: assignments.filter((a) => a.submission?.status === 'graded').length,
                    color: 'text-emerald-700 bg-emerald-50',
                  },
                ].map((s) => (
                  <div key={s.label} className={`rounded-2xl p-5 ${s.color}`}>
                    <div className="text-3xl font-bold">{s.value}</div>
                    <div className="text-sm font-medium opacity-75 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Referral */}
              {token && <ReferralCard token={token} />}

              {/* Announcements */}
              {(dashboard.announcements ?? []).length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">Announcements</div>
                  <div className="space-y-2">
                    {(dashboard.announcements ?? []).slice(0, 5).map((a) => (
                      <div key={a.id} className="border border-gray-200 rounded-xl p-4">
                        <div className="font-medium text-gray-900 text-sm">{a.title}</div>
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{a.body}</div>
                        <div className="text-xs text-gray-400 mt-1">{fmtDate(a.created_at)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming assignments */}
              {assignments.filter((a) => !a.submission || a.submission.status === 'missing').length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">Pending Assignments</div>
                  <div className="space-y-1.5">
                    {assignments
                      .filter((a) => !a.submission || a.submission.status === 'missing')
                      .slice(0, 4)
                      .map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { setSubmitTarget(a); setTab('assignments'); }}
                          className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-400 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900 text-sm truncate">{a.title}</span>
                            {a.due_at && (
                              <span className="text-xs text-gray-400 ml-2 shrink-0">due {fmtDate(a.due_at)}</span>
                            )}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Assignments ── */}
          {tab === 'assignments' && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-4">
                Assignments ({classroomAssignments.length})
              </h3>
              {classroomAssignments.length === 0 ? (
                <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                  No assignments yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {classroomAssignments.map((a) => {
                    const sub = a.submission;
                    const overdue = a.due_at && new Date(a.due_at) < new Date() && (!sub || sub.status === 'missing');
                    return (
                      <div
                        key={a.id}
                        className={`border rounded-xl p-4 ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-900">{a.title}</span>
                              {sub ? statusBadge(sub.status) : statusBadge('missing')}
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                {a.assignment_type}
                              </span>
                            </div>
                            {a.description && (
                              <div className="text-xs text-gray-500 mt-1 line-clamp-2">{a.description}</div>
                            )}
                            <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                              {a.due_at && <span className={overdue ? 'text-red-500' : ''}>Due {fmtDate(a.due_at)}</span>}
                              {a.max_score !== null && <span>Max {a.max_score} pts</span>}
                              {sub?.score !== null && sub?.score !== undefined && (
                                <span className="text-emerald-600 font-medium">
                                  Score: {sub.score}{a.max_score ? `/${a.max_score}` : ''}
                                </span>
                              )}
                            </div>
                            {sub?.notes && (
                              <div className="mt-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5">
                                Feedback: {sub.notes}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 flex flex-col gap-1.5 items-end">
                            {a.experience_url && (
                              <a
                                href={a.experience_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-2.5 py-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50"
                              >
                                Practice
                              </a>
                            )}
                            {sub?.status !== 'graded' && (
                              <button
                                onClick={() => setSubmitTarget(a)}
                                className="text-xs px-2.5 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-black"
                              >
                                {sub?.status === 'submitted' ? 'Edit' : 'Submit'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Grades ── */}
          {tab === 'grades' && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-4">My Grades</h3>
              {classroomAssignments.filter((a) => a.submission?.status === 'graded').length === 0 ? (
                <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                  No graded assignments yet.
                </div>
              ) : (
                <>
                  {/* Composite score */}
                  {(() => {
                    const graded = classroomAssignments.filter(
                      (a) => a.submission?.status === 'graded' && a.submission.score !== null && a.max_score,
                    );
                    if (graded.length === 0) return null;
                    let total = 0;
                    let weight = 0;
                    for (const a of graded) {
                      const maxS = a.max_score!;
                      const score = a.submission!.score!;
                      total += (score / maxS) * 100;
                      weight += 1;
                    }
                    const avg = Math.round((total / weight) * 10) / 10;
                    return (
                      <div className="bg-blue-50 rounded-2xl p-4 mb-4 flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-800">Average Score</span>
                        <span className="text-2xl font-bold text-blue-900">{avg}%</span>
                      </div>
                    );
                  })()}
                  <div className="space-y-2">
                    {classroomAssignments
                      .filter((a) => a.submission)
                      .map((a) => {
                        const sub = a.submission!;
                        return (
                          <div key={a.id} className="border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900 text-sm">{a.title}</div>
                              {sub.graded_at && (
                                <div className="text-xs text-gray-400 mt-0.5">Graded {fmtDate(sub.graded_at)}</div>
                              )}
                              {sub.notes && <div className="text-xs text-gray-600 mt-0.5">{sub.notes}</div>}
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <div className="font-bold text-gray-900">
                                {sub.score !== null
                                  ? `${sub.score}${a.max_score ? `/${a.max_score}` : ''}`
                                  : '—'}
                              </div>
                              {statusBadge(sub.status)}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Attendance ── */}
          {tab === 'attendance' && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-4">Attendance</h3>
              {attendance.length === 0 ? (
                <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                  No attendance records yet.
                </div>
              ) : (
                <>
                  {/* Summary */}
                  {(() => {
                    const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
                    const rate = Math.round((present / attendance.length) * 100);
                    return (
                      <div className="bg-emerald-50 rounded-2xl p-4 mb-4 flex items-center justify-between">
                        <span className="text-sm font-medium text-emerald-800">Attendance Rate</span>
                        <span className="text-2xl font-bold text-emerald-900">{rate}%</span>
                      </div>
                    );
                  })()}
                  <div className="space-y-1.5">
                    {attendance.map((a) => (
                      <div key={a.session_date} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-2.5">
                        <span className="text-sm text-gray-700 font-mono">{a.session_date}</span>
                        <div className="flex items-center gap-2">
                          {a.notes && <span className="text-xs text-gray-400">{a.notes}</span>}
                          {statusBadge(a.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Billing ── */}
          {tab === 'billing' && token && <BillingTab token={token} classroomNames={classroomNames} />}

          {/* ── Chat ── */}
          {tab === 'chat' && token && academyId && selectedClassroom && (
            <ChatTab
              token={token}
              academyId={academyId}
              classroomId={selectedClassroom.id}
              classroomName={selectedClassroom.name}
            />
          )}
          {tab === 'chat' && !selectedClassroom && (
            <div className="text-center text-gray-400 py-12">No classroom selected.</div>
          )}
        </div>
      </div>

      {/* Submit Modal */}
      {submitTarget && token && (
        <SubmitModal
          assignment={submitTarget}
          token={token}
          onClose={() => setSubmitTarget(null)}
          onSuccess={() => {
            if (token) void loadAssignments(token);
          }}
        />
      )}
    </div>
  );
};
