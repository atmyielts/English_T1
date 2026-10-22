import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  GraduationCap,
  Headphones,
  Home,
  MessageCircle,
  Send,
  Settings,
  User2,
} from 'lucide-react';
import { edgeBase } from '../lib/supabase';
import { TelegramHomeworkPanel } from '../components/telegram/TelegramHomeworkPanel';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        openLink?: (url: string) => void;
        openTelegramLink?: (url: string) => void;
        themeParams?: Record<string, string>;
      };
    };
  }
}

type Tab = 'today' | 'academy' | 'practice' | 'payments' | 'support' | 'profile';
type Json = Record<string, unknown>;

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  assignment_type: string;
  experience_url: string | null;
  due_at: string | null;
  max_score: number | null;
  classroom_id: string;
  submission: {
    id: string;
    status: string;
    score: number | null;
    max_score: number | null;
    notes: string | null;
    submission_content: string | null;
    submission_url: string | null;
    submitted_at: string | null;
    graded_at: string | null;
  } | null;
};

type Dashboard = {
  academies: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; first_name: string; last_name: string; email: string | null }>;
  classrooms: Array<{ id: string; name: string; description: string | null }>;
  memberships: Array<{ classroom_id: string; contact_id: string }>;
  announcements: Array<{ id: string; title: string; body: string; created_at: string }>;
  schedule: Array<{ id: string; classroom_id: string; day_of_week: number; start_time: string; end_time: string | null; label: string | null }>;
  assignments: Assignment[];
  attendance: Array<{ id: string; session_date: string; status: string; notes: string | null }>;
  billing: Array<{
    classroom_id: string;
    academy_name: string;
    paid: boolean;
    payment_handoff_url: string;
    offer: { id: string; name: string; price_amount: number; currency: string; description: string | null };
    last_payment: { status: string; created_at: string } | null;
  }>;
  outcomes: Array<{ id: string; overall_band: number | null; overall_score: number | null; computed_at: string; products?: { name?: string | null } | null }>;
  certificates: Array<{ id: string; public_token: string; exam_type: string; overall_band: number | null; overall_score: number | null; exam_date: string }>;
  vocab: { total: number; due: number; learned: number };
};

type Preferences = {
  notifications_enabled: boolean;
  telegram_enabled: boolean;
  email_enabled: boolean;
  academic_required_enabled: boolean;
  study_habit_enabled: boolean;
  commercial_enabled: boolean;
  assignment_reminders: boolean;
  class_reminders: boolean;
  score_notifications: boolean;
  grade_notifications: boolean;
  payment_notifications: boolean;
  vocabulary_reminders: boolean;
  certificate_notifications: boolean;
  digest_frequency: 'off' | 'daily' | 'weekly';
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
};

