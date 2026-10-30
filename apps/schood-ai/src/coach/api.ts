import { api } from '../core/index.ts';
import type { Sample } from '../../../../packages/coach-packs/src/types.ts';

// The coach area's calls to schood-ai/coach/* and their JSON shapes (snake_case,
// as the function sends them). Ids only in queries; never answers or text.

export interface LevelScale { id: string; min: number; max: number; step: number; labels?: { value: number; label: string }[]; decimals?: number }
export interface CoachCard {
  id: string; feature: string; name: string; tagline: string; description: string; accent: string; languages: string[];
  scale: LevelScale; correction_modes: string[]; menu: string[]; bot: string | null;
}
/** A sample as the function sends it: title and preview in the caller's language. */
export type SampleView = Sample extends infer S ? S extends Sample ? Omit<S, 'title' | 'preview'> & { title: string; preview: string } : never : never;
export interface SamplesView {
  coach: CoachCard; scale: LevelScale;
  criteria: Record<string, { name: string; scale: LevelScale }>;
  samples: SampleView[];
}
export interface PublicCertificate {
  code: string; display_name: string; coach: Record<string, string>; level: string; title: Record<string, string> | null; rubric: Record<string, string> | null;
  results: { at: string; overall: number | null; label: string | null }[]; issued_at: string; revoked: boolean; accent: string | null;
}
export interface HomeView { coaches: (CoachCard & { allowed: boolean; plans: string[]; enrolled: boolean; streak: number; placement: string | null })[]; telegram_linked: boolean }
export interface Task { slot: string; activityId: string; minutes: number; reason: string; node: string; errorTag?: string; cards?: number; part?: string; title: string }
export interface ReportRow { key: string; ref: string | null; start: number | null; before: number | null; after: number | null; delta: number | null; lowerIsBetter: boolean; verdict: 'better' | 'worse' | 'same' | null; label?: string }
export interface SessionCard { id: string; kind: string; activity: string | null; mode: string | null; title: string; status: string; rubric: string | null; overall: number | null; overall_label: string | null; minutes: number; started_at: string; finished_at: string | null }
export interface CertificateView { id: string; code: string; pack: string; milestone: string; level: number; level_label: string; display_name: string; issued_at: string; revoked: boolean; url: string; coach?: string }
export interface Dashboard {
  coach: CoachCard;
  access: { allowed: boolean; kind: 'plan' | 'beta' | 'pass' | 'team' | null; plans: string[] };
  enrollment: { locale: string; settings: CoachSettings; has_goal: boolean; placement: { overall: number; label: string; skills: { skill: string; level: number | null; correct: number; total: number; selfRated: boolean }[]; at: string } | null };
  goal: { target: number; target_label: string; exam_date: string | null; daily_minutes: number; weeks_left: number; days_left: number | null };
  streak: { current: number; best: number; minutes: number };
  skills: { node: string; name: string; parent: string | null; level: number | null; label: string | null; mastery: number; evidence: number }[];
  forecasts: { rubric: string; name: string; scale: LevelScale; points: { at: string; value: number }[]; current: number | null; predicted: number | null; perWeek: number | null; confidence: 'low' | 'medium' | null; reason: string }[];
  errors: { tag: string; weight: number; count: number; name: string; explain: string }[];
  today: { minutes: number; phase: string; days_left: number | null; tasks: Task[] } | null;
  week: { from: string; to: string; has_data: boolean; headline: ReportRow | null };
  sessions: SessionCard[];
  certificates: CertificateView[];
  bot: string | null;
}
export interface CoachSettings { correction?: 'gentle' | 'strict'; voice?: boolean; explain?: 'ui' | 'en'; reminder?: string | null; timeZone?: string }
export interface Report {
  from: string; to: string; has_data: boolean; rows: (ReportRow & { label: string })[]; headline: (ReportRow & { label: string }) | null;
  focus: { tag: string; count: number; name: string; explain: string }[];
  stats: { minutes: number; active_days: number; sessions: number; cards: { reviewed: number; correct: number }; quiz: Record<string, { correct: number; total: number; accuracy: number | null }> };
}
export interface PlanView {
  goal: { target: number; target_label: string; examDate: string | null; dailyMinutes: number; startedAt: string }; weeks_left: number; days_left: number | null;
  weeks: { week: number; phase: string; phase_id: string; focus: string[]; mock: boolean }[];
  options: { targets: { value: number; label: string }[]; minutes: number[]; exam_date: 'required' | 'optional' | 'none' };
  weekly_mock: { weekday: number; title: string } | null;
  links: { id: string; label: string; url: string }[];
  today: Task[];
}
export interface Evidence { quote: string; comment: string }
export interface SessionDetail {
  session: SessionCard;
  summary: Record<string, unknown>;
  rubric: { id: string; name: string; scale: LevelScale; overall_scale: LevelScale; criteria: { id: string; name: string; source: 'model' | 'audio' }[] } | null;
  turns: { seq: number; role: 'coach' | 'learner'; kind: string; prompt: string | null; content: string; input_mode: string | null; has_clip: boolean; metrics: Record<string, unknown>; timing: Record<string, unknown>; created_at: string }[];
  scores: { turn: number | null; criterion: string; score: number | null; status: string; evidence: Evidence[]; source: string }[];
  errors: Record<string, { name: string; explain: string }>;
  /** Curated facts the activity relied on (B5): when they were checked and the official source. */
  facts?: { id: string; title: string; checked_at: string; stale: boolean; source: { name: string; url: string } }[];
}
export interface TeamList { teams: { id: string; name: string; role: 'manager' | 'member'; packs: string[]; seats: number; valid_until: string }[] }
export interface TeamBoard {
  team: { id: string; name: string; packs: string[]; seats: number; used: number; valid_until: string };
  leaderboard: { user_id: string; name: string; role: string; joined_at: string; week: { minutes: number; results: number; active_days: number }; total: { minutes: number; results: number }; best: Record<string, number | null> }[];
}

