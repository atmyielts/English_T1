// The personal deck: cards come from completed lessons and the company glossary on
// their own, and the learner adds more. Reviews follow the schedule in srs.ts. All of
// it is private to the learner and needs a working seat.
import { csv } from '../insights/common.ts';
import { fetchAll } from '../people/shared.ts';
import { memberProgress } from '../training/lessons.ts';
import { findLesson } from '../training/tracks/index.ts';
import { check, checkUnique, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { int, obj, oneOf, text, uuid } from '../util.ts';
import { frontKey, typedMatch } from './compare.ts';
import { findPhrase, phrasesFor } from './phrasebook/index.ts';
import { situationsFor } from './plan.ts';
import { modeForSkills, weakSkills } from './skills.ts';
import { countLog, creditPractice, logOnce, readSettings, saveSettings, seated, today, type SettingsRow } from './shared.ts';
import { MATURE_STABILITY, modeFor, schedule, type Grade, type Schedule } from './srs.ts';

/** A person's whole deck, removed markers included. */
export const MAX_DECK = 3000;
/** New cards a person meets in a Tashkent day, so a finished track does not become a wall. */
export const NEW_PER_DAY = 8;
const QUEUE_MAX = 40;

export interface CardRow extends Schedule {
  id: string; org_id: string; member_id: string; source: 'lesson' | 'glossary' | 'phrasebook' | 'finder' | 'own'; source_ref: string | null;
  front: string; front_key: string; ru: string | null; uz: string | null; note: string | null; suspended: boolean; deleted_at?: string | null; created_at?: string;
}
export const CARD_COLUMNS = 'id,org_id,member_id,source,source_ref,front,front_key,ru,uz,note,state,stability,difficulty,reps,lapses,due_on,last_reviewed_at,suspended,deleted_at,created_at';

export function cardView(row: CardRow) {
  const { id, source, source_ref, front, ru, uz, note, state, stability, reps, lapses, due_on, last_reviewed_at, suspended } = row;
  return { id, source, source_ref, front, ru, uz, note, state, stability, reps, lapses, due_on, last_reviewed_at, suspended, mode: modeFor(row) };
}

const newCard = (ctx: Ctx, member: MemberRow, card: { source: CardRow['source']; source_ref: string | null; front: string; ru: string | null; uz: string | null; note: string | null }) => ({
  org_id: ctx.org!.id, member_id: member.id, user_id: member.user_id, ...card, front: card.front.slice(0, 300), front_key: frontKey(card.front),
  ru: card.ru?.slice(0, 300) ?? null, uz: card.uz?.slice(0, 300) ?? null, note: card.note?.slice(0, 500) ?? null,
  state: 'new', stability: 0, difficulty: 5, reps: 0, lapses: 0, due_on: null, suspended: false,
});

/** Starts an empty deck with phrases from the situations this job meets first. */
const STARTER_CARDS = 12;

/**
 * Brings completed lessons and the glossary into the deck. It runs only when they changed
 * (`sync_key`), and the unique index means two tabs syncing together cannot duplicate cards.
 * A card the learner removed stays as a marker, so it does not come back.
 */
export async function syncDeck(ctx: Ctx, member: MemberRow, settings: SettingsRow): Promise<SettingsRow> {
  const progress = await memberProgress(ctx, member.id);
  const completed = progress.filter((row) => row.status === 'completed');
  const terms = (await fetchAll<{ id: string; term: string; meaning: string; ru: string | null; uz: string | null; department_id: string | null; updated_at?: string }>(
    () => ctx.db.from('company_glossary_terms').select('id,term,meaning,ru,uz,department_id,updated_at').eq('org_id', ctx.org!.id).order('id'),
  )).filter((row) => row.department_id === null || row.department_id === member.department_id);
  const latest = terms.reduce((max, row) => (row.updated_at ?? '') > max ? row.updated_at ?? '' : max, '');
  const key = `${completed.length}:${terms.length}:${latest.slice(0, 19)}`;
  if (settings.sync_key === key) return settings;

  const existing = new Set((await fetchAll<{ front_key: string }>(() => ctx.db.from('company_coach_cards').select('front_key').eq('member_id', member.id).order('id'))).map((row) => row.front_key));
  const empty = existing.size === 0;
  const rows: ReturnType<typeof newCard>[] = [];
  const add = (card: Parameters<typeof newCard>[2]) => {
    const row = newCard(ctx, member, card);
    if (row.front_key && !existing.has(row.front_key)) {
      existing.add(row.front_key);
      rows.push(row);
    }
  };
  for (const entry of completed) {
    const lesson = findLesson(entry.lesson_code)?.lesson;
    if (!lesson) continue;
    for (const phrase of lesson.phrases) add({ source: 'lesson', source_ref: lesson.code, front: phrase.en, ru: phrase.ru, uz: phrase.uz, note: null });
    for (const word of lesson.words) add({ source: 'lesson', source_ref: lesson.code, front: word.en, ru: word.ru, uz: word.uz, note: word.note ?? null });
  }
  for (const term of terms) add({ source: 'glossary', source_ref: term.id, front: term.term, ru: term.ru, uz: term.uz, note: term.meaning });
  if (empty && rows.length < STARTER_CARDS) {
    const levelled = situationsFor(member.job_role).flatMap((situation) => phrasesFor(situation, member.level));
    for (const phrase of levelled.slice(0, STARTER_CARDS)) add({ source: 'phrasebook', source_ref: phrase.id, front: phrase.en, ru: phrase.ru, uz: phrase.uz, note: null });
  }
  const room = Math.max(0, MAX_DECK - (existing.size - rows.length));
  const adding = rows.slice(0, room);
  for (let from = 0; from < adding.length; from += 200) {
    check(await ctx.db.from('company_coach_cards').upsert(adding.slice(from, from + 200), { onConflict: 'member_id,front_key', ignoreDuplicates: true }));
  }
  await saveSettings(ctx, member, { sync_key: key });
  return { ...settings, sync_key: key };
}

const deckQuery = (ctx: Ctx, member: MemberRow) => ctx.db.from('company_coach_cards').select(CARD_COLUMNS).eq('org_id', ctx.org!.id).eq('member_id', member.id).is('deleted_at', null);

async function countCards(ctx: Ctx, member: MemberRow, filter: (query: ReturnType<typeof deckQuery>) => ReturnType<typeof deckQuery>): Promise<number> {
  const { count, error } = await filter(ctx.db.from('company_coach_cards').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org!.id).eq('member_id', member.id).is('deleted_at', null).eq('suspended', false));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Cards due now and new cards still open today. */
export async function deckCounts(ctx: Ctx, member: MemberRow, day: string) {
  const due = await countCards(ctx, member, (query) => query.not('due_on', 'is', null).lte('due_on', day));
  const fresh = await countCards(ctx, member, (query) => query.is('due_on', null));
  const metToday = await countLog(ctx, member, ['review_new'], day);
  return { due, new_total: fresh, new_today: Math.min(fresh, Math.max(0, NEW_PER_DAY - metToday)), reviewed_today: await countLog(ctx, member, ['review'], day) };
}

const SOURCE_ORDER: Record<CardRow['source'], number> = { own: 0, finder: 0, phrasebook: 1, lesson: 2, glossary: 3 };

/** The cards to review now: what is due first, then a few new ones with the learner's own first. */
export async function reviewQueue(ctx: Ctx, member: MemberRow, day: string, limit = QUEUE_MAX) {
  const counts = await deckCounts(ctx, member, day);
  const due = check<CardRow[]>(await deckQuery(ctx, member).eq('suspended', false).not('due_on', 'is', null).lte('due_on', day).order('due_on').order('id').limit(limit));
  const room = Math.min(limit - due.length, counts.new_today);
  const fresh = room > 0
    ? check<CardRow[]>(await deckQuery(ctx, member).eq('suspended', false).is('due_on', null).order('created_at').order('id').limit(200))
    : [];
  const chosen = [...fresh].sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]).slice(0, Math.max(0, room));
  return { cards: [...due, ...chosen], counts };
}

