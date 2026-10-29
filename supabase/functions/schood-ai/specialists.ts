import { CREDIT_KEY_PATTERN, isCreditKey, ROLES, type CreditKey, type WorkspaceKind } from '../../../packages/ai-core/src/mod.ts';
import { customContextKinds } from './context.ts';
import type { Area, Locale, Role, SpecialistRow, Workspace } from './types.ts';

// Specialists are the assistants people chat with. Built-ins are defined in code
// by each area (registerSpecialist); a workspace can override a built-in's name,
// add instructions, narrow its context and roles, switch it off, or add a custom
// specialist (ai_specialists). Instructions written by a workspace are placed below
// the core rules and can never widen what the code allows.

export interface SpecialistDefinition {
  key: string;
  area: Area;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  /** The role prompt, in English. */
  instructions: string;
  /** Context providers this specialist may read. */
  contextKinds: string[];
  /** What one reply costs. */
  creditKey: CreditKey;
  /** Roles that may use it in a centre workspace (the plan matrix still applies). */
  roles: Role[];
  workspaceKinds?: WorkspaceKind[];
  /** Starter prompts shown on an empty chat. */
  suggestions?: Record<Locale, string[]>;
}
export interface ResolvedSpecialist {
  key: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  instructions: string;
  workspaceInstructions: string | null;
  contextKinds: string[];
  creditKey: CreditKey;
  roles: Role[];
  custom: boolean;
  suggestions: Record<Locale, string[]>;
}

const builtIns = new Map<string, SpecialistDefinition>();
const KEY = /^[a-z][a-z0-9_]{1,40}$/;

export function registerSpecialist(definition: SpecialistDefinition): void {
  if (!KEY.test(definition.key)) throw new Error(`specialist key ${definition.key} is invalid`);
  if (builtIns.has(definition.key)) throw new Error(`specialist ${definition.key} is already registered`);
  if (!CREDIT_KEY_PATTERN.test(definition.creditKey) || !isCreditKey(definition.creditKey)) throw new Error(`specialist ${definition.key}: unknown credit key`);
  if (definition.roles.some((role) => !ROLES.includes(role))) throw new Error(`specialist ${definition.key}: unknown role`);
  builtIns.set(definition.key, definition);
}
export const builtInSpecialist = (key: string) => builtIns.get(key) ?? null;
export const builtInSpecialists = () => [...builtIns.values()];

const same = (text: string): Record<Locale, string> => ({ en: text, uz: text, ru: text });

/** The specialist as this workspace and role may use it, or null. */
export function resolveSpecialist(key: string, workspace: Workspace, role: Role, overrides: SpecialistRow[]): ResolvedSpecialist | null {
  const base = builtIns.get(key), row = overrides.find((entry) => entry.key === key);
  if (row && !row.enabled) return null;
  if (base) {
    if (base.workspaceKinds && !base.workspaceKinds.includes(workspace.kind)) return null;
    const roles = row ? base.roles.filter((entry) => row.roles.includes(entry)) : base.roles;
    if (workspace.kind === 'centre' && !roles.includes(role)) return null;
    return {
      key, creditKey: base.creditKey, roles, custom: false,
      name: row?.name ? same(row.name) : base.name,
      description: row?.description ? same(row.description) : base.description,
      instructions: base.instructions,
      workspaceInstructions: row?.instructions?.trim() || null,
      contextKinds: row ? base.contextKinds.filter((kind) => row.contextKinds.includes(kind)) : base.contextKinds,
      suggestions: base.suggestions ?? { en: [], uz: [], ru: [] },
    };
  }
  if (!row) return null;
  if (workspace.kind === 'centre' && !row.roles.includes(role)) return null;
  const allowed = customContextKinds();
  return {
    key, creditKey: 'assistant.reply', roles: row.roles, custom: true,
    name: same(row.name), description: same(row.description ?? ''),
    instructions: 'You are a custom assistant set up by this workspace. Help within the purpose its instructions describe.',
    workspaceInstructions: row.instructions.trim() || null,
    contextKinds: row.contextKinds.filter((kind) => allowed.includes(kind)),
    suggestions: { en: [], uz: [], ru: [] },
  };
}

export function listSpecialists(workspace: Workspace, role: Role, overrides: SpecialistRow[]): ResolvedSpecialist[] {
  const keys = new Set([...builtIns.keys(), ...overrides.map((row) => row.key)]);
  return [...keys].map((key) => resolveSpecialist(key, workspace, role, overrides)).filter((entry): entry is ResolvedSpecialist => !!entry);
}
