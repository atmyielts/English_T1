import { SchoodAIError, type RequestContext, type Workspace } from '../types.ts';
import { asList, asRecord, num } from './shared.ts';

// Academy, Schood's centre ERP, read and written only through its own API
// (supabase/functions/academy and academy-learning) with the signed-in person's
// token, so Academy's roles and scopes decide what they may see and do. Nothing
// here reads Academy tables. Reads with side effects in Academy (education_os,
// compute_at_risk) are never used.

export interface AcademyClient {
  id: string;
  get<T = Record<string, unknown>>(action: string, params?: Record<string, string | undefined>): Promise<T>;
  post<T = Record<string, unknown>>(action: string, body?: Record<string, unknown>): Promise<T>;
  /** The academy-learning function (Homework OS, course listings). */
  learning<T = Record<string, unknown>>(action: string, body?: Record<string, unknown>): Promise<T>;
}

function translate(cause: unknown): never {
  if (cause instanceof SchoodAIError && cause.code === 'upstream_failed') {
    const status = Number(cause.details.status ?? 0);
    if (status === 403) throw new SchoodAIError('academy_forbidden', 'Your Academy role does not allow this.', 403);
    if (status === 404) throw new SchoodAIError('academy_not_found', 'Academy could not find that.', 404);
    if (status === 409) throw new SchoodAIError('academy_conflict', 'Academy refused this change.', 409);
    throw new SchoodAIError('academy_unavailable', 'Academy is not answering right now.', 502, { status });
  }
  if (cause instanceof SchoodAIError) throw cause;
  throw new SchoodAIError('academy_unavailable', 'Academy is not answering right now.', 502);
}

export function academyClient(ctx: RequestContext, academyId: string): AcademyClient {
  const call = <T>(name: string, init: Parameters<RequestContext['functions']['call']>[2]) => ctx.functions.call<T>(name, '', { timeoutMs: 8_000, maxBytes: 2_000_000, ...init }).catch(translate);
  return {
    id: academyId,
    get: <T>(action: string, params: Record<string, string | undefined> = {}) =>
      call<T>('academy', { query: Object.fromEntries(Object.entries({ action, academy_id: academyId, ...params }).filter(([, value]) => value !== undefined)) as Record<string, string> }),
    post: <T>(action: string, body: Record<string, unknown> = {}) => call<T>('academy', { method: 'POST', body: { action, academy_id: academyId, ...body } }),
    learning: <T>(action: string, body: Record<string, unknown> = {}) => call<T>('academy-learning', { method: 'POST', body: { action, academy_id: academyId, ...body } }),
  };
}

/** The Academy of a centre workspace, or academy_not_linked. */
export function centreAcademy(ctx: RequestContext, workspace: Workspace): AcademyClient {
  if (!workspace.academyTenantId) throw new SchoodAIError('academy_not_linked', 'This centre is not connected to Academy.', 409);
  return academyClient(ctx, workspace.academyTenantId);
}

/** The person's academies and their role in each (any membership; 403 means none). */
export async function myAcademies(ctx: RequestContext): Promise<{ id: string; name: string; role: string; manageAcademy: boolean }[]> {
  try {
    const result = await ctx.functions.call<Record<string, unknown>>('academy', '', { query: { action: 'academies' }, timeoutMs: 8_000, maxBytes: 1_000_000 });
    return asList(result?.academies).map((row) => ({
      id: String(row.id), name: String(row.name ?? ''), role: String(row.role ?? asRecord(row.access).role ?? ''),
      manageAcademy: asRecord(asRecord(row.access).permissions).manageAcademy === true,
    }));
  } catch (cause) {
    if (cause instanceof SchoodAIError && cause.code === 'upstream_failed' && Number(cause.details.status) === 403) return [];
    return translate(cause);
  }
}

export const personName = (row: Record<string, unknown>) =>
  [row.first_name, row.last_name].filter((part) => typeof part === 'string' && part.trim()).join(' ').trim() || String(row.full_name ?? row.name ?? '').trim() || null;

// --- Reads for the teacher assistant (T7) and parent messages (T8) ---------------------------

export interface ClassStudent { contact_id: string; name: string; missed_homework: number; absences_30d: number; avg_score: number | null; status: string | null }
export interface ClassView { classroom_id: string; name: string; students: ClassStudent[]; assignments_due: number }

