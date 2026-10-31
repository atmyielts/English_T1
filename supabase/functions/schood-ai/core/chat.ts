import { optionalUuid, record, text, uuid } from '../input.ts';
import { buildSystemPrompt, wrapUserMessage } from '../prompt.ts';
import type { ChatMessage } from '../providers/types.ts';
import { resolveSpecialist, runChatGuards } from '../specialists.ts';
import { SchoodAIError, type Message, type RequestContext } from '../types.ts';
import { balanceJson, threadJson } from './views.ts';

// POST /schood-ai/core/chat: one reply from a specialist, streamed as server-sent
// events. Everything that can refuse (plan, role, switches, caps, credits) runs
// before anything is stored or streamed, so a refusal is a plain JSON error. A
// failed answer is refunded; a stop by the person keeps the charge.
//
// Body: { client_message_id, message?, thread_id?, specialist?, regenerate? }
// Events: start {thread, user_message_id, message_id, credits, balance, context},
//         delta {text}, done {message_id}, error {code, reason?, refunded}.

export const MAX_MESSAGE_CHARS = 8_000;
const HISTORY_CHARS = 12_000, HISTORY_MESSAGES = 20, MAX_ANSWER_CHARS = 40_000;

/** The latest turns that fit, oldest first, always ending with the person's message. */
export function trimHistory(turns: { role: 'user' | 'assistant'; content: string }[]): { role: 'user' | 'assistant'; content: string }[] {
  const kept: { role: 'user' | 'assistant'; content: string }[] = [];
  let size = 0;
  for (const turn of [...turns].reverse()) {
    if (kept.length >= HISTORY_MESSAGES || (kept.length > 0 && size + turn.content.length > HISTORY_CHARS)) break;
    kept.unshift(turn);
    size += turn.content.length;
  }
  return kept;
}
const titleFrom = (message: string) => message.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat';

export async function chat(ctx: RequestContext): Promise<Response> {
  const body = record(await ctx.body());
  const clientMessageId = uuid(body.client_message_id, 'client_message_id');
  const regenerate = body.regenerate === true;
  const threadId = optionalUuid(body.thread_id, 'thread_id');
  const message = regenerate ? null : text(body.message, 'message', { max: MAX_MESSAGE_CHARS });
  const access = await ctx.workspace();
  let thread = threadId ? await ctx.repo.thread(threadId) : null;
  if (threadId && (!thread || thread.userId !== ctx.user.id || thread.workspaceId !== access.workspace.id)) throw new SchoodAIError('not_found', 'Conversation not found.', 404);
  if (regenerate && !thread) throw new SchoodAIError('invalid_request', 'Nothing to answer again.', 400);
  const key = thread?.specialistKey ?? (body.specialist === undefined ? 'assistant' : text(body.specialist, 'specialist', { max: 41 }));
  const specialist = resolveSpecialist(key, access.workspace, access.role, await ctx.repo.specialists(access.workspace.id));
  if (!specialist) throw new SchoodAIError('specialist_not_found', 'This assistant is not available here.', 404);
  // Refuse early, before reading context or storing anything.
  await ctx.requireFeature(specialist.creditKey);
  // Area checks (for example the under-18 consent step), before anything is read, stored or charged.
  await runChatGuards(ctx, specialist, access);

  const history: Message[] = thread ? await ctx.repo.messages(thread.id, 60) : [];
  if (history.some((entry) => entry.clientMessageId === clientMessageId)) throw new SchoodAIError('duplicate_message', 'This message was already sent.', 409);
  const stale: Message[] = [];
  if (regenerate) {
    // Answer the person's last message again, replacing a failed or stopped answer.
    while (history.length && history.at(-1)!.role === 'assistant' && history.at(-1)!.status !== 'complete') stale.push(history.pop()!);
    if (history.at(-1)?.role !== 'user') throw new SchoodAIError('nothing_to_retry', 'The last answer is already complete.', 409);
  }
  const turns = trimHistory([
    ...history.filter((entry) => entry.role === 'user' || entry.status === 'complete').map((entry) => ({ role: entry.role, content: entry.content })),
    ...(message ? [{ role: 'user' as const, content: message }] : []),
  ]);
  const blocks = await ctx.context(specialist.contextKinds, { specialist: specialist.key });
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt({ specialist, workspace: access.workspace, locale: ctx.locale, blocks }) },
    ...turns.map((turn) => ({ role: turn.role, content: turn.role === 'user' ? wrapUserMessage(turn.content) : turn.content })),
  ];
  const prepared = await ctx.ai.stream({ key: specialist.creditKey, reference: `chat:${clientMessageId}`, messages, maxTokens: 1500 });
  // The same client message id reached the charge first in another request.
  if (prepared.replayed) throw new SchoodAIError('duplicate_message', 'This message was already sent.', 409);

  // Between the charge and the stream nothing may lose the person's credits.
  let stored;
  try {
    stored = await store();
  } catch (cause) {
    await ctx.repo.refund(prepared.chargeId).catch(() => undefined);
    throw cause;
  }
  const { current, userMessage, answer } = stored;
  async function store() {
    const created = thread ?? await ctx.repo.createThread({ workspaceId: access.workspace.id, userId: ctx.user.id, specialistKey: specialist!.key, pageId: null, title: titleFrom(message ?? '') });
    for (const entry of stale) await ctx.repo.deleteMessage(entry.id);
    const sent = message
      ? await ctx.repo.addMessage({ threadId: created.id, role: 'user', content: message, status: 'complete', clientMessageId, creditKey: null, credits: 0, callId: null, chargeId: null, contextKinds: [], errorCode: null })
      : history.at(-1)!;
    if (!sent) throw new SchoodAIError('duplicate_message', 'This message was already sent.', 409);
    const reply = (await ctx.repo.addMessage({
      threadId: created.id, role: 'assistant', content: '', status: 'streaming', clientMessageId: null, creditKey: specialist!.creditKey,
      credits: prepared.credits, callId: prepared.callId, chargeId: prepared.chargeId, contextKinds: blocks.map((block) => block.kind), errorCode: null,
    }))!;
    await ctx.repo.updateThread(created.id, { touch: true });
    return { current: created, userMessage: sent, answer: reply };
  }

  return ctx.sse(async (send, signal) => {
    send('start', {
      thread: threadJson(current), user_message_id: userMessage.id, message_id: answer.id, credits: prepared.credits,
      balance: balanceJson(prepared.balance), context: blocks.map((block) => ({ kind: block.kind, title: block.title })),
    });
    const result = await prepared.run((delta) => send('delta', { text: delta }), signal);
    const content = result.text.slice(0, MAX_ANSWER_CHARS);
    if (result.status === 'ok') {
      await ctx.repo.updateMessage(answer.id, { content, status: 'complete' });
      send('done', { message_id: answer.id });
    } else if (result.status === 'stopped') {
      await ctx.repo.updateMessage(answer.id, { content, status: 'stopped' });
    } else {
      await ctx.repo.updateMessage(answer.id, { content, status: 'failed', errorCode: (result.code ?? 'ai_failed').slice(0, 64), credits: 0 });
      send('error', { code: 'ai_failed', reason: result.code ?? null, refunded: true });
    }
  });
}
