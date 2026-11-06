// Shapes the hiring API returns (supabase/functions/company/hiring/*).
import type { Level, Skill } from '../../../../../packages/company-core/src/mod.ts';

export type Kind = 'hiring' | 'placement' | 'progress';
export type AttemptStatus = 'started' | 'submitted' | 'graded' | 'expired';
export type Decision = 'shortlist' | 'hold' | 'reject';

export interface Stats { total: number; in_progress: number; pending: number; graded: number; meets: number; shortlisted: number; average: number | null; levels: Partial<Record<Level, number>> }

export interface Assessment {
  id: string; org_id: string; kind: Kind; title: string; job_role: string; skills: Skill[]; min_level: Level | null;
  time_limit_minutes: number; status: 'draft' | 'open' | 'closed'; max_attempts: number | null; closes_at: string | null;
  settings: { show_level?: boolean; audience?: { type: 'all' | 'departments' | 'members'; ids: string[] }; retest_days?: number | null; member_role?: boolean; skill_minimums?: Partial<Record<Skill, Level>>; template?: string };
  created_at: string; has_link: boolean; link_id: string | null; stats?: Stats;
  progress?: { audience: number; done: number; in_progress: number; levels: Partial<Record<Level, number>> };
}

export interface Flag { code: string; severity: 'info' | 'warn'; value?: number | string }
export interface SkillScore { score: number; level: Level; source: 'auto' | 'ai' | 'manual' | 'empty' | 'skipped' }

export interface AttemptRow {
  id: string; name: string | null; email: string | null; phone: string | null; member_id: string | null; status: AttemptStatus;
  started_at: string; submitted_at: string | null; graded_at: string | null; overall_level: Level | null; overall_score: number | null;
  skills: Partial<Record<Skill, SkillScore | null>>; pending: Skill[]; decision: Decision | null; notes: string | null;
  meets: boolean | null; flags: Flag[]; certificate_code: string | null;
}

export interface Feedback { criteria: Record<string, number>; strengths: string[]; improvements: string[]; summary: string; locale: string; typed_only?: boolean }

export interface Report extends AttemptRow {
  deadline_at: string; decision_by: string | null;
  results: Partial<Record<Skill, SkillScore & { correct?: number; total?: number; stages?: { level: string; correct: number; total: number }[]; transcript_based?: boolean }>>;
  feedback: { writing: Feedback | null; speaking: Feedback | null; reason: 'ai_limit' | 'ai_unavailable' | null; tried_at: string | null };
  integrity: { tab_hidden?: number; paste?: number; copy?: number; fullscreen_exit?: number; section_seconds?: Partial<Record<Skill, number>>; plays?: Record<string, number>; user_agent?: string };
  sections: {
    skill: Skill; status: string; started_at: string | null; finished_at: string | null; seconds: number | null;
    texts: { id: string; title: string; genre: string; level: string; questions: number }[] | null;
    tasks: { id: string; prompt: string; points: string[]; target: number; answer: string; mode: 'speech' | 'typed' | null }[] | null;
  }[];
}

export interface Choice { id: string; prompt: string; options: string[] }
export interface PublicSection {
  skill: Skill;
  stage?: number; stages?: number; items?: Choice[];
  passages?: { id: string; genre: string; title: string; text?: string; lines?: { speaker: string; text: string }[]; questions: Choice[] }[];
  tasks?: { id: string; prompt: string; points: string[]; target: number }[];
}
export type SpokenAnswer = { transcript: string; mode: 'speech' | 'typed' };
export type AnswerValue = number | string | SpokenAnswer;

export interface Result {
  overall_level: Level | null; overall_score: number | null; certificate_code: string | null;
  skills: Partial<Record<Skill, { level: Level | null; score: number | null } | null>>;
  feedback?: { writing: Feedback | null; speaking: Feedback | null };
}

export interface AttemptView {
  id: string; status: AttemptStatus; kind: Kind; title: string; company: string;
  started_at: string; deadline_at: string; submitted_at: string | null; now: string; grace_seconds: number;
  sections: { skill: Skill; status: 'pending' | 'active' | 'done' }[]; current: number;
  section: PublicSection | null; answers: Record<string, AnswerValue>; plays: Record<string, number>;
  result: Result | null;
}

// ----- Applicant tracking -----
export type Stage = 'new' | 'reviewing' | 'interview' | 'offer' | 'hired' | 'rejected';
export type Verdict = 'meets' | 'below' | 'pending' | 'none';
export type Track = 'invited' | 'opened' | 'started' | 'finished' | 'graded' | 'expired';

export interface BenchmarkSkill { skill: Skill; required: Level | null; level: Level | null; score: number | null; meets: boolean | null; gap: number }
export interface BenchmarkView {
  verdict: Verdict; below: number; gap: number; skills: BenchmarkSkill[];
  overall: { required: Level | null; level: Level | null; score: number | null; meets: boolean | null };
}

