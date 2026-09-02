import { academyAssessmentRequest } from './client';

export const skills = [
  'grammar',
  'vocabulary',
  'reading',
  'listening',
  'writing',
  'speaking',
] as const;
export type Skill = typeof skills[number];
export type AssessmentItem = {
  id: string;
  skill: Skill;
  kind: 'choice' | 'written' | 'interview';
  prompt: string;
  rubric?: string;
  passage: string;
  media_url: string;
  options: string[];
  correct?: number | null;
  points: number;
};
export type AssessmentPaper = {
  id: string;
  title: string;
  duration_minutes: number;
  items: AssessmentItem[];
};
export type AssessmentRun = {
  id: string;
  paper_id: string;
  classroom_id: string | null;
  title: string;
  kind: 'placement' | 'exam' | 'audit';
  status: 'draft' | 'open' | 'closed';
  starts_at: string;
  ends_at: string;
  capacity: number;
  room: string;
  instructions: string;
};
export type AssessmentReport = {
  level: string;
  basis: string;
  strengths: string;
  next_steps: string;
  recommended_course: string;
  learning_plan: string;
  support_needed: boolean;
};
export type AssessmentSummary = {
  percent: number | null;
  earned: number;
  possible: number;
  pending: boolean;
  skills: Array<
    { skill: Skill; percent: number | null; earned: number; possible: number; pending: boolean }
  >;
};
export type AssessmentCandidate = {
  id: string;
  run_id: string;
  contact_id: string;
  lead_id?: string | null;
  candidate_code: string;
  status: 'invited' | 'in_progress' | 'submitted' | 'reviewed' | 'released';
  started_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  released_at: string | null;
  answers: Record<string, string | number>;
  marks: Record<string, number>;
  report: AssessmentReport | null;
  review_notes: string;
  summary: AssessmentSummary | null;
};
export type StudentAssessment =
  & Omit<AssessmentCandidate, 'contact_id' | 'lead_id' | 'marks' | 'review_notes' | 'answers'>
  & { answers?: Record<string, string | number>; learner_name?: string }
  & { run: AssessmentRun; duration_minutes: number; items?: AssessmentItem[] };
export type AssessmentWorkspace = {
  leads: Array<
    { id: string; full_name: string; email: string | null; interested_course: string | null }
  >;
  academy: { id: string; name: string };
  papers: AssessmentPaper[];
  runs: AssessmentRun[];
  candidates: AssessmentCandidate[];
  contacts: Array<
    {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      user_id: string | null;
    }
  >;
  classrooms: Array<{ id: string; name: string; branch_id: string | null }>;
  memberships: Array<{ contact_id: string; classroom_id: string; status: string }>;
  permissions: {
    create: boolean;
    run: boolean;
    review: boolean;
    enroll: boolean;
    intake: boolean;
    admissions: boolean;
  };
  limited: boolean;
  progress: Array<
    {
      contact_id: string;
      paper_id: string;
      classroom_id: string | null;
      baseline: number;
      latest: number;
      change: number;
      assessments: number;
      from: string;
      to: string;
    }
  >;
};
export const assessmentWorkspace = (id: string) =>
  academyAssessmentRequest<AssessmentWorkspace>(id, 'assessment_workspace');
export const assessmentCommand = (id: string, command: string, body: Record<string, unknown>) =>
  academyAssessmentRequest<Record<string, unknown>>(id, `assessment_${command}`, body);
export const studentAssessments = (id: string) =>
  academyAssessmentRequest<{ candidates: StudentAssessment[]; server_time: string }>(
    id,
    'assessment_student_list',
  );
export const studentAssessmentCommand = (
  id: string,
  command: string,
  body: Record<string, unknown>,
) =>
  academyAssessmentRequest<{ candidate: StudentAssessment; server_time: string }>(
    id,
    `assessment_student_${command}`,
    body,
  );
