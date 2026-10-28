import { edge } from './api.ts';
import type { CefrLevel, SkillKey } from './skills.ts';

// === Classes for teachers and learning centres (hub /classes) ===

export type AssignmentKind = 'lessons' | 'skill_count' | 'roleplay' | 'speaking_mock';
export type AssignmentState = 'done' | 'pending' | 'overdue';
import type { PlanTier } from './classesFormat.ts';
export type { PlanTier };
export type ClassLocale = 'en' | 'ru' | 'uz';

export type LessonRef = { id: string; skill: SkillKey; slug: string; title: string; level: CefrLevel | null };

export type LearnerAssignment = {
  id: string;
  class_id: string;
  class_name: string;
  kind: AssignmentKind;
  label: string;
  custom_title: boolean;
  skill: SkillKey | null;
  level: CefrLevel | null;
  required_count: number;
  scenario_id: string | null;
  note: string | null;
  due_at: string;
  due_date: string;
  done: number;
  required: number;
  state: AssignmentState;
  completed_at: string | null;
  lessons: Array<LessonRef & { done: boolean }>;
  href: string | null;
};

export type Caps = { max_classes_per_teacher: number; max_students_per_class: number };

export type ClassesResponse = {
  enabled: boolean;
  caps: Caps;
  teaching: Array<{
    id: string;
    name: string;
    level: CefrLevel | null;
    school_name: string | null;
    status: 'active' | 'archived';
    students: number;
    join_code: string | null;
    join_link: string | null;
  }>;
  joined: Array<{
    id: string;
    name: string;
    level: CefrLevel | null;
    school_name: string | null;
    teacher: string;
    assignments: LearnerAssignment[];
  }>;
};

export type ClassPreview = {
  code: string;
  class: { id: string; name: string; level: CefrLevel | null; school_name: string | null; teacher: string };
  role: 'teacher' | 'member' | 'none';
};

export type RosterEntry = {
  user_id: string;
  name: string;
  joined_at: string;
  levels: Record<SkillKey, CefrLevel | null>;
  streak: number;
  minutes_week: number;
  activities_week: number;
  last_active: string | null;
  assignments_done: number;
  assignments_total: number;
  plan: PlanTier;
};

export type TeacherAssignment = {
  id: string;
  kind: AssignmentKind;
  label: string;
  custom_title: boolean;
  skill: SkillKey | null;
  level: CefrLevel | null;
  required_count: number;
  scenario_id: string | null;
  note: string | null;
  lessons: LessonRef[];
  due_at: string;
  due_date: string;
  created_at: string;
  done: number;
  overdue: number;
  students: number;
  finished: string[];
};

export type WeakSkill = { skill: SkillKey; average_level: CefrLevel | null; average: number; students: number };
export type ClassMistake = { topic: string; students: number; count: number };

export type ClassDashboard = {
  class: {
    id: string;
    name: string;
    level: CefrLevel | null;
    school_name: string | null;
    status: 'active' | 'archived';
    join_code: string | null;
    join_link: string | null;
    digest_telegram: boolean;
    digest_locale: ClassLocale;
    created_at: string;
    max_students: number;
  };
  roster: RosterEntry[];
  assignments: TeacherAssignment[];
  weak_skills: WeakSkill[];
  mistakes: ClassMistake[];
  scenarios: Array<{ id: string; title: string; levels: [CefrLevel, CefrLevel] }>;
};

export type ClassDigest = {
  week_start: string;
  week_end: string;
  students: number;
  active_students: number;
  activities: number;
  minutes: number;
  top: Array<{ name: string; activities: number; minutes: number }>;
  inactive: { names: string[]; total: number };
  assignments: Array<{ id: string; label: string; due_at: string; done: number; total: number }>;
  weak_skills: WeakSkill[];
  mistakes: ClassMistake[];
};

export type ContentResult = { id: string; skill: SkillKey; slug: string; title: string; level: CefrLevel | null; minutes: number; tags: string[] };

export type NewAssignment = {
  kind: AssignmentKind;
  due_date: string;
  title?: string;
  note?: string;
  content_item_ids?: string[];
  skill?: SkillKey;
  level?: CefrLevel | null;
  count?: number;
  scenario_id?: string | null;
};

const q = (locale: string) => ({ language_code: 'en', locale });

export const getClasses = (locale: string, signal?: AbortSignal) =>
  edge<ClassesResponse>('hub', '/classes', { query: q(locale), signal });

export const getMyAssignments = (locale: string, signal?: AbortSignal) =>
  edge<{ enabled: boolean; assignments: LearnerAssignment[] }>('hub', '/classes/assignments', { query: q(locale), signal });

export const createClass = (body: { name: string; level: CefrLevel | null; school_name: string; locale: string }) =>
  edge<{ id: string; join_code: string }>('hub', '/classes', { method: 'POST', body, query: { language_code: 'en' } });

export const lookupClass = (code: string) =>
  edge<ClassPreview>('hub', '/classes/lookup', { method: 'POST', body: { code }, query: { language_code: 'en' } });

export const joinClass = (code: string) =>
  edge<{ class_id: string; result: 'joined' | 'already_member' }>('hub', '/classes/join', { method: 'POST', body: { code, consent: true }, query: { language_code: 'en' } });

export const leaveClass = (id: string) =>
  edge<{ ok: true }>('hub', `/classes/${encodeURIComponent(id)}/leave`, { method: 'POST', body: {}, query: { language_code: 'en' } });

export const getClassDashboard = (id: string, locale: string, signal?: AbortSignal) =>
  edge<ClassDashboard>('hub', `/classes/${encodeURIComponent(id)}`, { query: q(locale), signal });

export const getClassDigest = (id: string, locale: string, signal?: AbortSignal) =>
  edge<{ class_name: string; digest: ClassDigest }>('hub', `/classes/${encodeURIComponent(id)}/digest`, { query: q(locale), signal });

export const searchClassContent = (id: string, filters: { skill?: string; level?: string; q?: string }, signal?: AbortSignal) =>
  edge<{ items: ContentResult[] }>('hub', `/classes/${encodeURIComponent(id)}/content`, { query: { language_code: 'en', ...filters }, signal });

const post = <T>(id: string, path: string, body: unknown = {}) =>
  edge<T>('hub', `/classes/${encodeURIComponent(id)}/${path}`, { method: 'POST', body, query: { language_code: 'en' } });

export const updateClass = (id: string, body: Partial<{ name: string; level: CefrLevel | null; school_name: string; digest_telegram: boolean; digest_locale: ClassLocale }>) =>
  post<{ ok: true }>(id, 'update', body);
export const newJoinCode = (id: string) => post<{ join_code: string; join_link: string }>(id, 'code');
export const archiveClass = (id: string) => post<{ ok: true }>(id, 'archive');
export const removeStudent = (id: string, userId: string) => post<{ ok: true }>(id, 'remove', { user_id: userId });
export const createAssignment = (id: string, body: NewAssignment) => post<{ id: string }>(id, 'assignments', body);
export const cancelAssignment = (id: string, assignmentId: string) => post<{ ok: true }>(id, `assignments/${encodeURIComponent(assignmentId)}/cancel`);

export { dateAfter, daysUntil, rosterCsv } from './classesFormat.ts';
