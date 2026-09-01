import {
  BellRing,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Home,
  Inbox,
  Link2,
  LoaderCircle,
  Megaphone,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useI18n, translate } from '../../i18n';
import { platformUrl, supabase } from '../../lib/supabase';
import './academy-telegram.css';

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
        disableVerticalSwipes?: () => void;
      };
    };
  }
}

type Tab = 'today' | 'compose' | 'groups' | 'inbox' | 'more';
type Json = Record<string, unknown>;
type Access = {
  role: string;
  source: string;
  scope: string;
  classroom_ids: string[];
  branch_ids: string[];
  permissions: Record<string, boolean>;
};
type Academy = { id: string; name: string; access: Access };
type Group = {
  id: string;
  branch_id: string | null;
  classroom_id: string | null;
  purpose: string;
  title: string;
  locale: string;
  status: string;
  last_verified_at: string | null;
  last_error: string | null;
};
type TeacherDaySession = {
  id: string;
  classroom_id: string;
  classroom_name: string;
  room_name: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  delivery_mode: string;
  roster: Array<{ contact_id: string; name: string; status: string | null; notes: string | null }>;
  attendance_saved: boolean;
  curriculum: {
    lesson_id: string | null;
    course_title: string | null;
    module_title: string | null;
    lesson_title: string;
    objectives: Array<{ id: string; label: string; covered: boolean }>;
  };
  homework: { title: string; description: string; due_at: string };
  run: { id: string; status: string; coverage?: Array<{ id: string; label: string; covered: boolean }> } | null;
  connected_group_count: number;
};
type Dashboard = {
  settings: { enabled: boolean; default_locale: string; timezone: string; digest_time: string; emergency_override_enabled: boolean };
  metrics: { sessions_today: number; open_requests: number; urgent_requests: number; due_homework: number; connected_groups: number; failed_deliveries: number };
  branches: Array<{ id: string; name: string; is_active: boolean }>;
  classrooms: Array<{ id: string; name: string; branch_id: string | null; is_active: boolean }>;
  groups: Group[];
  subscriptions: Array<{ chat_binding_id: string; event_type: string; delivery_mode: string; enabled: boolean }>;
  sessions: Array<{ id: string; branch_id: string; classroom_id: string; title: string; starts_at: string; ends_at: string; status: string; delivery_mode: string }>;
  requests: Array<{ id: string; branch_id: string | null; classroom_id: string | null; request_type: string; subject: string; priority: string; status: string; assigned_to: string | null; created_at: string; sla_due_at: string | null }>;
  assignments: Array<{ id: string; classroom_id: string; title: string; due_at: string; status: string }>;
  contacts: Array<{ id: string; first_name: string; last_name: string; status: string; primary_branch_id: string | null; telegram_linked: boolean }>;
  deliveries: Array<{ id: string; type: string; title: string | null; status: string; error: string | null; scheduled_at: string; sent_at: string | null; chat_binding_id: string | null; created_at: string }>;
  teacher_day?: { date: string; sessions: TeacherDaySession[]; counts: Record<string, number> } | null;
};
type Bootstrap = {
  linked: boolean;
  user: { id: string; full_name: string | null; email: string | null };
  academies: Academy[];
  selected_academy_id: string;
  dashboard: Dashboard;
  error?: string;
};
type ComposeState = {
  messageType: string;
  groupId: string;
  contactId: string;
  classroomId: string;
  title: string;
  body: string;
  dueAt: string;
  scheduledAt: string;
};
type GroupLinkState = { purpose: string; branchId: string; classroomId: string; locale: string };
type AttendanceState = { sessionId: string; classroomId: string; roster: Array<{ id: string; first_name: string; last_name: string }>; statuses: Record<string, string> };
type LessonState = {
  sessionId: string;
  coverage: Array<{ id: string; label: string; covered: boolean }>;
  homeworkTitle: string;
  homeworkDescription: string;
  homeworkDueAt: string;
};

const tabs: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'compose', label: 'Compose', icon: Megaphone },
  { id: 'groups', label: 'Groups', icon: UsersRound },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'more', label: 'More', icon: Settings },
];
const messageTypes = [
  ['announcement', 'Announcement'],
  ['personal_warning', 'Personal warning'],
  ['homework_published', 'Homework'],
  ['class_reminder', 'Class reminder'],
  ['schedule_change', 'Schedule change'],
  ['class_cancelled', 'Class cancelled'],
  ['emergency_closure', 'Emergency closure'],
];
const purposeLabels: Record<string, string> = {
  academy_staff: 'Academy staff',
  branch_staff: 'Branch staff',
  classroom_community: 'Classroom community',
  classroom_guardians: 'Classroom guardians',
};
const statusTone = (status: string) => ['sent', 'active', 'completed', 'present'].includes(status)
  ? 'is-success'
  : ['failed', 'degraded', 'urgent', 'absent'].includes(status)
    ? 'is-danger'
    : ['queued', 'processing', 'high', 'late'].includes(status)
      ? 'is-warning'
      : '';
