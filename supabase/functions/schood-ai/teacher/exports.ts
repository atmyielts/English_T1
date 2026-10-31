import { assessmentItems, materialText, parseMaterial, studentView, telegramMessages, type Material } from '../../../../packages/ai-core/src/materials/mod.ts';
import { registerActionKind } from '../actions.ts';
import { isUuid, oneOf, optionalText, record, text, uuid } from '../input.ts';
import { SchoodAIError, type Locale, type RequestContext } from '../types.ts';
import { brandingView } from '../core/views.ts';
import { academyGroups, createAssignment, weakSpots } from './academy.ts';
import { teacherDeps, teacherStore } from './deps.ts';
import { approvedPage } from './library.ts';
import type { PageView } from '../library.ts';
import { recordListingUse } from './market.ts';
import { actionView } from './views.ts';

// Exports of an approved material (T1): Telegram-ready text, print (the app's print
// stylesheet; the server only counts the use), a student handout link, a Homework OS
// assignment and Assessment Cloud draft items. The last two act on another service,
// so they are Approve & run actions that run with the approving teacher's own token.

const encoder = new TextEncoder();
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A link to the student version of an approved page; students sign in with Schood to open it. */
export async function createHandout(ctx: RequestContext, page: PageView): Promise<{ id: string; url: string }> {
  const store = ctx.store(teacherStore), { appOrigin } = await teacherDeps();
  const secret = token();
  const handout = await store.createHandout({ workspaceId: page.workspace_id, pageId: page.id, tokenHash: await sha256(secret), createdBy: ctx.user.id });
  return { id: handout.id, url: `${appOrigin}/handout/${secret}` };
}

/** GET teacher/handout?token=: the student version, for any signed-in person with the link. */
export async function getHandout(ctx: RequestContext) {
  const secret = ctx.query.get('token') ?? '';
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(secret)) throw new SchoodAIError('not_found', 'This link is not valid.', 404);
  const store = ctx.store(teacherStore);
  const handout = await store.handoutByHash(await sha256(secret));
  if (!handout || handout.revokedAt) throw new SchoodAIError('not_found', 'This link is not valid.', 404);
  // The link is the permission: the page itself stays in the teacher's library.
  const page = await ctx.repo.page(handout.pageId);
  if (!page || page.status !== 'approved' || !page.material) throw new SchoodAIError('not_found', 'This link is not valid.', 404);
  const workspace = await ctx.repo.workspace(page.workspaceId);
  let material: Material;
  try { material = studentView(parseMaterial(page.material)); } catch { throw new SchoodAIError('not_found', 'This link is not valid.', 404); }
  return { material, workspace: workspace ? { name: workspace.kind === 'centre' ? workspace.name : null, branding: brandingView(workspace.branding) } : null };
}

const LINK_LABEL: Record<Locale, string> = { en: 'Open the full task', uz: 'Topshiriqni to‘liq ochish', ru: 'Открыть задание целиком' };
/** Homework OS takes up to 4,000 characters: the student text when it fits, else its start, always with the link. */
export function homeworkDescription(material: Material, instructions: string | null, url: string, locale: Locale): string {
  const link = `\n\n${LINK_LABEL[locale]}: ${url}`;
  const intro = instructions ? `${instructions}\n\n` : '';
  // The assignment has the title already, so the description starts with the material itself.
  const text = materialText(studentView(material));
  const body = text.startsWith(material.title) ? text.slice(material.title.length).trimStart() : text;
  const room = 4000 - intro.length - link.length;
  return `${intro}${body.length <= room ? body : `${body.slice(0, Math.max(0, room - 1)).trimEnd()}…`}${link}`;
}

const SUMMARY = {
  homework: { en: 'Assign “{title}” to {group} in Homework OS', uz: '“{title}”ni Homework OS’da {group} guruhiga topshiriq qilish', ru: 'Задать «{title}» группе {group} в Homework OS' },
  assessment: { en: 'Add {count} draft items from “{title}” to {bank} in Assessment Cloud', uz: '“{title}”dan {count} ta qoralama savolni Assessment Cloud’dagi {bank} bankiga qo‘shish', ru: 'Добавить {count} черновых вопросов из «{title}» в банк {bank} в Assessment Cloud' },
} as const;
const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

