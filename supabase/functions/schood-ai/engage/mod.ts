import { normalizeCertificateCode } from '../../_shared/english-certificate.ts';
import { registerAgeSource } from '../age.ts';
import { registerContextProvider } from '../context.ts';
import { registerNotifyKind } from '../registries.ts';
import { registerChatGuard } from '../specialists.ts';
import { SchoodAIError, type AnonymousOptions, type FeatureModule, type RequestContext } from '../types.ts';
import { engage, engageStore } from './binding.ts';
import { DAILY_LIMIT_CHOICES, isAdult, limitReached, localParts } from './rules.ts';
import { begin, sha256 } from './base.ts';
import { NOTIFY_LABELS } from './content/messages.ts';
import { getBoards, getCentreLeague, setCentreLeague } from './boards.ts';
import {
  decideSitting, getSitting, listCertificates, proctorCommand, proctorState, reviewQueue, revokeCertificate, saveAnswers, startSitting, submitSitting, uploadTaskAudio,
} from './certificates.ts';
import { seasonOf } from './content/seasons.ts';
import { pick } from './content/text.ts';
import { activeJourneys, changeGoal, changeJourney, dismissOffer, getJourney, getPath, listJourneys, pathView, progressView, startJourney } from './journeys.ts';
import { leagueStandings, leagueSummary } from './league.ts';
import { getEvents, joinEvent, setSponsor } from './live.ts';
import { inbox } from './outbox.ts';
import { createLink, getPassport, importPassport, revokeLink, savePassport, showItem, verifyCertificate, viewPassport } from './passport.ts';
import { buyFreeze, clearBirthDate, getSettings, progressCore, progressState, saveSettings, usageSummary } from './progress.ts';
import { addDate, engageMemoryContext, getMemory, memoryFacts, updateDate } from './remember.ts';
import { addVoiceSample, addWritingSample, deleteSample, linkSampleAudio, sampleAudio, thenVsNow } from './samples.ts';
import { createSquad, getSquad, joinSquad, leaveSquad, nudge, setSquadGoal } from './squads.ts';
import { answerEpisode, fillEpisode, getEpisode, listStories } from './stories.ts';
import { consentTalent, employerAudit, getTalent, grantEmployer, saveTalentProfile, searchTalent, viewCandidate, withdrawTalent } from './talent.ts';

// The lifetime engagement layer (E1–E14). One engine for the web app and every
// coach bot: areas report learning with ctx.events.emit, engage turns verified
// events into XP, streaks, leagues, journeys and the Skill Passport, and every
// message goes through ctx.notify. See docs/product/ai-requests/engage.md for the
// seams other areas and the coordinator wire up.

export { recordSample, type RecordSampleInput } from './samples.ts';
export { registerOfferSource, registerPassportSource, registerSampleSource, registerSittingSource } from './seams.ts';
/** Scheduled work, registered with core's scheduler below (system.ts). */
export { ENGAGE_SYSTEM_JOBS, planDue, rolloverLeagues, sweepMedia } from './system.ts';
export { deliverDue } from './outbox.ts';
import { registerEngageJobs } from './system.ts';

// --- Anonymous routes: a shared Skill Passport link and a certificate QR check -------------------
// Open without signing in. They show only what the person chose to share. A live link or
// a real certificate gets its own budget (an office or a fair behind one address opening
// many of them); a made-up token or code stays limited per IP.
const query = (req: Request, name: string) => new URL(req.url).searchParams.get(name);
const linkKey: AnonymousOptions['rateKey'] = async (req, { store }) => {
  const token = query(req, 'token') ?? query(req, 'link');
  const binding = store(engageStore).current();
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token) || !binding) return null;
  const link = await binding.repo.passportLinkByHash(await sha256(token));
  return link && !link.revokedAt ? `engage.link:${link.id}` : null;
};
const certificateKey: AnonymousOptions['rateKey'] = async (req, { store }) => {
  const code = normalizeCertificateCode(query(req, 'code'));
  const binding = store(engageStore).current();
  if (!code || !binding) return null;
  const row = await binding.repo.certificateByCode(code);
  return row ? `engage.certificate:${row.id}` : null;
};
const SHARED_LINK: AnonymousOptions = { perMinute: 120, perDay: 5_000, rateKey: linkKey, ipLimit: { perMinute: 600, perDay: 20_000 } };
const CERTIFICATE_CHECK: AnonymousOptions = { perMinute: 60, perDay: 3_000, rateKey: certificateKey, ipLimit: { perMinute: 600, perDay: 20_000 } };

const AUDIO = 4_800 * 1024;

