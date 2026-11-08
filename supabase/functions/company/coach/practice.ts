// Phrasebook reading and the pronunciation and shadowing round: listen, repeat, compare
// the words. Only the words are compared and no audio ever reaches the server.
import { fetchAll } from '../people/shared.ts';
import { memberProgress, seededShuffle } from '../training/lessons.ts';
import { findLesson, findTrack } from '../training/tracks/index.ts';
import { check, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { obj, oneOf, text } from '../util.ts';
import { compareSpoken } from './compare.ts';
import { ALL_PHRASES, findPhrase, findSituation, PHRASEBOOK_VERSION, phrasesFor, SITUATIONS } from './phrasebook/index.ts';
import { situationsFor } from './plan.ts';
import type { Localized } from './phrasebook/types.ts';
import { countLog, creditPractice, logOnce, seated, today } from './shared.ts';

const ROUND = 8;
/** Phrases to shadow in a day before the plan calls that step done. */
export const SHADOW_TARGET = 3;

async function expectedFor(ctx: Ctx, member: MemberRow, ref: string): Promise<string> {
  if (ref.startsWith('p:')) {
    const phrase = findPhrase(ref.slice(2));
    if (phrase) return phrase.en;
  } else if (ref.startsWith('c:') && UUID.test(ref.slice(2))) {
    const card = check<{ front: string } | null>(await ctx.db.from('company_coach_cards').select('front').eq('id', ref.slice(2)).eq('org_id', ctx.org!.id).eq('member_id', member.id).is('deleted_at', null).maybeSingle());
    if (card) return card.front;
  }
  if (ref.startsWith('d:')) {
    const [, code, position] = ref.split(':');
    const line = findSituation(code ?? '')?.dialogue?.lines[Number(position)];
    if (line) return line.en;
  }
  if (ref.startsWith('l:')) {
    const [, code, position] = ref.split(':');
    const line = findLesson(code ?? '')?.lesson.dialogue.lines[Number(position)];
    if (line) return line.text;
  }
  throw new CompanyError('phrase_not_found', 'No such phrase.', 404);
}

/** The lesson touched last, else the first of the person's track: its dialogue is job English they meet anyway. */
async function latestLesson(ctx: Ctx, member: MemberRow) {
  const progress = await memberProgress(ctx, member.id);
  const last = [...progress].sort((a, b) => String(b.updated_at ?? '') < String(a.updated_at ?? '') ? -1 : 1).find((row) => findLesson(row.lesson_code));
  return last ? findLesson(last.lesson_code)!.lesson : (findTrack(member.job_role) ?? findTrack('general'))!.lessons[0];
}

export const routes: Route[] = [
  {
    // All of it at once: the app keeps a copy for when the connection is poor. `saved` is what is already in the deck.
    method: 'GET', path: 'orgs/:org/coach/phrasebook', access: 'org',
    async handle(ctx) {
      const member = seated(ctx);
      const saved = await fetchAll<{ source_ref: string | null }>(() => ctx.db.from('company_coach_cards').select('source_ref').eq('member_id', member.id).eq('source', 'phrasebook').is('deleted_at', null).order('id'));
      return { version: PHRASEBOOK_VERSION, total: ALL_PHRASES.length, situations: SITUATIONS, saved: saved.map((row) => row.source_ref).filter(Boolean), recommended: situationsFor(member.job_role) };
    },
  },
  {
    // A round of phrases to repeat: from one situation at the person's level, or from their own deck.
    method: 'GET', path: 'orgs/:org/coach/shadow', access: 'org',
    async handle(ctx, _params, _body, query) {
      const member = seated(ctx);
      const day = today(ctx);
      const asked = query.get('situation');
      const recommended = situationsFor(member.job_role);
      const situation = asked === 'deck' || asked === 'lesson' || asked?.startsWith('talk:') && findSituation(asked.slice(5)) || (asked && findSituation(asked)) ? asked! : recommended[0];
      let items: { ref: string; en: string; ru: string | null; uz: string | null; speaker?: string | Localized }[];
      let lessonTitle = null;
      const talk = asked?.startsWith('talk:') ? findSituation(asked.slice(5))?.dialogue : null;
      if (talk) {
        items = talk.lines.map((line, index) => ({ ref: `d:${talk.situation}:${index}`, en: line.en, ru: line.ru, uz: line.uz, speaker: line.who === 'a' ? talk.a : talk.b }));
        lessonTitle = talk.title;
      } else if (situation === 'lesson') {
        const lesson = await latestLesson(ctx, member);
        lessonTitle = lesson.title;
        items = lesson.dialogue.lines.map((line, index) => ({ ref: `l:${lesson.code}:${index}`, en: line.text, ru: null, uz: null, speaker: line.speaker })).filter((line) => line.en.length <= 200);
      } else if (situation === 'deck') {
        const cards = check<{ id: string; front: string; ru: string | null; uz: string | null }[]>(
          await ctx.db.from('company_coach_cards').select('id,front,ru,uz').eq('org_id', ctx.org!.id).eq('member_id', member.id).eq('suspended', false).is('deleted_at', null).gt('reps', 0).order('last_reviewed_at', { ascending: false }).limit(40),
        );
        items = seededShuffle(cards, `${member.id}:${day}`).slice(0, ROUND).map((card) => ({ ref: `c:${card.id}`, en: card.front, ru: card.ru, uz: card.uz }));
      } else {
        items = seededShuffle(phrasesFor(situation, member.level), `${member.id}:${day}:${situation}`).slice(0, ROUND).map((phrase) => ({ ref: `p:${phrase.id}`, en: phrase.en, ru: phrase.ru, uz: phrase.uz }));
      }
      return {
        situation, recommended, items, lesson_title: lessonTitle, target: SHADOW_TARGET, done_today: await countLog(ctx, member, ['shadow'], day),
        situations: SITUATIONS.map(({ code, title }) => ({ code, title })),
      };
    },
  },
  {
    // One try. A phrase counts once a day however many times it is retried; the best score stays.
    method: 'POST', path: 'orgs/:org/coach/shadow', access: 'org',
    async handle(ctx, _params, body) {
      const member = seated(ctx);
      const input = obj(body);
      const ref = text(input.ref, 'ref', { min: 3, max: 60 })!;
      const said = text(input.said, 'said', { min: 1, max: 800 })!;
      const heard = oneOf(input.input, ['speech', 'typed'] as const, 'input');
      const expected = await expectedFor(ctx, member, ref);
      const result = compareSpoken(expected, said);
      const day = today(ctx);
      const first = await logOnce(ctx, member, day, 'shadow', ref, result.score);
      if (first) await creditPractice(ctx, member, day);
      else check(await ctx.db.from('company_coach_log').update({ score: result.score }).eq('member_id', member.id).eq('day', day).eq('kind', 'shadow').eq('ref', ref.slice(0, 120)).lt('score', result.score));
      return { ...result, input: heard, expected, passed: result.score >= 80, done_today: await countLog(ctx, member, ['shadow'], day), target: SHADOW_TARGET };
    },
  },
];