/** The person's own Academy classes (Academy scopes them) with homework and attendance per student. */
export async function teacherClasses(client: AcademyClient, now: Date, limit = 8): Promise<ClassView[]> {
  const classrooms = asList((await client.get('classrooms', { limit: '50' })).classrooms).filter((row) => row.is_active !== false).slice(0, limit);
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  return Promise.all(classrooms.map(async (room): Promise<ClassView> => {
    const id = String(room.id);
    const [gradebook, attendance] = await Promise.all([
      client.get('gradebook', { classroom_id: id }).catch(() => ({})),
      client.get('attendance', { classroom_id: id }).catch(() => ({})),
    ]);
    const assignments = asList((gradebook as Record<string, unknown>).assignments);
    const due = new Set(assignments.filter((row) => typeof row.due_at === 'string' && Date.parse(row.due_at) < now.getTime()).map((row) => String(row.id)));
    const absences = new Map<string, number>();
    for (const row of asList((attendance as Record<string, unknown>).attendance)) {
      if (row.status === 'absent' && String(row.session_date ?? '') >= since) absences.set(String(row.contact_id), (absences.get(String(row.contact_id)) ?? 0) + 1);
    }
    const students = asList((gradebook as Record<string, unknown>).rows).filter((row) => !row.role || row.role === 'student').map((row): ClassStudent => {
      const submissions = asRecord(row.submissions);
      const missed = [...due].filter((assignment) => asRecord(submissions[assignment]).status === 'missing' || !submissions[assignment]).length;
      return {
        contact_id: String(row.contact_id), name: personName(row) ?? 'Student', missed_homework: missed, absences_30d: absences.get(String(row.contact_id)) ?? 0,
        avg_score: num(row.composite_score), status: typeof row.status === 'string' ? row.status : null,
      };
    });
    return { classroom_id: id, name: String(room.name ?? 'Group'), students, assignments_due: due.size };
  }));
}

/** One student's record for a parent message: classes, attendance, homework, scores. */
export async function studentRecord(client: AcademyClient, contactId: string) {
  const progress = await client.get('student_progress', { contact_id: contactId });
  const contact = asRecord(progress.contact), stats = asRecord(progress.stats);
  const attendance = asList(progress.attendance);
  const submissions = asList(progress.submissions);
  return {
    name: personName(contact) ?? 'Student',
    status: typeof contact.status === 'string' ? contact.status : null,
    groups: asList(progress.classrooms).map((row) => String(asRecord(row.academy_classrooms).name ?? '')).filter(Boolean),
    attendance_rate: num(stats.attendance_rate),
    present_days: num(stats.present_days), total_days: num(stats.total_attendance_days),
    recent_absences: attendance.filter((row) => row.status === 'absent').slice(0, 5).map((row) => String(row.session_date ?? '')),
    average_score: num(stats.avg_score), graded: num(stats.graded_submissions), submitted: num(stats.total_submissions),
    missing_recent: submissions.filter((row) => row.status === 'missing').length,
  };
}

/** Guardian relationships of a student that can receive messages (office roles only in Academy). */
export async function guardiansOf(client: AcademyClient, contactId: string) {
  const result = await client.get('guardian_relationships');
  const guardians = new Map(asList(result.guardians).map((row) => [String(row.id), row]));
  return asList(result.relationships).filter((row) => String(row.contact_id) === contactId && row.status === 'active').map((row) => {
    const guardian = guardians.get(String(row.guardian_id)) ?? {};
    return {
      relationship_id: String(row.id), name: String(guardian.full_name ?? ''), locale: ['uz', 'ru', 'en'].includes(String(guardian.locale)) ? String(guardian.locale) as 'uz' | 'ru' | 'en' : 'uz',
      telegram: !!guardian.telegram_verified_at, consent: row.consent_status === 'granted', can_message: row.can_view_messages !== false, primary: row.is_primary_contact === true,
    };
  });
}

// --- The owner's numbers (C10 brief, C11 audiences, the dashboard) --------------------------

export interface AcademySnapshot {
  captured_at: string;
  parts: { name: string; ok: boolean }[];
  leads: { new: number | null; active: number | null; trials: number | null; conversions: number | null };
  students: { active: number | null; new: number | null; paused: number | null; withdrawals: number | null };
  money: { collected: number | null; expected: number | null; outstanding: number | null; currency: string | null };
  attendance_30d_percent: number | null;
  homework: { assigned: number | null; submitted: number | null; on_time: number | null; reviewed: number | null };
  at_risk: { count: number | null; students: { contact_id: string; name: string; reason: string }[] };
  teachers: { name: string; groups: number | null; students: number | null; lessons: number | null; attendance_percent: number | null }[];
  renewals_due: number | null;
}