/** The engagement snapshot the home card, /progress and the bots start from. */
async function state(ctx: RequestContext) {
  await ctx.requireFeature('E5');
  const e = await begin(ctx);
  const { view } = await progressState(e);
  const journeys = await activeJourneys(e);
  const path = await pathView(e);
  const facts = await memoryFacts(e);
  const season = seasonOf(e.now);
  const squad = await e.b.repo.squadOf(e.userId);
  const webInbox = await e.b.repo.outbox(e.userId, { channel: 'web', statuses: ['queued'], limit: 10 });
  return {
    ...view,
    journeys: journeys.filter((entry) => !entry.graduated).map((entry) => progressView(entry, e.locale)),
    graduated: journeys.filter((entry) => entry.graduated).map((entry) => ({ key: entry.journey.key, title: pick(entry.journey.title, e.locale), graduated_at: entry.row.graduatedAt })),
    next_goal: path.next ? path.goals.find((goal) => goal.key === path.next) ?? null : null,
    path_started: path.started,
    dates: facts.dates.slice(0, 3),
    season: { key: season.key, title: pick(season.theme.title, e.locale), days_left: season.daysLeft },
    squad: squad ? { id: squad.id, name: squad.name } : null,
    inbox: webInbox.filter((row) => Date.parse(row.dueAt) <= e.now.getTime()).length,
  };
}

async function league(ctx: RequestContext) {
  await ctx.requireFeature('E4');
  const e = await begin(ctx);
  const core = await progressCore(e);
  const { summary, member } = await leagueSummary(e, core.weekXp);
  return {
    summary: {
      joined: summary.joined, opted_out: summary.optedOut, tier: summary.tier, rank: summary.rank, size: summary.size, xp: summary.xp, zone: summary.zone,
      last_week: summary.lastWeek, week_start: e.week,
    },
    standings: member ? await leagueStandings(e, member) : null,
  };
}

async function usage(ctx: RequestContext) {
  const e = await begin(ctx);
  return await usageSummary(e, e.userId, 7);
}

/** Time and verified learning for a parent brief (P1). The learner area checks the parent–child link. */
export async function engageUsageFor(ctx: RequestContext, childUserId: string, days = 7) {
  const e = await begin(ctx, { locale: false });
  return await usageSummary(e, childUserId, Math.max(1, Math.min(28, days)));
}

/**
 * A parent sets or clears a child's daily time limit (P1). The learner area checks the
 * parent–child link first; once a parent sets it, the child cannot change it.
 */
export async function setChildDailyLimit(ctx: RequestContext, childUserId: string, minutes: number | null) {
  if (minutes !== null && !(DAILY_LIMIT_CHOICES as readonly number[]).includes(minutes)) throw new SchoodAIError('invalid_request', 'minutes is not one of the choices.', 400, { field: 'daily_limit_minutes' });
  const b = await engage(ctx);
  const profile = await b.repo.saveProfile(childUserId, { dailyLimitMinutes: minutes, limitSetBy: minutes === null ? null : 'parent' });
  await ctx.audit('engage.child_limit', { minutes }, { type: 'user', id: childUserId });
  return { daily_limit_minutes: profile.dailyLimitMinutes, limit_set_by: profile.limitSetBy };
}

/** Whether the person reached the daily time limit they (or a parent) set; other areas can respect it. */
export async function dailyLimitState(ctx: RequestContext): Promise<{ limitMinutes: number | null; minutesToday: number; reached: boolean }> {
  const e = await begin(ctx, { locale: false });
  const core = await progressCore(e);
  const minutes = core.today?.minutes ?? 0;
  return { limitMinutes: e.profile.dailyLimitMinutes, minutesToday: minutes, reached: !!e.profile.dailyLimitMinutes && minutes >= e.profile.dailyLimitMinutes };
}

let registered = false;
function registerProviders() {
  if (registered) return;
  registered = true;
  registerContextProvider('engage_memory', async (ctx) => await engageMemoryContext(ctx), {
    selfView: true, maxChars: 3_000,
    label: { en: 'Your dates and weak spot', uz: 'Sanalaringiz va zaif joyingiz', ru: 'Ваши даты и слабое место' },
  });
  registerContextProvider('engage_progress', async (ctx) => {
    const e = await begin(ctx, { locale: false });
    const { view } = await progressState(e);
    return { kind: 'engage_progress', title: 'Your Schood streak and league', data: { streak: view.streak.current, xp_this_week: view.xp.week, league: view.league.joined ? { tier: view.league.tier, rank: view.league.rank } : null, quests_left: view.quests.filter((quest) => !quest.done).map((quest) => quest.key), enough_today: view.wellbeing.enough_today } };
  }, { selfView: true, maxChars: 1_500, label: { en: 'Your streak and league', uz: 'Seriyangiz va ligangiz', ru: 'Ваша серия и лига' } });
}
registerProviders();

// Messages people can mute one by one in Settings → Notifications (or all of engage at once).
for (const [key, label] of Object.entries(NOTIFY_LABELS)) registerNotifyKind(key, { area: 'engage', label });

/**
 * The date of birth a person gave engage (set once; support can correct it) answers core's
 * adults-only checks, for example a streak freeze bought with credits. No date: unknown.
 */
registerAgeSource('engage.birth_date', async (ctx, userId) => {
  const profile = await engage(ctx).repo.profile(userId);
  if (!profile.birthDate) return null;
  return isAdult(profile, localParts(ctx.now(), 'Asia/Tashkent').day) ? 'adult' : 'minor';
});