type BootstrapResponse = {
  linked: boolean;
  site_url?: string;
  message?: string;
  link_account_url?: string;
  user?: { id: string; email: string | null; full_name: string | null };
  telegram?: { first_name: string | null; username: string | null; telegram_user_id: string };
  preferences?: Preferences;
  dashboard?: Dashboard;
  error?: string;
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const fmtScore = (value: number | null | undefined) => (value === null || typeof value === 'undefined' ? '-' : String(value));
const money = (amount: number, currency: string) => `${new Intl.NumberFormat().format(amount)} ${currency}`;

const getInitData = () => {
  const qs = new URLSearchParams(window.location.search);
  return qs.get('initData') || window.Telegram?.WebApp?.initData || '';
};

const openExternal = (url: string) => {
  if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
  else window.location.href = url;
};

const openTelegram = (url: string) => {
  if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(url);
  else window.location.href = url;
};

const waitForTelegramWebApp = async () => {
  if (window.Telegram?.WebApp) return window.Telegram.WebApp;

  const scriptId = 'telegram-web-app-sdk';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    document.head.appendChild(script);
  }

  await new Promise<void>((resolve) => {
    const started = Date.now();
    const finish = () => resolve();
    const poll = () => {
      if (window.Telegram?.WebApp || Date.now() - started > 2500) finish();
      else window.setTimeout(poll, 50);
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', finish, { once: true });
    poll();
  });

  return window.Telegram?.WebApp ?? null;
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827] ${className}`}>{children}</section>
);

const Metric: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'bg-gray-50' }) => (
  <div className={`rounded-xl border border-gray-200 px-3 py-3 ${tone}`}>
    <div className="text-xl font-black text-gray-950">{value}</div>
    <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
  </div>
);

const Empty: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
    <div className="font-bold text-gray-900">{title}</div>
    <div className="mt-1 text-sm text-gray-500">{body}</div>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const normalized = status.toLowerCase();
  const cls =
    normalized === 'graded' || normalized === 'paid' || normalized === 'present'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : normalized === 'submitted' || normalized === 'late'
        ? 'bg-blue-50 text-blue-700 border-blue-200'
        : normalized === 'missing' || normalized === 'absent'
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-gray-50 text-gray-600 border-gray-200';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
};

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left"
  >
    <span className="text-sm font-semibold text-gray-800">{label}</span>
    <span className={`h-6 w-11 rounded-full p-0.5 transition ${checked ? 'bg-gray-950' : 'bg-gray-300'}`}>
      <span className={`block h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

export const TelegramAppPage: React.FC = () => {
  const launchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const acquisitionSessionId = launchParams.get('session') || launchParams.get('acquisition_session_id');
  const launchContext = useMemo(() => ({
    view: launchParams.get('view'),
    assignment_id: launchParams.get('assignment'),
    result_id: launchParams.get('result'),
    section: launchParams.get('section'),
  }), [launchParams]);
  const [tab, setTab] = useState<Tab>('today');
  const [initData, setInitData] = useState('');
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<Assignment | null>(null);
  const [answer, setAnswer] = useState('');
  const [answerUrl, setAnswerUrl] = useState('');
  const [supportText, setSupportText] = useState('');
  const [supportSent, setSupportSent] = useState(false);
  const [vocabReveal, setVocabReveal] = useState(false);
  const [vocabCard, setVocabCard] = useState<Json | null>(null);

  const callTelegramApp = useCallback(
    async (action: string, body: Json = {}) => {
      const activeInitData = initData || getInitData();
      const res = await fetch(`${edgeBase}/telegram-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: activeInitData, action, acquisition_session_id: acquisitionSessionId, launch_context: launchContext, ...body }),
      });
      const payload = (await res.json().catch(() => ({}))) as Json;
      if (!res.ok) throw new Error(String(payload.error ?? `Telegram app request failed (${res.status})`));
      return payload;
    },
    [acquisitionSessionId, initData, launchContext],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const telegramApp = await waitForTelegramWebApp();
      telegramApp?.ready?.();
      telegramApp?.expand?.();
      const activeInitData = getInitData();
      setInitData(activeInitData);
      if (!activeInitData) {
        setData({
          linked: false,
          message: 'Open this page from the Schood Telegram bot. Telegram must provide a verified app session before Schood can load your student dashboard.',
          link_account_url: `${window.location.origin}/account`,
          site_url: window.location.origin,
        });
        return;
      }
      const payload = (await fetch(`${edgeBase}/telegram-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: activeInitData, action: 'bootstrap', acquisition_session_id: acquisitionSessionId, launch_context: launchContext }),
      }).then((r) => r.json())) as BootstrapResponse;
      setData(payload);
      if (payload.linked) {
        const next = (await fetch(`${edgeBase}/telegram-app`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: activeInitData, action: 'vocab_next' }),
        }).then((r) => r.json())) as { card?: Json | null };
        setVocabCard(next.card ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Telegram app failed to load');
    } finally {
      setLoading(false);
    }
  }, [acquisitionSessionId, launchContext]);

  useEffect(() => {
    const view = launchParams.get('view');
    if (view === 'academy') setTab('academy');
    else if (view === 'practice') setTab('practice');
    else if (view === 'payments') setTab('payments');
  }, [launchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const dashboard = data?.dashboard;
  const siteUrl = data?.site_url ?? window.location.origin;
  const pendingAssignments = useMemo(
    () => (dashboard?.assignments ?? []).filter((a) => !a.submission || a.submission.status === 'missing'),
    [dashboard],
  );
  const gradedAssignments = useMemo(
    () => (dashboard?.assignments ?? []).filter((a) => a.submission?.status === 'graded'),
    [dashboard],
  );
  const nextClass = useMemo(() => (dashboard?.schedule ?? [])[0] ?? null, [dashboard]);
  const latestOutcome = dashboard?.outcomes?.[0] ?? null;
  const attendanceRate = useMemo(() => {
    const rows = dashboard?.attendance ?? [];
    if (!rows.length) return null;
    const present = rows.filter((r) => r.status === 'present' || r.status === 'late').length;
    return Math.round((present / rows.length) * 100);
  }, [dashboard]);

  const submitAssignment = async () => {
    if (!submitTarget) return;
    const payload = await callTelegramApp('submit_assignment', {
      assignment_id: submitTarget.id,
      content: answer,
      url: answerUrl,
    });
    if (payload.error) throw new Error(String(payload.error));
    setSubmitTarget(null);
    setAnswer('');
    setAnswerUrl('');
    await load();
  };

  const reviewVocab = async (quality: number) => {
    if (!vocabCard?.id) return;
    const payload = await callTelegramApp('vocab_review', { card_id: vocabCard.id, quality });
    setVocabReveal(false);
    setVocabCard((payload.next as Json | null) ?? null);
    await load();
  };

  const sendSupport = async () => {
    if (!supportText.trim()) return;
    await callTelegramApp('support_create', { message: supportText.trim() });
    setSupportText('');
    setSupportSent(true);
    window.setTimeout(() => setSupportSent(false), 3500);
  };

  const updatePreference = async (key: keyof Preferences, value: boolean | string) => {
    if (!data?.preferences) return;
    const preferences = {
      ...data.preferences,
      [key]: value,
      ...(key === 'notifications_enabled' ? { telegram_enabled: Boolean(value) } : {}),
    };
    setData({ ...data, preferences });
    await callTelegramApp('notification_preferences', { preferences });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f1e8] px-4 py-10 text-gray-900">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-900 bg-white p-5 shadow-[0_2px_0_#111827]">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Telegram</div>
          <div className="mt-2 text-lg font-black">Opening Schood...</div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full w-2/3 rounded-full bg-gray-950" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.linked) {
    const hasTelegramSession = Boolean(initData || getInitData());
    return (
      <div className="min-h-screen bg-[#f6f1e8] px-4 py-8 text-gray-900">
        <div className="mx-auto max-w-md space-y-4">
          <Card>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
              <GraduationCap size={16} /> Schood in Telegram
            </div>
            <h1 className="mt-3 text-2xl font-black">{hasTelegramSession ? 'Connect this Telegram' : 'Open from Telegram'}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {error ?? data?.message ?? 'Open your Schood account profile and link Telegram, then reopen this app.'}
            </p>
            {hasTelegramSession ? (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
                Sign in to Schood once, press <b>Link Telegram</b>, then return here. This app will refresh into your Telegram student dashboard after the link is complete.
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                Telegram did not provide app auth data. Use the bot button or the Telegram app menu, not a normal browser tab.
              </div>
            )}
            <button
              type="button"
              onClick={() => openExternal(data?.link_account_url ?? `${siteUrl}/account?returnTo=${encodeURIComponent('/telegram')}`)}
              className="mt-5 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white"
            >
              Link Telegram in Schood
            </button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl border border-gray-900 bg-white px-4 py-3 text-sm font-bold"
              >
                I linked it, retry
              </button>
              <button
                type="button"
                onClick={() => openTelegram('https://t.me/schoodstudentbot?startapp')}
                className="rounded-xl border border-gray-900 bg-white px-4 py-3 text-sm font-bold"
              >
                Back to bot
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'today', label: 'Today', icon: <Home size={18} />, badge: pendingAssignments.length || undefined },
    { id: 'academy', label: 'Academy', icon: <GraduationCap size={18} /> },
    { id: 'practice', label: 'Practice', icon: <BookOpen size={18} />, badge: dashboard?.vocab.due || undefined },
    { id: 'payments', label: 'Pay', icon: <CreditCard size={18} /> },
    { id: 'support', label: 'Support', icon: <MessageCircle size={18} /> },
    { id: 'profile', label: 'Profile', icon: <User2 size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] pb-24 text-gray-900">
      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-gray-500">Schood Telegram</div>
            <h1 className="mt-1 text-2xl font-black leading-tight">Hi, {data.telegram?.first_name ?? data.user?.full_name ?? 'student'}</h1>
          </div>
          <button
            type="button"
            onClick={() => openExternal(siteUrl)}
            className="rounded-xl border border-gray-900 bg-white p-2 shadow-[0_2px_0_#111827]"
            aria-label="Open Schood"
          >
            <ExternalLink size={18} />
          </button>
        </header>

        {tab === 'today' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Pending" value={pendingAssignments.length} tone="bg-amber-50" />
              <Metric label="Vocab due" value={dashboard?.vocab.due ?? 0} tone="bg-blue-50" />
              <Metric label="Attendance" value={attendanceRate === null ? '-' : `${attendanceRate}%`} tone="bg-emerald-50" />
            </div>

            <Card>
              <div className="flex items-center gap-2 text-sm font-black"><CalendarDays size={17} /> Next class</div>
              {nextClass ? (
                <div className="mt-3 rounded-xl bg-gray-50 p-3">
                  <div className="font-bold">{dayLabels[nextClass.day_of_week] ?? 'Class'} at {nextClass.start_time}</div>
                  <div className="mt-1 text-sm text-gray-500">{nextClass.label ?? 'Scheduled session'}</div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No class schedule is set yet.</p>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-black"><CheckCircle2 size={17} /> Due work</div>
                <button type="button" onClick={() => setTab('academy')} className="text-xs font-bold text-gray-500">View all</button>
              </div>
              <div className="mt-3 space-y-2">
                {pendingAssignments.slice(0, 3).map((assignment) => (
                  <button
                    key={assignment.id}
                    type="button"
                    onClick={() => {
                      setSubmitTarget(assignment);
                      setAnswer(assignment.submission?.submission_content ?? '');
                      setAnswerUrl(assignment.submission?.submission_url ?? '');
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left"
                  >
                    <div className="font-bold">{assignment.title}</div>
                    <div className="mt-1 text-xs text-gray-500">Due {fmtDate(assignment.due_at)}</div>
                  </button>
                ))}
                {pendingAssignments.length === 0 ? <Empty title="No pending work" body="You are clear for now." /> : null}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2 text-sm font-black"><Award size={17} /> Latest result</div>
              {latestOutcome ? (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 p-3">
                  <div>
                    <div className="font-bold">{latestOutcome.products?.name ?? 'Exam'}</div>
                    <div className="text-xs text-gray-500">{fmtDate(latestOutcome.computed_at)}</div>
                  </div>
                  <div className="text-2xl font-black">{fmtScore(latestOutcome.overall_band ?? latestOutcome.overall_score)}</div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No completed scores yet.</p>
              )}
            </Card>
          </div>
        )}

        {tab === 'academy' && (
          <div className="space-y-4">
            <TelegramHomeworkPanel initData={initData} onSubmitted={() => void load()} />
            <Card>
              <div className="text-sm font-black">Classrooms</div>
              <div className="mt-3 space-y-2">
                {(dashboard?.classrooms ?? []).length > 0 ? dashboard?.classrooms.map((classroom) => (
                  <div key={classroom.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="font-bold">{classroom.name}</div>
                    {classroom.description ? <div className="mt-1 text-xs text-gray-500">{classroom.description}</div> : null}
                  </div>
                )) : <Empty title="No classrooms" body="Ask your teacher to add your Schood account." />}
              </div>
            </Card>

            <Card>
              <div className="text-sm font-black">Assignments</div>
              <div className="mt-3 space-y-2">
                {(dashboard?.assignments ?? []).map((assignment) => (
                  <div key={assignment.id} className="rounded-xl border border-gray-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold">{assignment.title}</div>
                        <div className="mt-1 text-xs text-gray-500">Due {fmtDate(assignment.due_at)} · {assignment.assignment_type}</div>
                      </div>
                      <StatusBadge status={assignment.submission?.status ?? 'missing'} />
                    </div>
                    {assignment.submission?.notes ? <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">{assignment.submission.notes}</div> : null}
                    <div className="mt-3 flex gap-2">
                      {assignment.experience_url ? (
                        <button type="button" onClick={() => openExternal(assignment.experience_url!)} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700">
                          Practice
                        </button>
                      ) : null}
                      {assignment.submission?.status !== 'graded' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitTarget(assignment);
                            setAnswer(assignment.submission?.submission_content ?? '');
                            setAnswerUrl(assignment.submission?.submission_url ?? '');
                          }}
                          className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-bold text-white"
                        >
                          {assignment.submission ? 'Edit answer' : 'Submit'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {(dashboard?.assignments ?? []).length === 0 ? <Empty title="No assignments" body="Assignments from your teacher will appear here." /> : null}
              </div>
            </Card>

            <Card>
              <div className="text-sm font-black">Grades and attendance</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric label="Graded" value={gradedAssignments.length} />
                <Metric label="Attendance" value={attendanceRate === null ? '-' : `${attendanceRate}%`} />
              </div>
              <div className="mt-3 space-y-2">
                {(dashboard?.attendance ?? []).slice(0, 5).map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                    <span className="text-sm font-semibold">{fmtDate(row.session_date)}</span>
                    <StatusBadge status={row.status} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'practice' && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-black">Vocabulary drill</div>
                  <div className="mt-1 text-xs text-gray-500">{dashboard?.vocab.learned ?? 0} learned · {dashboard?.vocab.due ?? 0} due</div>
                </div>
                <Headphones size={20} />
              </div>
              {vocabCard ? (
                <div className="mt-4 rounded-xl bg-gray-50 p-4">
                  <div className="text-2xl font-black">{String(vocabCard.word ?? '')}</div>
                  {vocabReveal ? (
                    <>
                      <div className="mt-3 text-sm font-semibold text-gray-700">{String(vocabCard.definition ?? '')}</div>
                      {vocabCard.example ? <div className="mt-2 text-xs italic text-gray-500">"{String(vocabCard.example)}"</div> : null}
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {[['Again', 1], ['Hard', 3], ['Good', 4], ['Easy', 5]].map(([label, quality]) => (
                          <button key={label} type="button" onClick={() => void reviewVocab(Number(quality))} className="rounded-xl border border-gray-900 bg-white px-3 py-2 text-sm font-bold">
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <button type="button" onClick={() => setVocabReveal(true)} className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white">
                      Show answer
                    </button>
                  )}
                </div>
              ) : (
                <Empty title="No vocab due" body="Come back tomorrow or open the full drill page." />
              )}
            </Card>

            <Card>
              <div className="text-sm font-black">Open Schood practice</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ['IELTS', 'https://practice.ielts.schood.online'],
                  ['SAT', 'https://practice.sat.schood.online'],
                  ['English', 'https://english.schood.online'],
                  ['Writing', `${siteUrl}/writing-tutor`],
                ].map(([label, href]) => (
                  <button key={label} type="button" onClick={() => openExternal(href)} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold">
                    {label}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'payments' && (
          <div className="space-y-4">
            {(dashboard?.billing ?? []).map((item) => (
              <Card key={`${item.classroom_id}-${item.offer.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{item.academy_name}</div>
                    <div className="mt-1 font-black">{item.offer.name}</div>
                    <div className="mt-1 text-sm text-gray-500">{money(item.offer.price_amount, item.offer.currency)}</div>
                  </div>
                  <StatusBadge status={item.paid ? 'paid' : item.last_payment?.status ?? 'due'} />
                </div>
                {!item.paid ? (
                  <button type="button" onClick={() => openExternal(item.payment_handoff_url)} className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white">
                    Continue payment
                  </button>
                ) : null}
              </Card>
            ))}
            {(dashboard?.billing ?? []).length === 0 ? <Empty title="No tuition due" body="Payment items from your academy will appear here." /> : null}
          </div>
        )}

        {tab === 'support' && (
          <Card>
            <div className="flex items-center gap-2 text-sm font-black"><MessageCircle size={17} /> Support</div>
            <textarea
              value={supportText}
              onChange={(e) => setSupportText(e.target.value)}
              rows={6}
              className="mt-4 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-gray-900"
              placeholder="Tell us what happened..."
            />
            {supportSent ? <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Support request sent.</div> : null}
            <button type="button" onClick={() => void sendSupport()} disabled={!supportText.trim()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300">
              <Send size={16} /> Send request
            </button>
          </Card>
        )}

        {tab === 'profile' && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-2 text-sm font-black"><User2 size={17} /> Profile</div>
              <div className="mt-4 rounded-xl bg-gray-50 p-3">
                <div className="font-bold">{data.user?.full_name ?? data.telegram?.first_name ?? 'Schood student'}</div>
                <div className="mt-1 text-sm text-gray-500">{data.user?.email ?? 'Telegram linked'}</div>
              </div>
              <button type="button" onClick={() => openExternal(`${siteUrl}/account`)} className="mt-3 w-full rounded-xl border border-gray-900 bg-white px-4 py-3 text-sm font-bold">
                Manage account
              </button>
            </Card>

            {data.preferences ? (
              <Card>
                <div className="flex items-center gap-2 text-sm font-black"><Settings size={17} /> Notifications</div>
                <div className="mt-3 space-y-2">
                  <Toggle label="All Telegram notifications" checked={data.preferences.notifications_enabled && data.preferences.telegram_enabled} onChange={(v) => void updatePreference('notifications_enabled', v)} />
                  <Toggle label="Required academic updates" checked={data.preferences.academic_required_enabled} onChange={(v) => void updatePreference('academic_required_enabled', v)} />
                  <Toggle label="Study habit reminders" checked={data.preferences.study_habit_enabled} onChange={(v) => void updatePreference('study_habit_enabled', v)} />
                  <Toggle label="Offers and promotions" checked={data.preferences.commercial_enabled} onChange={(v) => void updatePreference('commercial_enabled', v)} />
                  <Toggle label="Assignment reminders" checked={data.preferences.assignment_reminders} onChange={(v) => void updatePreference('assignment_reminders', v)} />
                  <Toggle label="Class reminders" checked={data.preferences.class_reminders} onChange={(v) => void updatePreference('class_reminders', v)} />
                  <Toggle label="Score notifications" checked={data.preferences.score_notifications} onChange={(v) => void updatePreference('score_notifications', v)} />
                  <Toggle label="Payment notifications" checked={data.preferences.payment_notifications} onChange={(v) => void updatePreference('payment_notifications', v)} />
                  <Toggle label="Vocabulary reminders" checked={data.preferences.vocabulary_reminders} onChange={(v) => void updatePreference('vocabulary_reminders', v)} />
                </div>
              </Card>
            ) : null}
          </div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pb-3 pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative flex h-14 flex-col items-center justify-center rounded-xl text-[10px] font-bold ${tab === item.id ? 'bg-gray-950 text-white' : 'text-gray-500'}`}
            >
              {item.icon}
              <span className="mt-0.5">{item.label}</span>
              {item.badge ? <span className="absolute right-1.5 top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] leading-none text-white">{item.badge}</span> : null}
            </button>
          ))}
        </div>
      </nav>

      {submitTarget ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 pb-3">
          <div className="mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Submit assignment</div>
                <h2 className="mt-1 text-lg font-black">{submitTarget.title}</h2>
              </div>
              <button type="button" onClick={() => setSubmitTarget(null)} className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-bold">Close</button>
            </div>
            {submitTarget.description ? <p className="mt-3 text-sm text-gray-600">{submitTarget.description}</p> : null}
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={7}
              className="mt-4 w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:border-gray-900"
              placeholder="Write your answer here..."
            />
            <input
              value={answerUrl}
              onChange={(e) => setAnswerUrl(e.target.value)}
              className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:border-gray-900"
              placeholder="File or recording URL (optional)"
            />
            <button type="button" onClick={() => void submitAssignment()} disabled={!answer.trim() && !answerUrl.trim()} className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300">
              Submit answer
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
