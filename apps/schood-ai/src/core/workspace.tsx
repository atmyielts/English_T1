import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { featureAccess, type AccessDecision } from '../../../../packages/ai-core/src/mod.ts';
import { api, ApiError } from './api.ts';
import type { Audience } from './areas.ts';
import { useSession } from './auth.tsx';
import type { Me } from './types.ts';

// The signed-in person's workspace, plan, credits and audience (learner, parent,
// teacher, centre). The workspace in use and the chosen audience are remembered in
// this browser only. Access decisions use the same ai-core rule as the function.

interface WorkspaceState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  me: Me | null;
  error: ApiError | null;
  workspaceId: string | null;
  setWorkspace(id: string | null): void;
  refresh(): Promise<void>;
  audience: Audience;
  audiences: Audience[];
  setAudience(audience: Audience): void;
  access(feature: string): AccessDecision;
}
const Context = createContext<WorkspaceState | null>(null);
const WORKSPACE_KEY = 'schood-ai.workspace', AUDIENCE_KEY = 'schood-ai.audience';
const remembered = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key: string, value: string | null) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* per-browser convenience only */ } };

/** Which audiences fit this workspace and role, best first. */
export function audiencesFor(me: Me): Audience[] {
  const role = me.workspace.role, plans = new Set(me.plan.plans), beta = me.plan.beta;
  if (me.workspace.kind === 'centre') {
    if (role === 'student') return ['learner'];
    if (role === 'parent') return ['parent'];
    if (role === 'teacher') return ['teacher'];
    return ['centre', 'teacher'];
  }
  const out: Audience[] = [];
  if (plans.has('teacher') || plans.has('teacher_pro')) out.push('teacher');
  if (plans.has('family')) out.push('parent');
  out.push('learner');
  if (beta) for (const extra of ['teacher', 'parent'] as const) if (!out.includes(extra)) out.push(extra);
  return out;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => remembered(WORKSPACE_KEY));
  const [state, setState] = useState<{ status: WorkspaceState['status']; me: Me | null; error: ApiError | null }>({ status: 'idle', me: null, error: null });
  const [chosen, setChosen] = useState<Audience | null>(() => remembered(AUDIENCE_KEY) as Audience | null);

  const load = useCallback(async (id: string | null) => {
    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const me = await api<Me>('core/me', { workspaceId: id });
      setState({ status: 'ready', me, error: null });
    } catch (cause) {
      const error = cause instanceof ApiError ? cause : new ApiError(0, 'network', 'Network error.');
      // A remembered workspace you left (or that was removed) falls back to your own.
      if (id && error.code === 'workspace_not_found') { remember(WORKSPACE_KEY, null); setWorkspaceId(null); return; }
      setState({ status: 'error', me: null, error });
    }
  }, []);

  useEffect(() => {
    if (session.status !== 'signed_in') { setState({ status: 'idle', me: null, error: null }); return; }
    void load(workspaceId);
  }, [session.status, session.userId, workspaceId, load]);

  const value = useMemo<WorkspaceState>(() => {
    const audiences = state.me ? audiencesFor(state.me) : ['learner' as const];
    const audience = chosen && audiences.includes(chosen) ? chosen : audiences[0];
    return {
      ...state,
      workspaceId,
      setWorkspace(id) {
        const next = id && state.me?.workspaces.find((ws) => ws.id === id)?.kind === 'personal' ? null : id;
        remember(WORKSPACE_KEY, next);
        setWorkspaceId(next);
      },
      refresh: () => load(workspaceId),
      audience,
      audiences,
      setAudience(next) { remember(AUDIENCE_KEY, next); setChosen(next); },
      access(feature) {
        const me = state.me;
        if (!me) return { allowed: false, reason: 'plan_required', plans: [] };
        return featureAccess(feature, { plans: me.plan.plans, workspaceKind: me.workspace.kind, role: me.workspace.role, beta: me.plan.beta, grants: me.plan.features });
      },
    };
  }, [state, workspaceId, chosen, load]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const value = useContext(Context);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