async function ownCard(ctx: Ctx, member: MemberRow, id: string): Promise<CardRow> {
  const row = check<CardRow | null>(await deckQuery(ctx, member).eq('id', uuid(id, 'card')).maybeSingle());
  if (!row) throw new CompanyError('card_not_found', 'This card is not in your deck.', 404);
  return row;
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/coach/queue', access: 'org',
    async handle(ctx) {
      const member = seated(ctx);
      await syncDeck(ctx, member, await readSettings(ctx, member));
      const { cards, counts } = await reviewQueue(ctx, member, today(ctx));
      const weak = await weakSkills(ctx, member);
      return { cards: cards.map((card) => { const view = cardView(card); return { ...view, mode: modeForSkills(view.mode, weak) }; }), weak, ...counts };
    },
  },
  {
    // One answer. `reps` is how many answers the card had when it was shown, so a double
    // click or a second tab finds it already moved and counts nothing.
    method: 'POST', path: 'orgs/:org/coach/reviews', access: 'org',
    async handle(ctx, _params, body) {
      const member = seated(ctx);
      const input = obj(body);
      const card = await ownCard(ctx, member, String(input.card ?? ''));
      const reps = int(input.reps, 'reps', { max: 1_000_000 })!;
      const mode = oneOf(input.mode, ['intro', 'listen', 'recall', 'type'] as const, 'mode');
      let match: 'exact' | 'close' | 'wrong' | null = null;
      let grade: Grade;
      if (mode === 'type') {
        match = typedMatch(card.front, text(input.typed, 'typed', { max: 400 }) ?? '');
        grade = match === 'exact' ? 3 : match === 'close' ? 2 : 1;
      } else {
        grade = int(input.grade, 'grade', { min: 1, max: 4 }) as Grade;
      }
      if (card.reps !== reps) return { status: 'duplicate', card: cardView(card), match, expected: card.front };
      const day = today(ctx), at = ctx.now().toISOString();
      const next = schedule(card, grade, day, at);
      const moved = check<CardRow[]>(await ctx.db.from('company_coach_cards').update(next).eq('id', card.id).eq('member_id', member.id).eq('reps', reps).select(CARD_COLUMNS));
      if (!moved.length) return { status: 'duplicate', card: cardView(card), match, expected: card.front };
      await logOnce(ctx, member, day, 'review', `${card.id}:${reps}`, grade * 25);
      if (reps === 0) await logOnce(ctx, member, day, 'review_new', card.id);
      await creditPractice(ctx, member, day);
      return { status: 'ok', card: cardView(moved[0]), match, expected: card.front, again: grade === 1, reviewed_today: await countLog(ctx, member, ['review'], day) };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/coach/deck', access: 'org',
    async handle(ctx) {
      const member = seated(ctx);
      await syncDeck(ctx, member, await readSettings(ctx, member));
      const day = today(ctx);
      const cards = await fetchAll<CardRow>(() => deckQuery(ctx, member).order('created_at', { ascending: false }).order('id'), MAX_DECK);
      const live = cards.filter((row) => !row.suspended);
      return {
        cards: cards.map(cardView),
        stats: {
          total: cards.length, learned: live.filter((row) => row.stability >= MATURE_STABILITY).length,
          due: live.filter((row) => row.due_on && row.due_on <= day).length, new: live.filter((row) => !row.due_on).length, paused: cards.length - live.length,
        },
        max: MAX_DECK,
      };
    },
  },
  {
    // The learner's own copy of their phrases, safe to open in a spreadsheet.
    method: 'GET', path: 'orgs/:org/coach/deck/export', access: 'org',
    async handle(ctx) {
      const member = seated(ctx);
      const cards = await fetchAll<CardRow>(() => deckQuery(ctx, member).order('created_at').order('id'), MAX_DECK);
      return { filename: 'schood-phrases.csv', csv: csv(['english', 'russian', 'uzbek', 'note', 'source', 'next_review'], cards.map((row) => [row.front, row.ru, row.uz, row.note, row.source, row.due_on])) };
    },
  },
  {
    // Save a phrasebook phrase by id, or any phrase of the learner's own or from the phrase finder.
    // Saving what is already there is fine: the answer says so and nothing changes.
    method: 'POST', path: 'orgs/:org/coach/cards', access: 'org',
    async handle(ctx, _params, body) {
      const member = seated(ctx);
      const input = obj(body);
      let card: Parameters<typeof newCard>[2];
      if (input.phrase !== undefined) {
        const phrase = findPhrase(String(input.phrase));
        if (!phrase) throw new CompanyError('phrase_not_found', 'No such phrase.', 404);
        card = { source: 'phrasebook', source_ref: phrase.id, front: phrase.en, ru: phrase.ru, uz: phrase.uz, note: null };
      } else {
        card = {
          source: oneOf(input.source, ['own', 'finder'] as const, 'source', 'own'), source_ref: null,
          front: text(input.front, 'front', { min: 2, max: 300 })!,
          ru: text(input.ru, 'ru', { max: 300, optional: true }),
          uz: text(input.uz, 'uz', { max: 300, optional: true }),
          note: text(input.note, 'note', { max: 500, optional: true }),
        };
      }
      const key = frontKey(card.front);
      if (!/\p{L}/u.test(key)) throw new CompanyError('invalid_field', 'Write the phrase in words.', 400, { field: 'front' });
      const found = check<CardRow | null>(await ctx.db.from('company_coach_cards').select(CARD_COLUMNS).eq('member_id', member.id).eq('front_key', key).maybeSingle());
      if (found && !found.deleted_at) return { card: cardView(found), already: true };
      if (found) {
        // Removed before and wanted again: it starts over.
        const revived = check<CardRow>(await ctx.db.from('company_coach_cards').update({ ...newCard(ctx, member, card), deleted_at: null, last_reviewed_at: null }).eq('id', found.id).eq('member_id', member.id).select(CARD_COLUMNS).single());
        return { card: cardView(revived), already: false };
      }
      const { count, error } = await ctx.db.from('company_coach_cards').select('id', { count: 'exact', head: true }).eq('member_id', member.id);
      if (error) throw new Error(error.message);
      if ((count ?? 0) >= MAX_DECK) throw new CompanyError('deck_full', `A deck holds up to ${MAX_DECK} cards. Remove some to add more.`, 409, { max: MAX_DECK });
      const inserted = await ctx.db.from('company_coach_cards').insert(newCard(ctx, member, card)).select(CARD_COLUMNS).single();
      if (inserted.error?.code === '23505') {
        const again = check<CardRow>(await ctx.db.from('company_coach_cards').select(CARD_COLUMNS).eq('member_id', member.id).eq('front_key', key).single());
        return { card: cardView(again), already: true };
      }
      return { card: cardView(check<CardRow>(inserted)), already: false };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/coach/cards/:card', access: 'org',
    async handle(ctx, params, body) {
      const member = seated(ctx);
      const card = await ownCard(ctx, member, params.card);
      const input = obj(body);
      const patch: Record<string, unknown> = {};
      if (input.front !== undefined) {
        patch.front = text(input.front, 'front', { min: 2, max: 300 });
        patch.front_key = frontKey(String(patch.front));
        if (!/\p{L}/u.test(String(patch.front_key))) throw new CompanyError('invalid_field', 'Write the phrase in words.', 400, { field: 'front' });
      }
      if (input.ru !== undefined) patch.ru = text(input.ru, 'ru', { max: 300, optional: true });
      if (input.uz !== undefined) patch.uz = text(input.uz, 'uz', { max: 300, optional: true });
      if (input.note !== undefined) patch.note = text(input.note, 'note', { max: 500, optional: true });
      if (input.suspended !== undefined) {
        if (typeof input.suspended !== 'boolean') throw new CompanyError('invalid_field', 'suspended must be true or false.', 400, { field: 'suspended' });
        patch.suspended = input.suspended;
      }
      if (!Object.keys(patch).length) return { card: cardView(card) };
      const row = checkUnique<CardRow>(
        await ctx.db.from('company_coach_cards').update(patch).eq('id', card.id).eq('member_id', member.id).select(CARD_COLUMNS).single(),
        () => new CompanyError('card_duplicate', 'This phrase is already in your deck.', 409, { field: 'front' }),
      );
      return { card: cardView(row) };
    },
  },
  {
    // Lesson and glossary cards stay as a marker so the next sync leaves them out. Text the learner brought goes for good.
    method: 'DELETE', path: 'orgs/:org/coach/cards/:card', access: 'org',
    async handle(ctx, params) {
      const member = seated(ctx);
      const card = await ownCard(ctx, member, params.card);
      if (card.source === 'lesson' || card.source === 'glossary') check(await ctx.db.from('company_coach_cards').update({ deleted_at: ctx.now().toISOString(), suspended: true }).eq('id', card.id).eq('member_id', member.id));
      else check(await ctx.db.from('company_coach_cards').delete().eq('id', card.id).eq('member_id', member.id));
      return { ok: true };
    },
  },
];
