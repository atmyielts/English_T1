import { decodeAnswers, plain, type InEvent, type Locale, type MenuAction, type UpdateRequest, type UpdateResponse } from '../../../../packages/coach-packs/src/mod.ts';
import { packFor } from '../../../../packages/coach-packs/src/registry.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { forgetTeamSeats } from './access.ts';
import { Bot } from './bot.ts';
import { chooseDrill, finishShadow, freshDrill, onDrillAnswer, onShadowVoice, repeatDrill, startDrill, startShadow } from './flows/drills.ts';
import { onLessonCheck, onPhotoHelp, onPhotoStep, startLesson } from './flows/extra.ts';
import { showHelp, showPlan, showProgress, showReport, showSamples, showSettings, showToday } from './flows/info.ts';
import { askTarget, languagePicker, onGoal, reminderPicker, savePlacement, setLanguage, startDiagnostic, welcome } from './flows/onboard.ts';
import { mockSets, onPollAnswer, onQuizAnswer, quizHint, startDeck, startMistakes, startMock, startQuiz } from './flows/quiz.ts';
import { chooseRoleplay, chooseScript, onRoleplayLine, reviewRoleplay, startRoleplay } from './flows/roleplay.ts';
import { finishScript, onScriptText, startScript } from './flows/script.ts';
import { chooseSpeaking, finishMock, finishPractice, onSpeakingAnswer, speakingExams, speakingNext, speakingRerecord, startSpeaking } from './flows/speaking.ts';
import { chooseWriting, confirmWriting, onWritingPhoto, onWritingText, startWriting, writingLadder, writingRewrite } from './flows/writing.ts';
import type { CoachRuntime } from './runtime.ts';

// The coach conversation: one Telegram event in, messages out. The worker sends
// events here (coach/update); this routes them by command, button or the flow in
// progress. Practice needs a plan; the placement test, examples, help and settings
// do not.

const COMMANDS: Record<string, MenuAction | 'menu' | 'test' | 'language' | 'samples'> = {
  today: 'today', mock: 'mock', speaking: 'speaking', writing: 'writing', reading: 'reading', listening: 'listening', practice: 'practice', vocab: 'vocab', phrases: 'phrases',
  roleplay: 'roleplay', shadowing: 'shadowing', drill: 'drill', photo: 'photo', lesson: 'lesson', progress: 'progress', report: 'report', plan: 'plan', settings: 'settings', help: 'help',
  mistakes: 'mistakes', script: 'script',
  menu: 'menu', cancel: 'menu', test: 'test', language: 'language', samples: 'samples',
};

export async function handleUpdate(ctx: RequestContext, runtime: CoachRuntime, request: UpdateRequest): Promise<UpdateResponse> {
  const pack = runtime.packs.get(request.pack);
  if (!pack) throw new SchoodAIError('not_found', 'Unknown coach.', 404);
  if (!(await runtime.store.claimUpdate(pack.manifest.id, request.updateId, ctx.user.id))) return { messages: [], duplicate: true };
  const access = await ctx.workspace();
  let enrollment = await runtime.store.ensureEnrollment({ userId: ctx.user.id, workspaceId: access.workspace.id, pack: pack.manifest.id, packVersion: pack.manifest.version, locale: request.locale });
  // Writing to the bot again after blocking it means they are back.
  if (enrollment.status === 'blocked') enrollment = (await runtime.store.updateEnrollment(enrollment.id, enrollment.revision, { status: 'active' })) ?? enrollment;
  if (enrollment.packVersion !== pack.manifest.version) enrollment = (await runtime.store.updateEnrollment(enrollment.id, enrollment.revision, { packVersion: pack.manifest.version })) ?? enrollment;
  // Mixed packs (B3–B6): the practice text in this person's language.
  const bot = new Bot(ctx, runtime, packFor(pack, enrollment.locale), enrollment, request);
  await dispatch(bot, request.event);
  await bot.save();
  return { messages: bot.messages, ...(bot.toast ? { toast: bot.toast } : {}), ...(bot.clearButtons ? { clearButtons: true } : {}) };
}

async function dispatch(bot: Bot, event: InEvent) {
  switch (event.type) {
    case 'command': return onCommand(bot, event.command, event.args);
    case 'callback': return onCallback(bot, event.data);
    case 'text': return onText(bot, event.text);
    case 'voice': return onVoice(bot, event);
    case 'photo': return onPhoto(bot, event.image, event.mime, event.caption);
    case 'poll_answer': return onPollAnswer(bot, event.pollId, event.options);
    case 'diagnostic': {
      const answers = decodeAnswers(event.answers);
      if (event.locale !== bot.locale && bot.pack.manifest.uiLanguages.includes(event.locale)) bot.update({ locale: event.locale });
      if (!answers) { startDiagnostic(bot); return; }
      return savePlacement(bot, answers, event.answers);
    }
  }
}

