import { playbookProfileGet, playbookProfilePatch } from './api';

// Modules a learner pinned with "Use in my plan". Stored in the Playbook
// profile metadata (no schema change) and shown on the dashboard.

const MAX_MODULES = 24;

export const readPlanModules = (profile: Record<string, unknown> | null | undefined): string[] => {
  const meta = profile?.metadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  const list = (meta as Record<string, unknown>).plan_modules;
  return Array.isArray(list)
    ? list.map((entry) => String(entry ?? '').trim()).filter((entry) => /^[a-z0-9-]{1,160}$/.test(entry))
    : [];
};

export const setPlanModule = async (accessToken: string, slug: string, include: boolean): Promise<string[]> => {
  const { profile } = await playbookProfileGet(accessToken, { fresh: true });
  const current = readPlanModules(profile);
  const next = include
    ? [...current.filter((entry) => entry !== slug), slug].slice(-MAX_MODULES)
    : current.filter((entry) => entry !== slug);
  const saved = await playbookProfilePatch(accessToken, { metadata: { plan_modules: next } });
  return readPlanModules(saved.profile);
};
