import { candidateModels, modeCapabilities, pickRoute } from '../../../../packages/ai-core/src/mod.ts';
import { buildSpeakingRequest, parseSpeakingAnswers, parseSpeakingMark, speakingTooShort, type ExamPaper } from '../../_shared/english-exam.ts';
import { examLevelFor, SPEAKING_PREP_SECONDS, SPEAKING_TALK_SECONDS, speakingScore } from '../../_shared/english-exam-format.ts';
import { buildFinishRequest, buildTurnRequest, parseFinishOutput, parseTurnOutput, readMessages, ROLEPLAY_MIN_TURNS, ROLEPLAY_SCENARIOS, type RoleplayScenario } from '../../_shared/english-roleplay.ts';
import {
  buildMockScoringRequest, MOCK_PREP_SECONDS, MOCK_TALK_SECONDS, mockAnswersProblem, parseMockScore, pickMockQuestions, seededRandom, type MockAnswer, type MockAnswers, type MockQuestions,
} from '../../_shared/english-speaking-mock.ts';
import { integer, oneOf, record, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { audioFrom, base64, countWords, isCefr, looseObject, ownRecord, quoted, receipt, requireLearner, saveRecord, store, systemFor, track, wrapUserMessage, type Cefr } from './common.ts';
import { conversationScenario, INTERVIEW_KINDS, INTERVIEWS, MULTILEVEL_SETS, type InterviewKind } from './data/speaking.ts';
import type { RecordRow } from './store.ts';
import { recordWeeklyVoice } from '../seams/samples.ts';

// Speaking partner (L4) and interview simulator (L12). One session engine:
//   conversation / roleplay / interview: the partner talks back each turn
//     (speaking.turn or interview.turn), and a written review closes the session;
//   ielts_mock / multilevel_mock: real test flow and timing (IELTS Part 1 six
//     questions, Part 2 cue card with 1 minute to prepare and 2 to talk, Part 3
//     three questions; Multilevel Q1–Q8 with the official answer and preparation
//     times). Answers are recorded without a model call; the report costs one
//     speaking.mock_report.
// Speech: the provider's speech-to-text and text-to-speech when the owner has set
// them up (ctx.ai.transcribe/speak); otherwise the browser's Web Speech API sends
// text, and typing always works. Every report quotes the learner's own words.

export const MODES = ['conversation', 'roleplay', 'interview', 'ielts_mock', 'multilevel_mock'] as const;
type Mode = (typeof MODES)[number];
const MAX_TURNS = 20;
const isMock = (mode: Mode) => mode === 'ielts_mock' || mode === 'multilevel_mock';
const featureOf = (mode: Mode) => (mode === 'interview' ? 'L12' : 'L4');

interface PlanItem { part: string; question: string; prep: number; talk: number; points?: string[]; scene?: string }
interface Answer { text: string; mode: 'speech' | 'typed' | 'audio'; seconds: number | null; words: number }
interface SessionState {
  [key: string]: unknown;
  messages?: { role: 'partner' | 'learner'; text: string }[];
  goals_met?: string[];
  tips?: { said: string; better: string }[];
  plan?: PlanItem[];
  answers?: Answer[];
  step?: number;
  questions?: MockQuestions;
  set_id?: string;
}

/** Whether the owner has set up speech for this feature (no cap slot is used). */
export async function speechStatus(ctx: RequestContext): Promise<{ stt: boolean; tts: boolean }> {
  const registry = await ctx.repo.registry();
  const ready = (mode: 'stt' | 'tts') => {
    const route = pickRoute(registry.routes, 'speaking.turn', 'standard', mode);
    if (!route) return false;
    return candidateModels(registry, route, { capabilities: modeCapabilities(mode), noTraining: false }).candidates.some((entry) => ctx.gateway.keyConfigured(entry.provider));
  };
  return { stt: ready('stt'), tts: ready('tts') };
}

function scenarioOf(row: RecordRow): RoleplayScenario {
  const input = row.input as { mode: Mode; scenario?: string; topic?: string; interview?: InterviewKind };
  if (input.mode === 'interview') return INTERVIEWS[input.interview ?? 'job'];
  if (input.mode === 'roleplay') return ROLEPLAY_SCENARIOS.find((entry) => entry.id === input.scenario) ?? ROLEPLAY_SCENARIOS[0];
  return conversationScenario(input.topic ?? '');
}

function mockPlan(mode: Mode, seed: number): { plan: PlanItem[]; questions?: MockQuestions; setId?: string } {
  if (mode === 'ielts_mock') {
    const questions = pickMockQuestions(seededRandom(seed));
    return {
      questions,
      plan: [
        ...questions.part1.map((entry) => ({ part: '1', question: entry.question, prep: 0, talk: 30 })),
        { part: '2', question: questions.part2.prompt, points: questions.part2.points, prep: MOCK_PREP_SECONDS, talk: MOCK_TALK_SECONDS },
        ...questions.part3.map((question) => ({ part: '3', question, prep: 0, talk: 60 })),
      ],
    };
  }
  const set = MULTILEVEL_SETS[seed % MULTILEVEL_SETS.length];
  const questions = [...set.part11, ...set.part12.questions, set.part2.questions.join(' '), `${set.part3.statement} Points for: ${set.part3.for.join('; ')}. Points against: ${set.part3.against.join('; ')}.`];
  return {
    setId: set.id,
    plan: questions.map((question, index) => ({
      part: index < 3 ? '1.1' : index < 6 ? '1.2' : index === 6 ? '2' : '3', question, prep: SPEAKING_PREP_SECONDS[index], talk: SPEAKING_TALK_SECONDS[index],
      ...(index >= 3 && index < 6 ? { scene: set.part12.scene } : index === 6 ? { scene: set.part2.scene } : {}),
    })),
  };
}

export function sessionView(row: RecordRow) {
  const input = row.input as { mode: Mode; level?: string; interview?: InterviewKind; scenario?: string; topic?: string };
  const state = row.state as SessionState;
  const scenario = isMock(input.mode) ? null : scenarioOf(row);
  return {
    id: row.id, mode: input.mode, status: row.status, level: input.level ?? null, interview: input.interview ?? null, scenario: input.scenario ?? null, topic: input.topic ?? null,
    title: scenario ? scenario.title : null, situation: scenario ? scenario.situation : null, role_card: scenario ? scenario.role_card : null,
    goals: scenario ? scenario.goals.map((goal) => ({ id: goal.id, text: goal.text, met: (state.goals_met ?? []).includes(goal.id) })) : [],
    practice_note: input.mode === 'interview' ? INTERVIEWS[input.interview ?? 'job'].practiceNote : null,
    messages: state.messages ?? [], tips: state.tips ?? [],
    plan: state.plan ?? [], step: state.step ?? 0, answered: (state.answers ?? []).length,
    report: row.output.report ?? null, created_at: row.createdAt,
  };
}

const levelOf = (value: unknown): Cefr => (isCefr(value) ? value : 'B1');

// GET learner/speaking: sessions, scenarios, interviews and whether server speech is set up; ?id= for one session.
export async function listSpeaking(ctx: RequestContext) {
  const access = await ctx.workspace();
  const id = ctx.query.get('id');
  if (id) return { session: sessionView(await ownRecord(ctx, access, uuid(id, 'id'), 'speaking')) };
  const rows = await store(ctx).records(ctx.user.id, { kind: 'speaking', workspaceId: access.workspace.id, limit: 12 });
  return {
    sessions: rows.map((row) => ({ id: row.id, mode: row.input.mode, status: row.status, interview: row.input.interview ?? null, title: isMock(row.input.mode as Mode) ? null : scenarioOf(row).title, score: (row.output.report as { score?: number } | undefined)?.score ?? null, created_at: row.createdAt })),
    scenarios: ROLEPLAY_SCENARIOS.map((entry) => ({ id: entry.id, title: entry.title, situation: entry.situation, levels: entry.levels })),
    interviews: INTERVIEW_KINDS.map((kind) => ({ kind, title: INTERVIEWS[kind].title, situation: INTERVIEWS[kind].situation, note: INTERVIEWS[kind].practiceNote })),
    mocks: { ielts: { part1: 6, prep: MOCK_PREP_SECONDS, talk: MOCK_TALK_SECONDS, part3: 3 }, multilevel: { talk: SPEAKING_TALK_SECONDS, prep: SPEAKING_PREP_SECONDS } },
    speech: await speechStatus(ctx),
  };
}

// POST learner/speaking-start { mode, level?, topic?, scenario?, interview? }: free; the first line is static.
export async function startSpeaking(ctx: RequestContext) {
  const body = record(await ctx.body());
  const mode = oneOf(body.mode, 'mode', MODES);
  const access = await requireLearner(ctx, featureOf(mode));
  const level = levelOf(body.level);
  const input: Record<string, unknown> = { mode, level };
  const state: SessionState = {};
  if (mode === 'roleplay') {
    const scenario = ROLEPLAY_SCENARIOS.find((entry) => entry.id === body.scenario);
    if (!scenario) throw new SchoodAIError('invalid_request', 'Pick a role-play.', 400, { field: 'scenario' });
    input.scenario = scenario.id;
  }
  if (mode === 'interview') input.interview = oneOf(body.interview, 'interview', INTERVIEW_KINDS);
  if (mode === 'conversation') input.topic = text(body.topic ?? 'everyday life', 'topic', { max: 80 });
  if (isMock(mode)) {
    const recent = await store(ctx).records(ctx.user.id, { kind: 'speaking', workspaceId: access.workspace.id, limit: 10 });
    const seed = recent.filter((row) => row.input.mode === mode).length + Math.floor(ctx.now().getTime() / 86_400_000);
    const built = mockPlan(mode, seed);
    Object.assign(state, { plan: built.plan, step: 0, answers: [], ...(built.questions ? { questions: built.questions } : {}), ...(built.setId ? { set_id: built.setId } : {}) });
  }
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'speaking', status: 'active', input, state });
  if (!isMock(mode)) {
    const opening = scenarioOf(row).opening;
    return { session: sessionView(await saveRecord(ctx, row, { state: { ...state, messages: [{ role: 'partner', text: opening }], goals_met: [], tips: [] } })) };
  }
  return { session: sessionView(row) };
}

