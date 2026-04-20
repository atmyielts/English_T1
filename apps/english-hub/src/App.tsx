import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { withEnglishRouteContext } from '../../english-shared/src/routeContext';
import { supabase } from './lib/supabase';
import { getLearningProfileSnapshot, type LearningProfileSnapshot } from './lib/learningProfileClient';
import { getHubPlan, type HubPlanSnapshot } from './lib/hubPlanClient';
import { getNotebookSnapshot, type NotebookCard } from './lib/vocabularyNotebookClient';

type Service = {
  key: string;
  label: string;
  role: string;
  summary: string;
  href: string;
  className: string;
  fallbackProgress: number;
};

type ServiceScore = {
  service: Service;
  score: number;
};

type DailyPlanTask = {
  id: string;
  serviceKey: Service['key'];
  serviceLabel: string;
  title: string;
  reason: string;
  href: string;
  estimatedMinutes?: number | null;
  intent: string;
  skill: string;
  planItemId?: string | null;
  targetId?: string | null;
};

type WeaknessBucket = {
  key: 'grammar' | 'vocabulary' | 'fluency';
  label: string;
  score: number;
  gap: number;
  hint: string;
};

type TimelineItem = {
  id: string;
  title: string;
  detail: string;
  when: string;
};

const SERVICES: Service[] = [
  {
    key: 'reading',
    label: 'Reading',
    role: 'Input + structure',
    summary: 'Interactive text, sentence structure work, and cloze-based comprehension.',
    href: 'https://reading.english.schood.online',
    className: 'is-reading',
    fallbackProgress: 82,
  },
  {
    key: 'listening',
    label: 'Listening',
    role: 'Comprehension training',
    summary: 'Sentence-level listening, dictation loops, and missed-word recovery.',
    href: 'https://listening.english.schood.online',
    className: 'is-listening',
    fallbackProgress: 78,
  },
  {
    key: 'writing',
    label: 'Writing',
    role: 'Structured output',
    summary: 'Task writing with active correction, rewrites, and grammar-aware feedback.',
    href: 'https://writing.english.schood.online',
    className: 'is-writing',
    fallbackProgress: 73,
  },
  {
    key: 'speaking',
    label: 'Speaking',
    role: 'Active production',
    summary: 'Guided speaking prompts, conversation mode, and fluency-focused drills.',
    href: 'https://speaking.english.schood.online',
    className: 'is-speaking',
    fallbackProgress: 69,
  },
  {
    key: 'grammar',
    label: 'Grammar',
    role: 'Precision fixing',
    summary: 'Targeted error drills and short, repeated pattern training loops.',
    href: 'https://grammar.english.schood.online',
    className: 'is-grammar',
    fallbackProgress: 81,
  },
  {
    key: 'vocabulary',
    label: 'Vocabulary',
    role: 'Memory system',
    summary: 'Context-based review with adaptive recall fed from other English services.',
    href: 'https://vocabulary.english.schood.online',
    className: 'is-vocabulary',
    fallbackProgress: 76,
  },
  {
    key: 'immersion',
    label: 'Immersion',
    role: 'Real-world application',
    summary: 'Scenario missions that combine reading, speaking, and writing in context.',
    href: 'https://immersion.english.schood.online',
    className: 'is-immersion',
    fallbackProgress: 71,
  },
];

const FALLBACK_SERVICE: Service = SERVICES[0]!;

const PRODUCT_LABEL_BY_ID: Record<string, string> = {
  '0e8ad198-6284-4406-9e07-11ba7da0f42d': 'Reading',
  'f9c4a14b-d5a2-4a66-9cd8-5b3a0d6e7bf1': 'Listening',
  '2f7c2d09-08e4-4f9f-9e8d-4f5916ef8532': 'Writing',
  '94ac6f14-15f3-4f35-a8a2-01f5aaecf66d': 'Speaking',
  '6c4f0566-6f50-4fb4-b176-c4397ecb8ec5': 'Grammar',
  'b1c98e87-84d3-4ddc-8f07-c72bcf7a716a': 'Vocabulary',
  '7ce43052-2f35-42ca-b305-0d9c358f73f0': 'Immersion',
};

const SERVICE_TASK_LIBRARY: Record<Service['key'], Array<{ title: string; intent: string; skill: string }>> = {
  reading: [
    { title: 'Interactive article route', intent: 'interactive-text', skill: 'comprehension' },
    { title: 'Sentence breakdown route', intent: 'sentence-breakdown', skill: 'structure' },
    { title: 'Intensive reading loop', intent: 'reading-modes', skill: 'pace' },
  ],
  listening: [
    { title: 'Sentence listening route', intent: 'sentence-loop', skill: 'comprehension' },
    { title: 'Dictation recovery lab', intent: 'dictation', skill: 'accuracy' },
    { title: 'Missed words repair', intent: 'missed-words', skill: 'vocabulary' },
  ],
  writing: [
    { title: 'Writing brief', intent: 'writing-task', skill: 'coherence' },
    { title: 'Active correction room', intent: 'active-correction', skill: 'grammar' },
    { title: 'Rewrite route', intent: 'rewrite', skill: 'clarity' },
  ],
  speaking: [
    { title: 'Guided speaking route', intent: 'guided-speaking', skill: 'fluency' },
    { title: 'Conversation route', intent: 'conversation-mode', skill: 'confidence' },
    { title: 'Shadowing block', intent: 'shadowing', skill: 'timing' },
  ],
  grammar: [
    { title: 'Repair queue', intent: 'targeted-drill', skill: 'grammar' },
    { title: 'Pattern diagnosis', intent: 'error-detection', skill: 'accuracy' },
    { title: 'Transfer checkpoint', intent: 'pattern-training', skill: 'structure' },
  ],
  vocabulary: [
    { title: 'Due review route', intent: 'leitner-review', skill: 'retention' },
    { title: 'Activation route', intent: 'context-review', skill: 'usage' },
    { title: 'Source tracing notebook', intent: 'word-sources', skill: 'vocabulary' },
  ],
  immersion: [
    { title: 'Scenario mission', intent: 'scenario-task', skill: 'communication' },
    { title: 'Task mission', intent: 'task-mission', skill: 'problem-solving' },
    { title: 'Mixed-skill mission', intent: 'mixed-skill', skill: 'fluency' },
  ],
};

const platformUrl = ((import.meta.env.VITE_PLATFORM_URL as string | undefined) ?? '').trim() || 'https://schood.online';

const buildPlatformUrl = (pathname: string): string => `${platformUrl.replace(/\/$/, '')}${pathname}`;

