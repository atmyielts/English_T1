import { MANAGER_ROLES, ROLES, type Role } from '../../../../packages/ai-core/src/mod.ts';
import { customContextKinds } from '../context.ts';
import { bool, oneOf, record, stringList, text } from '../input.ts';
import { builtInSpecialist, builtInSpecialists } from '../specialists.ts';
import { SchoodAIError, type RequestContext, type SpecialistRow } from '../types.ts';

// core/specialists: a workspace's owners and admins tailor the assistants. For a
// built-in they may rename it, add instructions, narrow what it reads and who may
// use it, or switch it off; they may also add custom assistants. Nothing here can
// widen what the code allows: context kinds and roles are always intersected with
// the built-in's own, and workspace instructions sit below the core rules.

const KEY = /^[a-z][a-z0-9_]{1,40}$/;
const MAX_CUSTOM = 20;
const managers = (ctx: RequestContext) => ctx.workspace({ roles: MANAGER_ROLES });

function view(ctx: RequestContext, key: string, row: SpecialistRow | null) {
  const base = builtInSpecialist(key);
  return {
    key,
    built_in: !!base,
    default: base ? { name: base.name[ctx.locale], description: base.description[ctx.locale], context_kinds: base.contextKinds, roles: base.roles } : null,
    override: row ? { name: row.name || null, description: row.description, instructions: row.instructions, context_kinds: row.contextKinds, roles: row.roles, enabled: row.enabled } : null,
  };
}

export const specialists = {
  /** Built-ins for this kind of workspace and the workspace's own rows, with what each may read and who may use it. */
  async GET(ctx: RequestContext) {
    const access = await managers(ctx);
    const rows = await ctx.repo.specialists(access.workspace.id);
    const keys = [...builtInSpecialists().filter((base) => !base.workspaceKinds || base.workspaceKinds.includes(access.workspace.kind)).map((base) => base.key),
      ...rows.filter((row) => !builtInSpecialist(row.key)).map((row) => row.key)];
    return {
      specialists: [...new Set(keys)].map((key) => view(ctx, key, rows.find((row) => row.key === key) ?? null)),
      custom_context_kinds: customContextKinds(),
      roles: access.workspace.kind === 'centre' ? ROLES : ['owner'],
      limits: { custom: MAX_CUSTOM, name: 80, description: 300, instructions: 4000 },
    };
  },
  /** Saves an override (built-in key) or a custom assistant (new key). */
  async PUT(ctx: RequestContext) {
    const access = await managers(ctx);
    const body = record(await ctx.body());
    const key = text(body.key, 'key', { max: 41 });
    if (!KEY.test(key)) throw new SchoodAIError('invalid_request', 'key must be lowercase letters, digits and _.', 400, { field: 'key' });
    const base = builtInSpecialist(key);
    if (base?.workspaceKinds && !base.workspaceKinds.includes(access.workspace.kind)) throw new SchoodAIError('not_found', 'This assistant is not available here.', 404);
    const rows = await ctx.repo.specialists(access.workspace.id);
    const existing = rows.find((row) => row.key === key) ?? null;
    if (!base && !existing && rows.filter((row) => !builtInSpecialist(row.key)).length >= MAX_CUSTOM) {
      throw new SchoodAIError('invalid_request', `A workspace can have at most ${MAX_CUSTOM} custom assistants.`, 400, { field: 'key' });
    }
    const name = body.name === undefined || body.name === null || body.name === '' ? null : text(body.name, 'name', { max: 80 });
    if (!base && !name) throw new SchoodAIError('invalid_request', 'A custom assistant needs a name.', 400, { field: 'name' });
    const allowedKinds = base ? base.contextKinds : customContextKinds();
    const contextKinds = body.context_kinds === undefined ? (existing?.contextKinds ?? allowedKinds)
      : stringList(body.context_kinds, 'context_kinds', { max: 12, pattern: /^[a-z][a-z0-9_.]{1,60}$/ }).filter((kind) => allowedKinds.includes(kind));
    const roles = body.roles === undefined ? (existing?.roles ?? (base ? base.roles : ['owner', 'admin', 'teacher']))
      : stringList(body.roles, 'roles', { max: ROLES.length, pattern: /^[a-z]+$/ }).map((role) => oneOf(role, 'roles', ROLES) as Role);
    if (!roles.length) throw new SchoodAIError('invalid_request', 'Choose at least one role.', 400, { field: 'roles' });
    const row: SpecialistRow = {
      key, name: name ?? '',
      description: body.description === undefined || body.description === null || body.description === '' ? null : text(body.description, 'description', { max: 300 }),
      instructions: body.instructions === undefined || body.instructions === null ? '' : text(body.instructions, 'instructions', { min: 0, max: 4000 }),
      contextKinds, roles,
      enabled: body.enabled === undefined ? true : bool(body.enabled, 'enabled'),
    };
    await ctx.repo.saveSpecialist(access.workspace.id, row, ctx.user.id);
    await ctx.audit('specialist.saved', { built_in: !!base, enabled: row.enabled, context_kinds: row.contextKinds, roles: row.roles }, { type: 'specialist', id: key });
    return { specialist: view(ctx, key, row) };
  },
  /** Removes an override (the built-in returns to its defaults) or a custom assistant. */
  async DELETE(ctx: RequestContext) {
    const access = await managers(ctx);
    const key = text(record(await ctx.body()).key, 'key', { max: 41 });
    const deleted = await ctx.repo.deleteSpecialist(access.workspace.id, key);
    if (deleted) await ctx.audit('specialist.deleted', { built_in: !!builtInSpecialist(key) }, { type: 'specialist', id: key });
    return { deleted };
  },
};