interface HomeworkPayload { page_id: string; revision: number; academy_id: string; classroom_id: string; classroom_name: string; title: string; description: string; due_at: string | null; max_score: number | null; handout_url: string }
interface AssessmentPayload { page_id: string; revision: number; tenant_id: string; tenant_name: string; bank_id: string; bank_title: string; title: string; items: number; types: Record<string, number> }

const isoOrNull = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || value.length > 40) throw new SchoodAIError('invalid_request', `${field} must be a date and time.`, 400, { field });
  return new Date(value).toISOString();
};

/** Registered once at module load (mod.ts). */
export function registerExportActions(): void {
  registerActionKind<HomeworkPayload>({
    kind: 'assign_homework', area: 'teacher', approverRoles: ['owner', 'admin', 'teacher'], expiresInHours: 72,
    parse(value) {
      const p = record(value, 'payload');
      const handout = text(p.handout_url, 'handout_url', { max: 300 });
      // https, or the local dev app (http on localhost or 127.0.0.1); the server builds this link itself.
      if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?)\/handout\/[A-Za-z0-9_-]{20,64}$/i.test(handout)) throw new SchoodAIError('invalid_request', 'The handout link is not valid.', 400, { field: 'handout_url' });
      return {
        page_id: uuid(p.page_id, 'page_id'), revision: Number.isInteger(p.revision) ? Number(p.revision) : 0,
        academy_id: uuid(p.academy_id, 'academy_id'), classroom_id: text(p.classroom_id, 'classroom_id', { max: 64 }), classroom_name: text(p.classroom_name, 'classroom_name', { max: 200 }),
        title: text(p.title, 'title', { max: 220 }), description: text(p.description, 'description', { max: 4000 }), due_at: isoOrNull(p.due_at, 'due_at'),
        max_score: typeof p.max_score === 'number' && p.max_score > 0 && p.max_score <= 1000 ? p.max_score : null, handout_url: handout,
      };
    },
    summary: (p, locale) => fill(SUMMARY.homework[locale], { title: p.title, group: p.classroom_name }),
    display: (p) => ({ title: p.title, group: p.classroom_name, due: p.due_at ?? '—', points: p.max_score ? String(p.max_score) : '—', link: p.handout_url, description: p.description.slice(0, 1200) }),
    async run(ctx, p) {
      // The approver's own view of the page: they must still be able to read it, and it must still be approved.
      const { page, material } = await approvedPage(ctx, p.page_id);
      const created = await createAssignment(ctx, {
        academy_id: p.academy_id, classroom_id: p.classroom_id, title: p.title, description: p.description, due_at: p.due_at, max_score: p.max_score,
        metadata: { source: 'schood_ai', page_id: page.id, kind: material.kind, handout_url: p.handout_url, ai_hints_only: true },
      });
      await recordListingUse(ctx, page, 'homework');
      return { assignment_id: created.assignment_id, group: p.classroom_name };
    },
  });

  registerActionKind<AssessmentPayload>({
    kind: 'export_assessment_items', area: 'teacher', approverRoles: ['owner', 'admin', 'teacher'], expiresInHours: 72,
    // Each item is created with its own idempotency key, so running again creates nothing twice.
    retrySafe: true,
    parse(value) {
      const p = record(value, 'payload');
      const types = record(p.types ?? {}, 'types');
      return {
        page_id: uuid(p.page_id, 'page_id'), revision: Number.isInteger(p.revision) ? Number(p.revision) : 0,
        tenant_id: uuid(p.tenant_id, 'tenant_id'), tenant_name: text(p.tenant_name ?? 'Assessment Cloud', 'tenant_name', { max: 200 }),
        bank_id: uuid(p.bank_id, 'bank_id'), bank_title: text(p.bank_title, 'bank_title', { max: 200 }), title: text(p.title, 'title', { max: 200 }),
        items: Number.isInteger(p.items) && Number(p.items) > 0 && Number(p.items) <= 120 ? Number(p.items) : 0,
        types: Object.fromEntries(Object.entries(types).filter(([key, count]) => /^[a-z_]{2,20}$/.test(key) && Number.isInteger(count)).map(([key, count]) => [key, Number(count)])),
      };
    },
    summary: (p, locale) => fill(SUMMARY.assessment[locale], { count: p.items, title: p.title, bank: p.bank_title }),
    display: (p) => ({ material: p.title, institution: p.tenant_name, bank: p.bank_title, items: String(p.items), types: Object.entries(p.types).map(([type, count]) => `${type} × ${count}`).join(', '), status: 'draft (then Assessment Cloud review)' }),
    async run(ctx, p, action) {
      const { page, material } = await approvedPage(ctx, p.page_id);
      // Exactly what was shown: an edit after the proposal needs a new proposal.
      if (page.revision !== p.revision) throw new SchoodAIError('material_changed', 'The material was edited after this was proposed. Propose it again.', 409);
      const items = assessmentItems(material);
      if (items.length !== p.items) throw new SchoodAIError('material_changed', 'The material changed after this was proposed. Propose it again.', 409);
      const { callFunction } = await teacherDeps();
      const ids: string[] = [];
      for (const entry of items) {
        const data = await callFunction<{ data?: { item_id?: unknown; id?: unknown } }>(ctx, 'assessment-cloud', '/commands', {
          method: 'POST', query: { tenant_id: p.tenant_id }, headers: { 'Idempotency-Key': `schood-ai-${action.id}-${entry.ref}` },
          body: { action: 'item.create', data: { bank_id: p.bank_id, item: entry.item, key: entry.key } }, timeoutMs: 10_000,
        });
        const id = data?.data?.item_id ?? data?.data?.id;
        if (typeof id === 'string') ids.push(id);
      }
      await recordListingUse(ctx, page, 'assessment');
      return { created: ids.length, status: 'draft', bank: p.bank_title };
    },
  });
}

