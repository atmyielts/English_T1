import type { MasteryState } from '../../../../packages/coach-packs/src/mod.ts';
import type { Locale } from '../types.ts';

// Storage for the coach tables (20261030600000_schood_coach.sql). store-postgres.ts
// talks to Postgres through the service role; store-memory.ts mirrors it for tests
// and the local dev stack.

export interface Goal { target: number; examDate: string | null; dailyMinutes: number; startedAt: string }
export interface Settings {
  correction?: 'gentle' | 'strict';
  voice?: boolean;
  explain?: 'ui' | 'en';
  /** Reminder time HH:MM and time zone, mirrored from the schedule for display. */
  reminder?: string | null;
  timeZone?: string;
}
export interface Placement { overall: number; skills: { skill: string; level: number | null; correct: number; total: number; selfRated: boolean }[]; at: string; answers: string }

export interface Enrollment {
  id: string;
  userId: string;
  workspaceId: string;
  pack: string;
  packVersion: string;
  status: 'active' | 'paused' | 'blocked';
  locale: Locale;
  settings: Settings;
  goal: Goal | null;
  placement: Placement | null;
  state: Record<string, unknown>;
  revision: number;
  streakCurrent: number;
  streakBest: number;
  lastActiveDay: string | null;
  verifiedMinutes: number;
  createdAt: string;
}
export type EnrollmentPatch = Partial<Pick<Enrollment, 'status' | 'locale' | 'settings' | 'goal' | 'placement' | 'state' | 'streakCurrent' | 'streakBest' | 'lastActiveDay' | 'verifiedMinutes' | 'packVersion'>>;

export type SessionKind = 'diagnostic' | 'speaking_exam' | 'roleplay' | 'writing' | 'quiz_set' | 'deck' | 'drill' | 'shadowing' | 'lesson' | 'photo_help';
export interface Session {
  id: string;
  enrollmentId: string;
  userId: string;
  pack: string;
  packVersion: string;
  kind: SessionKind;
  activityId: string | null;
  mode: string | null;
  status: 'active' | 'finished' | 'abandoned';
  rubric: string | null;
  overall: number | null;
  summary: Record<string, unknown>;
  minutes: number;
  source: 'telegram' | 'web';
  startedAt: string;
  finishedAt: string | null;
}
export interface Turn {
  id: string;
  sessionId: string;
  userId: string;
  pack: string;
  seq: number;
  role: 'coach' | 'learner';
  kind: string;
  promptRef: string | null;
  content: string;
  inputMode: 'voice' | 'text' | 'photo' | null;
  clip: { file_id: string; file_unique_id: string; duration: number; pack: string } | null;
  metrics: Record<string, unknown>;
  timing: Record<string, unknown>;
  keep: boolean;
  createdAt: string;
}
export interface ScoreRow {
  sessionId: string;
  turnId: string | null;
  userId: string;
  pack: string;
  rubric: string;
  criterion: string;
  score: number | null;
  status: 'scored' | 'insufficient_evidence' | 'not_scored_audio' | 'missing';
  evidence: { quote: string; comment: string }[];
  source: 'model' | 'aggregate' | 'key';
  createdAt?: string;
}
export interface CardState { cardId: string; srs: Record<string, unknown>; dueAt: string; reps: number; lapses: number }
export interface Schedule {
  id: string;
  enrollmentId: string;
  userId: string;
  pack: string;
  kind: 'daily' | 'weekly';
  localTime: string;
  weekday: number | null;
  timeZone: string;
  nextAt: string;
  lastSlot: string | null;
  enabled: boolean;
}
export interface Claimed extends Schedule { chatId: string }
export interface Certificate {
  id: string;
  code: string;
  userId: string;
  pack: string;
  packVersion: string;
  milestone: string;
  rubric: string;
  level: number;
  levelLabel: string;
  displayName: string;
  evidence: { session_id: string; at: string; overall: number | null }[];
  issuedAt: string;
  revokedAt: string | null;
}
/** A script built by the script builder (B4): the learner's answers and the structured script. */
export interface SavedScript {
  id: string;
  userId: string;
  pack: string;
  title: string;
  /** The answers to the builder's questions, by question id (the learner's own words). */
  input: Record<string, string>;
  script: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface Team { id: string; name: string; managerId: string | null; packs: string[]; seats: number; status: 'active' | 'suspended' | 'ended'; validUntil: string; source: string; createdAt: string }
export interface TeamMember { teamId: string; userId: string; role: 'manager' | 'member'; status: 'active' | 'removed'; joinedAt: string }

export interface CoachStore {
  enrollment(userId: string, pack: string): Promise<Enrollment | null>;
  enrollments(userId: string): Promise<Enrollment[]>;
  /** Creates the enrolment once; a concurrent second call returns the first. */
  ensureEnrollment(input: { userId: string; workspaceId: string; pack: string; packVersion: string; locale: Locale }): Promise<Enrollment>;
  /** Updates only when the stored revision still equals `revision`; returns the new row or null. */
  updateEnrollment(id: string, revision: number, patch: EnrollmentPatch): Promise<Enrollment | null>;

  /** Records a Telegram update id; false when it was already handled. */
  claimUpdate(pack: string, updateId: number, userId: string): Promise<boolean>;

