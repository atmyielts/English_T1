import { quoteCredits } from '../../../../packages/ai-core/src/mod.ts';
import {
  levelLabel, LOCALES, overallScale, pick, type CoachPack, type InEvent, type Locale, type UpdateRequest,
} from '../../../../packages/coach-packs/src/mod.ts';
import { integer, isUuid, oneOf, record, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext, type RouteHandler } from '../types.ts';
import { accessKind, ensureFairUse, forgetTeamSeats } from './access.ts';
import { keyOf } from './ai.ts';
import { Bot } from './bot.ts';
import { handleUpdate } from './engine.ts';
import { spokenScript } from './flows/quiz.ts';
import { pollSent } from './flows/quiz.ts';
import { setReminders } from './flows/onboard.ts';
import type { CoachRuntime } from './runtime.ts';
import type { Enrollment } from './store.ts';
import { verifyMiniAppData } from './telegram-auth.ts';
import { localParts, parseDate, validReminder, validTimeZone } from './time.ts';
import { goalOf, planView, progressView, todayPlan, weekView } from './views.ts';

// coach/* routes. Three kinds of caller:
//   - the Telegram worker (service secret, `service: true`): update, poll-sent,
//     media-cached, miniapp-session;
//   - the Mini App and the web (the person's session): home, dashboard, report,
//     session, plan, goal, settings, certificates, erase, link, samples, team…;
//   - Schood admins: team-create (Coach Team seats are granted by support until
//     checkout sells them).

const MB = 1024 * 1024;