/** POST teacher/export: one export of an approved material. */
export async function exportMaterial(ctx: RequestContext) {
  const body = record(await ctx.body());
  const to = oneOf(body.to, 'to', ['telegram', 'print', 'handout', 'homework', 'assessment'] as const);
  const { page, material } = await approvedPage(ctx, body.page_id);
  switch (to) {
    case 'telegram': {
      const withKey = body.key === true;
      await recordListingUse(ctx, page, 'print');
      return { messages: telegramMessages(material, { key: withKey }) };
    }
    case 'print':
      // The app prints with its print stylesheet; this counts a verified use of a marketplace copy.
      await recordListingUse(ctx, page, 'print');
      return { ok: true };
    case 'handout':
      return { handout: await createHandout(ctx, page) };
    case 'homework': {
      await ctx.requireFeature('T1');
      const academyId = uuid(body.academy_id, 'academy_id'), classroomId = text(body.classroom_id, 'classroom_id', { max: 64 });
      const group = (await academyGroups(ctx)).groups.find((entry) => entry.academy_id === academyId && entry.classroom_id === classroomId);
      if (!group) throw new SchoodAIError('group_not_found', 'That Academy group is not one of yours.', 404);
      const instructions = optionalText(body.instructions, 'instructions', { max: 1000 });
      const handout = await createHandout(ctx, page);
      const title = text(body.title ?? material.title, 'title', { max: 220 });
      const view = await ctx.actions.propose({
        kind: 'assign_homework',
        payload: {
          page_id: page.id, revision: page.revision, academy_id: academyId, classroom_id: classroomId, classroom_name: group.name || classroomId,
          title, description: homeworkDescription(material, instructions, handout.url, ctx.locale), due_at: isoOrNull(body.due_at, 'due_at'),
          max_score: typeof body.max_score === 'number' ? body.max_score : null, handout_url: handout.url,
        },
      });
      return { action: actionView(view, ctx.user.id) };
    }
    case 'assessment': {
      const tenantId = uuid(body.tenant_id, 'tenant_id'), bankId = uuid(body.bank_id, 'bank_id');
      const banks = await assessmentBanks(ctx);
      const tenant = banks.tenants.find((entry) => entry.tenant_id === tenantId);
      const bank = tenant?.banks.find((entry) => entry.id === bankId);
      if (!tenant || !bank) throw new SchoodAIError('bank_not_found', 'That item bank is not one you can write to.', 404);
      const items = assessmentItems(material);
      if (!items.length) throw new SchoodAIError('nothing_to_export', 'This material has no auto-markable questions.', 409);
      const types: Record<string, number> = {};
      for (const entry of items) types[entry.item.type] = (types[entry.item.type] ?? 0) + 1;
      const view = await ctx.actions.propose({
        kind: 'export_assessment_items',
        payload: { page_id: page.id, revision: page.revision, tenant_id: tenantId, tenant_name: tenant.name, bank_id: bankId, bank_title: bank.title, title: material.title, items: items.length, types },
      });
      return { action: actionView(view, ctx.user.id) };
    }
  }
}



