import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { platformUrl, supabase } from './lib/supabase';
import { getMe } from './lib/platformClient';
import { captureNotebookWords } from './lib/vocabularyNotebookClient';
import {
  archiveReadingArticle,
  createReadingArticle,
  getReadingArticleBySlug,
  listReadingArticles,
  updateReadingArticle,
  type CefrLevel,
  type ReadingArticle,
  type ReadingArticleTone,
} from './lib/readingArticlesClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';
const EXERCISES_PATH = '/exercises' as const;
const ARTICLES_PATH = '/articles' as const;
const ARTICLE_DETAIL_PATH = '/article-detail' as const;
const ADMIN_ARTICLES_PATH = '/admin/articles' as const;
type AppPath =
  | '/'
  | '/dashboard'
  | typeof EXERCISES_PATH
  | typeof ARTICLES_PATH
  | typeof ARTICLE_DETAIL_PATH
  | typeof ADMIN_ARTICLES_PATH;

type LessonRow = {
  id: string;
  title: string;
  level: string;
  schedule: string;
  progress: number;
  status: 'In progress' | 'Not started' | 'Completed';
  accent: string;
};

type ServiceWordSeed = {
  word: string;
  definition: string;
  example: string;
  context: string;
};

const READING_PRODUCT_ID = ((import.meta.env.VITE_READING_PRODUCT_ID as string | undefined) ?? '').trim() || '0e8ad198-6284-4406-9e07-11ba7da0f42d';
const READING_PRODUCT_SLUG = 'english-reading';
const SERVICE_LABEL = 'English Reading';

const ENGLISH_HUB_URL = 'https://english.schood.online';
const ENGLISH_SERVICE_LINKS = [
  { key: 'reading', label: 'Reading', href: 'https://reading.english.schood.online' },
  { key: 'writing', label: 'Writing', href: 'https://writing.english.schood.online' },
  { key: 'listening', label: 'Listening', href: 'https://listening.english.schood.online' },
  { key: 'speaking', label: 'Speaking', href: 'https://speaking.english.schood.online' },
  { key: 'grammar', label: 'Grammar', href: 'https://grammar.english.schood.online' },
  { key: 'vocabulary', label: 'Vocabulary', href: 'https://vocabulary.english.schood.online' },
  { key: 'immersion', label: 'Immersion', href: 'https://immersion.english.schood.online' },
] as const;
const CURRENT_SERVICE_KEY = SERVICE_LABEL.replace(/^English\s+/i, '').toLowerCase();
const SERVICE_SWITCH_LINKS = ENGLISH_SERVICE_LINKS.filter((service) => service.key !== CURRENT_SERVICE_KEY);

const SERVICE_BLUEPRINT = [
  {
    title: 'Interactive text mode',
    detail: 'Open passages with click-to-meaning support and direct vocabulary capture.',
    intent: 'interactive-text',
    skill: 'vocabulary',
  },
  {
    title: 'Sentence breakdown',
    detail: 'Highlight structure and connect clauses so passage logic is easier to parse.',
    intent: 'sentence-breakdown',
    skill: 'structure',
  },
  {
    title: 'Cloze tasks',
    detail: 'Fill targeted gaps to sharpen lexical precision and context reading.',
    intent: 'cloze',
    skill: 'comprehension',
  },
  {
    title: 'Dual reading modes',
    detail: 'Switch between intensive learning and extensive flow reading sessions.',
    intent: 'reading-modes',
    skill: 'pace',
  },
] as const;

const SERVICE_HANDOFFS = [
  { key: 'vocabulary', label: 'Send captured words to Vocabulary', intent: 'word-sources', skill: 'retention', reason: 'reading-handoff' },
  { key: 'grammar', label: 'Route structure gaps to Grammar', intent: 'pattern-training', skill: 'structure', reason: 'reading-handoff' },
  { key: 'writing', label: 'Transfer structure to Writing', intent: 'rewrite', skill: 'coherence', reason: 'reading-handoff' },
] as const;

const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const lessonRows: LessonRow[] = [
  {
    id: 'lesson-1',
    title: 'Daily Conversation Signals',
    level: 'Beginner',
    schedule: '08.00 - 09.00',
    progress: 56,
    status: 'In progress',
    accent: '#d3efbd',
  },
  {
    id: 'lesson-2',
    title: 'University Lecture Mapping',
    level: 'Intermediate',
    schedule: '10.00 - 11.30',
    progress: 81,
    status: 'In progress',
    accent: '#edf8dc',
  },
  {
    id: 'lesson-3',
    title: 'Airport and Travel Announcements',
    level: 'Beginner',
    schedule: '14.00 - 15.00',
    progress: 24,
    status: 'Not started',
    accent: '#f6fde9',
  },
  {
    id: 'lesson-4',
    title: 'IELTS Section 4 Master Drill',
    level: 'Advanced',
    schedule: '17.00 - 18.00',
    progress: 100,
    status: 'Completed',
    accent: '#c0e8a4',
  },
];

const weeklyMinutes = [
  { day: 'Mon', minutes: 62 },
  { day: 'Tue', minutes: 94 },
  { day: 'Wed', minutes: 71 },
  { day: 'Thu', minutes: 88 },
  { day: 'Fri', minutes: 102 },
  { day: 'Sat', minutes: 74 },
  { day: 'Sun', minutes: 80 },
];



void weeklyMinutes;

const READING_VOCAB_SEEDS: ServiceWordSeed[] = [
  {
    word: 'inference',
    definition: 'A conclusion reached from evidence rather than direct statement.',
    example: 'The question required an inference about the writer\'s attitude.',
    context: 'Reading comprehension and author-intent tasks.',
  },
  {
    word: 'cohesion',
    definition: 'The way ideas are linked clearly and logically within a text.',
    example: 'Strong cohesion made the paragraph easy to follow.',
    context: 'Passage structure analysis.',
  },
  {
    word: 'nuance',
    definition: 'A subtle difference in meaning, tone, or feeling.',
    example: 'She noticed the nuance between cautious and skeptical.',
    context: 'Vocabulary-in-context reading tasks.',
  },
  {
    word: 'paraphrase',
    definition: 'To restate information using different words with the same meaning.',
    example: 'He paraphrased the sentence before choosing the answer.',
    context: 'Sentence matching and summary questions.',
  },
  {
    word: 'implicit',
    definition: 'Suggested but not directly expressed.',
    example: 'The criticism was implicit, not explicit.',
    context: 'Inference and implication questions.',
  },
  {
    word: 'contextual',
    definition: 'Related to the surrounding text or situation.',
    example: 'Contextual clues helped identify the unknown term.',
    context: 'Word meaning from context.',
  },
  {
    word: 'synthesis',
    definition: 'Combining different ideas into a single coherent understanding.',
    example: 'The final answer needed synthesis of two paragraphs.',
    context: 'Multi-source reading tasks.',
  },
  {
    word: 'distortion',
    definition: 'A change that misrepresents the original meaning.',
    example: 'Option C was a distortion of the author\'s claim.',
    context: 'Trap-option detection.',
  },
  {
    word: 'precision',
    definition: 'Exactness and accuracy in language or interpretation.',
    example: 'Precision in word choice improved his summary score.',
    context: 'Close reading and vocabulary choice.',
  },
  {
    word: 'coherence',
    definition: 'Logical consistency that makes ideas easy to follow.',
    example: 'The paragraph lacked coherence after sentence three.',
    context: 'Paragraph flow evaluation.',
  },
];

const progressStatusClass = (status: LessonRow['status']): string => {
  if (status === 'Completed') return 'pill done';
  if (status === 'Not started') return 'pill muted';
  return 'pill live';
};