const fmt = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const waitForTelegram = async () => {
  if (window.Telegram?.WebApp) return window.Telegram.WebApp;
  let script = document.getElementById('telegram-web-app-sdk') as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = 'telegram-web-app-sdk';
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    document.head.appendChild(script);
  }
  await new Promise<void>((resolve) => {
    const started = Date.now();
    const poll = () => window.Telegram?.WebApp || Date.now() - started > 2500 ? resolve() : window.setTimeout(poll, 50);
    script?.addEventListener('load', () => resolve(), { once: true });
    script?.addEventListener('error', () => resolve(), { once: true });
    poll();
  });
  return window.Telegram?.WebApp ?? null;
};
const getInitData = () => new URLSearchParams(window.location.search).get('initData') || window.Telegram?.WebApp?.initData || '';
const openUrl = (url: string, telegram = false) => {
  if (telegram && window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(url);
  else if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
  else window.location.href = url;
};

const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={`academy-tg-card ${className}`}>{children}</section>
);
const Empty = ({ title, body, action }: { title: string; body: string; action?: ReactNode }) => (
  <div className="academy-tg-empty">
    <MessageSquareText size={24} aria-hidden="true" />
    <strong>{translate(title)}</strong>
    <p>{translate(body)}</p>
    {action}
  </div>
);
const BusyButton = ({ busy, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) => (
  <button {...props} disabled={busy || props.disabled}>
    {busy ? <LoaderCircle className="academy-tg-spin" size={17} aria-hidden="true" /> : null}
    {children}
  </button>
);

const readInvokeError = async (response: unknown, invokeError: unknown): Promise<string> => {
  if (response && typeof response === 'object' && 'error' in response) {
    return String((response as Json).error);
  }
  if (invokeError && typeof invokeError === 'object' && 'context' in invokeError) {
    const context = (invokeError as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as Json;
        if (payload.error) return String(payload.error);
      } catch {
        // Fall back to the SDK message when the response is not JSON.
      }
    }
  }
  return invokeError instanceof Error ? invokeError.message : '';
};

