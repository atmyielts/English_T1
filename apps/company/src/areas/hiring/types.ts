// Shapes the hiring API returns (supabase/functions/company/hiring/*).
import type { Level, Skill } from '../../../../../packages/company-core/src/mod.ts';

export type Kind = 'hiring' | 'placement' | 'progress';
export type AttemptStatus = 'started' | 'submitted' | 'graded' | 'expired';
export type Decision = 'shortlist' | 'hold' | 'reject';

export interface Stats { total: number; in_progress: number; pending: number; graded: number; meets: number; shortlisted: number; average: number | null; levels: Partial<Record<Level, number>> }

export interface Assessment {
  id: string; org_id: string; kind: Kind; title: string; job_role: string; skills: Skill[]; min_level: Level | null;
  time_limit_minutes: number; status: 'draft' | 'open' | 'closed'; max_attempts: number | null; closes_at: string | null;
  settings: { show_level?: boolean; audience?: { type: 'all' | 'departments' | 'members'; ids: string[] }; retest_days?: number | null; member_role?: boolean };
  created_at: string; has_link: boolean; stats?: Stats;
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