registerEngageJobs();

/**
 * The daily time limit a person (or their parent) set covers the tutor and coach chats
 * too: once today's verified minutes reach it, every core/chat turn is refused before
 * anything is read, stored or charged. Only people with a limit pay for more than one
 * profile read. A failure here never blocks a chat; it is logged instead.
 */
registerChatGuard('engage.daily_limit', async (ctx) => {
  let limit: number | null = null;
  try {
    const e = await begin(ctx, { locale: false });
    if (!e.profile.dailyLimitMinutes) return;
    await e.b.repo.ingest(e.userId, e.now);
    const today = (await e.b.repo.allDays(e.userId)).find((day) => day.day === e.today);
    if (limitReached(e.profile, today)) limit = e.profile.dailyLimitMinutes;
  } catch (cause) {
    console.error(JSON.stringify({ event: 'engage_limit_guard_failed', request_id: ctx.requestId, error: String(cause) }));
    return;
  }
  if (limit) throw new SchoodAIError('daily_limit_reached', 'The daily limit for today is reached. See you tomorrow.', 403, { limit_minutes: limit });
});

export const engageModule: FeatureModule = {
  area: 'engage',
  routes: {
    // Progress, streaks, quests, settings (E5, wellbeing)
    state: { GET: state, service: true },
    settings: { GET: getSettings, POST: saveSettings, service: true },
    usage: { GET: usage },
    'freeze-buy': { POST: buyFreeze },
    'support-birth-date': { POST: clearBirthDate },
    // E4 leagues
    league: { GET: league, service: true },
    // E1 journeys, E2 lifetime path
    journeys: { GET: listJourneys, service: true },
    journey: { GET: getJourney, service: true },
    'journey-start': { POST: startJourney },
    'journey-change': { POST: changeJourney },
    path: { GET: getPath, service: true },
    'path-goal': { POST: changeGoal },
    'offer-dismiss': { POST: dismissOffer },
    // E3 Skill Passport
    passport: { GET: getPassport, POST: savePassport },
    'passport-import': { POST: importPassport },
    'passport-item': { POST: showItem },
    'passport-link': { POST: createLink },
    'passport-link-revoke': { POST: revokeLink },
    'passport-view': { GET: viewPassport, anonymous: SHARED_LINK },
    'passport-sample': { GET: linkSampleAudio, anonymous: SHARED_LINK },
    verify: { GET: verifyCertificate, anonymous: CERTIFICATE_CHECK },
    // E7 then vs now
    'then-now': { GET: thenVsNow },
    'sample-voice': { POST: addVoiceSample, maxBody: AUDIO },
    'sample-writing': { POST: addWritingSample },
    'sample-delete': { POST: deleteSample },
    'sample-audio': { GET: sampleAudio },
    // E6 squads
    squad: { GET: getSquad, service: true },
    'squad-create': { POST: createSquad },
    'squad-join': { POST: joinSquad },
    'squad-leave': { POST: leaveSquad },
    'squad-goal': { POST: setSquadGoal },
    'squad-nudge': { POST: nudge, service: true },
    // E8 story mode (also the daily first step in Telegram)
    stories: { GET: listStories, service: true },
    story: { GET: getEpisode, service: true },
    'story-fill': { POST: fillEpisode, service: true },
    'story-answer': { POST: answerEpisode, service: true },
    // E9 a coach that remembers
    memory: { GET: getMemory, service: true },
    'date-add': { POST: addDate, service: true },
    'date-update': { POST: updateDate, service: true },
    // E10 seasons and live events, E11 leaderboards
    events: { GET: getEvents, service: true },
    'event-join': { POST: joinEvent, service: true },
    'event-sponsor': { POST: setSponsor },
    boards: { GET: getBoards },
    'centre-league': { GET: getCentreLeague, POST: setCentreLeague },
    // E12 Skill Certificates on Proctor Lite
    certificates: { GET: listCertificates },
    'sitting-start': { POST: startSitting },
    sitting: { GET: getSitting },
    'sitting-answers': { POST: saveAnswers },
    'sitting-audio': { POST: uploadTaskAudio, maxBody: AUDIO },
    'sitting-submit': { POST: submitSitting },
    'sitting-proctor': { GET: proctorState },
    'sitting-command': { POST: proctorCommand },
    'review-queue': { GET: reviewQueue },
    'review-decide': { POST: decideSitting },
    'certificate-revoke': { POST: revokeCertificate },
    // E13 talent pool (off until a Schood admin sets the engage.talent_pool switch on)
    talent: { GET: getTalent },
    'talent-consent': { POST: consentTalent },
    'talent-withdraw': { POST: withdrawTalent },
    'talent-profile': { POST: saveTalentProfile },
    'talent-search': { GET: searchTalent },
    'talent-candidate': { GET: viewCandidate },
    'talent-audit': { GET: employerAudit },
    'talent-employer': { POST: grantEmployer },
    // E14 win-back and delivery (the bots drain with the service secret)
    inbox: { GET: inbox },
  },
};
