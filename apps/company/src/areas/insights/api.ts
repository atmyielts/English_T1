// Shapes the insights API returns, and a small loader hook.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.ts';
import { useErrorText } from '../../i18n/index.ts';

export type LevelCode = 'pre_a1' | 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2';
export type LevelCounts = Record<LevelCode | 'none', number>;
export interface Avg { score: number | null; level: LevelCode | null }
export interface Department { id: string; name: string }
export interface WeekPoint { week: string; minutes: number; learners: number; events: number }
export type Kinds = Record<string, { events: number; minutes: number }>;

export interface Overview {
  generated_at: string;
  today: string;
  scope: { department: Department | null; unassigned: boolean };
  kpis: {
    people: number; learners: number; invited: number; sharing: number; tested: number; active7: number; active30: number;
    minutes_month: number; lessons_month: number; tests_month: number; candidates_month: number;
    avg_score: number | null; avg_level: LevelCode | null; with_target: number; at_target: number; seats: number;
  };
  levels: LevelCounts;
  departments: {
    id: string | null; name: string | null; people: number; tested: number; sharing: number; seats: number; avg_score: number | null; avg_level: LevelCode | null;
    with_target: number; at_target: number; active30: number; minutes30: number;
  }[];
  trend: { month: string; tested: number; graded: number; counts: LevelCounts; avg: Avg }[];
  weeks: WeekPoint[];
  kinds: Kinds;
  todo: { kind: string; count: number; people?: { id: string; name: string }[] }[];
  next_session: { id: string; title: string; starts_at: string; duration_minutes: number; kind: string } | null;
  upcoming_sessions: number;
  challenge: { id: string; title: string; metric: string; starts_on: string; ends_on: string } | null;
  usage: { status: string; tests_used: number; tests_limit: number | null; seats_used: number; seats_limit: number; contract_ends_at: string | null } | null;
  contact: { email: string | null; phone: string | null } | null;
  seats_requested_at: string | null;
}

export interface SkillBar { skill: string; score: number | null; level: LevelCode | null }
export interface Profile {
  member: {
    id: string; full_name: string | null; email: string | null; role: string; department_id: string | null; department_name: string | null; job_role: string; status: string; seat: boolean;
    level: LevelCode | null; level_score: number | null; level_source: string | null; level_at: string | null; target_level: LevelCode | null; target_date: string | null;
    consent_at: string | null; joined_at: string | null;
  };
  self: boolean;
  detail: boolean;
  can_manage: boolean;
  tests: { id: string; title: string | null; kind: string | null; status: string; overall_level: LevelCode | null; overall_score: number | null; skills: SkillBar[]; started_at: string; graded_at: string | null; certificate_code: string | null }[];
  certificates: { code: string; level: LevelCode | null; date: string | null; title: string | null }[];
  assignments: { id: string; track_code: string | null; target_level: LevelCode | null; due_date: string | null; status: string; note: string | null; scope: 'person' | 'department'; overdue: boolean; target_met: boolean | null; lessons_done: number | null }[];
  learning: null | {
    weeks_count: number; minutes: number; points: number; active_days: number; last_at: string | null; kinds: Kinds;
    weeks: { week: string; minutes: number; events: number }[];
    lessons_completed: number; lessons_started: number; lesson_minutes: number; avg_lesson_score: number | null;
    tracks: { track_code: string; completed: number; started: number; last_at: string | null }[];
    recent_lessons: { track_code: string; lesson_code: string; status: string; score: number | null; minutes: number; completed_at: string | null; updated_at: string | null }[];
    sessions: { id: string; title: string; kind: string; starts_at: string; duration_minutes: number }[];
  };
  english: null | {
    level: LevelCode | null; target: LevelCode | null; daily_goal_minutes: number | null; days: number; activities: number; minutes: number; active_days: number; xp: number;
    reviews: number | null; badges: number | null; skills: Record<string, { activities: number; minutes: number; accuracy: number | null }>;
    weeks: { week: string; minutes: number; activities: number }[]; last_at: string | null;
  };
  english_reason: 'no_seat' | 'no_consent' | 'not_joined' | 'no_data' | null;
}

