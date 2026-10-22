import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, platformUrl } from '../lib/supabase';
import { edge, ApiError } from '../lib/api';
import { buildPlatformHref } from '../lib/navigation';
import { SKILLS, isCefr, type CefrLevel, type SkillKey } from '../lib/skills';

type Entitlement = {
  resource_type: string;
  resource_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

type MeResponse = {
  user: { id: string; email: string | null };
  entitlements: Entitlement[];
};

export type Onboarding = {
  placementDone: boolean;
  goalSet: boolean;
  level: CefrLevel | null;
  targetLevel: CefrLevel | null;
  goalKeys: string[];
  dailyMinutes: number;
  perSkill: Partial<Record<SkillKey, CefrLevel>>;
};

type OnboardingResponse = {
  placement_done: boolean;
  goal_set: boolean;
  cefr_estimate: string | null;
  target_cefr: string | null;
  goal_keys: string[];
  daily_time_minutes: number;
  placement?: { per_skill?: Record<string, { level?: string } | string> } | null;
};

type Status = 'loading' | 'ready' | 'error';

type EnglishState = {
  sessionResolved: boolean;
  session: Session | null;
  accessToken: string | null;
  displayName: string | null;
  /** unlocked: skills in the learner's plan. freeLeft: free activities left today in other skills. */
  access: { status: Status; unlocked: Set<SkillKey>; freeLeft: number; freePerDay: number };
  /** Whether the learner can do an activity in this skill right now (plan or free allowance). */
  canPractise: (skill: SkillKey) => boolean;
  refreshAccess: () => Promise<void>;
  onboarding: { status: Status; value: Onboarding | null };
  refreshOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
  signInHref: (returnPath?: string) => string;
  pricingHref: (skill?: SkillKey) => string;
  accountHref: string;
};

const EnglishContext = createContext<EnglishState | null>(null);

const isActive = (entry: Entitlement, now: number): boolean => {
  if (entry.starts_at) {
    const startsAt = Date.parse(entry.starts_at);
    if (Number.isNaN(startsAt) || startsAt > now) return false;
  }
  if (!entry.ends_at) return true;
  const endsAt = Date.parse(entry.ends_at);
  return !Number.isNaN(endsAt) && endsAt > now;
};

const unlockedSkills = (entitlements: Entitlement[]): Set<SkillKey> => {
  const now = Date.now();
  const active = entitlements.filter((entry) => entry.resource_type === 'product' && isActive(entry, now));
  return new Set(
    SKILLS.filter((skill) => active.some((entry) => entry.resource_id === skill.productId || entry.resource_id === skill.productSlug))
      .map((skill) => skill.key),
  );
};

const toOnboarding = (raw: OnboardingResponse): Onboarding => {
  const perSkill: Partial<Record<SkillKey, CefrLevel>> = {};
  const source = raw.placement?.per_skill ?? {};
  for (const skill of SKILLS) {
    const entry = source[skill.key];
    const level = typeof entry === 'string' ? entry : entry?.level;
    if (isCefr(level)) perSkill[skill.key] = level.toUpperCase() as CefrLevel;
  }
  return {
    placementDone: Boolean(raw.placement_done),
    goalSet: Boolean(raw.goal_set),
    level: isCefr(raw.cefr_estimate) ? (raw.cefr_estimate.toUpperCase() as CefrLevel) : null,
    targetLevel: isCefr(raw.target_cefr) ? (raw.target_cefr.toUpperCase() as CefrLevel) : null,
    goalKeys: Array.isArray(raw.goal_keys) ? raw.goal_keys : [],
    dailyMinutes: Number(raw.daily_time_minutes) || 20,
    perSkill,
  };
};

const nameFrom = (session: Session | null): string | null => {
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const full = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
  if (full) return full.split(/\s+/)[0] ?? full;
  const first = typeof meta.first_name === 'string' ? meta.first_name.trim() : '';
  return first || null;
};

export const EnglishProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [access, setAccess] = useState<EnglishState['access']>({ status: 'loading', unlocked: new Set(), freeLeft: 0, freePerDay: 0 });
  const [onboarding, setOnboarding] = useState<EnglishState['onboarding']>({ status: 'loading', value: null });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (mounted) setSession(data.session ?? null); })
      .catch(() => { if (mounted) setSession(null); })
      .finally(() => { if (mounted) setSessionResolved(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionResolved(true);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const refreshAccess = useCallback(async () => {
    try {
      const [me, allowance] = await Promise.all([
        edge<MeResponse>('me'),
        edge<{ entitled_skills: string[]; free_left: number; free_per_day: number }>('hub', '/access', { query: { language_code: 'en' } })
          .catch(() => null),
      ]);
      const fromServer = allowance
        ? new Set(SKILLS.filter((skill) => allowance.entitled_skills.includes(skill.key)).map((skill) => skill.key))
        : unlockedSkills(me.entitlements ?? []);
      setAccess({
        status: 'ready',
        unlocked: fromServer,
        freeLeft: allowance?.free_left ?? 0,
        freePerDay: allowance?.free_per_day ?? 0,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        return;
      }
      setAccess({ status: 'error', unlocked: new Set(), freeLeft: 0, freePerDay: 0 });
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setAccess({ status: 'loading', unlocked: new Set(), freeLeft: 0, freePerDay: 0 });
      return;
    }
    void refreshAccess();
  }, [userId, refreshAccess]);

  const refreshOnboarding = useCallback(async () => {
    try {
      const raw = await edge<OnboardingResponse>('hub', '/onboarding/status', { query: { language_code: 'en' } });
      setOnboarding({ status: 'ready', value: toOnboarding(raw) });
    } catch {
      setOnboarding((current) => ({ status: current.value ? 'ready' : 'error', value: current.value }));
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setOnboarding({ status: 'loading', value: null });
      return;
    }
    void refreshOnboarding();
  }, [userId, refreshOnboarding]);

  const value = useMemo<EnglishState>(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return {
      sessionResolved,
      session,
      accessToken: session?.access_token ?? null,
      displayName: nameFrom(session),
      access,
      canPractise: (skill) => access.status !== 'ready' || access.unlocked.has(skill) || access.freeLeft > 0,
      refreshAccess,
      onboarding,
      refreshOnboarding,
      signOut: async () => { await supabase.auth.signOut({ scope: 'local' }); },
      signInHref: (returnPath = '/today') =>
        buildPlatformHref(platformUrl, '/auth', { mode: 'signin', returnTo: `${origin}${returnPath}` }),
      pricingHref: (skill) =>
        buildPlatformHref(platformUrl, '/pricing', {
          product: skill ? `english-${skill}` : null,
          returnTo: typeof window === 'undefined' ? null : window.location.href,
        }),
      accountHref: buildPlatformHref(platformUrl, '/student-center'),
    };
  }, [access, onboarding, refreshAccess, refreshOnboarding, session, sessionResolved]);

  return <EnglishContext.Provider value={value}>{children}</EnglishContext.Provider>;
};

export const useEnglish = (): EnglishState => {
  const value = useContext(EnglishContext);
  if (!value) throw new Error('useEnglish must be used inside EnglishProvider');
  return value;
};