const TURN_SCHEMA = {
  properties: { reply: { type: 'string' }, goals_met: { type: 'array', items: { type: 'string' } }, tip: { type: ['object', 'null'], properties: { said: { type: 'string' }, better: { type: 'string' } } }, end: { type: 'boolean' } },
  required: ['reply'],
};

// POST learner/speaking-turn { id, text? | audio+mime, seconds?, mode?, voice? }
export async function speakingTurn(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await ctx.workspace();
  const row = await ownRecord(ctx, access, uuid(body.id, 'id'), 'speaking');
  const mode = row.input.mode as Mode;
  if (row.status !== 'active') throw new SchoodAIError('session_finished', 'This session has finished.', 409);
  await requireLearner(ctx, mode === 'interview' ? 'interview.turn' : 'speaking.turn');
  const audio = audioFrom(body);
  const typed = audio ? null : text(body.text, 'text', { max: 3000 });
  const seconds = body.seconds === undefined || body.seconds === null ? null : integer(body.seconds, 'seconds', 0, 600);
  const spoken: Answer['mode'] = audio ? 'audio' : body.mode === 'speech' ? 'speech' : 'typed';
  const state = structuredClone(row.state) as SessionState;

  if (isMock(mode)) {
    const step = state.step ?? 0, plan = state.plan ?? [];
    if (step >= plan.length) throw new SchoodAIError('session_complete', 'Every question is answered. Finish the mock for your report.', 409);
    let said = typed ?? '', charge: { credits: number; balance: number } | null = null;
    if (audio) {
      const out = await ctx.ai.transcribe({ key: 'speaking.turn', audio: audio.audio, mime: audio.mime, language: 'en', reference: `speaking:${row.id}:${step}` });
      said = out.transcript.text.trim();
      charge = receipt(out);
      // Engage's then-vs-now: one recording a week per feature (seams/samples.ts).
      recordWeeklyVoice(ctx, { key: `learner:${featureOf(mode)}`, feature: featureOf(mode), audio: audio.audio, mime: audio.mime, transcript: said, durationSec: seconds ?? out.transcript.durationSec ?? 0 });
    }
    state.answers = [...(state.answers ?? []).slice(0, step), { text: said.slice(0, 3000), mode: spoken, seconds, words: countWords(said) }];
    state.step = step + 1;
    const saved = await saveRecord(ctx, row, { state });
    return { session: sessionView(saved), transcript: said, ...(charge ?? { credits: 0 }) };
  }

  const learnerTurns = (state.messages ?? []).filter((message) => message.role === 'learner').length;
  if (learnerTurns >= MAX_TURNS) throw new SchoodAIError('session_long', 'This session is long enough. Finish it for your review.', 409);
  const scenario = scenarioOf(row), level = levelOf(row.input.level);
  const history = readMessages(state.messages ?? []);
  const out = await ctx.ai.charged({ key: mode === 'interview' ? 'interview.turn' : 'speaking.turn', mode: audio ? 'stt' : 'json', reference: `speaking:${row.id}:${learnerTurns}` }, async (session) => {
    const said = audio ? (await session.transcribe({ audio: audio.audio, mime: audio.mime, language: 'en' })).text.trim() : typed!;
    if (!/[a-z]/i.test(said)) throw new SchoodAIError('nothing_heard', 'We could not hear any English. Try again.', 422);
    const request = buildTurnRequest(scenario, level, history, said.slice(0, 500));
    const raw = await session.json({
      messages: [{ role: 'system', content: systemFor(ctx, access, { name: `${scenario.partner.name}, ${scenario.partner.role}`, instructions: [request.systemPrompt] }) }, { role: 'user', content: wrapUserMessage(request.userPayload) }],
      schema: looseObject(TURN_SCHEMA), temperature: request.temperature, maxTokens: 400,
    });
    const turn = parseTurnOutput(raw, scenario, said);
    if (!turn) throw new SchoodAIError('ai_failed', 'The AI could not answer just now. Your credits were returned.', 502);
    let voice: { audio: string; mime: string } | null = null;
    if (body.voice === true) {
      try { const spokenReply = await session.speak({ text: turn.reply, format: 'mp3' }); voice = { audio: base64(spokenReply.audio), mime: spokenReply.mime }; } catch { voice = null; }
    }
    return { said, turn, voice };
  });
  const { said, turn, voice } = out.result;
  // Engage's then-vs-now: one recording a week per feature, conversations (L4) and interviews (L12) alike.
  if (audio) recordWeeklyVoice(ctx, { key: `learner:${featureOf(mode)}`, feature: featureOf(mode), audio: audio.audio, mime: audio.mime, transcript: said, durationSec: seconds ?? 0 });
  state.messages = [...(state.messages ?? []), { role: 'learner', text: said.slice(0, 800) }, { role: 'partner', text: turn.reply }];
  state.goals_met = [...new Set([...(state.goals_met ?? []), ...turn.goals_met])];
  if (turn.tip) state.tips = [...(state.tips ?? []), turn.tip].slice(-10);
  const saved = await saveRecord(ctx, row, { state });
  return { session: sessionView(saved), transcript: said, reply: turn.reply, tip: turn.tip, end: turn.end, voice, ...receipt(out) };
}