const resolveReturnTo = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

const resolveWordSource = (card: NotebookCard): string => {
  if (card.source_label) return card.source_label;
  const normalized = (card.source_type ?? '').replace(/^english-/, '').replace(/[._]+/g, ' ').trim();
  if (!normalized) return 'English notebook';
  return normalized.slice(0, 1).toUpperCase() + normalized.slice(1);
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
);

const normalizeMetric = (keyPath: string, raw: number): number | null => {
  if (!Number.isFinite(raw)) return null;
  const key = keyPath.toLowerCase();
  if (key.includes('gap') || key.includes('delta') || key.includes('error') || key.includes('incorrect')) return null;
  if (key.includes('band')) return clampPercent((raw / 9) * 100);
  if (key.includes('scaled_score_40')) return clampPercent((raw / 40) * 100);
  if (key.includes('scaled_score_800')) return clampPercent((raw / 800) * 100);
  if (key.includes('ratio') || key.includes('accuracy') || key.includes('confidence')) {
    return raw <= 1 ? clampPercent(raw * 100) : clampPercent(raw);
  }
  if (raw <= 1) return clampPercent(raw * 100);
  if (raw <= 9) return clampPercent((raw / 9) * 100);
  return clampPercent(raw);
};

const collectScores = (value: unknown, keyPath = ''): number[] => {
  if (typeof value === 'number') {
    const normalized = normalizeMetric(keyPath, value);
    return normalized == null ? [] : [normalized];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectScores(item, `${keyPath}[${index}]`));
  }

  const rec = asRecord(value);
  if (!rec) return [];

  return Object.entries(rec).flatMap(([key, nested]) => collectScores(nested, keyPath ? `${keyPath}.${key}` : key));
};

const avg = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
};

const collectServiceScores = (source: unknown, serviceKey: string): number[] => {
  const rec = asRecord(source);
  if (!rec) return [];

  const key = serviceKey.toLowerCase();
  const direct = collectScores(rec[key], key);
  if (direct.length > 0) return direct;

  const matchedEntries = Object.entries(rec).filter(([entryKey]) => entryKey.toLowerCase().includes(key));
  const fromMatched = matchedEntries.flatMap(([entryKey, value]) => collectScores(value, entryKey));
  if (fromMatched.length > 0) return fromMatched;

  return [];
};

const productLabelFromId = (productId: unknown): string => {
  const id = typeof productId === 'string' ? productId : '';
  return PRODUCT_LABEL_BY_ID[id] ?? 'English service';
};

const formatDateTime = (raw: unknown): string => {
  if (typeof raw !== 'string' || !raw) return 'Recently';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString();
};

const serviceRouteForIntent = (serviceKey: Service['key'], intent: string): string => {
  const normalized = intent.trim().toLowerCase();
  switch (serviceKey) {
    case 'reading':
      if (normalized === 'interactive-text') return '/library';
      if (normalized === 'sentence-breakdown' || normalized === 'reading-modes' || normalized === 'cloze') return '/intensive';
      if (normalized === 'report') return '/reports';
      return '/dashboard';
    case 'listening':
      if (normalized === 'dictation') return '/dictation';
      if (normalized === 'missed-words') return '/review';
      return normalized === 'sentence-loop' ? '/tracks' : '/dashboard';
    case 'writing':
      if (normalized === 'writing-task') return '/briefs';
      if (normalized === 'active-correction') return '/review';
      return normalized === 'rewrite' ? '/drafts' : '/dashboard';
    case 'speaking':
      if (normalized === 'shadowing') return '/shadowing';
      return normalized === 'guided-speaking' || normalized === 'conversation-mode' ? '/studio' : '/dashboard';
    case 'grammar':
      if (normalized === 'pattern-training') return '/transfer';
      return normalized === 'targeted-drill' || normalized === 'error-detection' ? '/repair-queue' : '/dashboard';
    case 'vocabulary':
      if (normalized === 'leitner-review') return '/review';
      if (normalized === 'context-review' || normalized === 'word-sources') return '/activation';
      return '/notebook';
    case 'immersion':
      return normalized === 'scenario-task' || normalized === 'task-mission' || normalized === 'mixed-skill' ? '/missions' : '/dashboard';
    default:
      return '/dashboard';
  }
};

const buildTaskHref = (
  service: Service,
  payload: {
    intent: string;
    skill: string;
    reason: string;
    sourceService?: string;
    planItemId?: string | null;
    targetId?: string | null;
  },
): string => {
  const routePath = serviceRouteForIntent(service.key, payload.intent);
  const targetUrl = new URL(routePath, `${service.href}/`);
  return withEnglishRouteContext(targetUrl.toString(), {
    sourceService: payload.sourceService ?? 'english-hub',
    intent: payload.intent,
    skill: payload.skill,
    reason: payload.reason,
    planItemId: payload.planItemId ?? null,
    targetId: payload.targetId ?? null,
  });
};

const pickTaskForService = (service: Service, indexSeed: number): { title: string; intent: string; skill: string } => {
  const options = SERVICE_TASK_LIBRARY[service.key];
  if (!options || options.length === 0) {
    return { title: `Focused ${service.label} drill`, intent: 'focused-drill', skill: service.key };
  }
  const picked = options[indexSeed % options.length];
  return picked ?? options[0] ?? { title: `Focused ${service.label} drill`, intent: 'focused-drill', skill: service.key };
};

const renderStatusStrip = ({
  session,
  profileLoading,
  profileError,
  profileSnapshot,
  hubPlanLoading,
  hubPlanError,
}: {
  session: Session | null;
  profileLoading: boolean;
  profileError: string | null;
  profileSnapshot: LearningProfileSnapshot | null;
  hubPlanLoading: boolean;
  hubPlanError: string | null;
}) => {
  if (!session) return null;

  return (
    <section className="status-grid">
      {profileLoading ? <div className="status-pill frame">Loading shared language profile...</div> : null}
      {profileError ? <div className="status-pill frame warning">{profileError}</div> : null}
      {hubPlanLoading ? <div className="status-pill frame">Generating hub plan...</div> : null}
      {hubPlanError ? <div className="status-pill frame warning">{hubPlanError}</div> : null}
      {!profileLoading && !profileError && profileSnapshot?.scope?.language_code ? (
        <div className="status-pill frame">
          Scope: {String(profileSnapshot.scope.language_name ?? 'English')} ({String(profileSnapshot.scope.language_code).toUpperCase()})
        </div>
      ) : null}
    </section>
  );
};

