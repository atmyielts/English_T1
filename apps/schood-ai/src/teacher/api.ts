import type { KeyCheckReport, Material, MaterialBrief, SolverComparison } from '../../../../packages/ai-core/src/materials/mod.ts';
import { api, type ActionView } from '../core/index.ts';

// Typed calls to /schood-ai/teacher/*. The function is the source of truth for every
// check; the app shows what it returns and never trusts its own copy of a cost.

export interface MaterialJob {
  id: string; feature: string; status: 'requested' | 'generating' | 'ready' | 'approved' | 'rejected' | 'failed';
  kind: string; level: string | null; topic: string | null; title: string | null; brief: Partial<MaterialBrief>; credits: number; error_code: string | null;
  progress: { phase: 'generate' | 'solve' | 'done'; done: number; total: number; solve_done: number; solve_total: number; running: boolean; revision: number; rechecks_left: number };
  material: Material | null;
  verification: { checks: KeyCheckReport; solver: (SolverComparison & { status: 'done' | 'skipped' | 'partial' }) | null; clean: boolean; stale: string[]; edited: boolean } | null;
  focus: { classroom_name: string | null; tags: string[] } | null; focus_unavailable: boolean; page_id: string | null;
  derived: { key: { version: string; number: number; question: string; answer: string; explanation?: string }[]; playable: number; assessment_items: number } | null;
  created_at: string; updated_at: string; decided_at: string | null;
}
export type MaterialSummary = Omit<MaterialJob, 'material' | 'derived' | 'verification'> & { issues: number | null };
export interface AcademyGroup { academy_id: string; academy_name: string; classroom_id: string; name: string; students: number | null }
export interface WeakSpot { tag: string; open: number; total: number; label: string }

type Ws = string | null;
const opts = (workspaceId: Ws) => ({ workspaceId });

export const createMaterial = (workspaceId: Ws, body: { brief: MaterialBrief; academy?: { academy_id: string; classroom_id: string; classroom_name?: string }; images?: string[]; page_text?: string }, idempotencyKey: string) =>
  api<{ material: MaterialJob }>('teacher/materials', { ...opts(workspaceId), body, idempotencyKey, timeoutMs: 90_000 }).then((result) => result.material);
export const stepMaterial = (workspaceId: Ws, id: string, images?: string[]) =>
  api<{ material: MaterialJob }>('teacher/material-step', { ...opts(workspaceId), body: { id, ...(images?.length ? { images } : {}) }, timeoutMs: 90_000 }).then((result) => result.material);
export const getMaterial = (workspaceId: Ws, id: string) => api<{ material: MaterialJob }>('teacher/material', { ...opts(workspaceId), query: { id } }).then((result) => result.material);
export const listMaterials = (workspaceId: Ws, query: { q?: string; kind?: string; status?: string } = {}) => api<{ materials: MaterialSummary[] }>('teacher/materials', { ...opts(workspaceId), query }).then((result) => result.materials);
export const editMaterial = (workspaceId: Ws, id: string, material: Material, updatedAt: string) => api<{ material: MaterialJob }>('teacher/material', { ...opts(workspaceId), method: 'PATCH', body: { id, material, updated_at: updatedAt } }).then((result) => result.material);
export const recheckMaterial = (workspaceId: Ws, id: string) => api<{ material: MaterialJob }>('teacher/material-recheck', { ...opts(workspaceId), body: { id }, timeoutMs: 90_000 }).then((result) => result.material);
export const decideMaterial = (workspaceId: Ws, id: string, decision: 'approve' | 'reject') => api<{ status: string; page_id: string | null }>('teacher/material-decide', { ...opts(workspaceId), body: { id, decision } });

export const exportTelegram = (workspaceId: Ws, pageId: string, key: boolean) => api<{ messages: string[] }>('teacher/export', { ...opts(workspaceId), body: { page_id: pageId, to: 'telegram', key } }).then((result) => result.messages);
export const notePrint = (workspaceId: Ws, pageId: string) => api<{ ok: boolean }>('teacher/export', { ...opts(workspaceId), body: { page_id: pageId, to: 'print' } });
export const createHandout = (workspaceId: Ws, pageId: string) => api<{ handout: { id: string; url: string } }>('teacher/export', { ...opts(workspaceId), body: { page_id: pageId, to: 'handout' } }).then((result) => result.handout);
export const proposeHomework = (workspaceId: Ws, body: { page_id: string; academy_id: string; classroom_id: string; due_at?: string | null; instructions?: string; title?: string; max_score?: number }) =>
  api<{ action: ActionView }>('teacher/export', { ...opts(workspaceId), body: { ...body, to: 'homework' } }).then((result) => result.action);