export const coachApi = {
  home: () => api<HomeView>('coach/home'),
  dashboard: (pack: string) => api<Dashboard>('coach/dashboard', { query: { pack } }),
  report: (pack: string, week?: string) => api<Report>('coach/report', { query: { pack, week } }),
  plan: (pack: string) => api<PlanView>('coach/plan', { query: { pack } }),
  setGoal: (pack: string, body: { target: number; exam_date: string | null; daily_minutes: number }) => api<{ goal: PlanView['goal'] }>('coach/goal', { body: { pack, ...body } }),
  settings: (pack: string, body: Record<string, unknown>) => api<{ settings: CoachSettings; locale: string }>('coach/settings', { method: 'PATCH', body: { pack, ...body } }),
  session: (id: string) => api<SessionDetail>('coach/session', { query: { id } }),
  certificates: () => api<{ certificates: CertificateView[] }>('coach/certificates'),
  /** Example reports for anyone (no sign-in): body texts stay in every language, titles come localized. */
  samples: (pack: string) => api<SamplesView>('coach/samples', { anonymous: true, query: { pack } }),
  /** The public check behind a certificate's share link: no sign-in, rate-limited per visitor. */
  verify: (code: string) => api<{ certificate: PublicCertificate }>('coach/verify', { anonymous: true, query: { code } }),
  revoke: (id: string) => api<{ revoked: boolean }>('coach/certificates', { method: 'DELETE', body: { id } }),
  erase: (pack: string) => api<{ removed: number }>('coach/erase', { body: { pack } }),
  link: (pack: string) => api<{ linked: boolean; url: string; expires_at?: string | null }>('coach/link', { body: { pack } }),
  confirmLink: (token: string) => api<{ linked: boolean }>('coach/link-confirm', { body: { token } }),
  audioText: (pack: string, ref: string) => api<{ lines: string[]; speakers: (string | null)[]; focus?: string }>('coach/audio-text', { query: { pack, ref } }),
  chart: (pack: string, activity: string) => api<{ title: string; prompt: string; data: { kind: string; title: string; unit?: string; columns: string[]; rows: (string | number)[][]; note: string } }>('coach/chart', { query: { pack, activity } }),
  teams: () => api<TeamList>('coach/team'),
  team: (id: string) => api<TeamBoard>('coach/team', { query: { id } }),
  invite: (teamId: string) => api<{ code: string; links: { pack: string; url: string | null }[]; web: string }>('coach/team-invite', { body: { team_id: teamId } }),
  removeMember: (teamId: string, userId: string) => api<{ removed: boolean }>('coach/team-member', { method: 'DELETE', body: { team_id: teamId, user_id: userId } }),
  joinTeam: (code: string) => api<{ team: { id: string; name: string; packs: string[] } }>('coach/team-join', { body: { code } }),
};

/** As the engine's levelLabel: on a named scale (CEFR) an average reads as the nearest named point. */
export function levelLabel(scale: LevelScale, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const named = (target: number) => scale.labels?.find((entry) => Math.abs(entry.value - target) < 1e-6)?.label;
  const nearest = Math.min(scale.max, Math.max(scale.min, scale.min + Math.round((value - scale.min) / scale.step) * scale.step));
  const label = named(value) ?? (scale.labels?.length ? named(nearest) : undefined);
  if (label) return label;
  return value.toFixed(scale.decimals ?? (scale.step < 1 ? 1 : 0));
}