const buildPlatformUrl = (pathname: string): string => `${platformUrl.replace(/\/$/, '')}${pathname}`;

const readMetaText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const resolveProfileName = (session: Session | null): string | null => {
  if (!session) return null;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = readMetaText(meta.full_name);
  if (fullName) return fullName;

  const firstName = readMetaText(meta.first_name);
  const lastName = readMetaText(meta.last_name);
  const combined = `${firstName} ${lastName}`.trim();
  return combined || null;
};

const resolveInitials = (name: string | null, email: string | null): string => {
  if (name) {
    const parts = name
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const first = parts[0] ?? '';
    const second = parts[1] ?? '';
    if (first && second) return `${first.slice(0, 1)}${second.slice(0, 1)}`.toUpperCase();
    if (first) return first.slice(0, 2).toUpperCase();
  }

  if (email) {
    const prefix = email.split('@')[0] ?? '';
    return prefix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'GL';
  }

  return 'GL';
};

const resolveReturnTo = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

const buildServiceDashboardHref = (
  serviceKey: string,
  intent: string,
  skill: string,
  reason: string,
): string => {
  const target = ENGLISH_SERVICE_LINKS.find((entry) => entry.key === serviceKey) ?? ENGLISH_SERVICE_LINKS[0];
  const url = new URL(`${target.href}/dashboard`);
  url.searchParams.set('from', 'english-hub');
  url.searchParams.set('source_service', CURRENT_SERVICE_KEY);
  url.searchParams.set('intent', intent);
  url.searchParams.set('skill', skill);
  url.searchParams.set('reason', reason);
  return url.toString();
};

const resolveArticleSlug = (pathname: string): string | null => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (!normalized.startsWith(`${ARTICLES_PATH}/`)) return null;
  const raw = normalized.slice(`${ARTICLES_PATH}/`.length).trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const resolveAppPath = (pathname: string): AppPath => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/dashboard') return '/dashboard';
  if (normalized === ADMIN_ARTICLES_PATH) return ADMIN_ARTICLES_PATH;
  if (normalized === ARTICLES_PATH) return ARTICLES_PATH;
  if (normalized.startsWith(`${ARTICLES_PATH}/`)) return ARTICLE_DETAIL_PATH;
  if (normalized === EXERCISES_PATH || normalized.startsWith('/exercise/')) return EXERCISES_PATH;
  if (normalized.startsWith('/feature/')) return '/dashboard';
  return '/';
};