export const proposeAssessment = (workspaceId: Ws, body: { page_id: string; tenant_id: string; bank_id: string }) =>
  api<{ action: ActionView }>('teacher/export', { ...opts(workspaceId), body: { ...body, to: 'assessment' } }).then((result) => result.action);
export const academyGroups = (workspaceId: Ws) => api<{ groups: AcademyGroup[]; unavailable: boolean }>('teacher/academy-groups', opts(workspaceId));
export const weakSpots = (workspaceId: Ws, academyId: string, classroomId: string) => api<{ spots: WeakSpot[]; unavailable: boolean }>('teacher/weak-spots', { ...opts(workspaceId), query: { academy_id: academyId, classroom_id: classroomId } });
export const assessmentBanks = (workspaceId: Ws) => api<{ tenants: { tenant_id: string; name: string; role: string; banks: { id: string; title: string }[] }[]; unavailable: boolean }>('teacher/assessment-banks', opts(workspaceId));
export const getHandout = (token: string) => api<{ material: Material; workspace: { name: string | null; branding: { logo_url: string | null; primary_color: string | null } } | null }>('teacher/handout', { query: { token } });

// --- Live Quiz ------------------------------------------------------------------------------
export interface HostQuiz {
  id: string; title: string; code: string; status: 'lobby' | 'question' | 'reveal' | 'finished'; index: number; total: number; seconds: number; remaining_ms: number;
  class_label: string | null; question: { prompt: string; options: { id: string; text: string }[]; context: string | null; answer?: string; explanation?: string | null } | null;
  answered: number; counts: Record<string, number> | null; players: number; leaderboard: { rank: number; nickname: string; score: number; correct: number }[]; created_at: string; finished_at: string | null;
}
export interface PlayState {
  title: string; status: HostQuiz['status']; index: number; total: number; remaining_ms: number; seconds: number;
  question: { prompt: string; options: { id: string; text: string }[]; answer?: string; explanation?: string | null } | null;
  my_answer: { choice: string; correct?: boolean; points?: number } | null; me: { nickname: string; score: number; correct: number; rank: number };
  players: number; leaderboard: { rank: number; nickname: string; score: number; correct: number }[];
}
export const openQuiz = (workspaceId: Ws, body: { page_id: string; seconds?: number; class_label?: string }) => api<{ quiz: HostQuiz }>('teacher/quiz', { ...opts(workspaceId), body }).then((result) => result.quiz);
export const hostQuiz = (workspaceId: Ws, id: string) => api<{ quiz: HostQuiz }>('teacher/quiz', { ...opts(workspaceId), query: { id }, timeoutMs: 8_000 }).then((result) => result.quiz);
export const controlQuiz = (workspaceId: Ws, id: string, command: 'start' | 'reveal' | 'next' | 'finish' | 'remove_player', playerId?: string) =>
  api<{ quiz: HostQuiz }>('teacher/quiz-control', { ...opts(workspaceId), body: { id, command, ...(playerId ? { player_id: playerId } : {}) } }).then((result) => result.quiz);