const EVIDENCE_RULE = 'Also return "evidence": {"fluency": [...], "lexical": [...], "grammar": [...]} with up to 2 short exact quotes per criterion, copied from the learner\'s answers, that show why you gave that band.';
const MOCK_SCHEMA = { properties: { bands: { type: 'object' }, comments: { type: 'object' }, priorities: { type: 'array' }, fixes: { type: 'array' }, evidence: { type: 'object' } }, required: ['bands'] };
const ML_SCHEMA = { properties: { q1_3: { type: 'object' }, q4_6: { type: 'object' }, q7: { type: 'object' }, q8: { type: 'object' }, priorities: { type: 'array' }, fixes: { type: 'array' } }, required: ['q1_3', 'q4_6', 'q7', 'q8'] };
const REVIEW_SCHEMA = { properties: { goals: { type: 'array' }, fixes: { type: 'array' }, phrases: { type: 'array' }, summary: { type: 'string' }, score: { type: 'number' } }, required: ['goals'] };
const INTERVIEW_SCHEMA = {
  properties: {
    criteria: { type: 'array', items: { type: 'object', properties: { key: { enum: ['clarity', 'relevance', 'specificity', 'confidence', 'language'] }, score: { type: 'number' }, comment: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } } } },
    best: { type: 'object', properties: { quote: { type: 'string' }, why: { type: 'string' } } },
    improve: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, said: { type: 'string' }, better: { type: 'string' }, why: { type: 'string' } } } },
    next_steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['criteria'],
};