export interface CandidateRow {
  id: string; assessment_id: string; attempt_id: string | null; name: string | null; email: string | null; phone: string | null; source: 'link' | 'invite';
  stage: Stage; stage_at: string; furthest_stage: Stage; invited_at: string | null; opened_at: string | null; reminded_at: string | null; reminders: number; hired_at: string | null;
  anonymised_at: string | null; created_at: string; has_personal_link: boolean; track: Track; status: AttemptStatus | null; started_at: string | null; submitted_at: string | null; minutes: number | null;
  overall_level: Level | null; overall_score: number | null; pending: Skill[]; flags: Flag[]; decision: Decision | null; benchmark: BenchmarkView; rank: number | null; notes_count: number; interview_average: number | null;
}

export interface AllCandidates {
  total: number; counts: Partial<Record<Stage, number>>; tests: { id: string; title: string }[];
  candidates: { id: string; name: string | null; email: string | null; phone: string | null; stage: Stage; assessment_id: string; test_title: string; track: Track; overall_level: Level | null; overall_score: number | null; verdict: Verdict; created_at: string; submitted_at: string | null; interview_average: number | null }[];
}

export interface Funnel {
  candidates: number; invited: number; opened: number; started: number; finished: number; graded: number; meets: number; reviewing: number; interview: number; offer: number; hired: number; rejected: number;
  median_minutes_to_finish: number | null; median_days_to_hire: number | null;
}
export interface Pipeline { assessment: Assessment; stats: Stats; funnel: Funnel; candidates: CandidateRow[] }

export interface InviteResult {
  created: { id: string; name: string; email: string | null; phone: string | null; link: string; subject: string; text: string }[];
  problems: { row: number; name: string; email: string | null; reason: 'name' | 'contact' | 'email' | 'phone' | 'duplicate' }[];
  csv: string | null;
}
export interface BulkMessage { id: string; name: string | null; email: string | null; phone: string | null; link: string | null; missing_link: boolean; subject: string; text: string }

export interface NoteRow { id: string; kind: 'note' | 'stage' | 'message' | 'system'; body: string | null; details: Record<string, unknown>; created_at: string; author_name: string | null; mine: boolean }
export interface InterviewKit {
  source: 'ai' | 'bank'; reason?: 'ai_limit' | 'ai_unavailable' | null; locale: string; created_at: string; weak: Skill[];
  questions: { skill: Skill | 'role'; question: string; follow_up: string; listen_for: string }[];
  ratings?: Record<string, number>; summary?: string | null;
}
export interface CandidateDetail {
  candidate: Omit<CandidateRow, 'rank' | 'notes_count'>; assessment: Assessment; interview_kit: InterviewKit | null;
  feedback: { writing: Feedback | null; speaking: Feedback | null } | null; notes: NoteRow[];
  other_applications: { id: string; stage: Stage; created_at: string; test_title: string; overall_level: Level | null }[];
}

export interface ShareLink {
  id: string; assessment_id: string; candidate_id: string | null; kind: 'report' | 'feedback'; label: string | null; include_contacts: boolean; include_feedback: boolean; stages: Stage[];
  expires_at: string; revoked_at: string | null; last_opened_at: string | null; opens: number; created_at: string; active: boolean;
}
export type PublicShare = {
  kind: 'report'; company: string; label: string | null; expires_at: string; include_contacts: boolean;
  test: { title: string; job_role: string; skills: Skill[]; min_level: Level | null; skill_minimums: Partial<Record<Skill, Level>> };
  candidates: { rank: number; name: string | null; email?: string | null; phone?: string | null; stage: Stage; overall_level: Level | null; overall_score: number | null; verdict: Verdict; skills: BenchmarkSkill[]; submitted_at: string | null; minutes: number | null; interview_average: number | null; flags: Flag[]; summary: string[] }[];
} | {
  kind: 'feedback'; company: string; expires_at: string; name: string | null; test: { title: string; job_role: string; skills: Skill[] };
  overall_level: Level | null; overall_score: number | null; skills: Partial<Record<Skill, { level: Level | null; score: number | null } | null>>; date: string | null; certificate_code: string | null;
  feedback: Record<'writing' | 'speaking', { strengths: string[]; improvements: string[]; summary: string } | null> | null;
};

export interface RoleTemplate { code: string; job_role: string; industries: string[]; min_level: Level; skills: Skill[]; skill_minimums: Partial<Record<Skill, Level>>; time_limit_minutes: number }
export interface MessageTemplate { subject: string; body: string }
type TemplateKinds = 'invite' | 'reminder' | 'interview' | 'offer' | 'rejection' | 'feedback';
type TemplateLocales = 'en' | 'ru' | 'uz';
export interface HiringSettings {
  retention_months: number | null;
  templates: Partial<Record<TemplateKinds, Partial<Record<TemplateLocales, MessageTemplate>>>>;
  defaults: Record<TemplateKinds, Record<TemplateLocales, MessageTemplate>>;
}
export interface TestHealth {
  started: number; finished: number; unfinished: number; completion: number | null;
  skills: { skill: Skill; average: number | null; average_minutes: number | null; count: number }[];
  questions_checked: number; flagged: { prompt: string; skill: Skill; served: number; rate: number }[];
}