export const listQuizzes = (workspaceId: Ws) => api<{ quizzes: { id: string; title: string; code: string | null; status: HostQuiz['status']; class_label: string | null; questions: number; players: number; created_at: string; finished_at: string | null }[] }>('teacher/quiz-sessions', opts(workspaceId)).then((result) => result.quizzes);
export const quizResults = (workspaceId: Ws, id: string) => api<{
  quiz: { id: string; title: string; status: string; class_label: string | null; created_at: string; finished_at: string | null };
  players: { id: string; rank: number; nickname: string; signed_in: boolean; score: number; correct: number; answered: number; answers: { index: number; choice: string; correct: boolean; points: number }[] }[];
  questions: { index: number; prompt: string; answer: string; options: { id: string; text: string }[]; answered: number; correct: number }[];
}>('teacher/quiz-results', { ...opts(workspaceId), query: { id } });
// Players always act in their own personal workspace.
export const joinQuiz = (code: string, nickname: string) => api<{ joined: { session_id: string; nickname: string; token: string | null } }>('teacher/quiz-join', { body: { code, nickname } }).then((result) => result.joined);
export const playQuiz = (sessionId: string, token: string | null) => api<{ play: PlayState }>('teacher/quiz-play', { body: { session_id: sessionId, ...(token ? { token } : {}) }, timeoutMs: 6_000 }).then((result) => result.play);
export const answerQuiz = (sessionId: string, token: string | null, index: number, choice: string) => api<{ answered: { index: number; choice: string } }>('teacher/quiz-answer', { body: { session_id: sessionId, index, choice, ...(token ? { token } : {}) } });

// --- Marking ------------------------------------------------------------------------------------
export interface Rubric { id: string; mode: 'writing' | 'speaking'; label: string; criteria: { id: string; name: string; max: number; step: number }[]; overall: string; schood?: true }
export interface MarkDraft { criteria: { id: string; mark: number; comment: string; evidence: string[] }[]; overall: { value: number; scale: string }; comments: string; fixes: string[]; level_estimate: string | null; transcript_note?: string }
export interface ScriptView {
  id: string; student_label: string; source: 'typed' | 'pasted' | 'photo' | 'recording' | 'transcript'; text: string | null; status: 'new' | 'marking' | 'marked' | 'failed' | 'confirmed'; error_code: string | null;
  draft: MarkDraft | null; final: { marks: Record<string, number>; overall: { value: number; scale: string }; comments: string; fixes: string[] } | null;
  signals: { signals: { signal: string; severity: 'info' | 'review'; detail: Record<string, unknown> }[]; explain_it: string[]; checked_at: string } | null;
  confirmed_at: string | null; created_at: string; updated_at: string;
}
export interface BatchView { id: string; title: string; rubric: string; task: string; level: string | null; feedback_language: 'en' | 'uz' | 'ru'; status: string; created_at: string; updated_at: string }
export const listBatches = (workspaceId: Ws) => api<{ batches: (BatchView & { scripts: number; confirmed: number })[]; rubrics: Rubric[] }>('teacher/marking', opts(workspaceId));
export const getBatch = (workspaceId: Ws, id: string) => api<{ batch: BatchView; rubric: Rubric | null; scripts: ScriptView[] }>('teacher/marking', { ...opts(workspaceId), query: { id } });
export const createBatch = (workspaceId: Ws, body: { title: string; rubric: string; task?: string; level?: string; feedback_language: string }) => api<{ batch: BatchView }>('teacher/marking', { ...opts(workspaceId), body }).then((result) => result.batch);
export const addScript = (workspaceId: Ws, body: { batch_id: string; student_label: string; source: ScriptView['source']; text?: string; meta?: Record<string, number> }) => api<{ script: ScriptView }>('teacher/marking-script', { ...opts(workspaceId), body }).then((result) => result.script);
export const saveScript = (workspaceId: Ws, body: { id: string; text?: string; student_label?: string; final?: { marks: Record<string, number>; comments: string; fixes: string[] }; confirm?: boolean }) => api<{ script: ScriptView }>('teacher/marking-script', { ...opts(workspaceId), method: 'PATCH', body }).then((result) => result.script);
export const deleteScript = (workspaceId: Ws, id: string) => api<{ deleted: boolean }>('teacher/marking-script', { ...opts(workspaceId), method: 'DELETE', body: { id } });
export const markScript = (workspaceId: Ws, id: string, images?: string[]) => api<{ script: ScriptView; credits: number }>('teacher/marking-run', { ...opts(workspaceId), body: { script_id: id, ...(images?.length ? { images } : {}) }, timeoutMs: 90_000, idempotencyKey: `mark-${id}-${Date.now()}` });
export const markRecording = (workspaceId: Ws, body: { batch_id: string; student_label: string; mime: string; audio: string }) => api<{ script: ScriptView; credits: number }>('teacher/marking-audio', { ...opts(workspaceId), body, timeoutMs: 120_000, idempotencyKey: crypto.randomUUID() });
export const scriptSignals = (workspaceId: Ws, id: string) => api<{ script: ScriptView; credits: number }>('teacher/marking-signals', { ...opts(workspaceId), body: { script_id: id }, timeoutMs: 60_000 });
export const writeFeedback = (workspaceId: Ws, body: { purpose: string; language: string; tone: string; words: number; student_label: string; marks: { what: string; mark: string }[]; notes?: string }) =>
  api<{ comment: string; credits: number }>('teacher/feedback', { ...opts(workspaceId), body, timeoutMs: 60_000, idempotencyKey: crypto.randomUUID() });