/** GET teacher/academy-groups */
export async function academyGroupsRoute(ctx: RequestContext) {
  await ctx.workspace();
  try { return await academyGroups(ctx); } catch (cause) {
    if (cause instanceof SchoodAIError && cause.code === 'user_token_required') throw cause;
    return { groups: [], unavailable: true };
  }
}

/** GET teacher/weak-spots?academy_id=&classroom_id= */
export async function weakSpotsRoute(ctx: RequestContext) {
  await ctx.requireFeature('T1');
  const academyId = uuid(ctx.query.get('academy_id'), 'academy_id'), classroomId = text(ctx.query.get('classroom_id'), 'classroom_id', { max: 64 });
  try { return { spots: await weakSpots(ctx, academyId, classroomId), unavailable: false }; } catch { return { spots: [], unavailable: true }; }
}

interface TenantBanks { tenant_id: string; name: string; role: string; banks: { id: string; title: string }[] }
async function assessmentBanks(ctx: RequestContext): Promise<{ tenants: TenantBanks[]; unavailable: boolean }> {
  const { callFunction } = await teacherDeps();
  let rows: { tenant_id?: unknown; role?: unknown; tenants?: { name?: unknown } }[] = [];
  try {
    rows = (await callFunction<{ data?: typeof rows }>(ctx, 'assessment-cloud', '/workspaces', { method: 'GET' }))?.data ?? [];
  } catch (cause) {
    if (cause instanceof SchoodAIError && cause.code === 'user_token_required') throw cause;
    return { tenants: [], unavailable: true };
  }
  const tenants: TenantBanks[] = [];
  let unavailable = false;
  for (const row of rows.filter((entry) => isUuid(entry?.tenant_id)).slice(0, 5)) {
    try {
      const banks = (await callFunction<{ data?: { id?: unknown; title?: unknown; status?: unknown }[] }>(ctx, 'assessment-cloud', '/item-banks', { method: 'GET', query: { tenant_id: String(row.tenant_id) } }))?.data ?? [];
      tenants.push({ tenant_id: String(row.tenant_id), name: String(row.tenants?.name ?? 'Assessment Cloud').slice(0, 200), role: String(row.role ?? ''), banks: banks.filter((bank) => isUuid(bank?.id)).map((bank) => ({ id: String(bank.id), title: String(bank.title ?? '').slice(0, 200) })) });
    } catch { unavailable = true; }
  }
  return { tenants, unavailable };
}
/** GET teacher/assessment-banks */
export async function assessmentBanksRoute(ctx: RequestContext) {
  await ctx.workspace();
  return assessmentBanks(ctx);
}