// Hesitation sounds and set fillers only: "like" and "I mean" are usually real words.
const FILLERS = /(?<!\p{L})(u+m+|u+h+|e+r+m+|e{2,}|a{2,}h*|you know|tipa|типа|anu)(?!\p{L})/giu;
/** Words per minute (spoken answers with a duration), fillers and the longest answer. */
export function fluencyNumbers(answers: Answer[]) {
  const timed = answers.filter((answer) => answer.mode !== 'typed' && answer.seconds && answer.seconds >= 5);
  const words = timed.reduce((sum, answer) => sum + answer.words, 0), seconds = timed.reduce((sum, answer) => sum + (answer.seconds ?? 0), 0);
  const all = answers.map((answer) => answer.text).join(' ');
  const fillers = (all.match(FILLERS) ?? []).length, total = countWords(all);
  return {
    words_per_minute: seconds >= 20 ? Math.round(words / (seconds / 60)) : null,
    fillers, filler_rate: total ? Math.round((fillers / total) * 1000) / 10 : 0,
    words: total, longest_answer: Math.max(0, ...answers.map((answer) => answer.words)),
  };
}
const evidenceFrom = (raw: unknown, learnerText: string, keys: readonly string[]) => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(keys.map((key) => [key, (Array.isArray(source[key]) ? source[key] as unknown[] : []).map((entry) => String(entry ?? '').trim().slice(0, 200)).filter((quote) => quoted(quote, learnerText)).slice(0, 2)]));
};

