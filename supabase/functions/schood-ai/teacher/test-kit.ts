import { completion, fixture, type FixtureOptions } from '../fixture.test.ts';
import type { FunctionCallInit, RequestContext } from '../types.ts';
import { setTeacherDeps, type TelegramApi, type TelegramFailure, type TelegramReply } from './deps.ts';
import { createMemoryTeacherStore } from './memory-store.ts';

// Shared kit for the teacher area's route tests: core's fixture (real handler,
// gateway, plans and memory repository with a fake model behind fetch) plus the
// teacher deps: the memory teacher store, a fake Academy / Assessment Cloud reached
// only with the person's own token, and a fake Telegram Bot API.

export const ACADEMY = '30000000-0000-4000-8000-000000000001';
export const TENANT = '30000000-0000-4000-8000-000000000002';
export const BANK = '30000000-0000-4000-8000-000000000003';

export interface RemoteRecord { token: string | null; name: string; path: string; init: FunctionCallInit & { headers?: Record<string, string> } }

export function teacherFixture(options: FixtureOptions & { academy?: 'ok' | 'down' } = {}) {
  const f = fixture(options);
  const teacher = createMemoryTeacherStore();
  const remote: RemoteRecord[] = [];
  const assignments: Record<string, unknown>[] = [];
  const items: { key: string; body: Record<string, unknown> }[] = [];
  const telegramCalls: { method: string; body: Record<string, unknown> }[] = [];
  let telegramNext: ((method: string, body: Record<string, unknown>) => TelegramReply | TelegramFailure) | null = null;
  const telegram: TelegramApi = {
    username: 'schood_teacher_bot',
    call(method, body) {
      telegramCalls.push({ method, body });
      if (telegramNext) { const reply = telegramNext(method, body); if (reply) return Promise.resolve(reply); }
      if (method === 'getMe') return Promise.resolve({ ok: true, result: { id: 4242, username: 'schood_teacher_bot' } });
      if (method === 'getChat') return Promise.resolve({ ok: true, result: { id: -1001234567890, type: 'channel', title: 'IELTS with Aziza', username: 'ielts_with_aziza' } });
      if (method === 'getChatMember') return Promise.resolve({ ok: true, result: { status: 'administrator', can_post_messages: true } });
      return Promise.resolve({ ok: true, result: { message_id: 1000 + telegramCalls.length } });
    },
  };
  const academyDown = options.academy === 'down';
  setTeacherDeps({
    store: teacher.store,
    telegram,
    appOrigin: 'https://ai.schood.online',
    async callFunction<T>(ctx: RequestContext, name: string, path: string, init: FunctionCallInit & { headers?: Record<string, string> }): Promise<T> {
      remote.push({ token: ctx.user.token, name, path, init });
      if (!ctx.user.token) throw new Error('no token');
      const body = (init.body ?? {}) as Record<string, unknown>;
      if (name === 'academy' || name === 'academy-learning') {
        if (academyDown) throw new Error('academy down');
        if (body.action === 'academies') return { academies: [{ id: ACADEMY, name: 'Registan Academy' }] } as T;
        if (body.action === 'classrooms') return { classrooms: [{ id: 'cls-5b', name: '5B IELTS', member_count: 14, is_active: true }, { id: 'cls-old', name: 'Old', is_active: false }] } as T;
        if (body.action === 'homework_mistakes') return { mistakes: [], tags: [{ tag: 'tfng_not_given', open: 9, total: 14 }, { tag: 'word_limit', open: 4, total: 6 }] } as T;
        if (body.action === 'create_assignment') {
          assignments.push({ ...body, token: ctx.user.token });
          return { assignment: { id: `asg-${assignments.length}`, classroom_id: body.classroom_id } } as T;
        }
      }
      if (name === 'assessment-cloud') {
        if (path === '/workspaces') return { data: [{ tenant_id: TENANT, role: 'owner', tenants: { name: 'Registan Assessments' } }] } as T;
        if (path === '/item-banks') return { data: [{ id: BANK, title: 'IELTS Reading bank' }] } as T;
        if (path === '/commands') {
          const key = init.headers?.['Idempotency-Key'] ?? '';
          if (!items.some((entry) => entry.key === key)) items.push({ key, body });
          return { data: { id: `v-${items.length}`, item_id: `item-${items.findIndex((entry) => entry.key === key) + 1}`, version: 1 } } as T;
        }
      }
      throw new Error(`unexpected call ${name}${path}`);
    },
  });
  return {
    ...f, teacher, remote, assignments, items, telegramCalls,
    setTelegram: (next: typeof telegramNext) => { telegramNext = next; },
    reset: () => setTeacherDeps(null),
  };
}

/** The last user message of a model request, as text. */
export async function promptOf(request: Request): Promise<{ system: string; user: string; images: number }> {
  const body = await request.json();
  const messages = body.messages as { role: string; content: string | { type: string; text?: string }[] }[];
  const flat = (content: string | { type: string; text?: string }[]) => typeof content === 'string' ? content : content.map((part) => part.text ?? '').join('\n');
  const images = messages.flatMap((message) => typeof message.content === 'string' ? [] : message.content.filter((part) => part.type === 'image_url' || part.type === 'image')).length;
  return { system: flat(messages.find((message) => message.role === 'system')?.content ?? ''), user: flat(messages.filter((message) => message.role === 'user').at(-1)?.content ?? ''), images };
}
export const reply = (value: unknown) => completion(JSON.stringify(value));