async function onCommand(bot: Bot, command: string, args: string) {
  if (command === 'start') {
    if (args.startsWith('team_')) { await joinTeam(bot, args.slice(5)); return; }
    if (args === 'test') { startDiagnostic(bot); return; }
    welcome(bot, bot.request?.firstName ?? null);
    return;
  }
  const action = COMMANDS[command];
  if (!action) { bot.menu(); return; }
  await onAction(bot, action);
}

async function joinTeam(bot: Bot, code: string) {
  if (!/^[A-Za-z0-9]{10}$/.test(code)) { bot.text(bot.t('team.failed', { reason: 'invite_not_found' })); return; }
  try {
    const member = await bot.store.joinTeam(code, bot.enrollment.userId, bot.ctx.now().toISOString());
    forgetTeamSeats(bot.enrollment.userId);
    const team = await bot.store.team(member.teamId);
    await bot.ctx.audit('coach.team_joined', { team: member.teamId }, { type: 'coach_team', id: member.teamId });
    bot.text(bot.t('team.joined', { name: team?.name ?? '' }));
    welcome(bot, bot.request?.firstName ?? null);
  } catch (cause) {
    const reason = cause instanceof Error && /^(invite_not_found|invite_expired|team_inactive|team_full)$/.test(cause.message) ? cause.message : 'error';
    bot.text(bot.t('team.failed', { reason: reason.replace(/_/g, ' ') }));
  }
}

const PRACTICE = new Set<string>(['today', 'mock', 'speaking', 'writing', 'reading', 'listening', 'practice', 'vocab', 'phrases', 'roleplay', 'shadowing', 'drill', 'photo', 'lesson', 'mistakes', 'script']);

async function onAction(bot: Bot, action: string) {
  bot.state.task = null;
  if (PRACTICE.has(action) && !(await bot.allowed())) { bot.paywall(); return; }
  // Starting other practice sets the current one aside; looking at progress or settings does not.
  if ((PRACTICE.has(action) || action === 'test') && bot.state.current.flow !== 'idle') await leaveFlow(bot);
  switch (action) {
    case 'menu': bot.menu(); return;
    case 'test': startDiagnostic(bot); return;
    case 'samples': showSamples(bot); return;
    case 'help': showHelp(bot); return;
    case 'settings': showSettings(bot); return;
    case 'language': languagePicker(bot); return;
    case 'progress': await showProgress(bot); return;
    case 'report': await showReport(bot); return;
    case 'plan': showPlan(bot); return;
    case 'today': if (!bot.enrollment.goal) { askTarget(bot, bot.enrollment.placement ? undefined : bot.pack.plan.goal.default); return; } await showToday(bot); return;
    case 'mock':
      if (speakingExams(bot).some((exam) => exam.mock)) await startSpeaking(bot, { mode: 'mock' });
      else if (mockSets(bot).length) await startMock(bot);
      // Role-play coaches (B4, B5): the weekly mock call or interview.
      else if (bot.pack.plan.weeklyMock && bot.pack.byId.get(bot.pack.plan.weeklyMock.activity)?.kind === 'roleplay') await startRoleplay(bot, bot.pack.plan.weeklyMock.activity);
      else await chooseRoleplay(bot);
      return;
    case 'mistakes': await startMistakes(bot); return;
    case 'script': await startScript(bot); return;
    case 'speaking': chooseSpeaking(bot); return;
    case 'writing': await chooseWriting(bot); return;
    case 'reading': case 'listening': case 'practice': await startQuiz(bot, action); return;
    case 'vocab': await startDeck(bot, 'word'); return;
    case 'phrases': await startDeck(bot, 'phrase'); return;
    case 'roleplay': await chooseRoleplay(bot); return;
    case 'shadowing': await startShadow(bot); return;
    case 'drill': await chooseDrill(bot); return;
    case 'lesson': await startLesson(bot); return;
    case 'photo': bot.text(bot.p('photo.send')); return;
    default: bot.menu();
  }
}

/** Leaving a flow halfway: practice that was scored still counts; the rest is set aside. */
async function leaveFlow(bot: Bot) {
  const current = bot.state.current;
  if (current.flow === 'speaking' && !current.mock && current.lastTurnId) { await finishPractice(bot); bot.messages.pop(); return; }
  if ('sessionId' in current) {
    const session = await bot.store.session(current.sessionId);
    if (session?.status === 'active') await bot.store.updateSession(session.id, { status: 'abandoned' });
  }
  bot.set({ flow: 'idle' });
}