export const AcademyTelegramApp = () => {
  const { locale, setLocale } = useI18n();
  const [tab, setTab] = useState<Tab>('today');
  const [initData, setInitData] = useState('');
  const [data, setData] = useState<Bootstrap | null>(null);
  const [academyId, setAcademyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [compose, setCompose] = useState<ComposeState>({ messageType: 'announcement', groupId: '', contactId: '', classroomId: '', title: '', body: '', dueAt: '', scheduledAt: '' });
  const [groupLink, setGroupLink] = useState<GroupLinkState>({ purpose: 'classroom_community', branchId: '', classroomId: '', locale: 'uz' });
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);
  const [lesson, setLesson] = useState<LessonState | null>(null);

  const invoke = useCallback(async <T,>(action: string, payload: Json = {}): Promise<T> => {
    const activeInitData = initData || getInitData();
    const { data: response, error: invokeError } = await supabase.functions.invoke('academy-telegram', {
      body: { action, initData: activeInitData, ...payload },
    });
    if (invokeError) {
      const detail = await readInvokeError(response, invokeError);
      throw new Error(detail || translate('Academy Telegram request failed'));
    }
    if (response?.error) throw new Error(String(response.error));
    return response as T;
  }, [initData]);

  const load = useCallback(async (nextAcademyId?: string) => {
    setLoading(true); setError('');
    try {
      const response = await invoke<Bootstrap>('bootstrap', nextAcademyId ? { academy_id: nextAcademyId } : {});
      setData(response);
      setAcademyId(response.selected_academy_id);
      const firstGroup = response.dashboard.groups.find((group) => group.status === 'active');
      const firstLinkedLearner = response.dashboard.contacts.find((contact) => contact.telegram_linked);
      const selectedAcademy = response.academies.find((item) => item.id === response.selected_academy_id);
      setCompose((current) => ({
        ...current,
        groupId: current.groupId || firstGroup?.id || '',
        contactId: current.contactId || firstLinkedLearner?.id || '',
        messageType: !firstGroup && firstLinkedLearner && selectedAcademy?.access.permissions.manageMessages === true && current.messageType === 'announcement'
          ? 'personal_warning'
          : current.messageType,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : translate('Academy Telegram could not load'));
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    let active = true;
    void waitForTelegram().then((telegram) => {
      if (!active) return;
      telegram?.ready?.(); telegram?.expand?.(); telegram?.disableVerticalSwipes?.();
      const value = getInitData(); setInitData(value);
      if (!value) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (initData) void load(); }, [initData, load]);

  const academy = useMemo(() => data?.academies.find((item) => item.id === academyId) ?? data?.academies[0] ?? null, [academyId, data]);
  const dashboard = data?.dashboard;
  const permissions = academy?.access.permissions ?? {};
  const canManage = permissions.manageAutomation === true;
  const canCompose = permissions.manageAnnouncements === true;
  const canPrivate = permissions.manageMessages === true;
  const canHomework = permissions.manageAssignments === true;
  const canAttendance = permissions.markAttendance === true;
  const canRequests = permissions.resolveActionItems === true;
  const activeGroups = dashboard?.groups.filter((group) => group.status === 'active') ?? [];
  const isPrivate = compose.messageType === 'personal_warning';

  const action = async (key: string, task: () => Promise<void>) => {
    setBusy(key); setError(''); setNotice('');
    try { await task(); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : translate('The action could not be completed')); }
    finally { setBusy(''); }
  };

  const publish = () => action('publish', async () => {
    if (!compose.title.trim() || !compose.body.trim()) throw new Error(translate('Complete the title and message'));
    if (isPrivate) {
      if (!compose.contactId) throw new Error(translate('Choose a learner'));
      await invoke('send_private_warning', { academy_id: academyId, contact_id: compose.contactId, title: compose.title, body: compose.body, idempotency_key: uuid() });
    } else if (compose.messageType === 'homework_published') {
      if (!compose.groupId) throw new Error(translate('Choose a group and complete the message'));
      if (!compose.classroomId || !compose.dueAt) throw new Error(translate('Choose a classroom and due date'));
      await invoke('create_homework', { academy_id: academyId, classroom_id: compose.classroomId, chat_binding_id: compose.groupId, title: compose.title, description: compose.body, due_at: new Date(compose.dueAt).toISOString(), scheduled_at: compose.scheduledAt ? new Date(compose.scheduledAt).toISOString() : undefined, idempotency_key: uuid() });
    } else {
      if (!compose.groupId) throw new Error(translate('Choose a group and complete the message'));
      await invoke('publish_message', { academy_id: academyId, chat_binding_id: compose.groupId, message_type: compose.messageType, title: compose.title, body: compose.body, scheduled_at: compose.scheduledAt ? new Date(compose.scheduledAt).toISOString() : undefined, idempotency_key: uuid() });
    }
    setCompose((current) => ({ ...current, title: '', body: '', dueAt: '', scheduledAt: '' }));
    setPreviewing(false); setNotice(translate('Message queued for delivery')); await load(academyId);
  });

  const connectGroup = () => action('connect', async () => {
    const payload: Json = { academy_id: academyId, purpose: groupLink.purpose, locale: groupLink.locale };
    if (groupLink.purpose === 'branch_staff') payload.branch_id = groupLink.branchId;
    if (groupLink.purpose.startsWith('classroom_')) payload.classroom_id = groupLink.classroomId;
    const response = await invoke<{ link: { url: string } }>('issue_group_link', payload);
    openUrl(response.link.url, true);
  });

  const startAttendance = (session: Dashboard['sessions'][number]) => action(`roster:${session.id}`, async () => {
    const response = await invoke<{ roster: AttendanceState['roster'] }>('attendance_roster', { academy_id: academyId, classroom_id: session.classroom_id });
    setAttendance({ sessionId: session.id, classroomId: session.classroom_id, roster: response.roster, statuses: Object.fromEntries(response.roster.map((student) => [student.id, 'present'])) });
  });
  const saveAttendance = () => action('attendance', async () => {
    if (!attendance) return;
    await invoke('record_attendance', { academy_id: academyId, session_id: attendance.sessionId, classroom_id: attendance.classroomId, records: attendance.roster.map((student) => ({ contact_id: student.id, status: attendance.statuses[student.id] || 'present' })), idempotency_key: uuid() });
    setAttendance(null); setNotice(translate('Attendance saved')); await load(academyId);
  });

  const openLesson = (session: TeacherDaySession) => {
    const coverage = session.run?.coverage?.length ? session.run.coverage : session.curriculum.objectives;
    setLesson({
      sessionId: session.id,
      coverage: coverage.map((item) => ({ ...item })),
      homeworkTitle: session.homework.title,
      homeworkDescription: session.homework.description,
      homeworkDueAt: session.homework.due_at.slice(0, 16),
    });
    setAttendance({
      sessionId: session.id,
      classroomId: session.classroom_id,
      roster: session.roster.map((student) => {
        const [first_name, ...rest] = student.name.split(' ');
        return { id: student.contact_id, first_name, last_name: rest.join(' ') };
      }),
      statuses: Object.fromEntries(session.roster.map((student) => [student.contact_id, student.status || 'present'])),
    });
  };
  const startTeacherLesson = (session: TeacherDaySession) => action(`lesson-start:${session.id}`, async () => {
    await invoke('teacher_lesson_start', {
      academy_id: academyId,
      session_id: session.id,
      lesson_id: session.curriculum.lesson_id,
      idempotency_key: uuid(),
    });
    openLesson(session);
    setNotice(translate('Lesson started'));
    await load(academyId);
  });
  const saveTeacherAttendance = () => action('teacher-attendance', async () => {
    if (!attendance) return;
    await invoke('teacher_lesson_attendance', {
      academy_id: academyId,
      session_id: attendance.sessionId,
      records: attendance.roster.map((student) => ({
        contact_id: student.id,
        status: attendance.statuses[student.id] || 'present',
      })),
      idempotency_key: uuid(),
    });
    setNotice(translate('Attendance saved'));
    await load(academyId);
  });
  const finishTeacherLesson = () => action('lesson-finish', async () => {
    if (!lesson) return;
    await invoke('teacher_lesson_finish', {
      academy_id: academyId,
      session_id: lesson.sessionId,
      coverage: lesson.coverage,
      homework: {
        title: lesson.homeworkTitle,
        description: lesson.homeworkDescription,
        due_at: new Date(lesson.homeworkDueAt).toISOString(),
      },
      assign_homework: true,
      idempotency_key: uuid(),
    });
    setLesson(null);
    setAttendance(null);
    setNotice(translate('Lesson finished and homework assigned'));
    await load(academyId);
  });

  if (!initData && !loading) {
    return (
      <main className="academy-tg-standalone">
        <Card className="academy-tg-entry">
          <span className="academy-tg-mark"><ShieldCheck size={24} /></span>
          <div><p className="academy-tg-eyebrow">{translate('Schood Academy')}</p><h1>{translate('Open this staff app from Telegram')}</h1></div>
          <p>{translate('Use the Academy bot so Telegram can verify your staff identity and workspace permissions.')}</p>
          <a className="academy-tg-primary" href="https://t.me/schoodacademybot">{translate('Open Academy bot')} <ExternalLink size={17} /></a>
          <a className="academy-tg-secondary" href="/academies">{translate('Back to Academy')}</a>
        </Card>
      </main>
    );
  }

  if (loading) return <main className="academy-tg-loading" aria-busy="true"><LoaderCircle className="academy-tg-spin" size={28} /><strong>{translate('Opening Academy operations')}</strong></main>;

  if (!data || error && !dashboard) {
    const normalizedError = error.toLowerCase();
    const shouldReopenTelegram = normalizedError.includes('telegram session expired') || normalizedError.includes('missing telegram');
    const shouldLinkAccount = normalizedError.includes('link this telegram account') || normalizedError.includes('no active academy staff workspace');
    return (
      <main className="academy-tg-standalone">
        <Card className="academy-tg-entry">
          <h1>{translate('Academy operations could not open')}</h1>
          <p>{error}</p>
          {shouldReopenTelegram ? (
            <a className="academy-tg-primary" href="https://t.me/schoodacademybot">{translate('Open Academy bot')} <ExternalLink size={17} /></a>
          ) : shouldLinkAccount ? (
            <a className="academy-tg-primary" href="/academies">{translate('Back to Academy')} <ChevronRight size={17} /></a>
          ) : (
            <BusyButton className="academy-tg-primary" onClick={() => void load()}><RefreshCw size={17} />{translate('Try again')}</BusyButton>
          )}
        </Card>
      </main>
    );
  }

  return (
    <main className="academy-tg-shell">
      <header className="academy-tg-header">
        <div className="academy-tg-brand"><span className="academy-tg-mark"><ShieldCheck size={20} /></span><div><strong>{translate('Schood Academy')}</strong><small>{translate('Staff operations')}</small></div></div>
        <button className="academy-tg-icon-btn" type="button" onClick={() => void load(academyId)} aria-label={translate('Refresh')}><RefreshCw size={18} /></button>
      </header>

      <div className="academy-tg-context">
        <label><span>{translate('Workspace')}</span><select value={academyId} onChange={(event) => void load(event.target.value)}>{data.academies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <span className="academy-tg-role">{translate(academy?.access.role.replaceAll('_', ' ') ?? 'Staff')}</span>
      </div>

      {error ? <div className="academy-tg-banner is-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label={translate('Dismiss')}><X size={17} /></button></div> : null}
      {notice ? <div className="academy-tg-banner is-success" role="status"><Check size={17} /><span>{notice}</span></div> : null}
      {!dashboard?.settings.enabled ? <div className="academy-tg-banner is-warning"><BellRing size={18} /><span>{translate('Telegram operations are paused for this Academy.')}</span>{canManage ? <BusyButton busy={busy === 'enable'} onClick={() => void action('enable', async () => { await invoke('update_settings', { academy_id: academyId, enabled: true, default_locale: locale, timezone: dashboard?.settings.timezone ?? 'Asia/Tashkent', digest_time: dashboard?.settings.digest_time ?? '08:00', emergency_override_enabled: true }); await load(academyId); })}>{translate('Enable')}</BusyButton> : null}</div> : null}

      <div className="academy-tg-content">
        {tab === 'today' ? (
          <div className="academy-tg-stack">
            <section className="academy-tg-welcome"><p>{translate('Today in {academy}', { academy: academy?.name ?? 'Academy' })}</p><h1>{translate('What needs attention now')}</h1><span>{translate('Only work inside your assigned scope is shown.')}</span></section>
            <div className="academy-tg-metrics">
              <Card><CalendarDays size={18} /><strong>{dashboard?.metrics.sessions_today ?? 0}</strong><span>{translate('Classes today')}</span></Card>
              <Card><Inbox size={18} /><strong>{dashboard?.metrics.open_requests ?? 0}</strong><span>{translate('Open requests')}</span></Card>
              <Card><BookOpenCheck size={18} /><strong>{dashboard?.metrics.due_homework ?? 0}</strong><span>{translate('Homework due')}</span></Card>
              <Card><BellRing size={18} /><strong>{dashboard?.metrics.failed_deliveries ?? 0}</strong><span>{translate('Needs retry')}</span></Card>
            </div>
            <Card className="academy-tg-register">
              <div className="academy-tg-card-head"><div><p className="academy-tg-eyebrow">{translate('Daily register')}</p><h2>{translate("Today's classes")}</h2></div><span className="academy-tg-count">{dashboard?.sessions.length ?? 0}</span></div>
              {dashboard?.teacher_day?.sessions.length ? <div className="academy-tg-timeline">{dashboard.teacher_day.sessions.map((session) => <article key={session.id}><time>{new Date(session.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span className="academy-tg-dot" /><div><strong>{session.classroom_name}</strong><small>{session.curriculum.lesson_title} · {session.room_name || session.delivery_mode}</small></div><BusyButton busy={busy === `lesson-start:${session.id}`} className="academy-tg-small" onClick={() => session.run?.status === 'in_progress' ? openLesson(session) : void startTeacherLesson(session)}>{translate(session.run?.status === 'in_progress' ? 'Continue' : session.run?.status === 'finished' ? 'Review' : 'Start lesson')}<ChevronRight size={16} /></BusyButton></article>)}</div> : dashboard?.sessions.length ? <div className="academy-tg-timeline">{dashboard.sessions.map((session) => <article key={session.id}><time>{new Date(session.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span className="academy-tg-dot" /><div><strong>{session.title}</strong><small>{session.delivery_mode} · {session.status}</small></div>{canAttendance ? <BusyButton busy={busy === `roster:${session.id}`} className="academy-tg-small" onClick={() => void startAttendance(session)}>{translate('Attendance')}<ChevronRight size={16} /></BusyButton> : null}</article>)}</div> : <Empty title={translate('No classes scheduled today')} body={translate('Use the full Academy workspace to review the timetable.')} />}
            </Card>
            {lesson ? <Card className="academy-tg-attendance"><div className="academy-tg-card-head"><div><p className="academy-tg-eyebrow">{translate('Lesson progress')}</p><h2>{translate('Teach, record, finish')}</h2></div><button className="academy-tg-icon-btn" type="button" onClick={() => { setLesson(null); setAttendance(null); }}><X size={18} /></button></div><div className="academy-tg-lesson-objectives"><strong>{translate('Covered today')}</strong>{lesson.coverage.map((item) => <label key={item.id}><input type="checkbox" checked={item.covered} onChange={(event) => setLesson((current) => current ? { ...current, coverage: current.coverage.map((entry) => entry.id === item.id ? { ...entry, covered: event.target.checked } : entry) } : current)} /><span>{item.label}</span></label>)}</div>{attendance?.roster.map((student) => <label key={student.id}><span>{`${student.first_name} ${student.last_name}`.trim()}</span><select value={attendance.statuses[student.id]} onChange={(event) => setAttendance((current) => current ? { ...current, statuses: { ...current.statuses, [student.id]: event.target.value } } : current)}><option value="present">{translate('Present')}</option><option value="late">{translate('Late')}</option><option value="absent">{translate('Absent')}</option><option value="excused">{translate('Excused')}</option></select></label>)}<BusyButton busy={busy === 'teacher-attendance'} className="academy-tg-secondary" onClick={() => void saveTeacherAttendance()}><ClipboardCheck size={17} />{translate('Save attendance')}</BusyButton><label><span>{translate('Homework title')}</span><input value={lesson.homeworkTitle} onChange={(event) => setLesson({ ...lesson, homeworkTitle: event.target.value })} /></label><label><span>{translate('Homework instructions')}</span><textarea rows={4} value={lesson.homeworkDescription} onChange={(event) => setLesson({ ...lesson, homeworkDescription: event.target.value })} /></label><label><span>{translate('Due date')}</span><input type="datetime-local" value={lesson.homeworkDueAt} onChange={(event) => setLesson({ ...lesson, homeworkDueAt: event.target.value })} /></label><p className="academy-tg-privacy-note"><BellRing size={17} />{translate('When you finish, homework is assigned and the connected class group is notified automatically.')}</p><BusyButton busy={busy === 'lesson-finish'} className="academy-tg-primary" onClick={() => void finishTeacherLesson()}><BookOpenCheck size={17} />{translate('Finish lesson and assign')}</BusyButton></Card> : attendance ? <Card className="academy-tg-attendance"><div className="academy-tg-card-head"><div><p className="academy-tg-eyebrow">{translate('Attendance')}</p><h2>{translate('Mark the class')}</h2></div><button className="academy-tg-icon-btn" type="button" onClick={() => setAttendance(null)}><X size={18} /></button></div>{attendance.roster.map((student) => <label key={student.id}><span>{`${student.first_name} ${student.last_name}`.trim()}</span><select value={attendance.statuses[student.id]} onChange={(event) => setAttendance((current) => current ? { ...current, statuses: { ...current.statuses, [student.id]: event.target.value } } : current)}><option value="present">{translate('Present')}</option><option value="late">{translate('Late')}</option><option value="absent">{translate('Absent')}</option><option value="excused">{translate('Excused')}</option></select></label>)}<BusyButton busy={busy === 'attendance'} className="academy-tg-primary" onClick={() => void saveAttendance()}><ClipboardCheck size={17} />{translate('Save attendance')}</BusyButton></Card> : null}
          </div>
        ) : null}

        {tab === 'compose' ? (
          <div className="academy-tg-stack">
            <section className="academy-tg-section-title"><p className="academy-tg-eyebrow">{translate('Clear communication')}</p><h1>{translate('Write an update')}</h1><span>{translate('Choose the audience first. Personal student information never appears in group posts.')}</span></section>
            {!canCompose && !canHomework && !canPrivate ? <Empty title={translate('Publishing is not part of your role')} body={translate('You can still read updates and complete your assigned daily work.')} /> : !activeGroups.length && !canPrivate ? <Empty title={translate('Connect a group before publishing')} body={translate('An Academy administrator can connect a staff, classroom, or guardian group.')} action={<button className="academy-tg-secondary" onClick={() => setTab('groups')}>{translate('Open groups')}</button>} /> : <Card className="academy-tg-form">
              <label><span>{translate('Update type')}</span><select value={compose.messageType} onChange={(event) => setCompose({ ...compose, messageType: event.target.value })}>{messageTypes.filter(([value]) => value === 'personal_warning' ? canPrivate : value === 'homework_published' ? canHomework : canCompose).map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></label>
              {isPrivate ? <label><span>{translate('Learner')}</span><select value={compose.contactId} onChange={(event) => setCompose({ ...compose, contactId: event.target.value })}><option value="">{translate('Choose a learner')}</option>{dashboard?.contacts.map((contact) => <option disabled={!contact.telegram_linked} key={contact.id} value={contact.id}>{`${contact.first_name} ${contact.last_name}`.trim()} {contact.telegram_linked ? '' : `— ${translate('Telegram not linked')}`}</option>)}</select></label> : <label><span>{translate('Send to')}</span><select value={compose.groupId} onChange={(event) => setCompose({ ...compose, groupId: event.target.value })}><option value="">{translate('Choose a group')}</option>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select></label>}
              {compose.messageType === 'homework_published' ? <><label><span>{translate('Classroom')}</span><select value={compose.classroomId} onChange={(event) => setCompose({ ...compose, classroomId: event.target.value })}><option value="">{translate('Choose a classroom')}</option>{dashboard?.classrooms.map((classroom) => <option value={classroom.id} key={classroom.id}>{classroom.name}</option>)}</select></label><label><span>{translate('Due date')}</span><input type="datetime-local" value={compose.dueAt} onChange={(event) => setCompose({ ...compose, dueAt: event.target.value })} /></label></> : null}
              <label><span>{translate('Title')}</span><input value={compose.title} maxLength={160} onChange={(event) => setCompose({ ...compose, title: event.target.value })} placeholder={translate('What should people know?')} /></label>
              <label><span>{translate('Message')}</span><textarea rows={6} value={compose.body} maxLength={3500} onChange={(event) => setCompose({ ...compose, body: event.target.value })} placeholder={translate('Write the useful details in plain language.')} /><small>{compose.body.length}/3500</small></label>
              {!isPrivate ? <label><span>{translate('Schedule (optional)')}</span><input type="datetime-local" value={compose.scheduledAt} onChange={(event) => setCompose({ ...compose, scheduledAt: event.target.value })} /></label> : <p className="academy-tg-privacy-note"><ShieldCheck size={17} />{translate('This warning is sent privately through the student bot and respects the learner notification settings.')}</p>}
              <button className="academy-tg-primary" type="button" onClick={() => setPreviewing(true)}>{translate('Review message')}<ChevronRight size={17} /></button>
            </Card>}
            {previewing ? <div className="academy-tg-modal-backdrop" role="presentation"><section className="academy-tg-modal" role="dialog" aria-modal="true" aria-labelledby="telegram-preview-title"><div className="academy-tg-card-head"><div><p className="academy-tg-eyebrow">{translate('Final check')}</p><h2 id="telegram-preview-title">{translate('Review before publishing')}</h2></div><button className="academy-tg-icon-btn" onClick={() => setPreviewing(false)}><X size={18} /></button></div><div className="academy-tg-message-preview"><strong>{compose.title || translate('Untitled update')}</strong><p>{compose.body || translate('No message written yet.')}</p><small>{isPrivate ? `${dashboard?.contacts.find((contact) => contact.id === compose.contactId)?.first_name ?? ''} ${dashboard?.contacts.find((contact) => contact.id === compose.contactId)?.last_name ?? ''}`.trim() || translate('No learner selected') : activeGroups.find((group) => group.id === compose.groupId)?.title || translate('No group selected')}</small></div><p className="academy-tg-privacy-note"><ShieldCheck size={17} />{translate(isPrivate ? 'This message stays private and is delivered by the student bot.' : 'This preview contains only group-safe information.')}</p><div className="academy-tg-actions"><button className="academy-tg-secondary" onClick={() => setPreviewing(false)}>{translate('Keep editing')}</button><BusyButton busy={busy === 'publish'} className="academy-tg-primary" onClick={() => void publish()}>{translate(isPrivate ? 'Send privately' : compose.scheduledAt ? 'Schedule' : 'Publish')}</BusyButton></div></section></div> : null}
          </div>
        ) : null}

        {tab === 'groups' ? (
          <div className="academy-tg-stack">
            <section className="academy-tg-section-title"><p className="academy-tg-eyebrow">{translate('Connected conversations')}</p><h1>{translate('Academy groups')}</h1><span>{translate('Each group has one clear purpose and receives only suitable updates.')}</span></section>
            {canManage ? <Card className="academy-tg-form academy-tg-connect"><div className="academy-tg-card-head"><div><h2>{translate('Connect a Telegram group')}</h2><p>{translate('Telegram will ask which group to add the Academy bot to.')}</p></div><Link2 size={22} /></div><label><span>{translate('Group purpose')}</span><select value={groupLink.purpose} onChange={(event) => setGroupLink({ ...groupLink, purpose: event.target.value })}>{Object.entries(purposeLabels).map(([value, label]) => <option value={value} key={value}>{translate(label)}</option>)}</select></label>{groupLink.purpose === 'branch_staff' ? <label><span>{translate('Branch')}</span><select value={groupLink.branchId} onChange={(event) => setGroupLink({ ...groupLink, branchId: event.target.value })}><option value="">{translate('Choose a branch')}</option>{dashboard?.branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label> : null}{groupLink.purpose.startsWith('classroom_') ? <label><span>{translate('Classroom')}</span><select value={groupLink.classroomId} onChange={(event) => setGroupLink({ ...groupLink, classroomId: event.target.value })}><option value="">{translate('Choose a classroom')}</option>{dashboard?.classrooms.map((classroom) => <option value={classroom.id} key={classroom.id}>{classroom.name}</option>)}</select></label> : null}<BusyButton busy={busy === 'connect'} className="academy-tg-primary" onClick={() => void connectGroup()}><UsersRound size={17} />{translate('Choose Telegram group')}</BusyButton></Card> : null}
            {dashboard?.groups.length ? <div className="academy-tg-list">{dashboard.groups.map((group) => <Card key={group.id} className="academy-tg-group"><div className="academy-tg-card-head"><div><h2>{group.title}</h2><p>{translate(purposeLabels[group.purpose] ?? group.purpose)}</p></div><span className={`academy-tg-status ${statusTone(group.status)}`}>{translate(group.status)}</span></div><div className="academy-tg-group-meta"><span>{translate('Language')}: {group.locale.toUpperCase()}</span><span>{translate('Checked')}: {fmt(group.last_verified_at)}</span></div>{group.last_error ? <p className="academy-tg-inline-error">{group.last_error}</p> : null}{canManage ? <div className="academy-tg-actions"><BusyButton busy={busy === `test:${group.id}`} className="academy-tg-secondary" onClick={() => void action(`test:${group.id}`, async () => { await invoke('test_group', { academy_id: academyId, chat_binding_id: group.id }); setNotice(translate('Connection check queued')); await load(academyId); })}>{translate('Test')}</BusyButton><BusyButton busy={busy === `pause:${group.id}`} className="academy-tg-secondary" onClick={() => void action(`pause:${group.id}`, async () => { await invoke('update_group', { academy_id: academyId, chat_binding_id: group.id, status: group.status === 'paused' ? 'active' : 'paused', locale: group.locale }); await load(academyId); })}>{translate(group.status === 'paused' ? 'Resume' : 'Pause')}</BusyButton><BusyButton busy={busy === `disconnect:${group.id}`} className="academy-tg-danger" onClick={() => void action(`disconnect:${group.id}`, async () => { if (!window.confirm(translate('Disconnect this Telegram group?'))) return; await invoke('disconnect_group', { academy_id: academyId, chat_binding_id: group.id }); await load(academyId); })}>{translate('Disconnect')}</BusyButton></div> : null}</Card>)}</div> : <Empty title={translate('No Telegram groups connected')} body={translate('Connect the first group to start sending scoped Academy updates.')} />}
          </div>
        ) : null}

        {tab === 'inbox' ? (
          <div className="academy-tg-stack">
            <section className="academy-tg-section-title"><p className="academy-tg-eyebrow">{translate('Follow-up')}</p><h1>{translate('Requests and delivery')}</h1><span>{translate('Handle learner requests and messages that need another attempt.')}</span></section>
            <Card><div className="academy-tg-card-head"><div><h2>{translate('Open requests')}</h2><p>{translate('Most urgent work appears first.')}</p></div><span className="academy-tg-count">{dashboard?.requests.length ?? 0}</span></div>{dashboard?.requests.length ? <div className="academy-tg-request-list">{dashboard.requests.map((request) => <article key={request.id}><div><span className={`academy-tg-status ${statusTone(request.priority)}`}>{translate(request.priority)}</span><strong>{request.subject}</strong><small>{translate(request.request_type.replaceAll('_', ' '))} · {fmt(request.created_at)}</small></div>{canRequests ? <BusyButton busy={busy === `request:${request.id}`} className="academy-tg-small" onClick={() => void action(`request:${request.id}`, async () => { await invoke('update_request', { academy_id: academyId, request_id: request.id, status: request.status === 'submitted' ? 'triaged' : 'in_review', assign_to_me: true, note: 'Opened from Academy Telegram', idempotency_key: uuid() }); await load(academyId); })}>{translate(request.status === 'submitted' ? 'Triage' : 'Take request')}<ChevronRight size={16} /></BusyButton> : null}</article>)}</div> : <Empty title={translate('No open requests')} body={translate('New learner and guardian requests will appear here.')} />}</Card>
            <Card><div className="academy-tg-card-head"><div><h2>{translate('Delivery activity')}</h2><p>{translate('Queued, sent, and failed Academy messages.')}</p></div><BellRing size={21} /></div>{dashboard?.deliveries.length ? <div className="academy-tg-deliveries">{dashboard.deliveries.slice(0, 30).map((delivery) => <article key={delivery.id}><div><strong>{delivery.title || translate(delivery.type.replaceAll('_', ' '))}</strong><small>{fmt(delivery.sent_at || delivery.scheduled_at)}</small>{delivery.error ? <p>{delivery.error}</p> : null}</div><span className={`academy-tg-status ${statusTone(delivery.status)}`}>{translate(delivery.status)}</span>{delivery.status === 'failed' && permissions.dispatchNotifications && delivery.type !== 'personal_warning' ? <BusyButton busy={busy === `retry:${delivery.id}`} className="academy-tg-icon-btn" aria-label={translate('Retry delivery')} onClick={() => void action(`retry:${delivery.id}`, async () => { await invoke('retry_delivery', { academy_id: academyId, notification_id: delivery.id }); await load(academyId); })}><RotateCcw size={16} /></BusyButton> : null}</article>)}</div> : <Empty title={translate('No delivery activity yet')} body={translate('Published Academy messages will appear here.')} />}</Card>
          </div>
        ) : null}

        {tab === 'more' ? (
          <div className="academy-tg-stack">
            <section className="academy-tg-section-title"><p className="academy-tg-eyebrow">{translate('Preferences')}</p><h1>{translate('Academy bot settings')}</h1><span>{translate('Keep the daily app simple; use the full workspace for advanced administration.')}</span></section>
            <Card className="academy-tg-form"><label><span>{translate('Language')}</span><select value={locale} onChange={(event) => { const next = event.target.value as 'en' | 'uz' | 'ru'; setLocale(next); setGroupLink({ ...groupLink, locale: next }); }}><option value="en">{translate('English')}</option><option value="uz">{translate('O‘zbekcha')}</option><option value="ru">{translate('Russian')}</option></select></label>{canManage ? <><label><span>{translate('Daily digest time')}</span><input type="time" value={dashboard?.settings.digest_time?.slice(0, 5) ?? '08:00'} onChange={(event) => setData((current) => current ? { ...current, dashboard: { ...current.dashboard, settings: { ...current.dashboard.settings, digest_time: event.target.value } } } : current)} /></label><BusyButton busy={busy === 'settings'} className="academy-tg-primary" onClick={() => void action('settings', async () => { await invoke('update_settings', { academy_id: academyId, enabled: dashboard?.settings.enabled === true, default_locale: locale, timezone: dashboard?.settings.timezone ?? 'Asia/Tashkent', digest_time: dashboard?.settings.digest_time?.slice(0, 5) ?? '08:00', emergency_override_enabled: dashboard?.settings.emergency_override_enabled !== false }); setNotice(translate('Settings saved')); await load(academyId); })}>{translate('Save settings')}</BusyButton></> : null}</Card>
            <Card className="academy-tg-safety"><ShieldCheck size={24} /><div><h2>{translate('Privacy by role')}</h2><p>{translate('The bot does not read ordinary group conversation. Grades, payments, attendance concerns, and personal warnings stay in private messages.')}</p></div></Card>
            <a className="academy-tg-row-link" href="/academy/office"><span><Home size={18} />{translate('Open full Academy workspace')}</span><ChevronRight size={18} /></a>
            <a className="academy-tg-row-link" href={`${platformUrl.replace(/\/$/, '')}/account`}><span><Link2 size={18} />{translate('Manage linked Telegram account')}</span><ChevronRight size={18} /></a>
          </div>
        ) : null}
      </div>

      <nav className="academy-tg-nav" aria-label={translate('Academy operations')}>
        {tabs.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}><Icon size={19} /><span>{translate(item.label)}</span>{item.id === 'inbox' && (dashboard?.metrics.urgent_requests ?? 0) > 0 ? <b>{dashboard?.metrics.urgent_requests}</b> : null}</button>; })}
      </nav>
    </main>
  );
};

export default AcademyTelegramApp;
