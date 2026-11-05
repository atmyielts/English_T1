import { leagueWeek } from '../../_shared/english-xp.ts';
import { record, text } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, refuse, requireSchoodAdmin, type Engage } from './base.ts';
import { EVENT_KEY, nationalMock, normalisedScore, seasonOf, SEASON_TIERS, tournaments, tournamentScore, type LiveEvent } from './content/seasons.ts';
import { pick } from './content/text.ts';
import { displayName, leaderboardVisibility } from './rules.ts';
import type { EventRow, EventSponsor } from './types.ts';

// E10 Seasons and live events: the quarterly season (XP standings and badges),
// the weekly national mock and the monthly speaking and sales tournaments. Ranking
// uses verified events only. Sponsors are shown with their name, logo and prize
// text set by a Schood admin under a contract; no money moves here.

const sponsorView = (row: EventSponsor | undefined, locale: Engage['locale']) => row ? { name: row.sponsorName, logo_url: row.logoUrl, prize: row.prize[locale] ?? row.prize.en ?? null } : null;

async function standings(e: Engage, event: LiveEvent, joined: string[] | null) {
  const since = new Date(event.opensAt), until = new Date(Math.min(Date.parse(event.closesAt), e.now.getTime()));
  if (until <= since) return [];
  const rows: EventRow[] = joined ? await e.b.repo.eventsOf(joined, since, until, 20_000) : await e.b.repo.eventsByRef(event.counts.refPrefix ?? '-', since, until, 20_000);
  const scores = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.verified || row.score === null || !event.counts.features.includes(row.feature)) continue;
    if (event.counts.refPrefix && !(row.ref ?? '').startsWith(event.counts.refPrefix)) continue;
    if (event.kind === 'national_mock' && row.kind !== 'mock_finished') continue;
    if (event.counts.skills && !event.counts.skills.some((skill) => (row.skill ?? '').startsWith(skill))) continue;
    if (event.kind !== 'national_mock' && row.kind !== 'turn_scored') continue;
    scores.set(row.userId, [...(scores.get(row.userId) ?? []), row.score]);
  }
  const ranked = [...scores].map(([userId, list]) => ({ userId, score: event.kind === 'national_mock' ? Math.max(...list.map(normalisedScore)) : tournamentScore(list), entries: list.length }))
    .filter((row): row is { userId: string; score: number; entries: number } => row.score !== null)
    .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
  const ids = ranked.slice(0, 50).map((row) => row.userId).concat(ranked.some((row) => row.userId === e.userId) ? [e.userId] : []);
  const [profiles, names] = await Promise.all([e.b.repo.profiles(ids), e.b.repo.names(ids)]);
  return ranked.map((row, index) => ({ ...row, rank: index + 1 })).filter((row) => row.rank <= 50 || row.userId === e.userId).map((row) => ({
    rank: row.rank, score: row.score, entries: row.entries, me: row.userId === e.userId,
    name: row.userId === e.userId ? null : displayName(leaderboardVisibility(profiles.get(row.userId)!, e.today), names.get(row.userId) ?? null),
  }));
}

export async function getEvents(ctx: RequestContext) {
  await ctx.requireFeature('E10');
  const e = await begin(ctx);
  await e.b.repo.ingest(e.userId, e.now);
  const season = seasonOf(e.now);
  const week = leagueWeek(e.now).start_date;
  const live = [nationalMock(week), ...tournaments(e.now)];
  const sponsors = new Map((await e.b.repo.sponsors([season.key, ...live.map((event) => event.key)])).map((row) => [row.eventKey, row]));
  const joined = await e.b.repo.joinedEvents(e.userId);
  // Season standings: the person's own XP in the season and the badge thresholds; nothing random, nothing for sale.
  const xp = (await e.b.repo.xpSince(e.userId, season.startsOn)).filter((row) => row.day <= season.endsOn).reduce((sum, row) => sum + row.xp, 0);
  const events = [];
  for (const event of live) {
    const open = e.now.getTime() >= Date.parse(event.opensAt) && e.now.getTime() < Date.parse(event.closesAt);
    const entrants = event.join ? (await e.b.repo.eventEntries(event.key)).map((row) => row.userId) : null;
    const board = event.kind === 'national_mock' ? await standings(e, event, null) : entrants && entrants.length ? await standings(e, event, entrants) : [];
    events.push({
      key: event.key, kind: event.kind, title: pick(event.title, e.locale), lead: pick(event.lead, e.locale), opens_at: event.opensAt, closes_at: event.closesAt, open,
      upcoming: e.now.getTime() < Date.parse(event.opensAt), joinable: event.join, joined: !event.join || joined.includes(event.key), link: event.link,
      entrants: entrants?.length ?? null, standings: board, sponsor: sponsorView(sponsors.get(event.key), e.locale),
    });
  }
  return {
    season: {
      key: season.key, quarter: season.quarter, year: season.year, starts_on: season.startsOn, ends_on: season.endsOn, days_left: season.daysLeft,
      title: pick(season.theme.title, e.locale), lead: pick(season.theme.lead, e.locale), spotlight: season.theme.spotlight,
      xp, tiers: SEASON_TIERS, reached: SEASON_TIERS.filter((tier) => xp >= tier.xp).map((tier) => tier.key).at(-1) ?? null,
      sponsor: sponsorView(sponsors.get(season.key), e.locale),
    },
    events,
  };
}

export async function joinEvent(ctx: RequestContext) {
  await ctx.requireFeature('E10');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const key = text(body.key, 'key', { max: 60 });
  const event = tournaments(e.now).find((entry) => entry.key === key) ?? refuse('not_found', 'This event is not open for joining.', 404);
  if (e.now.getTime() >= Date.parse(event.closesAt)) refuse('event_closed', 'This event has ended.', 409);
  await e.b.repo.joinEvent(event.key, e.userId);
  return await getEvents(ctx);
}

/** Sponsor text for an event, by contract. Schood admins only; nothing here takes a payment. */
export async function setSponsor(ctx: RequestContext) {
  await requireSchoodAdmin(ctx);
  const e = await begin(ctx, { locale: false });
  const body = record(await ctx.body());
  const key = text(body.key, 'key', { max: 60 });
  if (!EVENT_KEY.test(key)) refuse('invalid_request', 'key must be a season, mock or tournament key.', 400, { field: 'key' });
  const name = text(body.sponsor_name, 'sponsor_name', { max: 80 });
  const logo = body.logo_url === undefined || body.logo_url === null || body.logo_url === '' ? null : text(body.logo_url, 'logo_url', { max: 300 });
  if (logo && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s"'<>]*)?$/i.test(logo)) refuse('invalid_request', 'logo_url must be an https link.', 400, { field: 'logo_url' });
  const prizeRaw = record(body.prize ?? {}, 'prize');
  const prize: Partial<Record<'en' | 'uz' | 'ru', string>> = {};
  for (const locale of ['en', 'uz', 'ru'] as const) if (typeof prizeRaw[locale] === 'string' && prizeRaw[locale]) prize[locale] = text(prizeRaw[locale], `prize.${locale}`, { max: 200 });
  const row = await e.b.repo.saveSponsor({ eventKey: key, sponsorName: name, logoUrl: logo, prize, updatedBy: e.userId });
  await ctx.audit('engage.sponsor_set', { key, sponsor: name });
  return { sponsor: sponsorView(row, 'en'), key };
}