export function coachRoutes(runtime: () => Promise<CoachRuntime>): Record<string, RouteHandler> {
  const workerOnly = (ctx: RequestContext) => { if (ctx.user.via !== 'service') throw new SchoodAIError('service_only', 'Only the coach bots call this.', 403); };
  const packOf = async (value: unknown): Promise<{ rt: CoachRuntime; pack: CoachPack }> => {
    const rt = await runtime();
    const id = typeof value === 'string' ? value : '';
    const pack = rt.packs.get(id);
    if (!pack) throw new SchoodAIError('not_found', 'Unknown coach.', 404, { field: 'pack' });
    return { rt, pack };
  };
  const enrolment = async (ctx: RequestContext, rt: CoachRuntime, pack: CoachPack, locale: Locale = ctx.locale): Promise<Enrollment> => {
    const access = await ctx.workspace();
    return rt.store.ensureEnrollment({ userId: ctx.user.id, workspaceId: access.workspace.id, pack: pack.manifest.id, packVersion: pack.manifest.version, locale });
  };
  const deps = (rt: CoachRuntime, pack: CoachPack, enrollment: Enrollment, ctx: RequestContext) => ({ store: rt.store, pack, enrollment, now: ctx.now() });

  return {
    // --- the worker ----------------------------------------------------------------------------------------
    update: {
      service: true,
      maxBody: 9 * MB,
      async POST(ctx) {
        workerOnly(ctx);
        const body = record(await ctx.body());
        const { rt } = await packOf(body.pack);
        return handleUpdate(ctx, rt, parseUpdate(body));
      },
    },
    'poll-sent': {
      service: true,
      async POST(ctx) {
        workerOnly(ctx);
        const body = record(await ctx.body());
        const { rt, pack } = await packOf(body.pack);
        const ref = text(body.ref, 'ref', { max: 120 }), pollId = text(body.poll_id, 'poll_id', { max: 64 });
        const enrollment = await rt.store.enrollment(ctx.user.id, pack.manifest.id);
        if (!enrollment) return { ok: false };
        await pollSent(new Bot(ctx, rt, pack, enrollment, null), ref, pollId);
        return { ok: true };
      },
    },
    'media-cached': {
      service: true,
      async POST(ctx) {
        workerOnly(ctx);
        const body = record(await ctx.body());
        const { rt, pack } = await packOf(body.pack);
        const key = text(body.cache_key, 'cache_key', { max: 120 }), fileId = text(body.file_id, 'file_id', { max: 256 });
        if (!/^[a-z0-9][a-z0-9_.:-]{1,120}$/.test(key)) throw new SchoodAIError('invalid_request', 'cache_key is invalid.', 400, { field: 'cache_key' });
        await rt.store.saveMedia(pack.manifest.id, key, fileId);
        return { ok: true };
      },
    },
    /**
     * Mini App sign-in. The worker has checked Telegram's HMAC with the bot token;
     * here Telegram's Ed25519 signature is checked again with the bot's public id,
     * so this route cannot sign anyone in with the service secret alone.
     */
    'miniapp-session': {
      service: true,
      async POST(ctx) {
        workerOnly(ctx);
        const body = record(await ctx.body());
        const { rt, pack } = await packOf(body.pack);
        const initData = text(body.init_data, 'init_data', { max: 12000 });
        const botId = rt.config.bots[pack.manifest.id]?.id;
        if (!botId) throw new SchoodAIError('coach_not_configured', 'This coach bot is not set up yet.', 503);
        let identity;
        try {
          identity = await verifyMiniAppData(initData, botId, { publicKeyHex: rt.config.telegramPublicKey, nowSeconds: Math.floor(ctx.now().getTime() / 1000) });
        } catch (cause) {
          throw new SchoodAIError('telegram_invalid', 'Telegram could not confirm this session.', 401, { reason: cause instanceof Error ? cause.message : 'telegram_signature' });
        }
        if (identity.telegramUserId !== ctx.user.telegramChatId) throw new SchoodAIError('telegram_invalid', 'Telegram could not confirm this session.', 401, { reason: 'telegram_user' });
        if (await rt.store.countMints(ctx.user.id, new Date(ctx.now().getTime() - 3_600_000).toISOString()) >= 12) throw new SchoodAIError('capped', 'Too many sign-ins. Try again later.', 429, { scope: 'user', retry_after: new Date(ctx.now().getTime() + 3_600_000).toISOString() });
        const session = await rt.mintSession(ctx.user.id);
        if (!session) throw new SchoodAIError('session_unavailable', 'Open Schood on the web to sign in.', 409);
        await rt.store.addMint(ctx.user.id, pack.manifest.id);
        await ctx.audit('coach.miniapp_session', { pack: pack.manifest.id });
        return { session };
      },
    },

    // --- the Mini App and the web --------------------------------------------------------------------------
    home: {
      async GET(ctx) {
        const rt = await runtime();
        const mine = new Map((await rt.store.enrollments(ctx.user.id)).map((row) => [row.pack, row]));
        const coaches = [];
        for (const pack of rt.packs.values()) {
          const decision = await ctx.access(pack.manifest.feature);
          const row = mine.get(pack.manifest.id);
          coaches.push({
            ...packCard(pack, ctx.locale, rt), allowed: decision.allowed, plans: decision.allowed ? [] : decision.reason === 'plan_required' ? decision.plans : [],
            enrolled: !!row, streak: row?.streakCurrent ?? 0, placement: row?.placement ? levelLabel(pack.manifest.scale, row.placement.overall) : null,
          });
        }
        return { coaches, telegram_linked: !!ctx.user.telegramChatId };
      },
    },
    dashboard: {
      async GET(ctx) {
        const { rt, pack } = await packOf(ctx.query.get('pack'));
        let enrollment = await enrolment(ctx, rt, pack);
        enrollment = await ensureFairUse(ctx, rt, enrollment, pack.manifest.feature);
        const view = deps(rt, pack, enrollment, ctx);
        const [progress, today, week, sessions, certificates, kind] = await Promise.all([
          progressView(view), enrollment.placement ? todayPlan(view) : Promise.resolve(null), weekView(view),
          rt.store.sessions(ctx.user.id, pack.manifest.id, { limit: 20, status: 'finished' }), rt.store.certificates(ctx.user.id, pack.manifest.id), accessKind(ctx, pack.manifest.feature),
        ]);
        const scale = pack.manifest.scale, goal = goalOf(pack, enrollment);
        return {
          coach: packCard(pack, ctx.locale, rt),
          access: { allowed: kind !== null, kind, plans: kind ? [] : (await ctx.access(pack.manifest.feature) as { plans?: string[] }).plans ?? [] },
          enrollment: { locale: enrollment.locale, settings: enrollment.settings, has_goal: !!enrollment.goal, placement: enrollment.placement ? { overall: enrollment.placement.overall, label: levelLabel(scale, enrollment.placement.overall), skills: enrollment.placement.skills, at: enrollment.placement.at } : null },
          goal: { target: goal.target, target_label: levelLabel(scale, goal.target), exam_date: goal.examDate, daily_minutes: goal.dailyMinutes, weeks_left: progress.weeksLeft, days_left: progress.daysLeft },
          streak: progress.streak,
          skills: progress.skills.map((skill) => ({ ...skill, name: pick(pack.skillById.get(skill.node)?.name, ctx.locale), parent: pack.skillById.get(skill.node)?.parent ?? null, label: skill.level === null ? null : levelLabel(scale, skill.level) })),
          forecasts: progress.forecasts.map((forecast) => {
            const rubric = pack.rubricById.get(forecast.rubric)!;
            return { rubric: forecast.rubric, name: pick(rubric.name, ctx.locale), scale: overallScale(rubric), points: forecast.points, ...forecast.prediction };
          }),
          errors: progress.errors.map((error) => ({ ...error, name: pick(pack.errorById.get(error.tag)?.name, ctx.locale), explain: pick(pack.errorById.get(error.tag)?.explain, ctx.locale) })),
          today: today ? { minutes: today.minutes, phase: pick(today.phase.title, ctx.locale), days_left: today.daysLeft, tasks: today.tasks.map((task) => ({ ...task, title: pick(pack.byId.get(task.activityId)?.title, ctx.locale) })) } : null,
          week: { from: week.from, to: week.to, has_data: week.hasData, headline: week.report.headline },
          sessions: sessions.map((session) => sessionCard(pack, session, ctx.locale)),
          certificates: certificates.map((cert) => certView(rt, cert)),
          bot: botLink(rt, pack),
        };
      },
    },
    report: {
      async GET(ctx) {
        const { rt, pack } = await packOf(ctx.query.get('pack'));
        const enrollment = await enrolment(ctx, rt, pack);
        const week = ctx.query.get('week') ?? undefined;
        if (week !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new SchoodAIError('invalid_request', 'week must be a date.', 400, { field: 'week' });
        const view = await weekView(deps(rt, pack, enrollment, ctx), week);
        return {
          from: view.from, to: view.to, has_data: view.hasData,
          rows: view.report.rows.map((row) => ({ ...row, label: rowLabelFor(pack, row, ctx.locale) })),
          headline: view.report.headline,
          focus: view.report.focus.map((entry) => ({ ...entry, name: pick(pack.errorById.get(entry.tag)?.name, ctx.locale), explain: pick(pack.errorById.get(entry.tag)?.explain, ctx.locale) })),
          stats: { minutes: view.report.current.minutes, active_days: view.report.current.activeDays, sessions: view.report.current.sessions, cards: view.report.current.cards, quiz: view.report.current.quiz },
        };
      },
    },
    session: {
      async GET(ctx) {
        const rt = await runtime();
        const id = uuid(ctx.query.get('id'), 'id');
        const session = await rt.store.session(id);
        if (!session || session.userId !== ctx.user.id) throw new SchoodAIError('not_found', 'Not found.', 404);
        const pack = rt.packs.get(session.pack);
        if (!pack) throw new SchoodAIError('not_found', 'Not found.', 404);
        const [turns, scores] = await Promise.all([rt.store.turns(id), rt.store.scores(id)]);
        const rubric = session.rubric ? pack.rubricById.get(session.rubric) : undefined;
        return {
          session: sessionCard(pack, session, ctx.locale), summary: session.summary,
          rubric: rubric ? { id: rubric.id, name: pick(rubric.name, ctx.locale), scale: rubric.scale, overall_scale: overallScale(rubric), criteria: rubric.criteria.map((criterion) => ({ id: criterion.id, name: pick(criterion.name, ctx.locale), source: criterion.source })) } : null,
          turns: turns.map((turn) => ({ seq: turn.seq, role: turn.role, kind: turn.kind, prompt: promptText(pack, session.activityId, turn.promptRef), content: turn.content, input_mode: turn.inputMode, has_clip: !!turn.clip, metrics: publicMetrics(turn.metrics), timing: turn.timing, created_at: turn.createdAt })),
          scores: scores.map((score) => ({ turn: turns.find((turn) => turn.id === score.turnId)?.seq ?? null, criterion: score.criterion, score: score.score, status: score.status, evidence: score.evidence, source: score.source })),
          errors: Object.fromEntries(pack.manifest.errorTags.map((tag) => [tag.id, { name: pick(tag.name, ctx.locale), explain: pick(tag.explain, ctx.locale) }])),
        };
      },
    },
    plan: {
      async GET(ctx) {
        const { rt, pack } = await packOf(ctx.query.get('pack'));
        const enrollment = await enrolment(ctx, rt, pack);
        const view = planView(pack, enrollment, ctx.now()), scale = pack.manifest.scale;
        const today = enrollment.placement ? await todayPlan(deps(rt, pack, enrollment, ctx)) : null;
        return {
          goal: { ...view.goal, target_label: levelLabel(scale, view.goal.target) }, weeks_left: view.left.weeks, days_left: view.goal.examDate ? view.left.days : null,
          weeks: view.weeks.map((week) => ({ week: week.week, phase: pick(week.phase.title, ctx.locale), phase_id: week.phase.id, focus: week.focus, mock: week.mock })),
          options: { targets: pack.plan.goal.options.map((value) => ({ value, label: levelLabel(scale, value) })), minutes: pack.plan.dailyMinutes.options, exam_date: pack.plan.goal.examDate },
          weekly_mock: pack.plan.weeklyMock ? { weekday: pack.plan.weeklyMock.weekday, title: pick(pack.plan.weeklyMock.title, ctx.locale) } : null,
          links: pack.plan.links.map((link) => ({ id: link.id, label: pick(link.label, ctx.locale), url: link.url })),
          today: today ? today.tasks.map((task) => ({ ...task, title: pick(pack.byId.get(task.activityId)?.title, ctx.locale) })) : [],
        };
      },
    },
    goal: {
      async POST(ctx) {
        const body = record(await ctx.body());
        const { rt, pack } = await packOf(body.pack);
        const enrollment = await enrolment(ctx, rt, pack);
        const target = Number(body.target);
        if (!pack.plan.goal.options.includes(target)) throw new SchoodAIError('invalid_request', 'target is not one of the options.', 400, { field: 'target' });
        const minutes = integer(body.daily_minutes, 'daily_minutes', 5, 180);
        if (!pack.plan.dailyMinutes.options.includes(minutes)) throw new SchoodAIError('invalid_request', 'daily_minutes is not one of the options.', 400, { field: 'daily_minutes' });
        let examDate: string | null = null;
        if (body.exam_date !== null && body.exam_date !== undefined && body.exam_date !== '') {
          examDate = parseDate(String(body.exam_date));
          if (!examDate || examDate <= localParts(ctx.now(), enrollment.settings.timeZone).day) throw new SchoodAIError('invalid_request', 'exam_date must be a future date.', 400, { field: 'exam_date' });
        } else if (pack.plan.goal.examDate === 'required') throw new SchoodAIError('invalid_request', 'exam_date is required.', 400, { field: 'exam_date' });
        const goal = { target, examDate: pack.plan.goal.examDate === 'none' ? null : examDate, dailyMinutes: minutes, startedAt: enrollment.goal?.startedAt ?? ctx.now().toISOString() };
        const saved = await rt.store.updateEnrollment(enrollment.id, enrollment.revision, { goal });
        if (!saved) throw new SchoodAIError('conflict', 'Changed elsewhere. Try again.', 409);
        ctx.events.emit({ kind: 'goal_set', area: 'coach', feature: pack.manifest.feature, outcome: `target_${String(target).replace('.', '_')}`.slice(0, 40), ref: enrollment.id });
        return { goal: { ...goal, target_label: levelLabel(pack.manifest.scale, target) } };
      },
    },
    settings: {
      async PATCH(ctx) {
        const body = record(await ctx.body());
        const { rt, pack } = await packOf(body.pack);
        const enrollment = await enrolment(ctx, rt, pack);
        const settings = { ...enrollment.settings };
        let locale = enrollment.locale;
        if (body.locale !== undefined) { locale = oneOf(body.locale, 'locale', LOCALES); if (!pack.manifest.uiLanguages.includes(locale)) throw new SchoodAIError('invalid_request', 'This coach does not speak that language.', 400, { field: 'locale' }); }
        if (body.correction !== undefined) settings.correction = oneOf(body.correction, 'correction', ['gentle', 'strict'] as const);
        if (body.voice !== undefined) { if (typeof body.voice !== 'boolean') throw new SchoodAIError('invalid_request', 'voice must be true or false.', 400, { field: 'voice' }); settings.voice = body.voice; }
        if (body.explain !== undefined) settings.explain = oneOf(body.explain, 'explain', ['ui', 'en'] as const);
        if (body.time_zone !== undefined) { if (!validTimeZone(body.time_zone)) throw new SchoodAIError('invalid_request', 'time_zone is invalid.', 400, { field: 'time_zone' }); settings.timeZone = body.time_zone; }
        let reminderChanged = false;
        if (body.reminder !== undefined) {
          if (body.reminder !== null && !validReminder(body.reminder)) throw new SchoodAIError('invalid_request', 'reminder must be between 08:00 and 21:59.', 400, { field: 'reminder' });
          settings.reminder = body.reminder as string | null; reminderChanged = true;
        }
        const saved = await rt.store.updateEnrollment(enrollment.id, enrollment.revision, { settings, locale });
        if (!saved) throw new SchoodAIError('conflict', 'Changed elsewhere. Try again.', 409);
        if (reminderChanged || body.time_zone !== undefined) await setReminders(new Bot(ctx, rt, pack, saved, null), settings.reminder ?? null);
        return { settings: saved.settings, locale: saved.locale };
      },
    },
    certificates: {
      async GET(ctx) {
        const rt = await runtime();
        return { certificates: (await rt.store.certificates(ctx.user.id)).map((cert) => ({ ...certView(rt, cert), coach: pick(rt.packs.get(cert.pack)?.manifest.name, ctx.locale) })) };
      },
      async DELETE(ctx) {
        const rt = await runtime();
        const body = record(await ctx.body());
        const revoked = await rt.store.revokeCertificate(uuid(body.id, 'id'), ctx.user.id);
        if (!revoked) throw new SchoodAIError('not_found', 'Not found.', 404);
        await ctx.audit('coach.certificate_revoked', {}, { type: 'coach_certificate', id: String(body.id) });
        return { revoked: true };
      },
    },
    erase: {
      async POST(ctx) {
        const body = record(await ctx.body());
        const { rt, pack } = await packOf(body.pack);
        const removed = await rt.store.erase(ctx.user.id, pack.manifest.id);
        await ctx.audit('coach.history_erased', { pack: pack.manifest.id, sessions: removed });
        return { removed };
      },
    },
    link: {
      /** A link that opens this coach's bot with a telegram-link token, so the bot links the same Schood account. */
      async POST(ctx) {
        const body = record(await ctx.body());
        const { rt, pack } = await packOf(body.pack);
        const username = rt.config.bots[pack.manifest.id]?.username;
        if (!username) throw new SchoodAIError('coach_not_configured', 'This coach bot is not set up yet.', 503);
        if (ctx.user.telegramChatId) return { linked: true, url: `https://t.me/${username}` };
        const issued = await ctx.functions.call<{ token?: string; expires_at?: string }>('telegram-link', '', { method: 'POST', body: { action: 'generate' } });
        if (!issued?.token || !/^[A-Za-z0-9_-]{32,64}$/.test(issued.token)) throw new SchoodAIError('upstream_failed', 'Linking is not available right now.', 502);
        return { linked: false, url: `https://t.me/${username}?start=${issued.token}`, expires_at: issued.expires_at ?? null };
      },
    },
    'link-confirm': {
      async POST(ctx) {
        const body = record(await ctx.body());
        const token = text(body.token, 'token', { max: 200 });
        if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) throw new SchoodAIError('invalid_request', 'token is invalid.', 400, { field: 'token' });
        await ctx.functions.call('telegram-link', '', { method: 'POST', body: { action: 'confirm', token } });
        return { linked: true };
      },
    },
    samples: {
      async GET(ctx) {
        const { pack } = await packOf(ctx.query.get('pack'));
        return { coach: packCard(pack, ctx.locale, null), samples: pack.samples.map((sample) => ({ id: sample.id, kind: sample.kind, title: pick(sample.title, ctx.locale), preview: pick(sample.preview, ctx.locale), body: sample.body })) };
      },
    },
    /** Text the Mini App reads aloud with the browser's own voice when no speech provider is set up. */
    'audio-text': {
      async GET(ctx) {
        const { pack } = await packOf(ctx.query.get('pack'));
        const decision = await ctx.access(pack.manifest.feature);
        if (!decision.allowed) throw new SchoodAIError('plan_required', 'This needs a Schood AI plan.', 402, { plans: decision.reason === 'plan_required' ? decision.plans : [], feature: pack.manifest.feature });
        const ref = text(ctx.query.get('ref'), 'ref', { max: 120 });
        const [activityId, itemId] = ref.split('/');
        const activity = pack.byId.get(activityId);
        if (activity?.kind === 'quiz_set' && activity.audio) return { lines: spokenScript(activity.audio.script).split('\n'), speakers: activity.audio.script.split('\n').filter(Boolean).map((line) => /^\s*([A-Z][A-Za-z .'-]{0,30}):\s+/.exec(line)?.[1] ?? null) };
        if (activity?.kind === 'shadowing') { const sentence = activity.sentences.find((entry) => entry.id === itemId); if (sentence) return { lines: [sentence.text], focus: pick(sentence.focus, ctx.locale), speakers: [null] }; }
        throw new SchoodAIError('not_found', 'Not found.', 404);
      },
    },
    chart: {
      async GET(ctx) {
        const { pack } = await packOf(ctx.query.get('pack'));
        const activity = pack.byId.get(text(ctx.query.get('activity'), 'activity', { max: 100 }));
        if (activity?.kind !== 'writing' || !activity.data) throw new SchoodAIError('not_found', 'Not found.', 404);
        return { title: pick(activity.title, ctx.locale), prompt: activity.prompt, data: activity.data };
      },
    },
    costs: {
      /** What each coach action costs, from the same price table the function charges. */
      async GET(ctx) {
        const { pack } = await packOf(ctx.query.get('pack'));
        return { costs: Object.fromEntries((['turn', 'review', 'writing', 'ladder', 'photo', 'drill', 'voice', 'shadow'] as const).map((action) => [action, quoteCredits(keyOf(pack, action)).credits])) };
      },
    },

    // --- Coach Team --------------------------------------------------------------------------------------------
    team: {
      /** The manager's view: members' verified practice and best results this week and in total, never their messages. */
      async GET(ctx) {
        const rt = await runtime();
        const teamId = ctx.query.get('id');
        const teams = await rt.store.teamsOf(ctx.user.id);
        if (!teamId) return { teams: teams.map(({ team, member }) => ({ id: team.id, name: team.name, role: member.role, packs: team.packs, seats: team.seats, valid_until: team.validUntil })) };
        const mine = teams.find(({ team }) => team.id === teamId);
        if (!mine || mine.member.role !== 'manager') throw new SchoodAIError('not_found', 'Not found.', 404);
        const members = (await rt.store.teamMembers(teamId)).filter((member) => member.status === 'active');
        const week = new Date(ctx.now().getTime() - 7 * 86_400_000).toISOString(), ever = new Date(ctx.now().getTime() - 365 * 86_400_000).toISOString();
        const [weekly, total] = await Promise.all([rt.store.teamActivity(members.map((m) => m.userId), mine.team.packs, week), rt.store.teamActivity(members.map((m) => m.userId), mine.team.packs, ever)]);
        const names = new Map<string, string>();
        for (const member of members) names.set(member.userId, (await ctx.repo.profile(member.userId))?.name ?? 'Member');
        const board = members.map((member) => {
          const w = weekly.find((row) => row.userId === member.userId)!, t = total.find((row) => row.userId === member.userId)!;
          return { user_id: member.userId, name: names.get(member.userId), role: member.role, joined_at: member.joinedAt, week: { minutes: w.minutes, results: w.results, active_days: w.activeDays }, total: { minutes: t.minutes, results: t.results }, best: t.best };
        }).sort((a, b) => b.week.minutes - a.week.minutes || b.week.results - a.week.results);
        await ctx.audit('coach.team_viewed', {}, { type: 'coach_team', id: teamId });
        return { team: { id: mine.team.id, name: mine.team.name, packs: mine.team.packs, seats: mine.team.seats, used: members.length, valid_until: mine.team.validUntil }, leaderboard: board };
      },
    },
    'team-create': {
      async POST(ctx) {
        if (!(await ctx.isSchoodAdmin())) throw new SchoodAIError('admin_required', 'Schood admins only.', 403);
        const rt = await runtime();
        const body = record(await ctx.body());
        const name = text(body.name, 'name', { min: 2, max: 80 });
        const manager = uuid(body.manager_id, 'manager_id');
        const packs = Array.isArray(body.packs) ? [...new Set(body.packs.map(String))] : [];
        if (!packs.length || packs.length > 6 || packs.some((pack) => !rt.packs.has(pack))) throw new SchoodAIError('invalid_request', 'packs must name coaches.', 400, { field: 'packs' });
        const seats = integer(body.seats, 'seats', 5, 10000), days = integer(body.days, 'days', 1, 400);
        const team = await rt.store.createTeam({ name, managerId: manager, packs, seats, validUntil: new Date(ctx.now().getTime() + days * 86_400_000).toISOString(), source: 'support', createdBy: ctx.user.id });
        await rt.store.addTeamMember(team.id, manager, 'manager');
        forgetTeamSeats(manager);
        await ctx.audit('coach.team_created', { packs, seats, days }, { type: 'coach_team', id: team.id });
        return { team };
      },
    },
    'team-invite': {
      async POST(ctx) {
        const rt = await runtime();
        const body = record(await ctx.body());
        const teamId = uuid(body.team_id, 'team_id');
        const mine = (await rt.store.teamsOf(ctx.user.id)).find(({ team }) => team.id === teamId);
        if (!mine || mine.member.role !== 'manager') throw new SchoodAIError('not_found', 'Not found.', 404);
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', bytes = crypto.getRandomValues(new Uint8Array(10));
        const code = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
        await rt.store.createInvite({ code, teamId, createdBy: ctx.user.id, expiresAt: new Date(ctx.now().getTime() + 14 * 86_400_000).toISOString(), maxUses: mine.team.seats });
        const links = mine.team.packs.map((pack) => ({ pack, url: rt.config.bots[pack]?.username ? `https://t.me/${rt.config.bots[pack]!.username}?start=team_${code}` : null }));
        await ctx.audit('coach.team_invite', {}, { type: 'coach_team', id: teamId });
        return { code, links, web: `${rt.config.appUrl}/coach/team/join?code=${code}` };
      },
    },
    'team-member': {
      async DELETE(ctx) {
        const rt = await runtime();
        const body = record(await ctx.body());
        const teamId = uuid(body.team_id, 'team_id'), userId = uuid(body.user_id, 'user_id');
        const mine = (await rt.store.teamsOf(ctx.user.id)).find(({ team }) => team.id === teamId);
        if (!mine || mine.member.role !== 'manager' || userId === ctx.user.id) throw new SchoodAIError('not_found', 'Not found.', 404);
        if (!(await rt.store.removeTeamMember(teamId, userId))) throw new SchoodAIError('not_found', 'Not found.', 404);
        forgetTeamSeats(userId);
        await ctx.audit('coach.team_member_removed', {}, { type: 'coach_team', id: teamId });
        return { removed: true };
      },
    },
    'team-join': {
      async POST(ctx) {
        const rt = await runtime();
        const body = record(await ctx.body());
        const code = text(body.code, 'code', { max: 10 });
        if (!/^[A-Za-z0-9]{10}$/.test(code)) throw new SchoodAIError('invalid_request', 'code is invalid.', 400, { field: 'code' });
        try {
          const member = await rt.store.joinTeam(code, ctx.user.id, ctx.now().toISOString());
          forgetTeamSeats(ctx.user.id);
          const team = await rt.store.team(member.teamId);
          return { team: { id: member.teamId, name: team?.name ?? '', packs: team?.packs ?? [] } };
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : '';
          if (['invite_not_found', 'invite_expired', 'team_inactive', 'team_full'].includes(reason)) throw new SchoodAIError(reason, 'That invite cannot be used.', 409);
          throw cause;
        }
      },
    },
  };
}

// --- helpers ------------------------------------------------------------------------------------------------

function packCard(pack: CoachPack, locale: Locale, rt: CoachRuntime | null) {
  const m = pack.manifest;
  return {
    id: m.id, feature: m.feature, name: pick(m.name, locale), tagline: pick(m.tagline, locale), description: pick(m.description, locale), accent: m.accent ?? '#0f172a',
    languages: m.uiLanguages, scale: m.scale, correction_modes: m.correctionModes ?? [], menu: m.menu.map((item) => item.action),
    bot: rt ? botLink(rt, pack) : null,
  };
}
const botLink = (rt: CoachRuntime, pack: CoachPack) => (rt.config.bots[pack.manifest.id]?.username ? `https://t.me/${rt.config.bots[pack.manifest.id]!.username}` : null);

function sessionCard(pack: CoachPack, session: { id: string; kind: string; activityId: string | null; mode: string | null; status: string; rubric: string | null; overall: number | null; minutes: number; startedAt: string; finishedAt: string | null }, locale: Locale) {
  const rubric = session.rubric ? pack.rubricById.get(session.rubric) : undefined;
  return {
    id: session.id, kind: session.kind, activity: session.activityId, mode: session.mode, title: pick(session.activityId ? pack.byId.get(session.activityId)?.title : undefined, locale) || session.kind,
    status: session.status, rubric: session.rubric, overall: session.overall, overall_label: rubric && session.overall !== null ? levelLabel(overallScale(rubric), session.overall) : null,
    minutes: session.minutes, started_at: session.startedAt, finished_at: session.finishedAt,
  };
}

function certView(rt: CoachRuntime, cert: { id: string; code: string; pack: string; milestone: string; level: number; levelLabel: string; displayName: string; issuedAt: string; revokedAt: string | null }) {
  return { id: cert.id, code: cert.code, pack: cert.pack, milestone: cert.milestone, level: cert.level, level_label: cert.levelLabel, display_name: cert.displayName, issued_at: cert.issuedAt, revoked: !!cert.revokedAt, url: `${rt.config.appUrl}/coach/verify/${cert.code}` };
}

function promptText(pack: CoachPack, activityId: string | null, ref: string | null): string | null {
  if (!ref) return null;
  const activity = activityId ? pack.byId.get(activityId) : undefined;
  if (activity?.kind === 'speaking_exam') {
    const [base, suffix] = ref.split(':');
    for (const part of activity.parts) {
      const card = part.cards?.find((entry) => entry.id === base);
      if (card) return suffix?.startsWith('r') ? card.roundOff[Number(suffix.slice(1))] ?? null : suffix?.startsWith('d') ? card.discussion[Number(suffix.slice(1))] ?? null : card.topic;
      const topic = part.topics?.find((entry) => entry.id === base);
      if (topic) return topic.questions[Number(suffix)] ?? null;
    }
  }
  if (activity?.kind === 'writing') return activity.prompt;
  return null;
}

/** Turn metrics without the raw assessment blob (scores are returned separately). */
const publicMetrics = (metrics: Record<string, unknown>) => { const { assessment: _assessment, ...rest } = metrics; return rest; };

function rowLabelFor(pack: CoachPack, row: { key: string; ref: string | null }, locale: Locale): string {
  if (row.key === 'result') return pick(pack.rubricById.get(row.ref ?? '')?.name, locale) || String(row.ref);
  if (row.key === 'criterion' && row.ref) {
    const at = row.ref.lastIndexOf('.');
    return pick(pack.rubricById.get(row.ref.slice(0, at))?.criteria.find((criterion) => criterion.id === row.ref!.slice(at + 1))?.name, locale) || row.ref;
  }
  return '';
}

// --- the worker's update body ----------------------------------------------------------------------------

const b64 = /^[A-Za-z0-9+/]+={0,2}$/;
function parseUpdate(body: Record<string, unknown>): UpdateRequest {
  const updateId = body.update_id;
  if (typeof updateId !== 'number' || !Number.isInteger(updateId) || updateId < 0) throw new SchoodAIError('invalid_request', 'update_id is required.', 400, { field: 'update_id' });
  const locale = (LOCALES as readonly string[]).includes(String(body.locale)) ? body.locale as Locale : 'en';
  const event = record(body.event, 'event');
  const n = (value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER) => integer(value, field, min, max);
  let parsed: InEvent;
  switch (event.type) {
    case 'text': parsed = { type: 'text', text: text(event.text, 'event.text', { max: 12000 }), messageId: n(event.messageId, 'messageId'), date: n(event.date, 'date') }; break;
    case 'command': parsed = { type: 'command', command: oneOfPattern(event.command, /^[a-z][a-z0-9_]{0,31}$/, 'command'), args: typeof event.args === 'string' ? event.args.slice(0, 64) : '', messageId: n(event.messageId, 'messageId'), date: n(event.date, 'date') }; break;
    case 'callback': parsed = { type: 'callback', data: text(event.data, 'event.data', { max: 64 }), messageId: n(event.messageId, 'messageId'), date: n(event.date, 'date') }; break;
    case 'voice': {
      const audio = typeof event.audio === 'string' && b64.test(event.audio) ? event.audio : '';
      if (!audio) throw new SchoodAIError('invalid_request', 'event.audio must be base64.', 400, { field: 'event.audio' });
      parsed = { type: 'voice', audio, mime: oneOfPattern(event.mime ?? 'audio/ogg', /^audio\/[a-z0-9.+-]{1,30}$/, 'mime'), duration: n(event.duration, 'duration', 0, 3600), fileId: text(event.fileId, 'fileId', { max: 256 }), fileUniqueId: text(event.fileUniqueId, 'fileUniqueId', { max: 128 }), messageId: n(event.messageId, 'messageId'), date: n(event.date, 'date') };
      break;
    }
    case 'photo': {
      const image = typeof event.image === 'string' && b64.test(event.image) ? event.image : '';
      if (!image) throw new SchoodAIError('invalid_request', 'event.image must be base64.', 400, { field: 'event.image' });
      parsed = { type: 'photo', image, mime: oneOfPattern(event.mime ?? 'image/jpeg', /^image\/(jpeg|png|webp)$/, 'mime'), caption: typeof event.caption === 'string' ? event.caption.slice(0, 1000) : '', messageId: n(event.messageId, 'messageId'), date: n(event.date, 'date') };
      break;
    }
    case 'poll_answer': parsed = { type: 'poll_answer', pollId: text(event.pollId, 'pollId', { max: 64 }), options: Array.isArray(event.options) ? event.options.filter((value): value is number => Number.isInteger(value) && value >= 0 && value < 10).slice(0, 10) : [] }; break;
    case 'diagnostic': parsed = { type: 'diagnostic', answers: oneOfPattern(event.answers, /^[0-9a-z]{1,13}$/, 'answers'), locale: (LOCALES as readonly string[]).includes(String(event.locale)) ? event.locale as Locale : locale }; break;
    default: throw new SchoodAIError('invalid_request', 'Unknown event.', 400, { field: 'event.type' });
  }
  const firstName = typeof body.first_name === 'string' ? body.first_name.slice(0, 64) : null;
  return { pack: String(body.pack), updateId, locale, firstName, event: parsed };
}
function oneOfPattern(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new SchoodAIError('invalid_request', `${field} is invalid.`, 400, { field });
  return value;
}
export { isUuid };