export interface Report {
  range: { from: string; to: string; days: number };
  generated_at: string;
  org: { name: string; industry: string };
  scope: { department: Department | null; unassigned: boolean };
  summary: {
    people: number; learners: number; sharing: number; active: number; minutes: number; lessons: number; tests_graded: number; staff_tests: number;
    avg_start: Avg; avg_end: Avg; current_avg: Avg; with_target: number; at_target: number;
  };
  kinds: Kinds;
  weeks: WeekPoint[];
  movement: { up: number; same: number; down: number; first: number; start: LevelCounts; end: LevelCounts };
  departments: { id: string | null; name: string | null; people: number; active: number; sharing: number; minutes: number; lessons: number; tested: number; avg: Avg; moved_up: number; with_target: number; at_target: number }[];
  improvers: { member_id: string; name: string; department: string | null; from_level: LevelCode; to_level: LevelCode; from_score: number | null; to_score: number | null; delta: number }[];
  most_active: { member_id: string; name: string; department: string | null; minutes: number; lessons: number; days: number }[];
  hiring: null | Funnel & { by_test: (Funnel & { id: string; title: string; min_level: LevelCode | null })[] };
  training: {
    assignments: { id: string; track_code: string | null; target_level: LevelCode | null; due_date: string | null; status: string; department: string | null; person: string | null; assignees: number; sharing: number; learners: number; lessons: number; target_met: number | null; overdue: boolean }[];
    lessons_completed: number; learners: number; by_track: { track_code: string; lessons: number; learners: number }[];
  };
}
export interface Funnel { started: number; finished: number; graded: number; meets_min: number; with_min: number; shortlisted: number; held: number; rejected: number; waiting: number }
export interface AiSummary { status: 'ok' | 'limit' | 'unavailable'; summary: { headline: string; paragraphs: string[]; actions: string[] } | null; generated_at?: string }

export type ChallengeStatus = 'upcoming' | 'running' | 'finished';
export interface Challenge {
  id: string; title: string; description: string | null; metric: 'points' | 'minutes' | 'lessons'; starts_on: string; ends_on: string;
  department_ids: string[]; ended_at: string | null; status: ChallengeStatus;
}
export interface ChallengeList { today: string; challenges: Challenge[]; departments: Department[]; can_manage: boolean }
export interface Standings {
  challenge: Challenge; today: string; days_left: number; starts_in: number; participants: number; active: number; total: number;
  departments: { id: string; name: string; participants: number; active: number; total: number; average: number; rank: number }[];
  people: { rank: number; member_id: string | null; name: string; department: string | null; value: number; me: boolean }[];
  me: { participating: boolean; sharing: boolean; rank: number | null; value: number } | null;
  can_manage: boolean;
}

export interface Session {
  id: string; title: string; kind: 'class' | 'workshop'; trainer: string | null; starts_at: string; duration_minutes: number; location: string | null; link: string | null;
  department_ids: string[]; member_ids: string[]; notes: string | null; status: 'scheduled' | 'cancelled';
  for_me: boolean; attended: boolean | null; counts: { invited: number; present: number } | null; in_progress: boolean;
}
export interface SessionList { when: 'upcoming' | 'past'; can_manage: boolean; departments: Department[]; sessions: Session[] }
export interface AttendanceSheet {
  session: Session; started: boolean; can_mark: boolean;
  people: { member_id: string; name: string; department: string | null; invited: boolean; present: boolean }[];
  others: { member_id: string; name: string }[];
}
export interface PersonOption { id: string; name: string; department_id: string | null }

/** Loads `path` (null = nothing) and reloads on demand. */
export function useApi<T>(path: string | null): { data: T | null; error: string; loading: boolean; reload: () => Promise<void> } {
  const problem = useErrorText();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(path));
  const latest = useRef(path);
  latest.current = path;
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const result = await api<T>(path);
      if (latest.current === path) { setData(result); setError(''); }
    } catch (cause) {
      if (latest.current === path) setError(problem(cause));
    } finally {
      if (latest.current === path) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}