// --- Channel autopilot ----------------------------------------------------------------------------
export interface ChannelPostView { id: string; kind: 'word' | 'quiz' | 'tip'; content: { text?: string; poll?: { question: string; options: string[]; correct: number; explanation?: string } }; scheduled_for: string; status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'; message_id: string | null; attempts: number; last_error: string | null; sent_at: string | null }
export interface ChannelWeek { id: string; week_start: string; status: 'generating' | 'draft' | 'proposed' | 'approved' | 'cancelled'; action_id: string | null; credits: number; posts: ChannelPostView[] }
export interface ChannelView { id: string; chat_id: string; title: string; username: string | null; voice: string; language: 'en' | 'uz' | 'ru'; level: string; topics: string; schedule: { time: string; days: number[]; kinds: ('word' | 'quiz' | 'tip')[] }; status: 'pending' | 'verified' | 'error'; verified_at: string | null; last_error: string | null; batches?: ChannelWeek[] }
export const listChannels = (workspaceId: Ws) => api<{ channels: ChannelView[]; bot: { configured: boolean; username: string | null }; next_week: string }>('teacher/channels', opts(workspaceId));
export const connectChannel = (workspaceId: Ws, body: Record<string, unknown>) => api<{ channel: ChannelView }>('teacher/channels', { ...opts(workspaceId), body }).then((result) => result.channel);
export const updateChannel = (workspaceId: Ws, body: Record<string, unknown>) => api<{ channel: ChannelView }>('teacher/channels', { ...opts(workspaceId), method: 'PATCH', body }).then((result) => result.channel);
export const removeChannel = (workspaceId: Ws, id: string) => api<{ deleted: boolean }>('teacher/channels', { ...opts(workspaceId), method: 'DELETE', body: { id } });
export const verifyChannel = (workspaceId: Ws, id: string) => api<{ channel: ChannelView }>('teacher/channel-verify', { ...opts(workspaceId), body: { id } }).then((result) => result.channel);
export const planWeek = (workspaceId: Ws, channelId: string, weekStart?: string) => api<{ batch: ChannelWeek }>('teacher/channel-week', { ...opts(workspaceId), body: { channel_id: channelId, ...(weekStart ? { week_start: weekStart } : {}) } }).then((result) => result.batch);
export const writePost = (workspaceId: Ws, postId: string) => api<{ post: ChannelPostView; credits: number }>('teacher/channel-post-write', { ...opts(workspaceId), body: { post_id: postId }, timeoutMs: 60_000 });
export const editPost = (workspaceId: Ws, body: { id: string; content?: ChannelPostView['content']; cancel?: boolean }) => api<{ post: ChannelPostView }>('teacher/channel-post', { ...opts(workspaceId), method: 'PATCH', body }).then((result) => result.post);
export const proposeWeek = (workspaceId: Ws, batchId: string) => api<{ action: ActionView }>('teacher/channel-approve', { ...opts(workspaceId), body: { batch_id: batchId } }).then((result) => result.action);
export const dispatchPosts = (workspaceId: Ws) => api<{ dispatched: { sent: number; failed: number; deferred: number } }>('teacher/channel-dispatch', { ...opts(workspaceId), body: {} });

// --- Marketplace ---------------------------------------------------------------------------------
export interface ListingCard { id: string; title: string; description: string; kind: string; level: string; exam: string | null; language: string; tags: string[]; price_uzs: number; seller_name: string; rating: number | null; ratings: number; verified_uses: number; copies: number; status: string; published_at: string | null }
export interface ListingPreview { blocks: string[]; questions: number; variants: number; aims: string[]; excerpt: string | null; sample: { prompt: string; options: string[] }[] }
export const searchMarket = (workspaceId: Ws, query: Record<string, string | undefined>) => api<{ listings: ListingCard[]; total: number; page: number; paid_enabled: boolean }>('teacher/market', { ...opts(workspaceId), query });
export const getListing = (workspaceId: Ws, id: string) => api<{ listing: ListingCard & { preview: ListingPreview | null; moderation_note: string | null }; ratings: { stars: number; comment: string | null; mine: boolean; created_at: string }[]; mine: { seller: boolean; copy_id: string | null; rated: boolean }; paid_enabled: boolean }>('teacher/market-listing', { ...opts(workspaceId), query: { id } });
export const acquireListing = (workspaceId: Ws, id: string) => api<{ copy: { page_id: string; created: boolean } }>('teacher/market-acquire', { ...opts(workspaceId), body: { id } }).then((result) => result.copy);
export const rateListing = (workspaceId: Ws, id: string, stars: number, comment?: string) => api<{ listing: ListingCard }>('teacher/market-rate', { ...opts(workspaceId), body: { id, stars, ...(comment ? { comment } : {}) } });
export const proposeListing = (workspaceId: Ws, body: { page_id: string; title: string; description: string; tags: string[]; price_uzs: number }) => api<{ action: ActionView }>('teacher/market-list', { ...opts(workspaceId), body }).then((result) => result.action);
export const myListings = (workspaceId: Ws) => api<{ listings: (ListingCard & { moderation_note: string | null; source_page_id: string | null })[]; ledger: { id: number; listing_id: string; gross_uzs: number; commission_uzs: number | null; net_uzs: number | null; status: string; created_at: string }[]; totals: { gross_pending_uzs: number; commission_rate: number | null }; paid_enabled: boolean }>('teacher/market-mine', opts(workspaceId));
export const withdrawListing = (workspaceId: Ws, id: string) => api<{ listing: ListingCard }>('teacher/market-withdraw', { ...opts(workspaceId), body: { id } });
export const moderationQueue = () => api<{ queue: (ListingCard & { material: Material; checks: KeyCheckReport | null; submitted_at: string })[] }>('teacher/market-moderation');
export const moderate = (id: string, decision: 'publish' | 'reject', note?: string) => api<{ listing: ListingCard }>('teacher/market-moderation', { body: { id, decision, ...(note ? { note } : {}) } });

// --- Brand kit ------------------------------------------------------------------------------------
export interface BrandProfileView { display_name: string; subjects: string; city: string; experience_years: number | null; format: string; contact: string; about: string; updated_at: string }
export interface TutorResultView { id: string; student_label: string; consent: boolean; exam: string; score: string; previous_score: string | null; achieved_on: string; note: string | null }
export const getBrand = (workspaceId: Ws) => api<{ profile: BrandProfileView | null; results: TutorResultView[] }>('teacher/brand', opts(workspaceId));
export const saveBrand = (workspaceId: Ws, body: Record<string, unknown>) => api<{ profile: BrandProfileView }>('teacher/brand', { ...opts(workspaceId), method: 'PUT', body }).then((result) => result.profile);
export const addResult = (workspaceId: Ws, body: Record<string, unknown>) => api<{ result: TutorResultView }>('teacher/brand-results', { ...opts(workspaceId), body }).then((result) => result.result);
export const deleteResult = (workspaceId: Ws, id: string) => api<{ deleted: boolean }>('teacher/brand-results', { ...opts(workspaceId), method: 'DELETE', body: { id } });
export const writeBrand = (workspaceId: Ws, body: Record<string, unknown>) => api<{ text: string; hashtags: string[]; flags: { invented_numbers: string[] } | null; credits: number }>('teacher/brand-write', { ...opts(workspaceId), body, timeoutMs: 60_000, idempotencyKey: crypto.randomUUID() });

/** A file read as a data URL (page photos, script photos), resized when it is large so uploads stay small on weak connections. */
export async function imageDataUrl(file: File, maxSide = 1800): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  if (file.size < 1_200_000) return raw;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = raw; });
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
export async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