const App = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [notebookLoading, setNotebookLoading] = useState(false);
  const [notebookError, setNotebookError] = useState<string | null>(null);
  const [notebookDueCount, setNotebookDueCount] = useState(0);
  const [notebookTotalCount, setNotebookTotalCount] = useState(0);
  const [recentNotebookWords, setRecentNotebookWords] = useState<NotebookCard[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSnapshot, setProfileSnapshot] = useState<LearningProfileSnapshot | null>(null);
  const [hubPlanLoading, setHubPlanLoading] = useState(false);
  const [hubPlanError, setHubPlanError] = useState<string | null>(null);
  const [hubPlanSnapshot, setHubPlanSnapshot] = useState<HubPlanSnapshot | null>(null);
  const [planSeed, setPlanSeed] = useState(1);
  const [selectedPlanTaskId, setSelectedPlanTaskId] = useState<string | null>(null);

  const returnTo = resolveReturnTo();
  const signInHref = useMemo(
    () => `${buildPlatformUrl('/auth?mode=signin')}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const workspaceHref = useMemo(() => buildPlatformUrl('/workspace/student'), []);
  const pricingHref = useMemo(
    () => `${buildPlatformUrl('/pricing')}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setRecentNotebookWords([]);
      setNotebookDueCount(0);
      setNotebookTotalCount(0);
      setNotebookError(null);
      return;
    }

    let cancelled = false;
    const loadNotebook = async () => {
      setNotebookLoading(true);
      setNotebookError(null);
      try {
        const [dailySnapshot, recentSnapshot] = await Promise.all([
          getNotebookSnapshot(session.access_token, 'daily', 10),
          getNotebookSnapshot(session.access_token, 'recent', 8),
        ]);
        if (cancelled) return;
        setNotebookDueCount(Number(dailySnapshot.summary?.due_count ?? 0));
        setNotebookTotalCount(Number(dailySnapshot.summary?.total_count ?? 0));
        setRecentNotebookWords(recentSnapshot.cards ?? []);
      } catch (error) {
        if (cancelled) return;
        const status = (error as { status?: number } | null)?.status ?? null;
        if (status === 401 || status === 403) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // Ignore sign-out failures.
          }
          return;
        }
        setNotebookError('Could not load notebook preview right now.');
      } finally {
        if (!cancelled) setNotebookLoading(false);
      }
    };

    void loadNotebook();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      setProfileSnapshot(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const next = await getLearningProfileSnapshot(session.access_token, { languageCode: 'en', limit: 80 });
        if (cancelled) return;
        setProfileSnapshot(next);
      } catch (error) {
        if (cancelled) return;
        const status = (error as { status?: number } | null)?.status ?? null;
        if (status === 401 || status === 403) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // Ignore sign-out failures.
          }
          return;
        }
        setProfileError('Could not load shared English profile right now.');
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      setHubPlanSnapshot(null);
      setHubPlanError(null);
      setHubPlanLoading(false);
      return;
    }

    let cancelled = false;
    const loadPlan = async () => {
      setHubPlanLoading(true);
      setHubPlanError(null);
      try {
        const next = await getHubPlan(session.access_token, { languageCode: 'en', rebuild: planSeed > 1 });
        if (cancelled) return;
        setHubPlanSnapshot(next);
      } catch (error) {
        if (cancelled) return;
        const status = (error as { status?: number } | null)?.status ?? null;
        if (status === 401 || status === 403) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // Ignore sign-out failures.
          }
          return;
        }
        setHubPlanError('Could not load the generated hub plan right now.');
      } finally {
        if (!cancelled) setHubPlanLoading(false);
      }
    };

    void loadPlan();
    return () => {
      cancelled = true;
    };
  }, [planSeed, session?.access_token]);

  const handleSignOut = async (): Promise<void> => {
    await supabase.auth.signOut({ scope: 'local' });
  };

  const serviceScores = useMemo<ServiceScore[]>(() => {
    const languageProfile = profileSnapshot?.language_profile ?? null;
    const breakdown = profileSnapshot?.service_breakdown ?? null;

    return SERVICES.map((service) => {
      const fromBreakdown = collectServiceScores(breakdown, service.key);
      const fromLanguageProfile = collectServiceScores(languageProfile, service.key);
      const computed = avg([...fromBreakdown, ...fromLanguageProfile]);
      return {
        service,
        score: computed == null ? service.fallbackProgress : Math.round(clampPercent(computed)),
      };
    });
  }, [profileSnapshot?.language_profile, profileSnapshot?.service_breakdown]);

  const completedServices = useMemo(
    () => serviceScores.filter((item) => item.score >= 75).length,
    [serviceScores],
  );

  const rankedWeakServices = useMemo(
    () => [...serviceScores].sort((a, b) => a.score - b.score),
    [serviceScores],
  );

  const weaknessBuckets = useMemo<WeaknessBucket[]>(() => {
    const scoreOf = (serviceKey: Service['key']): number => (
      serviceScores.find((entry) => entry.service.key === serviceKey)?.score ?? 0
    );

    const grammar = scoreOf('grammar');
    const vocabulary = scoreOf('vocabulary');
    const fluency = Math.round((scoreOf('speaking') + scoreOf('listening')) / 2);

    return [
      {
        key: 'grammar',
        label: 'Grammar gaps',
        score: grammar,
        gap: Math.max(0, 100 - grammar),
        hint: 'Route to grammar repair queues and writing correction loops.',
      },
      {
        key: 'vocabulary',
        label: 'Vocabulary pressure',
        score: vocabulary,
        gap: Math.max(0, 100 - vocabulary),
        hint: 'Prioritize review and activation so reading/listening words become usable.',
      },
      {
        key: 'fluency',
        label: 'Fluency pressure',
        score: fluency,
        gap: Math.max(0, 100 - fluency),
        hint: 'Mix listening recovery with speaking routes so decoding becomes production.',
      },
    ];
  }, [serviceScores]);

  const normalizeHubTask = (task: Record<string, unknown> | null | undefined): DailyPlanTask | null => {
    if (!task?.id || !task?.service_key || !task?.title) return null;
    const serviceKey = String(task.service_key);
    const service = SERVICES.find((entry) => entry.key === serviceKey) ?? FALLBACK_SERVICE;
    const intent = String(task.intent ?? 'focused-drill');
    const skill = String(task.skill ?? serviceKey);
    return {
      id: String(task.id),
      serviceKey: service.key,
      serviceLabel: String(task.service_label ?? service.label),
      title: String(task.title),
      reason: String(task.reason ?? 'Generated from your shared English profile.'),
      href: buildTaskHref(service, {
        intent,
        skill,
        reason: String(task.reason ?? 'hub-plan'),
        planItemId: typeof task.recommendation_id === 'string' ? task.recommendation_id : String(task.id),
        targetId: typeof task.content_item_id === 'string' ? task.content_item_id : null,
      }),
      estimatedMinutes: typeof task.estimated_minutes === 'number' ? task.estimated_minutes : null,
      intent,
      skill,
      planItemId: typeof task.recommendation_id === 'string' ? task.recommendation_id : String(task.id),
      targetId: typeof task.content_item_id === 'string' ? task.content_item_id : null,
    };
  };

  const dailyPlan = useMemo<DailyPlanTask[]>(() => {
    const remoteTasks = (hubPlanSnapshot?.today_plan?.tasks ?? [])
      .map((task) => normalizeHubTask(task))
      .filter((task): task is DailyPlanTask => Boolean(task));

    if (remoteTasks.length > 0) return remoteTasks;

    const base = [...rankedWeakServices];
    const tasks: DailyPlanTask[] = [];
    const now = Date.now() + planSeed;

    if (notebookDueCount > 0) {
      const vocabularyService = SERVICES.find((service) => service.key === 'vocabulary');
      if (vocabularyService) {
        tasks.push({
          id: 'vocab-daily-review',
          serviceKey: vocabularyService.key,
          serviceLabel: vocabularyService.label,
          title: `Review ${Math.min(10, notebookDueCount)} due vocabulary cards`,
          reason: `You have ${notebookDueCount} due cards waiting in the shared notebook.`,
          href: buildTaskHref(vocabularyService, {
            intent: 'leitner-review',
            skill: 'vocabulary',
            reason: 'daily-vocabulary-review',
          }),
          intent: 'leitner-review',
          skill: 'vocabulary',
          estimatedMinutes: Math.min(12, Math.max(6, notebookDueCount)),
        });
      }
    }

    for (const [index, serviceScore] of base.slice(0, 5).entries()) {
      const picked = pickTaskForService(serviceScore.service, now + index);
      tasks.push({
        id: `${serviceScore.service.key}-${index}-${picked.intent}`,
        serviceKey: serviceScore.service.key,
        serviceLabel: serviceScore.service.label,
        title: picked.title,
        reason: `${serviceScore.service.label} is at ${serviceScore.score}% readiness, so this task is prioritized.`,
        href: buildTaskHref(serviceScore.service, {
          intent: picked.intent,
          skill: picked.skill,
          reason: `${serviceScore.service.key}-weakness`,
        }),
        intent: picked.intent,
        skill: picked.skill,
      });
    }

    if (tasks.length < 6) {
      const strongest = [...serviceScores].sort((a, b) => b.score - a.score)[0];
      if (strongest) {
        const picked = pickTaskForService(strongest.service, now + 77);
        tasks.push({
          id: `maintenance-${strongest.service.key}`,
          serviceKey: strongest.service.key,
          serviceLabel: strongest.service.label,
          title: `Maintenance: ${picked.title}`,
          reason: `Keep momentum in your strongest area (${strongest.score}% readiness).`,
          href: buildTaskHref(strongest.service, {
            intent: picked.intent,
            skill: picked.skill,
            reason: 'maintenance',
          }),
          intent: picked.intent,
          skill: picked.skill,
        });
      }
    }

    return tasks.slice(0, 6);
  }, [hubPlanSnapshot?.today_plan?.tasks, notebookDueCount, planSeed, rankedWeakServices, serviceScores]);

  const carryoverTasks = useMemo(
    () =>
      (hubPlanSnapshot?.carryover_tasks ?? [])
        .map((task) => normalizeHubTask(task))
        .filter((task): task is DailyPlanTask => Boolean(task)),
    [hubPlanSnapshot?.carryover_tasks],
  );

  useEffect(() => {
    if (dailyPlan.length === 0) {
      setSelectedPlanTaskId(null);
      return;
    }
    setSelectedPlanTaskId((current) => {
      if (current && dailyPlan.some((task) => task.id === current)) return current;
      return dailyPlan[0]?.id ?? null;
    });
  }, [dailyPlan]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    const outcomes = profileSnapshot?.outcomes ?? [];

    outcomes.slice(0, 4).forEach((outcome, index) => {
      const overallBand = typeof outcome.overall_band === 'number'
        ? `Band ${outcome.overall_band.toFixed(1)}`
        : 'Outcome recorded';
      items.push({
        id: `outcome-${index}`,
        title: `${productLabelFromId(outcome.product_id)} result`,
        detail: overallBand,
        when: formatDateTime(outcome.computed_at),
      });
    });

    recentNotebookWords.slice(0, 2).forEach((word, index) => {
      items.push({
        id: `word-${word.id}-${index}`,
        title: `Vocabulary captured: ${word.word}`,
        detail: `${resolveWordSource(word)} added to notebook`,
        when: formatDateTime(word.updated_at),
      });
    });

    if (dailyPlan.length > 0) {
      items.unshift({
        id: 'plan-generated',
        title: 'Daily plan generated',
        detail: `${dailyPlan.length} routed tasks prepared across the English services`,
        when: new Date().toLocaleString(),
      });
    }

    return items.slice(0, 8);
  }, [dailyPlan, profileSnapshot?.outcomes, recentNotebookWords]);

  const topWeakService = rankedWeakServices[0]?.service ?? FALLBACK_SERVICE;
  const speakingService = SERVICES.find((service) => service.key === 'speaking') ?? FALLBACK_SERVICE;
  const weakPracticeTask = dailyPlan[0] ?? null;
  const selectedPlanTask = dailyPlan.find((task) => task.id === selectedPlanTaskId) ?? dailyPlan[0] ?? null;
  const focusStory =
    hubPlanSnapshot?.focus_story ??
    `Today leans toward ${topWeakService.label.toLowerCase()} because it has the widest gap in your shared English profile.`;
  const transferContext =
    hubPlanSnapshot?.transfer_context ??
    'The hub balances review, recovery, and one transfer task so today still moves usable English forward.';
  const celebrationLevel = hubPlanSnapshot?.celebration_level ?? 'steady';
  const priorityTone = hubPlanSnapshot?.priority_tone ?? 'supportive';
  const weeklyFocusMap = serviceScores.slice(0, 7);
  const doSpeakingHref = useMemo(
    () => buildTaskHref(speakingService, { intent: 'guided-speaking', skill: 'fluency', reason: 'hub-smart-route' }),
    [speakingService],
  );
  const weakAreaHref = useMemo(() => {
    if (!weakPracticeTask) {
      return buildTaskHref(topWeakService, {
        intent: 'focused-drill',
        skill: topWeakService.key,
        reason: 'weak-area',
      });
    }
    return weakPracticeTask.href;
  }, [topWeakService, weakPracticeTask]);

  if (location.pathname === '/' || !session) {
    return (
      <Routes>
        <Route
          path="/"
          element={
            <div className="hub-root">
              <div className="hub-ambient" aria-hidden />
              <main className="hub-shell">
                <header className="hub-nav frame">
                  <Link className="brand" to="/">
                    <img className="brand-logo" src="/schood-logo.png" alt="Schood" />
                    <span className="brand-copy">
                      <strong>Schood English</strong>
                      <small>Unified English services</small>
                    </span>
                  </Link>

                  <button
                    className="hub-menu-toggle"
                    type="button"
                    aria-expanded={mobileMenuOpen}
                    aria-controls="hub-nav-panel"
                    onClick={() => setMobileMenuOpen((prev) => !prev)}
                  >
                    Menu
                  </button>

                  <nav id="hub-nav-panel" className={`hub-links ${mobileMenuOpen ? 'mobile-open' : ''}`.trim()}>
                    <NavLink className={({ isActive }) => (isActive ? 'route-btn active' : 'route-btn')} to="/" end>
                      Home
                    </NavLink>
                  </nav>

                  <div className={`hub-controls ${mobileMenuOpen ? 'mobile-open' : ''}`.trim()}>
                    <a className="btn btn-ghost" href={workspaceHref}>
                      Platform
                    </a>
                    {session ? (
                      <Link className="btn btn-ghost" to="/dashboard">
                        Dashboard
                      </Link>
                    ) : (
                      <a className="btn btn-ghost" href={signInHref}>
                        Sign in
                      </a>
                    )}
                    <a className="btn btn-solid" href={pricingHref}>
                      Get access
                    </a>
                  </div>
                </header>

                <section className="hero frame">
                  <p className="kicker">Daily briefing room</p>
                  <h1>One hub coordinating all English services with real routes.</h1>
                  <p className="hero-copy">
                    The hub is no longer one generic dashboard. It now splits planning, weaknesses, review, and weekly recap into dedicated pages.
                  </p>
                  <div className="hero-actions">
                    {session ? (
                      <Link className="btn btn-solid" to="/plan">
                        Open today&apos;s plan
                      </Link>
                    ) : (
                      <a className="btn btn-solid" href={signInHref}>
                        Sign in to continue
                      </a>
                    )}
                    <a className="btn btn-ghost" href={workspaceHref}>
                      Open platform account
                    </a>
                  </div>
                </section>

                <section className="route-preview frame">
                  <div className="route-preview-head">
                    <div>
                      <p className="kicker">Today&apos;s route</p>
                      <h3>{focusStory}</h3>
                    </div>
                    <span className={`route-tone route-tone-${priorityTone}`}>{priorityTone}</span>
                  </div>
                  <div className="route-preview-grid">
                    <article>
                      <small>Strongest recommendation</small>
                      <strong>{weakPracticeTask?.title ?? `Start with ${topWeakService.label}`}</strong>
                      <p>{weakPracticeTask?.reason ?? 'The first routed task appears here after sign-in.'}</p>
                    </article>
                    <article>
                      <small>Due reviews</small>
                      <strong>{notebookDueCount} vocabulary cards waiting</strong>
                      <p>Daily notebook pressure feeds directly into the plan and review pages.</p>
                    </article>
                    <article>
                      <small>Transfer challenge</small>
                      <strong>{transferContext}</strong>
                      <p>Every plan now sends you to a precise downstream route instead of a generic service page.</p>
                    </article>
                  </div>
                </section>

                <section className="focus-map frame">
                  <div className="panel-head">
                    <h3>Weekly focus map</h3>
                    <span className="route-tone route-tone-soft">{celebrationLevel}</span>
                  </div>
                  <div className="focus-map-grid">
                    {weeklyFocusMap.map(({ service, score }) => (
                      <article key={`${service.key}-focus`} className={`focus-map-card ${service.className}`}>
                        <small>{service.role}</small>
                        <strong>{service.label}</strong>
                        <div className="focus-map-track" aria-hidden>
                          <span style={{ width: `${score}%` }} />
                        </div>
                        <p>{score}% current readiness</p>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="services-grid" aria-label="English services">
                  {SERVICES.map((service) => (
                    <article className={`service-card frame ${service.className}`} key={service.key}>
                      <p className="service-tag">{service.label}</p>
                      <h2>English {service.label}</h2>
                      <p className="service-role">{service.role}</p>
                      <p className="service-summary">{service.summary}</p>
                      <div className="service-actions">
                        <a className="btn btn-ghost" href={service.href}>
                          Open service
                        </a>
                        <a
                          className="btn btn-soft"
                          href={buildTaskHref(service, {
                            intent: 'dashboard-entry',
                            skill: service.key,
                            reason: 'hub-entry',
                          })}
                        >
                          Open routed start
                        </a>
                      </div>
                    </article>
                  ))}
                </section>

                <section className="connection frame">
                  <h3>How the reorganized hub works</h3>
                  <ul>
                    <li>Plan page owns the daily timeline and task preview drawer.</li>
                    <li>Weaknesses page owns service pressure, gap categories, and quick repair jumps.</li>
                    <li>Review page owns due vocabulary, carryover tasks, and recent learning events.</li>
                    <li>Week page owns recap, stronger services, and progress momentum.</li>
                  </ul>
                </section>
              </main>
            </div>
          }
        />
        <Route path="*" element={<Navigate to={session ? '/dashboard' : '/'} replace />} />
      </Routes>
    );
  }

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', exact: true },
    { label: 'Plan', href: '/plan', exact: true },
    { label: 'Weaknesses', href: '/weaknesses', exact: true },
    { label: 'Review', href: '/review', exact: true },
    { label: 'Week', href: '/week', exact: true },
  ];

  return (
    <div className="hub-root">
      <div className="hub-ambient" aria-hidden />
      <main className="hub-shell">
        <header className="hub-nav frame">
          <Link className="brand" to="/">
            <img className="brand-logo" src="/schood-logo.png" alt="Schood" />
            <span className="brand-copy">
              <strong>Schood English</strong>
              <small>Unified English services</small>
            </span>
          </Link>

          <button
            className="hub-menu-toggle"
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="hub-nav-panel"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            Menu
          </button>

          <nav id="hub-nav-panel" className={`hub-links ${mobileMenuOpen ? 'mobile-open' : ''}`.trim()} aria-label="Hub routes">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                className={({ isActive }) => (isActive ? 'route-btn active' : 'route-btn')}
                to={item.href}
                end={item.exact}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className={`hub-controls ${mobileMenuOpen ? 'mobile-open' : ''}`.trim()}>
            <a className="btn btn-ghost" href={workspaceHref}>
              Platform
            </a>
            <button className="btn btn-ghost" type="button" onClick={() => void handleSignOut()}>
              Sign out
            </button>
            <a className="btn btn-solid" href={pricingHref}>
              Get access
            </a>
          </div>
        </header>

        <Routes>
          <Route
            path="/dashboard"
            element={
              <>
                <section className="dashboard-hero frame">
                  <p className="kicker">Connected overview</p>
                  <h1>Use the hub to decide the next route, not to do the work itself.</h1>
                  <p>
                    {completedServices}/{SERVICES.length} services are currently above the target readiness threshold.
                  </p>
                  <div className="hero-actions">
                    <a className="btn btn-ghost" href={doSpeakingHref}>
                      Do speaking
                    </a>
                    <a className="btn btn-solid" href={weakAreaHref}>
                      Practice weak area
                    </a>
                    <button className="btn btn-ghost" type="button" onClick={() => setPlanSeed((seed) => seed + 17)}>
                      Regenerate plan
                    </button>
                  </div>
                </section>

                <section className="briefing-strip frame">
                  <article>
                    <small>Focus story</small>
                    <strong>{focusStory}</strong>
                  </article>
                  <article>
                    <small>Transfer context</small>
                    <strong>{transferContext}</strong>
                  </article>
                  <article>
                    <small>Weekly recap</small>
                    <strong>
                      {completedServices} strong services · {carryoverTasks.length} carryover tasks · {notebookDueCount} due cards
                    </strong>
                  </article>
                </section>

                {renderStatusStrip({
                  session,
                  profileLoading,
                  profileError,
                  profileSnapshot,
                  hubPlanLoading,
                  hubPlanError,
                })}

                <section className="dashboard-grid">
                  <article className="progress-panel frame">
                    <h3>Weakness dashboard by service</h3>
                    <ul className="progress-list">
                      {serviceScores.map(({ service, score }) => (
                        <li key={`${service.key}-progress`}>
                          <div className="progress-row">
                            <span>{service.label}</span>
                            <strong>{score}%</strong>
                          </div>
                          <div className={`progress-track ${service.className}`} aria-hidden>
                            <span style={{ width: `${score}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="daily-plan frame">
                    <div className="panel-head">
                      <h3>Direct launch cards</h3>
                      <Link className="btn btn-ghost" to="/plan">
                        Full plan
                      </Link>
                    </div>
                    <ul className="plan-list">
                      {dailyPlan.slice(0, 4).map((task) => (
                        <li key={task.id}>
                          <button className="plan-brief" type="button" onClick={() => setSelectedPlanTaskId(task.id)}>
                            <small>{task.serviceLabel}</small>
                            <strong>{task.title}</strong>
                            <p>{task.reason}{task.estimatedMinutes ? ` · ${task.estimatedMinutes} min` : ''}</p>
                          </button>
                          <div className="plan-actions">
                            <a className="btn btn-soft" href={task.href}>
                              Launch
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="plan-drawer frame">
                    <div className="panel-head">
                      <h3>Preview drawer</h3>
                      {selectedPlanTask ? <span className="route-tone route-tone-soft">{selectedPlanTask.serviceLabel}</span> : null}
                    </div>
                    {selectedPlanTask ? (
                      <div className="plan-drawer-body">
                        <small>Why today</small>
                        <strong>{selectedPlanTask.title}</strong>
                        <p>{selectedPlanTask.reason}</p>
                        <div className="drawer-stats">
                          <span>Route: {serviceRouteForIntent(selectedPlanTask.serviceKey, selectedPlanTask.intent)}</span>
                          <span>Target skill: {selectedPlanTask.skill}</span>
                          <span>{selectedPlanTask.estimatedMinutes ? `${selectedPlanTask.estimatedMinutes} minutes` : 'Short-form task'}</span>
                        </div>
                        <div className="hero-actions">
                          <a className="btn btn-solid" href={selectedPlanTask.href}>
                            Launch task
                          </a>
                          <Link className="btn btn-ghost" to="/plan">
                            Open plan page
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <p>Select a plan item to preview its route context.</p>
                    )}
                  </article>

                  <article className="quick-jump frame">
                    <h3>Smart routing</h3>
                    <div className="jump-list">
                      {SERVICES.map((service) => (
                        <a
                          className={`jump-chip ${service.className}`}
                          href={buildTaskHref(service, {
                            intent: 'smart-route',
                            skill: service.key,
                            reason: 'hub-quick-jump',
                          })}
                          key={`${service.key}-jump`}
                        >
                          {service.label}
                        </a>
                      ))}
                    </div>
                    <Link className="btn btn-ghost" to="/weaknesses">
                      Open weakness atlas
                    </Link>
                  </article>

                  <article className="insights frame">
                    <h3>Connected reaction loop</h3>
                    <ul>
                      <li>When speaking reveals tense errors, route immediately to Grammar repair.</li>
                      <li>When listening misses key words, send terms into Vocabulary activation.</li>
                      <li>When writing shows coherence issues, route to Reading structure and summary transfer.</li>
                    </ul>
                  </article>
                </section>
              </>
            }
          />

          <Route
            path="/plan"
            element={
              <>
                <section className="dashboard-hero frame">
                  <p className="kicker">Daily plan</p>
                  <h1>Open the exact route you need next.</h1>
                  <p>The plan page now owns the timeline, preview drawer, carryover logic, and day-end wrap-up.</p>
                  <div className="hero-actions">
                    <button className="btn btn-solid" type="button" onClick={() => setPlanSeed((seed) => seed + 31)}>
                      Refresh plan
                    </button>
                    <Link className="btn btn-ghost" to="/review">
                      Open review page
                    </Link>
                  </div>
                </section>

                <section className="briefing-strip frame">
                  <article>
                    <small>Minutes budget</small>
                    <strong>{hubPlanSnapshot?.today_plan?.minutes_budget ?? 40} min</strong>
                  </article>
                  <article>
                    <small>Due review first</small>
                    <strong>{notebookDueCount} notebook cards waiting</strong>
                  </article>
                  <article>
                    <small>Carryover</small>
                    <strong>{carryoverTasks.length} tasks preserved for the next route cycle</strong>
                  </article>
                </section>

                {renderStatusStrip({
                  session,
                  profileLoading,
                  profileError,
                  profileSnapshot,
                  hubPlanLoading,
                  hubPlanError,
                })}

                <section className="dashboard-grid">
                  <article className="daily-plan frame">
                    <div className="panel-head">
                      <h3>Today&apos;s timeline</h3>
                      <span className={`route-tone route-tone-${priorityTone}`}>{priorityTone}</span>
                    </div>
                    <ul className="plan-list">
                      {dailyPlan.map((task) => (
                        <li key={task.id}>
                          <button className="plan-brief" type="button" onClick={() => setSelectedPlanTaskId(task.id)}>
                            <small>{task.serviceLabel}</small>
                            <strong>{task.title}</strong>
                            <p>{task.reason}{task.estimatedMinutes ? ` · ${task.estimatedMinutes} min` : ''}</p>
                          </button>
                          <div className="plan-actions">
                            <button className="btn btn-ghost" type="button" onClick={() => setSelectedPlanTaskId(task.id)}>
                              Preview
                            </button>
                            <a className="btn btn-soft" href={task.href}>
                              Start
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="plan-drawer frame">
                    <div className="panel-head">
                      <h3>Task preview drawer</h3>
                      {selectedPlanTask ? <span className="route-tone route-tone-soft">{selectedPlanTask.serviceLabel}</span> : null}
                    </div>
                    {selectedPlanTask ? (
                      <div className="plan-drawer-body">
                        <small>Why this route exists</small>
                        <strong>{selectedPlanTask.title}</strong>
                        <p>{selectedPlanTask.reason}</p>
                        <div className="drawer-stats">
                          <span>Target language: English</span>
                          <span>Path: {serviceRouteForIntent(selectedPlanTask.serviceKey, selectedPlanTask.intent)}</span>
                          <span>Estimated payoff: stabilize {selectedPlanTask.serviceLabel.toLowerCase()}</span>
                        </div>
                        <div className="hero-actions">
                          <a className="btn btn-solid" href={selectedPlanTask.href}>
                            Launch task
                          </a>
                          <button className="btn btn-ghost" type="button" onClick={() => setPlanSeed((seed) => seed + 43)}>
                            Swap this task
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>Select a plan item to preview its route context.</p>
                    )}
                  </article>

                  <article className="timeline-panel frame">
                    <h3>Carryover tray</h3>
                    {carryoverTasks.length === 0 ? <p>No carryover tasks are waiting right now.</p> : null}
                    <ul className="timeline-list">
                      {carryoverTasks.map((task) => (
                        <li key={`carryover-${task.id}`}>
                          <div className="timeline-dot" aria-hidden />
                          <div>
                            <strong>{task.title}</strong>
                            <p>{task.reason}</p>
                            <small>{task.serviceLabel}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="wrap-up frame">
                    <h3>End-of-day wrap-up</h3>
                    <div className="wrap-up-grid">
                      <div>
                        <small>Completed</small>
                        <strong>{Math.max(0, dailyPlan.length - carryoverTasks.length)} route steps ready to close</strong>
                      </div>
                      <div>
                        <small>Carry over</small>
                        <strong>{carryoverTasks.length} tasks waiting for tomorrow</strong>
                      </div>
                      <div>
                        <small>Unlocked next</small>
                        <strong>{weeklyFocusMap[0]?.service.label ?? 'Reading'} remains your strongest launchpad</strong>
                      </div>
                    </div>
                  </article>
                </section>
              </>
            }
          />

          <Route
            path="/weaknesses"
            element={
              <>
                <section className="dashboard-hero frame">
                  <p className="kicker">Weakness atlas</p>
                  <h1>See what is weak, why it is weak, and where to route it.</h1>
                  <p>This page owns service pressure, gap categories, and direct repair jumps.</p>
                  <div className="hero-actions">
                    <a className="btn btn-solid" href={weakAreaHref}>
                      Open weakest route
                    </a>
                    <Link className="btn btn-ghost" to="/plan">
                      Back to plan
                    </Link>
                  </div>
                </section>

                {renderStatusStrip({
                  session,
                  profileLoading,
                  profileError,
                  profileSnapshot,
                  hubPlanLoading,
                  hubPlanError,
                })}

                <section className="dashboard-grid">
                  <article className="progress-panel frame">
                    <h3>Service pressure</h3>
                    <ul className="progress-list">
                      {rankedWeakServices.map(({ service, score }) => (
                        <li key={`${service.key}-weak`}>
                          <div className="progress-row">
                            <span>{service.label}</span>
                            <strong>{score}%</strong>
                          </div>
                          <div className={`progress-track ${service.className}`} aria-hidden>
                            <span style={{ width: `${score}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="weakness-buckets frame">
                    <h3>Core weakness categories</h3>
                    <ul className="bucket-list">
                      {weaknessBuckets.map((bucket) => (
                        <li key={bucket.key}>
                          <div className="progress-row">
                            <span>{bucket.label}</span>
                            <strong>{bucket.gap}% gap</strong>
                          </div>
                          <div className={`progress-track is-${bucket.key}`} aria-hidden>
                            <span style={{ width: `${bucket.score}%` }} />
                          </div>
                          <p>{bucket.hint}</p>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="focus-map frame">
                    <div className="panel-head">
                      <h3>Weekly focus map</h3>
                      <span className="route-tone route-tone-soft">{celebrationLevel}</span>
                    </div>
                    <div className="focus-map-grid">
                      {weeklyFocusMap.map(({ service, score }) => (
                        <article key={`${service.key}-focus-weak`} className={`focus-map-card ${service.className}`}>
                          <small>{service.role}</small>
                          <strong>{service.label}</strong>
                          <div className="focus-map-track" aria-hidden>
                            <span style={{ width: `${score}%` }} />
                          </div>
                          <p>{score}% current readiness</p>
                        </article>
                      ))}
                    </div>
                  </article>

                  <article className="quick-jump frame">
                    <h3>Repair jumps</h3>
                    <div className="jump-list">
                      {SERVICES.map((service) => (
                        <a
                          className={`jump-chip ${service.className}`}
                          href={buildTaskHref(service, {
                            intent: pickTaskForService(service, 1).intent,
                            skill: service.key,
                            reason: 'hub-weakness-jump',
                          })}
                          key={`${service.key}-repair`}
                        >
                          {service.label}
                        </a>
                      ))}
                    </div>
                  </article>
                </section>
              </>
            }
          />

          <Route
            path="/review"
            element={
              <>
                <section className="dashboard-hero frame">
                  <p className="kicker">Review room</p>
                  <h1>Keep due review, carryover, and recent signals in one place.</h1>
                  <p>This page is for notebook pressure and continuity, not for starting random exercises.</p>
                  <div className="hero-actions">
                    <a
                      className="btn btn-solid"
                      href={buildTaskHref(FALLBACK_SERVICE, {
                        intent: 'leitner-review',
                        skill: 'vocabulary',
                        reason: 'hub-review',
                      }).replace('reading.english.schood.online', 'vocabulary.english.schood.online')}
                    >
                      Open vocabulary review
                    </a>
                    <Link className="btn btn-ghost" to="/week">
                      Weekly recap
                    </Link>
                  </div>
                </section>

                {renderStatusStrip({
                  session,
                  profileLoading,
                  profileError,
                  profileSnapshot,
                  hubPlanLoading,
                  hubPlanError,
                })}

                <section className="dashboard-grid">
                  <article className="vocab-preview frame">
                    <h3>Shared Vocabulary Notebook</h3>
                    <p>{notebookDueCount} cards due now · {notebookTotalCount} words saved.</p>
                    {notebookLoading ? <p>Loading notebook preview...</p> : null}
                    {notebookError ? <p>{notebookError}</p> : null}
                    {!notebookLoading && recentNotebookWords.length === 0 ? (
                      <p>No words captured yet. Save words in Vocabulary to see them here.</p>
                    ) : null}
                    <ul className="vocab-word-list">
                      {recentNotebookWords.map((card) => (
                        <li key={card.id}>
                          <div className="vocab-word-head">
                            <strong>{card.word}</strong>
                            <small>{resolveWordSource(card)}</small>
                          </div>
                          {card.definition ? <span>{card.definition}</span> : null}
                        </li>
                      ))}
                    </ul>
                    <a className="btn btn-ghost" href="https://vocabulary.english.schood.online/review">
                      Open vocabulary review
                    </a>
                  </article>

                  <article className="timeline-panel frame">
                    <h3>Recent events</h3>
                    {timelineItems.length === 0 ? <p>No recent events yet. Start a task in any English service.</p> : null}
                    <ul className="timeline-list">
                      {timelineItems.map((item) => (
                        <li key={item.id}>
                          <div className="timeline-dot" aria-hidden />
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                            <small>{item.when}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="daily-plan frame">
                    <div className="panel-head">
                      <h3>Carryover tasks</h3>
                      <Link className="btn btn-ghost" to="/plan">
                        Back to plan
                      </Link>
                    </div>
                    <ul className="plan-list">
                      {(carryoverTasks.length > 0 ? carryoverTasks : dailyPlan.slice(0, 3)).map((task) => (
                        <li key={`review-${task.id}`}>
                          <button className="plan-brief" type="button" onClick={() => setSelectedPlanTaskId(task.id)}>
                            <small>{task.serviceLabel}</small>
                            <strong>{task.title}</strong>
                            <p>{task.reason}</p>
                          </button>
                          <div className="plan-actions">
                            <a className="btn btn-soft" href={task.href}>
                              Launch
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>
                </section>
              </>
            }
          />

          <Route
            path="/week"
            element={
              <>
                <section className="dashboard-hero frame">
                  <p className="kicker">Weekly recap</p>
                  <h1>Look at the week as a connected English system, not separate apps.</h1>
                  <p>This page holds recap, stronger services, transfer momentum, and the next launchpad.</p>
                  <div className="hero-actions">
                    <Link className="btn btn-solid" to="/dashboard">
                      Back to dashboard
                    </Link>
                    <Link className="btn btn-ghost" to="/plan">
                      Tomorrow&apos;s plan
                    </Link>
                  </div>
                </section>

                <section className="briefing-strip frame">
                  <article>
                    <small>Completed services</small>
                    <strong>{completedServices}/{SERVICES.length}</strong>
                  </article>
                  <article>
                    <small>Priority tone</small>
                    <strong>{priorityTone}</strong>
                  </article>
                  <article>
                    <small>Celebration level</small>
                    <strong>{celebrationLevel}</strong>
                  </article>
                </section>

                {renderStatusStrip({
                  session,
                  profileLoading,
                  profileError,
                  profileSnapshot,
                  hubPlanLoading,
                  hubPlanError,
                })}

                <section className="focus-map frame">
                  <div className="panel-head">
                    <h3>Service readiness this week</h3>
                    <span className="route-tone route-tone-soft">{celebrationLevel}</span>
                  </div>
                  <div className="focus-map-grid">
                    {weeklyFocusMap.map(({ service, score }) => (
                      <article key={`${service.key}-week`} className={`focus-map-card ${service.className}`}>
                        <small>{service.role}</small>
                        <strong>{service.label}</strong>
                        <div className="focus-map-track" aria-hidden>
                          <span style={{ width: `${score}%` }} />
                        </div>
                        <p>{score}% current readiness</p>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="dashboard-grid">
                  <article className="timeline-panel frame">
                    <h3>Week in events</h3>
                    <ul className="timeline-list">
                      {timelineItems.map((item) => (
                        <li key={`week-${item.id}`}>
                          <div className="timeline-dot" aria-hidden />
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                            <small>{item.when}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="wrap-up frame">
                    <h3>Weekly wrap-up</h3>
                    <div className="wrap-up-grid">
                      <div>
                        <small>Recovered</small>
                        <strong>{Math.max(1, completedServices - 2)} service lanes stabilized</strong>
                      </div>
                      <div>
                        <small>Still open</small>
                        <strong>{rankedWeakServices.slice(0, 2).map((entry) => entry.service.label).join(' · ')}</strong>
                      </div>
                      <div>
                        <small>Next launchpad</small>
                        <strong>{weakPracticeTask?.serviceLabel ?? topWeakService.label}</strong>
                      </div>
                    </div>
                  </article>

                  <section className="services-grid" aria-label="Weekly service recap">
                    {SERVICES.map((service) => (
                      <article className={`service-card frame ${service.className}`} key={`${service.key}-recap`}>
                        <p className="service-tag">{service.label}</p>
                        <h2>{service.role}</h2>
                        <p className="service-summary">{service.summary}</p>
                        <div className="service-actions">
                          <a
                            className="btn btn-soft"
                            href={buildTaskHref(service, {
                              intent: pickTaskForService(service, 2).intent,
                              skill: service.key,
                              reason: 'hub-weekly-recap',
                            })}
                          >
                            Re-open route
                          </a>
                        </div>
                      </article>
                    ))}
                  </section>
                </section>
              </>
            }
          />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