async function startTask(bot: Bot, index: number) {
  const plan = bot.state.plan;
  const task = plan && plan.day === bot.local().day ? plan.tasks[index] : undefined;
  if (!task) { await showToday(bot); return; }
  if (!(await bot.allowed())) { bot.paywall(); return; }
  if (bot.state.current.flow !== 'idle') await leaveFlow(bot);
  bot.state.task = index;
  switch (task.slot) {
    case 'mock': {
      const kind = bot.pack.byId.get(task.activityId)?.kind;
      if (kind === 'quiz_set') await startMock(bot, task.activityId);
      else if (kind === 'roleplay') await startRoleplay(bot, task.activityId);
      else await startSpeaking(bot, { activityId: task.activityId, mode: 'mock' });
      return;
    }
    case 'speaking': await startSpeaking(bot, { activityId: task.activityId, mode: task.part ?? '' }); return;
    case 'roleplay': await startRoleplay(bot, task.activityId); return;
    case 'writing': await startWriting(bot, task.activityId); return;
    case 'reading': case 'listening': case 'practice': await startQuiz(bot, task.slot, task.activityId); return;
    case 'vocab': await startDeck(bot, bot.pack.cardById.size && bot.pack.ofKind('deck').find((deck) => deck.id === task.activityId)?.cardType === 'phrase' ? 'phrase' : 'word'); return;
    case 'drill': await startDrill(bot, task.errorTag ?? (bot.pack.byId.get(task.activityId) as { errorTag?: string } | undefined)?.errorTag ?? ''); return;
    case 'shadowing': await startShadow(bot, task.activityId); return;
    case 'lesson': await startLesson(bot); return;
    default: bot.menu();
  }
}

async function onOption(bot: Bot, index: number) {
  const option = bot.state.options?.[index];
  if (!option) { bot.menu(); return; }
  bot.clearButtons = true;
  const [kind, value] = [option.slice(0, option.indexOf(':')), option.slice(option.indexOf(':') + 1)];
  if (!(await bot.allowed())) { bot.paywall(); return; }
  switch (kind) {
    case 'speak': { const [activityId, mode] = value.split('|'); await startSpeaking(bot, { activityId, mode }); return; }
    case 'rp': await startRoleplay(bot, value); return;
    case 'write': await startWriting(bot, value); return;
    case 'drill': await startDrill(bot, value); return;
    case 'drill-fresh': await freshDrill(bot, value); return;
    case 'drill-repeat': await repeatDrill(bot, value); return;
    default: bot.menu();
  }
}

