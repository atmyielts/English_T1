import { integer, oneOf, optionalText, record, text, uuid } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { beginFor } from './base.ts';
import { engage } from './binding.ts';
import { settleIfDue } from './league.ts';
import { drainFor, MAX_PER_DAY, planMessages, rowView } from './outbox.ts';
import { weekStart } from './rules.ts';

// Engage's scheduled work, ready for core's coming `system: true` routes (worker
// secret only, no user, run on a documented schedule). Until those land, the bots
// use the per-person service routes `tick`, `outbox` and `outbox-ack` with the
// `ai_engage_due_users` RPC (docs/product/ai-requests/engage.md, section 3), which
// run the same code. Wiring each job is one route entry, for example
//   'system-deliver': { POST: (ctx) => deliverDue(ctx), system: true },
// None of these jobs reads ctx.user.

export interface SystemJob { route: string; schedule: string; does: string }
export const ENGAGE_SYSTEM_JOBS: readonly SystemJob[] = [
  {
    route: 'engage/system-deliver', schedule: '*/15 * * * *',
    does: 'For each person whose chosen hour has come today (once a day, outside 22:00–08:00 local): plans the day (check-ins, streak at risk, comeback, journey behind, win-back on lapse days 2, 7 and 21, last week’s league result, the national mock), then returns their Telegram messages that pass the two-a-day budget, with chat ids, for the bot to send. Body: { bot, limit? }.',
  },
  { route: 'engage/system-ack', schedule: 'after each send', does: 'Marks sent or failed messages: { acks: [{ id, claim, status, reason? }] }. The claim token is the proof.' },
  {
    route: 'engage/system-rollover', schedule: '10 * * * 1',
    does: 'Settles every league group of a finished week once (an hour after the week ends, Monday 00:00 Tashkent): final ranks, promotion and demotion. Reading a league settles too, so this only makes sure quiet groups close on time.',
  },
];

/** engage/system-deliver: plans and drains for the people due now, across all of them. */
export async function deliverDue(ctx: RequestContext) {
  const body = record(await ctx.body());
  const bot = body.bot === undefined ? 'student' : text(body.bot, 'bot', { max: 20 });
  const limit = body.limit === undefined ? 200 : integer(body.limit, 'limit', 1, 500);
  if (!/^[a-z][a-z0-9_]{1,19}$/.test(bot)) return { people: 0, messages: [], failed: 0 };
  const due = await engage(ctx).repo.dueUsers(ctx.now(), limit);
  const messages: (ReturnType<typeof rowView> & { user_id: string; chat_id: string })[] = [];
  let failed = 0;
  for (const person of due) {
    try {
      const e = await beginFor(ctx, { id: person.userId, telegramChatId: person.chatId });
      await planMessages(e);
      for (const row of await drainFor(e, 'telegram', bot, MAX_PER_DAY)) messages.push({ ...rowView(row), user_id: person.userId, chat_id: person.chatId });
    } catch (cause) {
      // One person's failure never stops the others; their messages stay queued.
      failed++;
      console.error(JSON.stringify({ event: 'engage_deliver_failed', request_id: ctx.requestId, user_id: person.userId, error: String(cause) }));
    }
  }
  return { people: due.length, messages, failed };
}

/** engage/system-ack: the bot reports what it sent. */
export async function ackDelivered(ctx: RequestContext) {
  const body = record(await ctx.body());
  const acks = Array.isArray(body.acks) ? body.acks.slice(0, 500) : [];
  const repo = engage(ctx).repo, at = ctx.now().toISOString();
  let done = 0;
  for (const raw of acks) {
    const ack = record(raw);
    const status = oneOf(ack.status, 'status', ['sent', 'failed'] as const);
    if (await repo.finish(uuid(ack.id, 'id'), uuid(ack.claim, 'claim'), status, at, optionalText(ack.reason, 'reason', { max: 80 }))) done++;
  }
  return { done };
}

/** engage/system-rollover: settles finished league weeks that nobody has opened since. */
export async function rolloverLeagues(ctx: RequestContext) {
  const body = record(await ctx.body());
  const limit = body.limit === undefined ? 200 : integer(body.limit, 'limit', 1, 1000);
  const b = engage(ctx), now = ctx.now();
  const groups = await b.repo.unsettledGroups(weekStart(now), limit);
  let settled = 0;
  for (const group of groups) if (await settleIfDue({ b, now }, group)) settled++;
  return { checked: groups.length, settled };
}