// POST learner/speaking-finish { id }: the written report.
export async function finishSpeaking(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await ctx.workspace();
  const row = await ownRecord(ctx, access, uuid(body.id, 'id'), 'speaking');
  const mode = row.input.mode as Mode;
  if (row.status === 'finished') return { session: sessionView(row) };
  const state = row.state as SessionState;
  const level = levelOf(row.input.level);
  let report: Record<string, unknown>, score: number, minutes: number, key: string;

  if (isMock(mode)) {
    const answers = state.answers ?? [];
    const plan = state.plan ?? [];
    const learnerText = answers.map((answer) => answer.text).join(' ');
    minutes = Math.max(1, Math.round(answers.reduce((sum, answer) => sum + (answer.seconds ?? answer.words / 2), 0) / 60));
    const fluency = fluencyNumbers(answers);
    key = 'speaking.mock_report';
    await requireLearner(ctx, key);
    if (mode === 'ielts_mock') {
      const toMock = (answer: Answer | undefined, question: string): MockAnswer => ({ question, text: answer?.text ?? '', mode: answer?.mode === 'typed' || !answer ? 'typed' : 'speech', seconds: answer?.seconds ?? null, words: answer?.words ?? 0 });
      const mock: MockAnswers = { part1: plan.slice(0, 6).map((item, i) => toMock(answers[i], item.question)), part2: toMock(answers[6], plan[6]?.question ?? ''), part3: plan.slice(7).map((item, i) => toMock(answers[7 + i], item.question)) };
      const problem = mockAnswersProblem(mock);
      if (problem) throw new SchoodAIError('too_short', 'Answer more of the questions before the report.', 422, { problem });
      const request = buildMockScoringRequest(state.questions!, mock);
      const out = await ctx.ai.charged({ key, mode: 'json', reference: `speaking-report:${row.id}` }, async (session) => {
        const raw = await session.json({ messages: [{ role: 'system', content: systemFor(ctx, access, { name: 'IELTS Speaking examiner', instructions: [request.systemPrompt, EVIDENCE_RULE] }) }, { role: 'user', content: wrapUserMessage(request.userPayload) }], schema: looseObject(MOCK_SCHEMA), temperature: request.temperature, maxTokens: 1500 });
        const result = parseMockScore(raw, mock);
        if (!result) throw new SchoodAIError('ai_failed', 'The report could not be written just now. Your credits were returned.', 502);
        return { result, evidence: evidenceFrom(raw.evidence, learnerText, ['fluency', 'lexical', 'grammar']) };
      });
      const { result, evidence } = out.result;
      score = result.overall;
      report = { kind: 'ielts', overall: result.overall, bands: result.bands, comments: result.comments, priorities: result.priorities, fixes: result.fixes, evidence, fluency, pronunciation_note: result.pronunciation_note, credits: out.credits };
    } else {
      const set = MULTILEVEL_SETS.find((entry) => entry.id === state.set_id) ?? MULTILEVEL_SETS[0];
      const ml = parseSpeakingAnswers(answers.map((answer) => ({ text: answer.text, mode: answer.mode === 'typed' ? 'typed' : 'speech', seconds: answer.seconds })));
      if (speakingTooShort(ml)) throw new SchoodAIError('too_short', 'Answer more of the questions before the report.', 422, { problem: 'too_short' });
      const request = buildSpeakingRequest({ speaking: set } as unknown as ExamPaper, ml);
      const out = await ctx.ai.charged({ key, mode: 'json', reference: `speaking-report:${row.id}` }, async (session) => {
        const raw = await session.json({ messages: [{ role: 'system', content: systemFor(ctx, access, { name: 'Multilevel speaking examiner', instructions: [request.systemPrompt] }) }, { role: 'user', content: wrapUserMessage(request.userPayload) }], schema: looseObject(ML_SCHEMA), temperature: request.temperature, maxTokens: 1500 });
        const marked = parseSpeakingMark(raw, ml);
        if (!marked) throw new SchoodAIError('ai_failed', 'The report could not be written just now. Your credits were returned.', 502);
        return marked;
      });
      const marked = out.result;
      score = speakingScore(marked.raw);
      report = { kind: 'multilevel', parts: marked.parts, raw: marked.raw, raw_max: marked.raw_max, scaled: score, scale_max: 75, level: examLevelFor(score), priorities: marked.priorities, fixes: marked.fixes, fluency, credits: out.credits };
    }
    track(ctx, access, {
      feature: 'L4', kind: 'mock', score, minutes,
      summary: { mode, score, priorities: ((report.priorities ?? []) as { text?: string }[]).map((entry) => entry.text).slice(0, 2), fixes: ((report.fixes ?? []) as { said?: string; better?: string }[]).slice(0, 2) },
      event: { kind: 'mock_finished', skill: mode === 'ielts_mock' ? 'ielts.speaking' : 'multilevel.speaking', score, verified_minutes: Math.min(60, minutes), outcome: mode === 'ielts_mock' ? `band_${String(score).replace('.', '_')}` : undefined, ref: row.id },
    });
  } else {
    const messages = state.messages ?? [];
    const learnerLines = messages.filter((message) => message.role === 'learner').map((message) => message.text);
    if (learnerLines.length < ROLEPLAY_MIN_TURNS) throw new SchoodAIError('too_short', 'Say a little more before the review.', 422, { problem: 'too_short' });
    const learnerText = learnerLines.join(' ');
    const scenario = scenarioOf(row);
    minutes = Math.max(1, Math.round(countWords(learnerText) / 60));
    if (mode === 'interview') {
      key = 'interview.report';
      await requireLearner(ctx, key);
      const kind = (row.input.interview ?? 'job') as InterviewKind;
      const out = await ctx.ai.charged({ key, mode: 'json', reference: `interview-report:${row.id}` }, async (session) => {
        const raw = await session.json({
          messages: [
            { role: 'system', content: systemFor(ctx, access, { name: 'Interview coach', instructions: [
              `You review a practice interview (${scenario.title.en}) by a ${level} English speaker. Judge only the candidate's lines.`,
              'Rate five criteria from 1 to 5 (whole numbers): clarity, relevance, specificity (examples and results), confidence (direct, fluent answers) and language (grammar and vocabulary).',
              'For each criterion write one short comment and give up to 2 exact quotes from the candidate as evidence.',
              '"best": the candidate\'s strongest moment as an exact quote and why. "improve": up to 3 answers to make stronger: the question, the candidate\'s exact words, a stronger answer in their own voice (at most 40 words, using only facts they gave), and why.',
              '"next_steps": up to 3 short instructions. Never state visa, admission or legal rules; say to check the official site instead.',
            ] }) },
            { role: 'user', content: wrapUserMessage(JSON.stringify({ interview: kind, conversation: messages.slice(-30).map((message) => ({ speaker: message.role === 'partner' ? 'interviewer' : 'candidate', text: message.text })) })) },
          ],
          schema: looseObject(INTERVIEW_SCHEMA), temperature: 0.2, maxTokens: 1500,
        });
        const criteria = (Array.isArray(raw.criteria) ? raw.criteria : []).flatMap((entry: unknown) => {
          const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
          const keyName = String(item.key ?? ''), value = Math.round(Number(item.score));
          if (!['clarity', 'relevance', 'specificity', 'confidence', 'language'].includes(keyName) || !(value >= 1 && value <= 5)) return [];
          return [{ key: keyName, score: value, comment: String(item.comment ?? '').slice(0, 300), evidence: (Array.isArray(item.evidence) ? item.evidence : []).map((quote) => String(quote ?? '').slice(0, 200)).filter((quote) => quoted(quote, learnerText)).slice(0, 2) }];
        });
        const unique = [...new Map(criteria.map((entry) => [entry.key, entry])).values()];
        if (unique.length < 3) throw new SchoodAIError('ai_failed', 'The report could not be written just now. Your credits were returned.', 502);
        const best = raw.best && typeof raw.best === 'object' ? raw.best as Record<string, unknown> : {};
        const improve = (Array.isArray(raw.improve) ? raw.improve : []).flatMap((entry: unknown) => {
          const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
          const said = String(item.said ?? '').slice(0, 300);
          return quoted(said, learnerText) ? [{ question: String(item.question ?? '').slice(0, 300), said, better: String(item.better ?? '').slice(0, 300), why: String(item.why ?? '').slice(0, 200) }] : [];
        }).slice(0, 3);
        return {
          criteria: unique, best: quoted(String(best.quote ?? ''), learnerText) ? { quote: String(best.quote).slice(0, 300), why: String(best.why ?? '').slice(0, 200) } : null,
          improve, next_steps: (Array.isArray(raw.next_steps) ? raw.next_steps : []).map((entry: unknown) => String(entry ?? '').slice(0, 200)).filter(Boolean).slice(0, 3),
        };
      });
      score = Math.round((out.result.criteria.reduce((sum, entry) => sum + entry.score, 0) / out.result.criteria.length) * 20);
      report = { kind: 'interview', interview: kind, score, ...out.result, note: INTERVIEWS[kind].practiceNote, credits: out.credits };
      track(ctx, access, { feature: 'L12', kind: 'interview', score, minutes, summary: { interview: kind, score, improve: out.result.improve.map((entry) => ({ said: entry.said, better: entry.better })).slice(0, 2) }, event: { kind: 'mock_finished', skill: `interview.${kind}`, score, verified_minutes: Math.min(60, minutes), ref: row.id } });
    } else {
      key = 'speaking.session_report';
      await requireLearner(ctx, key);
      const request = buildFinishRequest(scenario, level, readMessages(messages));
      const out = await ctx.ai.charged({ key, mode: 'json', reference: `speaking-report:${row.id}` }, async (session) => {
        const raw = await session.json({ messages: [{ role: 'system', content: systemFor(ctx, access, { name: 'Speaking coach', instructions: [request.systemPrompt] }) }, { role: 'user', content: wrapUserMessage(request.userPayload) }], schema: looseObject(REVIEW_SCHEMA), temperature: 0.2, maxTokens: 1000 });
        const result = parseFinishOutput(raw, scenario, learnerText, state.goals_met ?? []);
        if (!result) throw new SchoodAIError('ai_failed', 'The review could not be written just now. Your credits were returned.', 502);
        return result;
      });
      score = out.result.score;
      report = { kind: 'review', ...out.result, fluency: fluencyNumbers(learnerLines.map((line) => ({ text: line, mode: 'typed', seconds: null, words: countWords(line) }))), credits: out.credits };
      track(ctx, access, { feature: 'L4', kind: 'speaking', score, minutes, summary: { mode, score, fixes: out.result.fixes.slice(0, 2).map((fix) => ({ said: fix.said, better: fix.better })) }, event: { kind: 'drill_finished', skill: `speaking.${mode}`, score, verified_minutes: Math.min(30, minutes), ref: row.id } });
    }
  }
  const saved = await saveRecord(ctx, row, { status: 'finished', output: { report }, credits: row.credits + Number(report.credits ?? 0) });
  return { session: sessionView(saved) };
}

export const speakingRoutes = {
  speaking: { GET: listSpeaking },
  'speaking-start': { POST: startSpeaking },
  'speaking-turn': { POST: speakingTurn, maxBody: 4_500_000 },
  'speaking-finish': { POST: finishSpeaking },
  'speech-status': { GET: async (ctx: RequestContext) => ({ speech: await speechStatus(ctx) }) },
};