const DashboardPage = ({
  lessons,
  hasAccess,
  pricingHref,
  onOpenExercise,
  isSignedIn,
  signInHref,
  syncingWords,
  syncMessage,
  syncError,
  onSyncWords,
}: {
  lessons: LessonRow[];
  hasAccess: boolean;
  pricingHref: string;
  onOpenExercise: (index: number) => void;
  isSignedIn: boolean;
  signInHref: string;
  syncingWords: boolean;
  syncMessage: string | null;
  syncError: string | null;
  onSyncWords: () => void;
}) => {
  const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const inboundIntent = params.get('intent') ?? '';
  const inboundSkill = params.get('skill') ?? '';
  const inboundReason = params.get('reason') ?? '';
  const inboundSourceService = params.get('source_service') ?? '';
  const hasInboundFocus = Boolean(inboundIntent || inboundSkill);

  return (
    <div className="dashboard-stack">
    <section className="hero-card card">
      <div className="hero-copy">
        <div className="eyebrow">English Reading Studio</div>
        <h1>Build real exam reading confidence, one focused session at a time.</h1>
        <p>
          Train with structured drills, track micro-skills, and keep your full learning history in one workspace.
        </p>
        <button
          className="primary-cta"
          type="button"
          onClick={() => {
            if (!hasAccess) window.location.assign(pricingHref);
          }}
        >
          {hasAccess ? 'Start 15-min warmup' : 'Unlock reading access'}
        </button>
        {!hasAccess ? <small className="hero-note">Your account is signed in, but this service needs an active plan or trial.</small> : null}
      </div>
      <div className="hero-art" aria-hidden>
        <div className="wave one" />
        <div className="wave two" />
        <div className="wave three" />
      </div>
    </section>

    {hasInboundFocus ? (
      <section className="card connected-brief">
        <div>
          <h2>Focus routed from Schood English</h2>
          <p>
            Continue with intent <strong>{inboundIntent || 'interactive-text'}</strong> on skill{' '}
            <strong>{inboundSkill || 'comprehension'}</strong>.
          </p>
          {inboundReason ? <small>Reason: {inboundReason.replace(/[-_]+/g, ' ')}</small> : null}
          {inboundSourceService ? <small>Triggered by: {inboundSourceService}</small> : null}
        </div>
        <a
          className="ghost-btn"
          href={buildServiceDashboardHref(CURRENT_SERVICE_KEY, inboundIntent || 'interactive-text', inboundSkill || 'comprehension', 'continue-focus')}
        >
          Keep this focus
        </a>
      </section>
    ) : null}

    <section className="kpi-grid">
      <article className="card kpi">
        <span>Total reading sets</span>
        <strong>48</strong>
        <small>+6 this month</small>
      </article>
      <article className="card kpi">
        <span>Hours practiced</span>
        <strong>36.4 h</strong>
        <small>consistency score: 88</small>
      </article>
      <article className="card kpi">
        <span>Estimated band (Reading)</span>
        <strong>7.0</strong>
        <small>target: 7.5</small>
      </article>
    </section>

    <section className="card class-table">
      <div className="section-head">
        <h2>My class list</h2>
        <button className="ghost-btn" type="button">See all</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Class</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((lesson) => (
            <tr key={lesson.id}>
              <td>
                <strong>{lesson.title}</strong>
                <small>{lesson.level} - {lesson.schedule}</small>
              </td>
              <td>
                <div className="progress-row">
                  <span>{lesson.progress}%</span>
                  <div className="track">
                    <div className="fill" style={{ width: `${lesson.progress}%`, background: lesson.accent }} />
                  </div>
                </div>
              </td>
              <td>
                <span className={progressStatusClass(lesson.status)}>{lesson.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>

    <section className="card cross-service-playbook">
      <div className="section-head">
        <h2>Exercises</h2>
        <a className="ghost-btn" href={`${ENGLISH_HUB_URL}/dashboard`}>Open Schood English</a>
      </div>
      <div className="playbook-grid">
        {SERVICE_BLUEPRINT.map((item, index) => (
          <article key={item.title} className="playbook-card">
            <small>{'Exercise ' + (index + 1) + ' - ' + item.skill}</small>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <button className="ghost-btn" type="button" onClick={() => onOpenExercise(index)}>
              Open exercise window
            </button>
          </article>
        ))}
      </div>
      <div className="handoff-row">
        {SERVICE_HANDOFFS.map((handoff) => (
          <a
            key={handoff.key}
            className="menu-link muted-link"
            href={buildServiceDashboardHref(handoff.key, handoff.intent, handoff.skill, handoff.reason)}
          >
            {handoff.label}
          </a>
        ))}
      </div>
    </section>

    <section className="card vocab-sync-card">
      <div className="section-head">
        <h2>Vocabulary Sync</h2>
        <button
          className="ghost-btn"
          type="button"
          disabled={syncingWords}
          onClick={() => {
            if (!isSignedIn) {
              window.location.assign(signInHref);
              return;
            }
            onSyncWords();
          }}
        >
          {isSignedIn ? (syncingWords ? 'Syncing...' : 'Send 10 words') : 'Sign in to sync'}
        </button>
      </div>
      <p className="vocab-sync-copy">
        Save key reading words to the shared English Vocabulary notebook for daily Leitner review.
      </p>
      <small className="vocab-sync-copy">
        Words are deduplicated by language scope, so repeated syncs will not create duplicates.
      </small>
      {syncError ? (
        <div className="access-banner warning">
          <strong>Sync failed.</strong>
          <span>{syncError}</span>
        </div>
      ) : null}
      {syncMessage ? (
        <div className="access-banner">
          <strong>{syncMessage}</strong>
          <a className="ghost-btn" href="https://vocabulary.english.schood.online/dashboard">Open vocabulary notebook</a>
        </div>
      ) : null}
    </section>
  </div>
  );
};



const ExercisesPage = ({
  hasAccess,
  pricingHref,
  onNavigate,
}: {
  hasAccess: boolean;
  pricingHref: string;
  onNavigate: (nextPath: AppPath) => void;
}) => {
  type LaneKey = 'todo' | 'in_progress' | 'completed';

  const [activeLane, setActiveLane] = useState<'all' | LaneKey>('all');
  const [selectedId, setSelectedId] = useState<string>('');

  const exerciseItems = useMemo(
    () =>
      SERVICE_BLUEPRINT.map((item, index) => {
        const lane: LaneKey = index === 0 ? 'todo' : index < SERVICE_BLUEPRINT.length - 1 ? 'in_progress' : 'completed';
        const priority = index === 0 ? 'High' : index === 1 ? 'Medium' : 'Low';

        return {
          id: `${CURRENT_SERVICE_KEY}-${index + 1}`,
          lane,
          priority,
          due: `${10 + index * 3} days left`,
          comments: 6 + index * 4,
          updates: 3 + index * 2,
          ...item,
        };
      }),
    [],
  );

  useEffect(() => {
    const firstItem = exerciseItems[0];
    if (!selectedId && firstItem) {
      setSelectedId(firstItem.id);
    }
  }, [exerciseItems, selectedId]);

  const visibleItems = activeLane === 'all' ? exerciseItems : exerciseItems.filter((item) => item.lane === activeLane);

  const groupedItems = useMemo(
    () => ({
      todo: visibleItems.filter((item) => item.lane === 'todo'),
      in_progress: visibleItems.filter((item) => item.lane === 'in_progress'),
      completed: visibleItems.filter((item) => item.lane === 'completed'),
    }),
    [visibleItems],
  );

  const selectedItem = exerciseItems.find((item) => item.id === selectedId) ?? exerciseItems[0];

  const laneDefs: Array<{ key: LaneKey; label: string }> = [
    { key: 'todo', label: 'Todo' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <div className="dashboard-stack">
      <section className="card exercises-workspace">
        <div className="exercises-grid">
          <div className="exercises-list-pane">
            <div className="exercises-list-head">
              <h2>{SERVICE_LABEL} Exercises</h2>
              <small>One unified page</small>
            </div>

            <div className="exercises-filters">
              <button className={activeLane === 'all' ? 'exercise-filter active' : 'exercise-filter'} type="button" onClick={() => setActiveLane('all')}>
                All
              </button>
              {laneDefs.map((lane) => (
                <button
                  key={lane.key}
                  className={activeLane === lane.key ? 'exercise-filter active' : 'exercise-filter'}
                  type="button"
                  onClick={() => setActiveLane(lane.key)}
                >
                  {lane.label}
                </button>
              ))}
            </div>

            {laneDefs.map((lane) => (
              <section key={lane.key} className="exercise-lane">
                <header>
                  <h3>{lane.label}</h3>
                  <span>{groupedItems[lane.key].length}</span>
                </header>

                {groupedItems[lane.key].length === 0 ? <p className="exercise-empty">No exercises in this lane.</p> : null}

                {groupedItems[lane.key].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={selectedItem?.id === item.id ? 'exercise-item active' : 'exercise-item'}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="exercise-item-top">
                      <h4>{item.title}</h4>
                      <span className={`exercise-priority ${item.priority.toLowerCase()}`}>{item.priority} priority</span>
                    </div>
                    <p>{item.detail}</p>
                    <div className="exercise-item-meta">
                      <span>{item.due}</span>
                      <span>{item.comments} notes</span>
                      <span>{item.updates} updates</span>
                    </div>
                  </button>
                ))}
              </section>
            ))}
          </div>

          <div className="exercises-detail-pane">
            {selectedItem ? (
              <>
                <div className="exercise-detail-actions">
                  <button type="button" className="ghost-btn">Share</button>
                  <button type="button" className="ghost-btn">Expand</button>
                  <button type="button" className="ghost-btn" onClick={() => onNavigate('/dashboard')}>Close</button>
                </div>

                <small className="exercise-detail-eyebrow">{SERVICE_LABEL.toUpperCase()} · {selectedItem.skill}</small>
                <h2>{selectedItem.title}</h2>

                <div className="exercise-detail-badges">
                  <span className={`exercise-priority ${selectedItem.priority.toLowerCase()}`}>{selectedItem.priority} priority</span>
                  <span className="exercise-chip">{selectedItem.due}</span>
                </div>

                <div className="exercise-timebox">
                  <span>Focused exercise block</span>
                  <strong>45:00</strong>
                </div>

                <p className="exercise-detail-copy">{selectedItem.detail}</p>

                <div className="exercise-subsection">
                  <h3>Execution checklist</h3>
                  <ul>
                    <li>Complete the task prompt without switching services.</li>
                    <li>Write one short reflection before submitting.</li>
                    <li>Push weak words or patterns into connected services.</li>
                  </ul>
                </div>

                <div className="exercise-subsection">
                  <h3>Comments</h3>
                  <div className="exercise-comment">
                    <strong>Coach</strong>
                    <p>Prioritize clarity first, then improve speed in the second attempt.</p>
                  </div>
                  <div className="exercise-comment">
                    <strong>You</strong>
                    <p>I will repeat this with a shorter time limit after one full run.</p>
                  </div>
                </div>

                <div className="exercise-detail-footer">
                  <button
                    className="primary-cta"
                    type="button"
                    onClick={() => {
                      if (!hasAccess) {
                        window.location.assign(pricingHref);
                      }
                    }}
                  >
                    {hasAccess ? 'Start exercise' : 'Unlock exercise access'}
                  </button>
                  <button className="ghost-btn" type="button" onClick={() => onNavigate('/dashboard')}>
                    Back to dashboard
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
};

const ArticlesPage = ({
  hasAccess,
  pricingHref,
  accessToken,
  onNavigate,
  onOpenArticle,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
  onNavigate: (nextPath: AppPath) => void;
  onOpenArticle: (slug: string) => void;
}) => {
  const [articles, setArticles] = useState<ReadingArticle[]>([]);
  const [libraryCategories, setLibraryCategories] = useState<string[]>([]);
  const [libraryThemes, setLibraryThemes] = useState<string[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<CefrLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTheme, setSelectedTheme] = useState<string>('all');

  const loadArticles = async (): Promise<void> => {
    if (!accessToken) return;
    setLoadingArticles(true);
    setArticlesError(null);
    try {
      const result = await listReadingArticles(accessToken, { status: 'published', limit: 150 });
      setArticles(result.articles);
      setLibraryCategories(result.filters.categories);
      setLibraryThemes(result.filters.themes);
    } catch (error) {
      const statusCode = (error as { status?: number } | null)?.status ?? null;
      if (statusCode === 401 || statusCode === 403) {
        setArticlesError('Sign in again to load reading articles.');
        return;
      }
      setArticlesError('Could not load articles right now. Please try again.');
    } finally {
      setLoadingArticles(false);
    }
  };

  useEffect(() => {
    if (!accessToken) {
      setArticles([]);
      setLibraryCategories([]);
      setLibraryThemes([]);
      setLoadingArticles(false);
      setArticlesError('Sign in to load the reading article library.');
      return;
    }
    void loadArticles();
  }, [accessToken]);

  const categories = useMemo(() => {
    if (libraryCategories.length > 0) return ['all', ...libraryCategories];
    return ['all', ...Array.from(new Set(articles.map((article) => article.category)))];
  }, [articles, libraryCategories]);

  useEffect(() => {
    if (!categories.includes(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categories, selectedCategory]);

  const availableThemes = useMemo(() => {
    const source =
      selectedCategory === 'all'
        ? articles
        : articles.filter((article) => article.category === selectedCategory);
    if (source.length > 0) return ['all', ...Array.from(new Set(source.map((article) => article.theme)))];

    const fromFilters = selectedCategory === 'all'
      ? libraryThemes
      : libraryThemes.filter(Boolean);
    return ['all', ...Array.from(new Set(fromFilters))];
  }, [articles, libraryThemes, selectedCategory]);

  useEffect(() => {
    if (!availableThemes.includes(selectedTheme)) {
      setSelectedTheme('all');
    }
  }, [availableThemes, selectedTheme]);

  const filteredArticles = useMemo(
    () =>
      articles.filter((article) => {
        if (selectedLevel !== 'all' && article.level !== selectedLevel) return false;
        if (selectedCategory !== 'all' && article.category !== selectedCategory) return false;
        if (selectedTheme !== 'all' && article.theme !== selectedTheme) return false;
        return true;
      }),
    [articles, selectedCategory, selectedLevel, selectedTheme],
  );

  const featuredArticle = filteredArticles[0] ?? null;
  const sideArticles = featuredArticle ? filteredArticles.slice(1, 4) : filteredArticles.slice(0, 3);
  const visibleThemes = Array.from(new Set(filteredArticles.map((article) => article.theme))).slice(0, 10);

  const handleArticleOpen = (slug?: string): void => {
    if (!hasAccess) {
      window.location.assign(pricingHref);
      return;
    }
    if (slug) {
      onOpenArticle(slug);
      return;
    }
    onNavigate(EXERCISES_PATH);
  };

  return (
    <div className="dashboard-stack">
      <section className="card reading-library-head">
        <div>
          <small className="library-label">Reading Library</small>
          <h2>Tiered articles from A1 to C2 with focused pathways.</h2>
          <p>
            Select your level, category, and theme to keep reading practice targeted while staying connected to your
            English profile.
          </p>
        </div>
        <div className="library-head-actions">
          <button
            className="ghost-btn"
            type="button"
            onClick={() => {
              void loadArticles();
            }}
            disabled={loadingArticles || !accessToken}
          >
            {loadingArticles ? 'Refreshing...' : 'Refresh library'}
          </button>
          <button className="ghost-btn" type="button" onClick={() => onNavigate(EXERCISES_PATH)}>
            Open exercises
          </button>
          <button className="primary-cta" type="button" onClick={() => handleArticleOpen(featuredArticle?.slug)}>
            {hasAccess ? 'Start reading now' : 'Unlock article access'}
          </button>
        </div>
      </section>

      {loadingArticles ? (
        <div className="access-banner">
          <strong>Loading article library...</strong>
          <span>Fetching latest level and category catalog.</span>
        </div>
      ) : null}

      {!loadingArticles && articlesError ? (
        <div className="access-banner warning">
          <strong>Article library unavailable.</strong>
          <span>{articlesError}</span>
          <button
            className="ghost-btn"
            type="button"
            onClick={() => {
              void loadArticles();
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      <section className="card reading-library-filters">
        <div className="library-filter-block">
          <small>CEFR level</small>
          <div className="library-chip-row">
            <button
              className={selectedLevel === 'all' ? 'library-chip active' : 'library-chip'}
              type="button"
              onClick={() => setSelectedLevel('all')}
            >
              All levels
            </button>
            {CEFR_LEVELS.map((level) => (
              <button
                key={level}
                className={selectedLevel === level ? 'library-chip active' : 'library-chip'}
                type="button"
                onClick={() => setSelectedLevel(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="library-select-grid">
          <label>
            <span>Category</span>
            <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All categories' : category}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Theme</span>
            <select value={selectedTheme} onChange={(event) => setSelectedTheme(event.target.value)}>
              {availableThemes.map((theme) => (
                <option key={theme} value={theme}>
                  {theme === 'all' ? 'All themes' : theme}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="reading-library-grid">
        {featuredArticle ? (
          <article className={`card reading-article-feature tone-${featuredArticle.tone}`}>
            <div className="reading-article-meta">
              <span>{featuredArticle.category}</span>
              <span>{featuredArticle.level}</span>
            </div>
            <h3>{featuredArticle.title}</h3>
            <p>{featuredArticle.summary}</p>
            <div className="reading-article-footer">
              <small>{featuredArticle.readTimeMinutes} min read</small>
              {featuredArticle.hot ? <span className="reading-hot-pill">Trending</span> : null}
            </div>
            <button className="ghost-btn" type="button" onClick={() => handleArticleOpen(featuredArticle.slug)}>
              Open article
            </button>
          </article>
        ) : (
          <article className="card reading-library-empty">
            <h3>No articles match this filter yet.</h3>
            <p>Adjust level, category, or theme to load another set.</p>
          </article>
        )}

        <div className="reading-library-column">
          {sideArticles.length === 0 ? (
            <article className="card reading-article-mini">
              <h4>No secondary cards</h4>
              <p>Try widening filters to discover more options.</p>
            </article>
          ) : (
            sideArticles.map((article) => (
              <article key={article.id} className={`card reading-article-mini tone-${article.tone}`}>
                <div className="reading-article-meta">
                  <span>{article.category}</span>
                  <span>{article.level}</span>
                </div>
                <h4>{article.title}</h4>
                <p>{article.summary}</p>
                <small>{article.readTimeMinutes} min read</small>
              </article>
            ))
          )}
        </div>

        <article className="card reading-library-topics">
          <small>Theme map</small>
          <h4>Popular themes</h4>
          <div className="library-theme-cloud">
            {visibleThemes.length === 0 ? (
              <span className="library-theme-chip muted">No themes available</span>
            ) : (
              visibleThemes.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={selectedTheme === theme ? 'library-theme-chip active' : 'library-theme-chip'}
                  onClick={() => setSelectedTheme(theme)}
                >
                  {theme}
                </button>
              ))
            )}
          </div>
          <button className="ghost-btn" type="button" onClick={() => setSelectedTheme('all')}>
            Show all themes
          </button>
        </article>
      </section>

      <section className="card reading-library-catalog">
        <div className="section-head">
          <h2>Article catalog</h2>
          <small>{filteredArticles.length} results</small>
        </div>

        {filteredArticles.length === 0 ? (
          <p className="reading-catalog-empty">No articles found for this selection.</p>
        ) : (
          <div className="reading-catalog-grid">
            {filteredArticles.map((article) => (
              <article key={article.id} className={`reading-catalog-card tone-${article.tone}`}>
                <div className="reading-article-meta">
                  <span>{article.category}</span>
                  <span>{article.level}</span>
                </div>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <div className="reading-article-footer">
                  <small>{article.theme}</small>
                  <small>{article.readTimeMinutes} min</small>
                </div>
                <button className="ghost-btn" type="button" onClick={() => handleArticleOpen(article.slug)}>
                  {hasAccess ? 'Read article' : 'Unlock to read'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const ArticleDetailPage = ({
  articleSlug,
  accessToken,
  hasAccess,
  pricingHref,
  onNavigate,
}: {
  articleSlug: string | null;
  accessToken: string | null;
  hasAccess: boolean;
  pricingHref: string;
  onNavigate: (nextPath: AppPath) => void;
}) => {
  const [article, setArticle] = useState<ReadingArticle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!articleSlug) {
      setArticle(null);
      setError('Article not found.');
      setLoading(false);
      return;
    }
    if (!accessToken) {
      setArticle(null);
      setError('Sign in to open this article.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const data = await getReadingArticleBySlug(accessToken, articleSlug);
        if (cancelled) return;
        if (!data) {
          setArticle(null);
          setError('This article is unavailable right now.');
          return;
        }
        setArticle(data);
      } catch {
        if (cancelled) return;
        setArticle(null);
        setError('Could not load this article right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, articleSlug]);

  const contentBlocks = useMemo(() => {
    const source = (article?.contentMarkdown ?? '').trim();
    if (!source) {
      return [
        {
          type: 'paragraph' as const,
          text: article?.summary ?? 'This article content is being prepared. Please check back shortly.',
        },
      ];
    }

    return source
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        if (block.startsWith('## ')) return { type: 'heading' as const, text: block.replace(/^##\s+/, '') };
        if (block.startsWith('> ')) return { type: 'quote' as const, text: block.replace(/^>\s+/, '') };
        return { type: 'paragraph' as const, text: block };
      });
  }, [article?.contentMarkdown, article?.summary]);

  const startPractice = (): void => {
    if (!hasAccess) {
      window.location.assign(pricingHref);
      return;
    }
    onNavigate(EXERCISES_PATH);
  };

  return (
    <div className="dashboard-stack">
      <section className={`card article-detail-hero ${article ? `tone-${article.tone}` : ''}`.trim()}>
        <div>
          <div className="reading-article-meta">
            <span>{article?.category ?? 'Reading'}</span>
            <span>{article?.level ?? 'A1'}</span>
            <span>{article?.theme ?? 'General'}</span>
          </div>
          <h2>{article?.title ?? 'Reading article'}</h2>
          <p>{article?.summary ?? 'Open focused reading content and connect it with your English profile.'}</p>
        </div>
        <div className="article-detail-actions">
          <button className="ghost-btn" type="button" onClick={() => onNavigate(ARTICLES_PATH)}>
            Back to library
          </button>
          <button className="primary-cta" type="button" onClick={startPractice}>
            {hasAccess ? 'Open exercises' : 'Unlock access'}
          </button>
        </div>
      </section>

      {loading ? (
        <div className="access-banner">
          <strong>Loading article...</strong>
          <span>Preparing the full reading view.</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="access-banner warning">
          <strong>Could not open article.</strong>
          <span>{error}</span>
          <button className="ghost-btn" type="button" onClick={() => onNavigate(ARTICLES_PATH)}>
            Back to library
          </button>
        </div>
      ) : null}

      {!loading && !error && article ? (
        <section className="article-detail-layout">
          <article className="card article-detail-content">
            {contentBlocks.map((block, index) => {
              if (block.type === 'heading') {
                return (
                  <h3 key={`${block.text}-${index}`} className="article-detail-h3">
                    {block.text}
                  </h3>
                );
              }
              if (block.type === 'quote') {
                return (
                  <blockquote key={`${block.text}-${index}`} className="article-detail-quote">
                    {block.text}
                  </blockquote>
                );
              }
              return (
                <p key={`${block.text}-${index}`} className="article-detail-paragraph">
                  {block.text}
                </p>
              );
            })}
          </article>

          <aside className="card article-detail-side">
            <h3>Reading panel</h3>
            <div className="article-detail-kv">
              <span>Read time</span>
              <strong>{article.readTimeMinutes} min</strong>
            </div>
            <div className="article-detail-kv">
              <span>Level</span>
              <strong>{article.level}</strong>
            </div>
            <div className="article-detail-kv">
              <span>Category</span>
              <strong>{article.category}</strong>
            </div>
            <div className="article-detail-kv">
              <span>Theme</span>
              <strong>{article.theme}</strong>
            </div>
            <button className="ghost-btn" type="button" onClick={startPractice}>
              Practice this skill
            </button>
          </aside>
        </section>
      ) : null}
    </div>
  );
};

const ARTICLE_STATUS_OPTIONS = ['draft', 'published', 'archived'] as const;
type ArticleStatus = (typeof ARTICLE_STATUS_OPTIONS)[number];

const AdminReadingArticlesPage = ({
  accessToken,
  isAdmin,
}: {
  accessToken: string | null;
  isAdmin: boolean;
}) => {
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | 'all'>('all');
  const [articles, setArticles] = useState<ReadingArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    title: string;
    slug: string;
    summary: string;
    contentMarkdown: string;
    level: CefrLevel;
    category: string;
    theme: string;
    tone: ReadingArticleTone;
    readTimeMinutes: number;
    status: ArticleStatus;
    sortOrder: number;
    hot: boolean;
  }>({
    title: '',
    slug: '',
    summary: '',
    contentMarkdown: '',
    level: 'B1',
    category: 'Daily Life',
    theme: 'Everyday Language',
    tone: 'mint',
    readTimeMinutes: 6,
    status: 'draft',
    sortOrder: 100,
    hot: false,
  });

  const draftFromArticle = (article: ReadingArticle) => ({
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    contentMarkdown: article.contentMarkdown ?? '',
    level: article.level,
    category: article.category,
    theme: article.theme,
    tone: article.tone,
    readTimeMinutes: article.readTimeMinutes,
    status: article.status,
    sortOrder: article.sortOrder,
    hot: article.hot,
  });

  const loadArticles = async (): Promise<void> => {
    if (!accessToken || !isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const statuses: ArticleStatus[] = statusFilter === 'all' ? [...ARTICLE_STATUS_OPTIONS] : [statusFilter];
      const responses = await Promise.all(statuses.map((status) => listReadingArticles(accessToken, { status, limit: 200 })));
      const merged = responses
        .flatMap((entry) => entry.articles)
        .sort((a, b) => (a.sortOrder - b.sortOrder) || a.title.localeCompare(b.title));
      setArticles(merged);
      if (selectedId && !merged.some((article) => article.id === selectedId)) {
        setSelectedId(null);
      }
    } catch {
      setError('Could not load admin article catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    void loadArticles();
  }, [accessToken, isAdmin, statusFilter]);

  useEffect(() => {
    if (!selectedId) return;
    const selected = articles.find((article) => article.id === selectedId);
    if (!selected) return;
    setDraft(draftFromArticle(selected));
  }, [articles, selectedId]);

  const resetDraft = (): void => {
    setSelectedId(null);
    setDraft({
      title: '',
      slug: '',
      summary: '',
      contentMarkdown: '',
      level: 'B1',
      category: 'Daily Life',
      theme: 'Everyday Language',
      tone: 'mint',
      readTimeMinutes: 6,
      status: 'draft',
      sortOrder: 100,
      hot: false,
    });
    setSuccess(null);
    setError(null);
  };

  const onSave = async (): Promise<void> => {
    if (!accessToken || !isAdmin) return;
    if (!draft.title.trim() || !draft.summary.trim() || !draft.category.trim() || !draft.theme.trim()) {
      setError('Title, summary, category, and theme are required.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (selectedId) {
        await updateReadingArticle(accessToken, selectedId, {
          title: draft.title,
          slug: draft.slug,
          summary: draft.summary,
          content_markdown: draft.contentMarkdown,
          level: draft.level,
          category: draft.category,
          theme: draft.theme,
          tone: draft.tone,
          read_time_minutes: draft.readTimeMinutes,
          status: draft.status,
          sort_order: draft.sortOrder,
          is_hot: draft.hot,
        });
        setSuccess('Article updated.');
      } else {
        const created = await createReadingArticle(accessToken, {
          title: draft.title,
          slug: draft.slug,
          summary: draft.summary,
          content_markdown: draft.contentMarkdown,
          level: draft.level,
          category: draft.category,
          theme: draft.theme,
          tone: draft.tone,
          read_time_minutes: draft.readTimeMinutes,
          status: draft.status,
          sort_order: draft.sortOrder,
          is_hot: draft.hot,
        });
        setSelectedId(created.id);
        setSuccess('Article created.');
      }
      await loadArticles();
    } catch {
      setError('Could not save article.');
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async (): Promise<void> => {
    if (!accessToken || !isAdmin || !selectedId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await archiveReadingArticle(accessToken, selectedId);
      setSuccess('Article archived.');
      await loadArticles();
    } catch {
      setError('Could not archive article.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="dashboard-stack">
        <div className="access-banner warning">
          <strong>Admin access required.</strong>
          <span>This area is available only for Reading service admins.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-stack">
      <section className="card admin-articles-head">
        <div>
          <small>Reading admin</small>
          <h2>Article Studio</h2>
          <p>Create, edit, and publish high-quality reading articles with level/category/theme control.</p>
        </div>
        <div className="admin-articles-actions">
          <button className="ghost-btn" type="button" onClick={resetDraft}>
            New article
          </button>
          <button className="primary-cta" type="button" onClick={() => void onSave()} disabled={saving}>
            {saving ? 'Saving...' : selectedId ? 'Update article' : 'Create article'}
          </button>
        </div>
      </section>

      {error ? (
        <div className="access-banner warning">
          <strong>Action failed.</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className="access-banner">
          <strong>{success}</strong>
        </div>
      ) : null}

      <section className="card admin-articles-layout">
        <div className="admin-articles-list">
          <div className="admin-articles-list-head">
            <h3>Catalog</h3>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ArticleStatus | 'all')}>
              <option value="all">All statuses</option>
              {ARTICLE_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          {loading ? <p className="reading-catalog-empty">Loading...</p> : null}
          <div className="admin-article-list-grid">
            {articles.map((article) => (
              <button
                key={article.id}
                type="button"
                className={selectedId === article.id ? 'admin-article-row active' : 'admin-article-row'}
                onClick={() => {
                  setSelectedId(article.id);
                  setDraft(draftFromArticle(article));
                }}
              >
                <div className="reading-article-meta">
                  <span>{article.level}</span>
                  <span>{article.status}</span>
                </div>
                <strong>{article.title}</strong>
                <small>{article.category} · {article.theme}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="admin-articles-editor">
          <h3>{selectedId ? 'Edit article' : 'Create article'}</h3>
          <div className="admin-form-grid two">
            <label>
              <span>Title</span>
              <input value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} />
            </label>
            <label>
              <span>Slug</span>
              <input value={draft.slug} onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))} />
            </label>
          </div>

          <label className="admin-form-block">
            <span>Summary</span>
            <textarea
              rows={3}
              value={draft.summary}
              onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
            />
          </label>

          <div className="admin-form-grid four">
            <label>
              <span>Level</span>
              <select
                value={draft.level}
                onChange={(event) => setDraft((prev) => ({ ...prev, level: event.target.value as CefrLevel }))}
              >
                {CEFR_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tone</span>
              <select
                value={draft.tone}
                onChange={(event) => setDraft((prev) => ({ ...prev, tone: event.target.value as ReadingArticleTone }))}
              >
                {['lime', 'mint', 'sky', 'peach', 'lavender', 'sand'].map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                value={draft.status}
                onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as ArticleStatus }))}
              >
                {ARTICLE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Read time (min)</span>
              <input
                type="number"
                min={1}
                max={60}
                value={draft.readTimeMinutes}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, readTimeMinutes: Math.max(1, Math.min(60, Number(event.target.value) || 6)) }))
                }
              />
            </label>
          </div>

          <div className="admin-form-grid two">
            <label>
              <span>Category</span>
              <input value={draft.category} onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))} />
            </label>
            <label>
              <span>Theme</span>
              <input value={draft.theme} onChange={(event) => setDraft((prev) => ({ ...prev, theme: event.target.value }))} />
            </label>
          </div>

          <div className="admin-form-grid two">
            <label>
              <span>Sort order</span>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) => setDraft((prev) => ({ ...prev, sortOrder: Number(event.target.value) || 100 }))}
              />
            </label>
            <label className="admin-checkbox-row">
              <input
                type="checkbox"
                checked={draft.hot}
                onChange={(event) => setDraft((prev) => ({ ...prev, hot: event.target.checked }))}
              />
              <span>Mark as trending</span>
            </label>
          </div>

          <label className="admin-form-block">
            <span>Article content (markdown)</span>
            <textarea
              rows={14}
              value={draft.contentMarkdown}
              onChange={(event) => setDraft((prev) => ({ ...prev, contentMarkdown: event.target.value }))}
              placeholder={'## Intro\nWrite article content here...\n\n## Section\nAdd focused paragraphs.'}
            />
          </label>

          <div className="admin-articles-footer">
            <button className="ghost-btn" type="button" onClick={resetDraft}>
              Reset
            </button>
            {selectedId ? (
              <button className="ghost-btn" type="button" onClick={() => void onArchive()} disabled={saving}>
                Archive
              </button>
            ) : null}
            <button className="primary-cta" type="button" onClick={() => void onSave()} disabled={saving}>
              {saving ? 'Saving...' : selectedId ? 'Save changes' : 'Create article'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

const SignedOutLanding = ({
  serviceLabel,
  signInHref,
  pricingHref,
  platformWorkspaceHref,
  isSignedIn,
  onContinue,
}: {
  serviceLabel: string;
  signInHref: string;
  pricingHref: string;
  platformWorkspaceHref: string;
  isSignedIn: boolean;
  onContinue: () => void;
}) => {
  const focusTitle = serviceLabel.replace(/^English\s+/i, '');
  const focusLower = focusTitle.toLowerCase();

  return (
    <div className="service-landing">
      <section className="landing-hero">
        <div className="landing-mosaic">
          <article className="landing-card landing-stat tilt-left">
            <div className="landing-stat-head">
              <strong>174+</strong>
              <span className="landing-arrow">{'->'}</span>
            </div>
            <p>{focusTitle} programs</p>
            <small>new practice packs every week</small>
          </article>

          <article className="landing-card landing-team tilt-right">
            <span className="landing-pill">4.8 review</span>
            <h3>Mentor team</h3>
            <p>Human mentors and AI scoring work together so your {focusLower} progress stays accurate and actionable.</p>
          </article>

          <article className="landing-card landing-offer tilt-right">
            <h3>Secrets of {focusLower}</h3>
            <p className="landing-price">
              12$ <span>35$</span>
            </p>
            <div className="landing-ticket">
              <div className="landing-ticket-row">
                <small>24 Jul</small>
                <small>28 Jul</small>
              </div>
              <strong>18:00</strong>
              <small>35h 20m</small>
            </div>
          </article>

          <article className="landing-card landing-showcase tilt-left">
            <div className="landing-orb" aria-hidden />
            <h3>{focusTitle} studio</h3>
            <p>Structured drills, diagnostics, and feedback loops connected to your English learner profile.</p>
          </article>
        </div>

        <article className="landing-copy card">
          <div className="landing-chip">{serviceLabel}</div>
          <h2>Interactive online {focusLower} education that keeps progress connected.</h2>
          <p>
            Train in one focused service while your outcomes feed a shared English profile across reading, listening,
            writing, speaking, grammar, vocabulary, and immersion.
          </p>
          <div className="landing-cta-row">
            {isSignedIn ? (
              <button className="primary-cta" type="button" onClick={onContinue}>Continue</button>
            ) : (
              <a className="primary-cta" href={signInHref}>Get started</a>
            )}
            <a className="ghost-btn" href={pricingHref}>See pricing</a>
            <a className="ghost-btn" href={platformWorkspaceHref}>Open platform</a>
          </div>
        </article>
      </section>

      <section className="landing-proof-grid">
        <article className="landing-proof card tilt-left">
          <small>Learner footprint</small>
          <strong>12k+</strong>
          <p>Students completed at least one full-cycle {focusLower} pathway this year.</p>
        </article>
        <article className="landing-proof card tilt-right">
          <small>Practice volume</small>
          <strong>34k</strong>
          <p>Total {focusLower} training hours logged by active users on the platform.</p>
        </article>
      </section>
    </div>
  );
};
const App = () => {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [session, setSession] = useState<Session | null>(null);
  const [search, setSearch] = useState('');
  const [profileNameFromDb, setProfileNameFromDb] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('idle');
  const [accessEndsAt, setAccessEndsAt] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [syncingWords, setSyncingWords] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [path, setPath] = useState<AppPath>(() => {
    if (typeof window === 'undefined') return '/';
    return resolveAppPath(window.location.pathname);
  });
  const [articleSlug, setArticleSlug] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return resolveArticleSlug(window.location.pathname);
  });
  const showLanding = path === '/';

  const navigate = (nextPath: AppPath, replace = false): void => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== nextPath) {
      if (replace) {
        window.history.replaceState({}, '', nextPath);
      } else {
        window.history.pushState({}, '', nextPath);
      }
    }
    setPath(nextPath);
    if (nextPath !== ARTICLE_DETAIL_PATH) setArticleSlug(null);
  };

  const navigateToArticle = (slug: string, replace = false): void => {
    if (typeof window === 'undefined') return;
    const cleanSlug = slug.trim();
    if (!cleanSlug) return;
    const target = `${ARTICLES_PATH}/${encodeURIComponent(cleanSlug)}`;
    if (window.location.pathname !== target) {
      if (replace) {
        window.history.replaceState({}, '', target);
      } else {
        window.history.pushState({}, '', target);
      }
    }
    setArticleSlug(cleanSlug);
    setPath(ARTICLE_DETAIL_PATH);
  };

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setStatus(data.session ? 'signed_in' : 'signed_out');
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'signed_in' : 'signed_out');
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setPath(resolveAppPath(window.location.pathname));
      setArticleSlug(resolveArticleSlug(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (status === 'signed_out' && path !== '/') {
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.replaceState({}, '', '/');
      }
      setPath('/');
      setArticleSlug(null);
    }
  }, [path, status]);

  useEffect(() => {
    let cancelled = false;

    const resolveAccess = async () => {
      if (status !== 'signed_in' || !session?.access_token) {
        setAccessStatus('idle');
        setAccessEndsAt(null);
        setAccessError(null);
        setUserRole(null);
        return;
      }

      setAccessStatus('checking');
      setAccessError(null);

      try {
        const me = await getMe(session.access_token);
        if (cancelled) return;
        setUserRole(typeof me.user.role === 'string' ? me.user.role : null);

        const entitlement =
          me.entitlements.find(
            (entry) => entry.resource_type === 'product' && entry.resource_id === READING_PRODUCT_ID,
          ) ?? null;

        setAccessEndsAt(entitlement?.ends_at ?? null);
        setAccessStatus(entitlement ? 'granted' : 'denied');
      } catch (error) {
        if (cancelled) return;
        const statusCode = (error as { status?: number } | null)?.status ?? null;
        if (statusCode === 401 || statusCode === 403) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // ignore sign-out failures
          }
          setAccessStatus('idle');
          setUserRole(null);
          return;
        }
        setAccessStatus('denied');
        setAccessError('Could not verify your service access right now.');
        setUserRole(null);
      }
    };

    void resolveAccess();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, status]);

  useEffect(() => {
    let cancelled = false;

    const loadProfileName = async () => {
      if (status !== 'signed_in' || !session?.user.id) {
        setProfileNameFromDb(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('first_name,last_name')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (cancelled || error || !data) {
          if (!cancelled) setProfileNameFromDb(null);
          return;
        }

        const row = data as Record<string, unknown>;
        const firstName = readMetaText(row.first_name);
        const lastName = readMetaText(row.last_name);
        const combined = `${firstName} ${lastName}`.trim();
        setProfileNameFromDb(combined || null);
      } catch {
        if (!cancelled) setProfileNameFromDb(null);
      }
    };

    void loadProfileName();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id, status]);

  const returnTo = resolveReturnTo();
  const signInHref = useMemo(
    () => `${buildPlatformUrl('/auth?mode=signin')}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const pricingHref = useMemo(
    () => `${buildPlatformUrl(`/pricing?product=${READING_PRODUCT_SLUG}`)}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const platformWorkspaceHref = useMemo(() => buildPlatformUrl('/workspace/student'), []);
  const hasAccess = status === 'signed_in' && accessStatus === 'granted';
  const needsAccess = status === 'signed_in' && accessStatus === 'denied';
  const checkingAccess = status === 'signed_in' && accessStatus === 'checking';
  const isAdmin = (userRole ?? '').toLowerCase() === 'admin';
  const profileName = useMemo(() => profileNameFromDb ?? resolveProfileName(session), [profileNameFromDb, session]);
  const profileEmail = session?.user.email ?? null;
  const avatarLabel = useMemo(() => resolveInitials(profileName, profileEmail), [profileName, profileEmail]);
  const accessEndsLabel = useMemo(() => {
    if (!accessEndsAt) return null;
    const date = new Date(accessEndsAt);
    if (Number.isNaN(date.getTime())) return accessEndsAt;
    return date.toLocaleString();
  }, [accessEndsAt]);

  const visibleLessons = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return lessonRows;
    return lessonRows.filter((lesson) => lesson.title.toLowerCase().includes(normalized));
  }, [search]);

  
  void profileName;
  void profileEmail;
  void avatarLabel;
  void accessEndsLabel;

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
  };

  const handleSyncWords = async (): Promise<void> => {
    if (!session?.access_token) {
      window.location.assign(signInHref);
      return;
    }

    setSyncingWords(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const payload = READING_VOCAB_SEEDS.map((seed, index) => ({
        word: seed.word,
        definition: seed.definition,
        example: seed.example,
        context_text: seed.context,
        source_type: 'english-reading.sync',
        source_product_id: READING_PRODUCT_ID,
        source_label: 'Reading sync',
        metadata: {
          pipeline: 'reading_dashboard_sync',
          rank: index + 1,
        },
      }));

      const result = await captureNotebookWords(session.access_token, payload);
      const savedCount = Number(result.saved ?? payload.length);
      setSyncMessage(`${savedCount} reading words synced to your vocabulary notebook.`);
    } catch (error) {
      const statusCode = (error as { status?: number } | null)?.status ?? null;
      if (statusCode === 401 || statusCode === 403) {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // ignore sign-out failures
        }
        return;
      }
      setSyncError('Could not sync reading words right now. Please try again.');
    } finally {
      setSyncingWords(false);
    }
  };

  
  if (showLanding) {
    return (
      <div className="landing-page-root">
        <div className="ambient-layer" />
        <div className="landing-page-main">
          <header className="landing-page-topbar card">
            <button
              type="button"
              className="landing-brand"
              onClick={() => navigate('/')}
            >
              <span className="dot" />
              <strong>{SERVICE_LABEL}</strong>
            </button>
            <nav className="landing-links">
              <a href={buildPlatformUrl('/about')}>About us</a>
              <a href={buildPlatformUrl('/programs')}>Programs</a>
              <a href={buildPlatformUrl('/blog')}>Blog</a>
              <a href={buildPlatformUrl('/courses')}>Courses</a>
              <a href={buildPlatformUrl('/faq')}>FAQ</a>
              <a href={buildPlatformUrl('/contact')}>Contact</a>
            </nav>
            <div className="landing-actions">
              <a className="ghost-btn" href={ENGLISH_HUB_URL}>English hub</a>
              <a className="ghost-btn" href={platformWorkspaceHref}>Open platform</a>
              {status === 'signed_in' ? (
                <button className="icon-btn" type="button" onClick={() => navigate('/dashboard')}>Dashboard</button>
              ) : (
                <a className="icon-btn" href={signInHref}>Log in</a>
              )}
              <a className="primary-cta" href={pricingHref}>Sign up</a>
            </div>
          </header>

          <SignedOutLanding
            serviceLabel={SERVICE_LABEL}
            signInHref={signInHref}
            pricingHref={pricingHref}
            platformWorkspaceHref={platformWorkspaceHref}
            isSignedIn={status === 'signed_in'}
            onContinue={() => navigate('/dashboard')}
          />
        </div>
        <a className="updates-fab" href={buildPlatformUrl('/updates')}>
          Updates
        </a>
      </div>
    );
  }
  return (
    <div className="reading-root">
      <div className="ambient-layer" />
      <div className={`app-shell ${status === 'signed_out' ? 'signed-out' : ''} ${showLanding ? 'landing' : ''}`.trim()}>
        <aside className="left-nav">
          <button
            type="button"
            className="brand-mark"
            onClick={() => {
              navigate('/dashboard');
            }}
            style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
          >
            <span className="dot" />
            <div>
              <strong>ENGLISH READING</strong>
              <small>Unified auth + payment</small>
            </div>
          </button>

          <nav className="menu-list">
            <button
              className={'menu-link ' + (path === '/dashboard' ? 'active' : '')}
              type="button"
              onClick={() => {
                navigate('/dashboard');
              }}
            >
              Dashboard
            </button>
            <button
              className={'menu-link ' + (path === ARTICLES_PATH || path === ARTICLE_DETAIL_PATH ? 'active' : '')}
              type="button"
              onClick={() => {
                navigate(ARTICLES_PATH);
              }}
            >
              Articles
            </button>
            <button
              className={'menu-link ' + (path === EXERCISES_PATH ? 'active' : '')}
              type="button"
              onClick={() => {
                navigate(EXERCISES_PATH);
              }}
            >
              Exercises
            </button>
          </nav>

          
          <section className="service-switcher">
            <div className="service-switch-head">
              <span>Switch service</span>
              <a className="muted-link" href={ENGLISH_HUB_URL}>Hub</a>
            </div>
            <div className="service-switch-grid">
              {SERVICE_SWITCH_LINKS.map((service) => (
                <a key={service.key} className="service-switch-link" href={service.href}>
                  {service.label}
                </a>
              ))}
            </div>
          </section>

          <div className="left-footer">
            <div className="support-zone">
              <a className="menu-link muted-link" href={buildPlatformUrl('/contact')}>Support</a>
              <a className="menu-link muted-link" href={pricingHref}>Pricing and trial</a>
            </div>

            <article className="upgrade-card">
              <h3>Premium Reading Pack</h3>
              <p>Unlock full mock banks, detailed answer analytics, and teacher-reviewed dictation feedback.</p>
              <a className="black-btn" href={pricingHref}>View plans</a>
            </article>
          </div>
        </aside>

        <main className="main-column">
          {!showLanding ? (
          <header className="topbar">
            <div className="topbar-title">
              <h1>Welcome back, learner</h1>
              <p>{`${SERVICE_LABEL} service - exam-focused daily workflow.`}</p>
            </div>

            <div className="topbar-actions">
              <label className="search-box">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search classes, sets, tasks..."
                />
              </label>
              <a className="icon-btn" href={platformWorkspaceHref}>Platform</a>
              <a className="icon-btn" href={ENGLISH_HUB_URL}>English hub</a>
              {needsAccess ? <a className="icon-btn" href={pricingHref}>Get access</a> : null}
              {status === 'signed_in' ? (
                <button className="icon-btn" type="button" onClick={handleSignOut}>Sign out</button>
              ) : (
                <a className="icon-btn" href={signInHref}>Sign in</a>
              )}
            </div>
          </header>
          ) : null}

          {showLanding ? (
            <SignedOutLanding
              serviceLabel={SERVICE_LABEL}
              signInHref={signInHref}
              pricingHref={pricingHref}
              platformWorkspaceHref={platformWorkspaceHref}
              isSignedIn={status === 'signed_in'}
              onContinue={() => navigate('/dashboard')}
            />
          ) : null}
          {!showLanding && status !== 'signed_out' && checkingAccess ? (
            <div className="access-banner">
              <strong>Checking access...</strong>
              <span>Verifying your active plan for English Reading.</span>
            </div>
          ) : null}
          {!showLanding && status !== 'signed_out' && needsAccess ? (
            <div className="access-banner warning">
              <strong>Plan required for full access.</strong>
              <span>Choose a trial or paid plan to unlock this service.</span>
              <a className="ghost-btn" href={pricingHref}>Pricing and trial</a>
            </div>
          ) : null}
          {!showLanding && status !== 'signed_out' && accessError ? <div className="access-banner warning">{accessError}</div> : null}

          {!showLanding && status !== 'signed_out' && path === '/dashboard' && (
            <DashboardPage
              lessons={visibleLessons}
              hasAccess={hasAccess}
              pricingHref={pricingHref}
              onOpenExercise={() => {
                navigate(EXERCISES_PATH);
              }}
              isSignedIn={status === 'signed_in'}
              signInHref={signInHref}
              syncingWords={syncingWords}
              syncMessage={syncMessage}
              syncError={syncError}
              onSyncWords={() => {
                void handleSyncWords();
              }}
            />
          )}
          {!showLanding && status !== 'signed_out' && path === ARTICLES_PATH && (
            <ArticlesPage
              hasAccess={hasAccess}
              pricingHref={pricingHref}
              accessToken={session?.access_token ?? null}
              onNavigate={navigate}
              onOpenArticle={(slug) => {
                navigateToArticle(slug);
              }}
            />
          )}
          {!showLanding && status !== 'signed_out' && path === ARTICLE_DETAIL_PATH && (
            <ArticleDetailPage
              articleSlug={articleSlug}
              accessToken={session?.access_token ?? null}
              hasAccess={hasAccess}
              pricingHref={pricingHref}
              onNavigate={navigate}
            />
          )}
          {!showLanding && status !== 'signed_out' && path === ADMIN_ARTICLES_PATH && (
            <AdminReadingArticlesPage
              accessToken={session?.access_token ?? null}
              isAdmin={isAdmin}
            />
          )}
          {!showLanding && status !== 'signed_out' && path === EXERCISES_PATH && (
            <ExercisesPage
              hasAccess={hasAccess}
              pricingHref={pricingHref}
              onNavigate={navigate}
            />
          )}
        </main>
      </div>
      <a className="updates-fab" href={buildPlatformUrl('/updates')}>
        Updates
      </a>
    </div>
  );
};

export default App;














