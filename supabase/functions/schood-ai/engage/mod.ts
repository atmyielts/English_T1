import { registerContextProvider } from '../context.ts';
import type { FeatureModule, RequestContext, RouteHandler } from '../types.ts';
import { begin } from './base.ts';
import { getBoards, getCentreLeague, setCentreLeague } from './boards.ts';
import {
  decideSitting, getSitting, listCertificates, proctorCommand, proctorState, reviewQueue, revokeCertificate, saveAnswers, startSitting, submitSitting, uploadTaskAudio,
} from './certificates.ts';
import { seasonOf } from './content/seasons.ts';
import { pick } from './content/text.ts';
import { activeJourneys, changeGoal, changeJourney, dismissOffer, getJourney, getPath, listJourneys, pathView, progressView, startJourney } from './journeys.ts';
import { leagueStandings, leagueSummary } from './league.ts';
import { getEvents, joinEvent, setSponsor } from './live.ts';
import { ackOutbox, claimOutbox, inbox, tick } from './outbox.ts';
import { createLink, getPassport, importPassport, revokeLink, savePassport, showItem, verifyCertificate, viewPassport } from './passport.ts';
import { buyFreeze, clearBirthDate, getSettings, progressCore, progressState, saveSettings, usageSummary } from './progress.ts';
import { addDate, engageMemoryContext, getMemory, memoryFacts, updateDate } from './remember.ts';
import { addVoiceSample, addWritingSample, deleteSample, sampleAudio, thenVsNow } from './samples.ts';
import { createSquad, getSquad, joinSquad, leaveSquad, nudge, setSquadGoal } from './squads.ts';
import { answerEpisode, fillEpisode, getEpisode, listStories } from './stories.ts';
import { consentTalent, employerAudit, getTalent, grantEmployer, saveTalentProfile, searchTalent, switchTalent, viewCandidate, withdrawTalent } from './talent.ts';

// The lifetime engagement layer (E1–E14). One engine for the web app and every
// coach bot: areas report learning with ctx.events.emit, engage turns verified
// events into XP, streaks, leagues, journeys and the Skill Passport, and every
// message goes through ctx.notify. See docs/product/ai-requests/engage.md for the
// seams other areas and the coordinator wire up.

export { recordSample, type RecordSampleInput } from './samples.ts';
export { registerOfferSource, registerPassportSource, registerSampleSource, registerSittingSource } from './seams.ts';

/**
 * A route anyone with the link may open, without signing in. The core router does
 * not support it yet (requested in docs/product/ai-requests/engage.md); until it
 * does, these routes answer signed-in viewers only. They never use who is asking.
 */
const publicRoute = (handler: RouteHandler): RouteHandler & { public: true } => ({ ...handler, public: true });

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
  registerContextProvider('engage_memory', async (ctx) => await engageMemoryContext(ctx), { selfView: true, maxChars: 3_000 });
  registerContextProvider('engage_progress', async (ctx) => {
    const e = await begin(ctx, { locale: false });
    const { view } = await progressState(e);
    return { kind: 'engage_progress', title: 'Your Schood streak and league', data: { streak: view.streak.current, xp_this_week: view.xp.week, league: view.league.joined ? { tier: view.league.tier, rank: view.league.rank } : null, quests_left: view.quests.filter((quest) => !quest.done).map((quest) => quest.key), enough_today: view.wellbeing.enough_today } };
  }, { selfView: true, maxChars: 1_500 });
}
registerProviders();

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
    'passport-view': publicRoute({ GET: viewPassport }),
    verify: publicRoute({ GET: verifyCertificate }),
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
    // E13 talent pool (switched off until the owner turns it on)
    talent: { GET: getTalent },
    'talent-consent': { POST: consentTalent },
    'talent-withdraw': { POST: withdrawTalent },
    'talent-profile': { POST: saveTalentProfile },
    'talent-search': { GET: searchTalent },
    'talent-candidate': { GET: viewCandidate },
    'talent-audit': { GET: employerAudit },
    'talent-employer': { POST: grantEmployer },
    'talent-switch': { POST: switchTalent },
    // E14 win-back and delivery (the bots drain with the service secret)
    tick: { POST: tick, service: true },
    outbox: { POST: claimOutbox, service: true },
    'outbox-ack': { POST: ackOutbox, service: true },
    inbox: { GET: inbox },
  },
};