/** Aggregates for the owner, each part read separately so a missing permission skips only that part. */
export async function academySnapshot(client: AcademyClient, now: Date): Promise<AcademySnapshot> {
  const parts: { name: string; ok: boolean }[] = [];
  const read = async <T>(name: string, work: () => Promise<T>): Promise<T | null> => {
    try { const value = await work(); parts.push({ name, ok: true }); return value; } catch { parts.push({ name, ok: false }); return null; }
  };
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const [bi, alerts, funnel] = await Promise.all([
    read('business_intelligence', () => client.get('business_intelligence')),
    read('alerts', () => client.get('alerts')),
    read('homework_funnel', () => client.learning('homework_funnel', { from: week, to: now.toISOString().slice(0, 10) })),
  ]);
  const dashboard = asRecord(bi?.dashboard), owner = asRecord(bi?.owner);
  const names = new Map(asList(bi?.student_intelligence).map((row) => [String(row.contact_id), personName(row) ?? String(row.display_name ?? '')]));
  const risky = asList(alerts?.alerts).filter((row) => row.type === 'at_risk' && row.resolved !== true);
  const highRisk = asList(bi?.student_intelligence).filter((row) => ['high', 'critical'].includes(String(row.latest_risk_level)));
  const atRisk = new Map<string, { contact_id: string; name: string; reason: string }>();
  for (const row of risky) {
    const meta = asRecord(row.metadata), id = String(row.contact_id);
    const reason = [num(meta.attendance_rate) !== null ? `attendance ${Math.round(num(meta.attendance_rate)!)}%` : null, num(meta.missing) ? `${num(meta.missing)} homeworks missing` : null].filter(Boolean).join(', ') || String(row.message ?? 'at risk').slice(0, 80);
    atRisk.set(id, { contact_id: id, name: names.get(id) || 'Student', reason });
  }
  for (const row of highRisk) {
    const id = String(row.contact_id);
    if (!atRisk.has(id)) atRisk.set(id, { contact_id: id, name: names.get(id) || 'Student', reason: `risk ${String(row.latest_risk_level)}` });
  }
  const classrooms = asList((funnel as Record<string, unknown> | null)?.classrooms);
  const sum = (key: string) => (classrooms.length ? classrooms.reduce((total, row) => total + (num(row[key]) ?? 0), 0) : null);
  const currency = asList(asRecord(bi ?? {}).branches)[0]?.currency;
  return {
    captured_at: now.toISOString(),
    parts,
    leads: { new: num(dashboard.new_leads), active: num(dashboard.active_leads) ?? num(owner.open_leads), trials: num(dashboard.trials), conversions: num(dashboard.conversions) ?? num(owner.conversions) },
    students: { active: num(dashboard.active_students) ?? num(owner.active_students), new: num(dashboard.new_students), paused: num(dashboard.paused_enrollments), withdrawals: num(dashboard.withdrawals) },
    money: {
      collected: num(dashboard.collected_revenue) ?? num(owner.collected_amount), expected: num(dashboard.expected_revenue),
      outstanding: num(dashboard.outstanding_amount) ?? num(owner.outstanding_debt), currency: typeof currency === 'string' ? currency : null,
    },
    attendance_30d_percent: num(dashboard.attendance_30d_percent),
    homework: { assigned: sum('assigned'), submitted: sum('submitted'), on_time: sum('on_time'), reviewed: sum('reviewed') },
    at_risk: { count: bi || alerts ? atRisk.size : null, students: [...atRisk.values()].slice(0, 8) },
    teachers: asList(bi?.teacher_performance).slice(0, 12).map((row) => ({
      name: String(row.display_name ?? 'Teacher'), groups: num(row.assigned_groups), students: num(row.active_students), lessons: num(row.lessons_delivered), attendance_percent: num(row.attendance_percent),
    })),
    renewals_due: bi ? asList(bi.renewals).filter((row) => ['open', 'pending', 'due'].includes(String(row.status ?? 'open'))).length : null,
  };
}