async function onCallback(bot: Bot, data: string) {
  if (data.startsWith('m:')) { await onAction(bot, data.slice(2)); return; }
  if (data.startsWith('o:')) { await onOption(bot, Number(data.slice(2))); return; }
  if (data.startsWith('t:')) { await startTask(bot, Number(data.slice(2))); return; }
  if (data.startsWith('g:')) { if (!(await onGoal(bot, { data }))) bot.menu(); return; }
  if (data.startsWith('l:')) { setLanguage(bot, data.slice(2) as Locale); return; }
  if (data.startsWith('ph:')) { await onPhotoStep(bot, data); return; }
  if (data.startsWith('ls:')) { await onLessonCheck(bot, Number(data.slice(3))); return; }
  if (data.startsWith('dr:')) { if (!(await bot.allowed())) { bot.paywall(); return; } if (bot.state.current.flow !== 'idle') await leaveFlow(bot); await startDrill(bot, data.slice(3)); return; }
  if (data.startsWith('qh:')) { const [, index, n] = data.split(':'); quizHint(bot, Number(index), Number(n)); return; }
  if (data.startsWith('rp:script:')) { if (!(await bot.allowed())) { bot.paywall(); return; } if (bot.state.current.flow !== 'idle') await leaveFlow(bot); const template = bot.pack.scriptBuilder?.roleplay; if (template) await startRoleplay(bot, template, data.slice(10)); else bot.menu(); return; }
  if (data === 'sc:list') { if (!(await bot.allowed())) { bot.paywall(); return; } if (bot.state.current.flow !== 'idle') await leaveFlow(bot); await chooseScript(bot); return; }
  if (data === 'sc:retry') { if (bot.state.current.flow === 'script') await finishScript(bot); else bot.menu(); return; }
  if (data.startsWith('rp:again:')) { if (!(await bot.allowed())) { bot.paywall(); return; } if (bot.state.current.flow !== 'idle') await leaveFlow(bot); await startRoleplay(bot, data.slice(9)); return; }
  const flow = bot.state.current.flow;
  const answer = /^a:(\d{1,3}):(\d)$/.exec(data);
  if (answer) {
    if (flow === 'quiz') await onQuizAnswer(bot, { index: Number(answer[1]), choice: Number(answer[2]) });
    else if (flow === 'drill') await onDrillAnswer(bot, { index: Number(answer[1]), choice: Number(answer[2]) });
    else bot.toast = plain(bot.locale, 'not_now');
    return;
  }
  switch (data) {
    case 'sp:rr': if (flow === 'speaking') await speakingRerecord(bot); return;
    case 'sp:nx': if (flow === 'speaking') await speakingNext(bot); return;
    case 'sp:end': if (flow === 'speaking') await finishPractice(bot); return;
    case 'sp:score': if (flow === 'speaking') { const exam = speakingExams(bot).find((entry) => entry.id === (bot.state.current as { activityId: string }).activityId); if (exam) await finishMock(bot, exam); } return;
    case 'rp:end': if (flow === 'roleplay') await reviewRoleplay(bot); return;
    case 'w:sc': if (flow === 'writing') await confirmWriting(bot); return;
    case 'w:ld': if (flow === 'writing') await writingLadder(bot); return;
    case 'w:rw': if (flow === 'writing') await writingRewrite(bot); return;
    case 'sh:end': if (flow === 'shadow') await finishShadow(bot); return;
    case 's:lang': languagePicker(bot); return;
    case 's:rem': reminderPicker(bot); return;
    case 's:cor': bot.text(bot.t('correction.choose'), [[{ text: bot.p('correction.gentle'), data: 'c:gentle' }], [{ text: bot.p('correction.strict'), data: 'c:strict' }]]); return;
    case 'c:gentle': case 'c:strict': bot.update({ settings: { ...bot.enrollment.settings, correction: data === 'c:strict' ? 'strict' : 'gentle' } }); bot.text(bot.t('settings.saved'), bot.nav()); return;
    case 's:voice': bot.update({ settings: { ...bot.enrollment.settings, voice: bot.enrollment.settings.voice === false } }); showSettings(bot); return;
    default: bot.toast = plain(bot.locale, 'not_now');
  }
}

async function onText(bot: Bot, text: string) {
  const current = bot.state.current;
  if (current.flow === 'onboard') { if (!(await onGoal(bot, { text }))) bot.text(bot.t('not_now'), bot.menuButtons()); return; }
  switch (current.flow) {
    case 'speaking': await onSpeakingAnswer(bot, { text }); return;
    case 'roleplay': await onRoleplayLine(bot, { text }); return;
    case 'writing':
      if (current.awaiting === 'after') { await writingRewrite(bot); await onWritingText(bot, text); return; }
      await onWritingText(bot, text, current.awaiting === 'confirm');
      return;
    case 'quiz': await onQuizAnswer(bot, { text }); return;
    case 'drill': await onDrillAnswer(bot, { text }); return;
    case 'shadow': await onShadowVoice(bot, null); return;
    case 'script': await onScriptText(bot, text); return;
    default: bot.text(bot.t('not_now'), bot.menuButtons());
  }
}

async function onVoice(bot: Bot, event: Extract<InEvent, { type: 'voice' }>) {
  switch (bot.state.current.flow) {
    case 'speaking': await onSpeakingAnswer(bot, { voice: event }); return;
    case 'roleplay': await onRoleplayLine(bot, { voice: event }); return;
    case 'shadow': await onShadowVoice(bot, event); return;
    case 'script': bot.text(bot.t('script.typed')); return;
    default:
      if (!(await bot.allowed())) { bot.paywall(); return; }
      if (speakingExams(bot).length) chooseSpeaking(bot);
      else if (bot.pack.ofKind('roleplay').length) await chooseRoleplay(bot);
      else bot.menu();
  }
}

async function onPhoto(bot: Bot, image: string, mime: string, caption: string) {
  const current = bot.state.current;
  if (current.flow === 'writing' && current.awaiting !== 'confirm') {
    if (current.awaiting === 'after') await writingRewrite(bot);
    await onWritingPhoto(bot, image, mime);
    return;
  }
  if (bot.pack.ofKind('photo_help').length) { await onPhotoHelp(bot, image, mime); return; }
  if (bot.pack.ofKind('writing').length) { bot.text(bot.t('write.choose')); await chooseWriting(bot); return; }
  void caption;
  bot.menu();
}