  createSession(input: Pick<Session, 'enrollmentId' | 'userId' | 'pack' | 'packVersion' | 'kind' | 'activityId' | 'mode' | 'rubric' | 'source'>): Promise<Session>;
  session(id: string): Promise<Session | null>;
  updateSession(id: string, patch: Partial<Pick<Session, 'status' | 'overall' | 'summary' | 'minutes' | 'finishedAt' | 'mode'>>): Promise<Session | null>;
  sessions(userId: string, pack: string, options: { limit: number; status?: Session['status']; since?: string; kind?: SessionKind }): Promise<Session[]>;
  /** Finished sessions with an overall result, newest first. */
  results(userId: string, pack: string, options: { rubric?: string; since?: string; limit: number }): Promise<Session[]>;

  addTurn(input: Omit<Turn, 'id' | 'createdAt' | 'seq'> & { seq?: number }): Promise<Turn>;
  turns(sessionId: string): Promise<Turn[]>;
  turn(id: string): Promise<Turn | null>;
  /** Learner turns with fluency numbers since a time (for reports). */
  learnerTurns(userId: string, pack: string, since: string): Promise<Turn[]>;
  keepTurn(id: string): Promise<void>;

  addScores(rows: ScoreRow[]): Promise<void>;
  scores(sessionId: string): Promise<ScoreRow[]>;

  mastery(userId: string, pack: string): Promise<MasteryState[]>;
  saveMastery(userId: string, pack: string, rows: MasteryState[]): Promise<void>;

  cards(userId: string, pack: string, ids?: string[]): Promise<CardState[]>;
  dueCards(userId: string, pack: string, now: string, limit: number): Promise<CardState[]>;
  countDue(userId: string, pack: string, now: string): Promise<number>;
  saveCard(userId: string, pack: string, card: CardState): Promise<void>;
  /** Card reviews since a time, for reports: learner turns of kind `card` with `metrics.correct`. */
  cardReviews(userId: string, pack: string, since: string): Promise<{ at: string; correct: boolean }[]>;

  addPoll(input: { pollId: string; userId: string; pack: string; sessionId: string; cardId: string; correct: number }): Promise<void>;
  /** Marks a poll answered; null when unknown or already answered. */
  answerPoll(pollId: string, at: string): Promise<{ userId: string; pack: string; sessionId: string; cardId: string; correct: number } | null>;

  schedule(enrollmentId: string, kind: Schedule['kind']): Promise<Schedule | null>;
  saveSchedule(input: Omit<Schedule, 'id' | 'lastSlot'> & { lastSlot?: string | null }): Promise<Schedule>;
  claimDue(now: string, limit: number, leaseSeconds: number): Promise<Claimed[]>;
  /** After a cron run: the next time, the slot sent, and the lease released. */
  advanceSchedule(id: string, patch: { nextAt: string; lastSlot?: string | null; sent?: boolean }): Promise<void>;
  logDelivery(input: { scheduleId: string | null; userId: string; pack: string; kind: 'daily' | 'weekly' | 'level_up'; slot: string; status: 'rendered' | 'sent' | 'failed' | 'blocked' | 'skipped'; reason?: string | null }): Promise<number>;
  updateDelivery(id: number, status: 'sent' | 'failed' | 'blocked', reason?: string | null): Promise<{ userId: string; pack: string } | null>;

  media(pack: string, cacheKey: string): Promise<string | null>;
  saveMedia(pack: string, cacheKey: string, fileId: string): Promise<void>;


  certificates(userId: string, pack?: string): Promise<Certificate[]>;
  certificateByCode(code: string): Promise<Certificate | null>;
  /** Issues once per milestone (a concurrent second call returns the first). */
  issueCertificate(input: Omit<Certificate, 'id' | 'issuedAt' | 'revokedAt'>): Promise<Certificate>;
  revokeCertificate(id: string, userId: string): Promise<boolean>;

  /** Deletes a person's practice history in one coach (sessions, turns, scores, mastery, cards); certificates stay. */
  erase(userId: string, pack: string): Promise<number>;

  teamsOf(userId: string): Promise<{ team: Team; member: TeamMember }[]>;
  team(id: string): Promise<Team | null>;
  teamMembers(teamId: string): Promise<TeamMember[]>;
  createTeam(input: Omit<Team, 'id' | 'createdAt' | 'status'> & { createdBy: string }): Promise<Team>;
  addTeamMember(teamId: string, userId: string, role: TeamMember['role']): Promise<void>;
  removeTeamMember(teamId: string, userId: string): Promise<boolean>;
  createInvite(input: { code: string; teamId: string; createdBy: string; expiresAt: string; maxUses: number }): Promise<void>;
  /** Joins within the team's seats; throws Error('invite_not_found' | 'invite_expired' | 'team_inactive' | 'team_full'). */
  joinTeam(code: string, userId: string, now: string): Promise<TeamMember>;
  /** Verified practice per member since a time, for the leaderboard: minutes, scored results, active days. */
  teamActivity(userIds: string[], packs: string[], since: string): Promise<{ userId: string; minutes: number; results: number; activeDays: number; best: Record<string, number | null> }[]>;

  /**
   * The anonymous percentile's input: for each score (rounded to a whole number), how
   * many people's latest result on a rubric since a time it is. Counts only, never people.
   */
  cohort(pack: string, rubric: string, since: string): Promise<{ score: number; people: number }[]>;

  /** Saved scripts (B4 script builder), newest first. */
  scripts(userId: string, pack: string): Promise<SavedScript[]>;
  script(id: string): Promise<SavedScript | null>;
  saveScript(input: Omit<SavedScript, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedScript>;
  deleteScript(id: string, userId: string): Promise<boolean>;
}
