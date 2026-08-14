import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import '../../../../english-shared/src/english-routes.css';
import {
  AccessBoundaryCard,
  EnglishSkillWorkspace,
  PageHero,
  RouteContextRibbon,
  SectionGrid,
  StatCard,
} from '../../../../english-shared/src/ui';
import {
  readEnglishRouteContext,
  type EnglishRouteContext,
  withEnglishRouteContext,
} from '../../../../english-shared/src/routeContext';
import { platformUrl, supabase } from './lib/supabase';
import { getMe } from './lib/platformClient';
import { captureNotebookWords } from './lib/vocabularyNotebookClient';
import {
  getLearningAttempt,
  startLearningAttempt,
  submitLearningAttempt,
} from './lib/learningAttemptClient';
import {
  archiveReadingArticle,
  createReadingArticle,
  getReadingArticleBySlug,
  listReadingArticles,
  updateReadingArticle,
  type PresentationMeta,
  type CefrLevel,
  type ReadingArticle,
  type ReadingArticleTone,
} from './lib/readingArticlesClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';

const READING_PRODUCT_ID =
  ((import.meta.env.VITE_READING_PRODUCT_ID as string | undefined) ?? '').trim() ||
  '0e8ad198-6284-4406-9e07-11ba7da0f42d';
const READING_PRODUCT_SLUG = 'english-reading';
const SERVICE_LABEL = 'English Reading';
const ENGLISH_HUB_URL = '/';
const MODULE_BASE_PATH = '/reading';

const toModulePath = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/' ? MODULE_BASE_PATH : `${MODULE_BASE_PATH}${normalized}`;
};

const isModulePath = (pathname: string, path: string): boolean => pathname === toModulePath(path);
const isModulePathPrefix = (pathname: string, path: string): boolean => pathname.startsWith(toModulePath(path));

const hasActiveProductEntitlement = (
  entry: { resource_type: string; resource_id: string | null; ends_at: string | null },
  productId: string,
  productSlug: string,
): boolean => {
  if (entry.resource_type !== 'product') return false;
  if (entry.resource_id !== productId && entry.resource_id !== productSlug) return false;
  if (!entry.ends_at) return true;
  const endsAt = new Date(entry.ends_at).getTime();
  return Number.isNaN(endsAt) || endsAt > Date.now();
};

const ENGLISH_SERVICE_LINKS = [
  { key: 'reading', label: 'Reading', href: '/reading' },
  { key: 'writing', label: 'Writing', href: '/writing' },
  { key: 'listening', label: 'Listening', href: '/listening' },
  { key: 'speaking', label: 'Speaking', href: '/speaking' },
  { key: 'grammar', label: 'Grammar', href: '/grammar' },
  { key: 'vocabulary', label: 'Vocabulary', href: '/vocabulary' },
  { key: 'immersion', label: 'Immersion', href: '/immersion' },
] as const;

const SERVICE_SWITCH_LINKS = ENGLISH_SERVICE_LINKS.filter((service) => service.key !== 'reading').map((service) => ({
  ...service,
  href: `${service.href}/dashboard`,
}));

const SERVICE_BLUEPRINT = [
  {
    slug: 'interactive-text',
    title: 'Interactive text route',
    detail: 'Read paragraph by paragraph, capture words in context, and keep structure visible while you move.',
    intent: 'interactive-text',
    skill: 'comprehension',
  },
  {
    slug: 'sentence-breakdown',
    title: 'Sentence breakdown lane',
    detail: 'Slow the passage down, map clauses, and expose why meaning changes with structure.',
    intent: 'sentence-breakdown',
    skill: 'structure',
  },
  {
    slug: 'cloze-transfer',
    title: 'Cloze and summary transfer',
    detail: 'Use targeted gaps and short transfer prompts to move from understanding into control.',
    intent: 'cloze',
    skill: 'accuracy',
  },
  {
    slug: 'extensive-flow',
    title: 'Extensive flow route',
    detail: 'Read with minimal interruption, then close with a short report instead of stopping every line.',
    intent: 'reading-modes',
    skill: 'pace',
  },
] as const;

const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const ARTICLE_STATUS_OPTIONS = ['draft', 'published', 'archived'] as const;
type ArticleStatus = (typeof ARTICLE_STATUS_OPTIONS)[number];

const READING_VOCAB_SEEDS = [
  {
    word: 'inference',
    definition: 'A conclusion reached from evidence rather than direct statement.',
    example: 'The question required an inference about the writer’s attitude.',
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
] as const;

const PREVIEW_ARTICLES: ReadingArticle[] = [
  {
    id: 'preview-city-garden',
    slug: 'city-garden-routes',
    title: 'City Garden Routes',
    summary: 'A gentle B1 article about public spaces, daily routines, and why people return to the same quiet places.',
    contentMarkdown:
      '## Opening scene\nMany city residents do not need a large park. They need one reliable place where the day feels slower.\n\n## Reading angle\nThe article follows how small routines shape comfort, attention, and memory in ordinary spaces.\n\n## Transfer note\nAfter reading, learners can summarize the main point or collect useful words related to place and routine.',
    level: 'B1',
    category: 'Daily Life',
    theme: 'Routine',
    readTimeMinutes: 6,
    tone: 'mint',
    hot: true,
    status: 'published',
    sortOrder: 10,
    presentationMeta: {
      scene_label: 'Quiet salon route',
      hero_note: 'Read with a margin glossary, then carry one idea into summary transfer.',
      difficulty_badge: 'Balanced B1',
      support_mode_labels: ['Focus mode', 'Margin glossary', 'Summary transfer'],
      target_badges: ['Inference', 'Vocabulary in context', 'Paragraph flow'],
      celebration_copy: 'Good article to transfer into Writing after the read.',
    },
  },
  {
    id: 'preview-night-market',
    slug: 'night-market-signals',
    title: 'Night Market Signals',
    summary: 'A lively article about movement, sound, and the decisions people make quickly in crowded places.',
    contentMarkdown:
      '## First layer\nCrowded environments create many small reading clues. A sign, a gesture, and one short instruction may carry the whole meaning.\n\n## Practice direction\nThis route is good for detail, reference, and the difference between explicit and implied information.',
    level: 'B2',
    category: 'Travel',
    theme: 'Movement',
    readTimeMinutes: 7,
    tone: 'lime',
    hot: false,
    status: 'published',
    sortOrder: 20,
    presentationMeta: {
      scene_label: 'Street signal route',
      hero_note: 'Use the sentence ladder when detail starts slipping.',
      difficulty_badge: 'Fast B2',
      support_mode_labels: ['Sentence ladder', 'Detail focus'],
      target_badges: ['Detail', 'Reference', 'Signal tracking'],
    },
  },
  {
    id: 'preview-late-lecture',
    slug: 'late-lecture-notes',
    title: 'Late Lecture Notes',
    summary: 'A C1 passage about academic attention, missed context, and rebuilding the main thread of an idea.',
    contentMarkdown:
      '## Lecture setup\nStudents often miss not the hardest sentence, but the one that quietly connects two larger ideas.\n\n## Why this matters\nThe article rewards careful summary and helps learners track structure over isolated facts.',
    level: 'C1',
    category: 'Study',
    theme: 'Academic focus',
    readTimeMinutes: 8,
    tone: 'sky',
    hot: true,
    status: 'published',
    sortOrder: 30,
    presentationMeta: {
      scene_label: 'Academic structure route',
      hero_note: 'Map structure first, then test summary accuracy.',
      difficulty_badge: 'High transfer',
      support_mode_labels: ['Structure map', 'Summary transfer'],
      target_badges: ['Summary', 'Cohesion', 'Inference'],
    },
  },
];
const DEFAULT_PREVIEW_ARTICLE: ReadingArticle = PREVIEW_ARTICLES[0]!;

const REVIEW_HANDOFFS = [
  {
    label: 'Repair structure in Grammar',
    href: withEnglishRouteContext('/grammar/repair-queue', {
      sourceService: 'reading',
      intent: 'pattern-training',
      skill: 'structure',
      reason: 'reading-report',
    }),
  },
  {
    label: 'Transfer summary into Writing',
    href: withEnglishRouteContext('/writing/briefs', {
      sourceService: 'reading',
      intent: 'writing-task',
      skill: 'coherence',
      reason: 'reading-report',
    }),
  },
  {
    label: 'Activate saved words in Vocabulary',
    href: withEnglishRouteContext('/vocabulary/activation', {
      sourceService: 'reading',
      intent: 'word-sources',
      skill: 'retention',
      reason: 'reading-report',
    }),
  },
] as const;

const emptyArticleDraft = () => ({
  title: '',
  slug: '',
  summary: '',
  contentMarkdown: '',
  level: 'B1' as CefrLevel,
  category: 'Daily Life',
  theme: 'Everyday Language',
  tone: 'mint' as ReadingArticleTone,
  readTimeMinutes: 6,
  status: 'draft' as ArticleStatus,
  sortOrder: 100,
  hot: false,
  sceneLabel: '',
  heroNote: '',
  coverStyleKey: '',
  coachTone: '',
  difficultyBadge: '',
  supportModeLabels: '',
  targetBadges: '',
  ambientAudioKey: '',
  celebrationCopy: '',
  previewMediaUrl: '',
});

const buildPlatformUrl = (pathname: string): string => `${platformUrl.replace(/\/$/, '')}${pathname}`;
const readMetaText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const asMetaRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const readMetaList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => readMetaText(entry)).filter(Boolean) : [];

const buildPresentationMeta = (draft: ReturnType<typeof emptyArticleDraft>): PresentationMeta | null => {
  const meta: PresentationMeta = {};
  const supportModeLabels = draft.supportModeLabels.split(',').map((entry) => entry.trim()).filter(Boolean);
  const targetBadges = draft.targetBadges.split(',').map((entry) => entry.trim()).filter(Boolean);

  if (draft.sceneLabel.trim()) meta.scene_label = draft.sceneLabel.trim();
  if (draft.heroNote.trim()) meta.hero_note = draft.heroNote.trim();
  if (draft.coverStyleKey.trim()) meta.cover_style_key = draft.coverStyleKey.trim();
  if (draft.coachTone.trim()) meta.coach_tone = draft.coachTone.trim();
  if (draft.difficultyBadge.trim()) meta.difficulty_badge = draft.difficultyBadge.trim();
  if (supportModeLabels.length > 0) meta.support_mode_labels = supportModeLabels;
  if (targetBadges.length > 0) meta.target_badges = targetBadges;
  if (draft.ambientAudioKey.trim()) meta.ambient_audio_key = draft.ambientAudioKey.trim();
  if (draft.celebrationCopy.trim()) meta.celebration_copy = draft.celebrationCopy.trim();
  if (draft.previewMediaUrl.trim()) meta.preview_media_url = draft.previewMediaUrl.trim();

  return Object.keys(meta).length > 0 ? meta : null;
};

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

const resolveReturnTo = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

const filterArticlesBySearch = (articles: ReadingArticle[], search: string): ReadingArticle[] => {
  const query = search.trim().toLowerCase();
  if (!query) return articles;
  return articles.filter((article) =>
    [article.title, article.summary, article.category, article.theme, article.level].some((field) =>
      field.toLowerCase().includes(query),
    ),
  );
};

const SignedOutLanding = ({
  signInHref,
  pricingHref,
  platformWorkspaceHref,
  isSignedIn,
}: {
  signInHref: string;
  pricingHref: string;
  platformWorkspaceHref: string;
  isSignedIn: boolean;
}) => (
  <div className="landing-page-root">
    <div className="ambient-layer" />
    <div className="landing-page-main">
      <header className="landing-page-topbar card">
        <Link className="landing-brand" to={toModulePath('/')}>
          <span className="dot" />
          <strong>{SERVICE_LABEL}</strong>
        </Link>
        <nav className="landing-links">
          <a href={buildPlatformUrl('/about')}>About us</a>
          <a href={buildPlatformUrl('/programs')}>Programs</a>
          <a href={buildPlatformUrl('/blog')}>Blog</a>
          <a href={buildPlatformUrl('/courses')}>Courses</a>
          <a href={buildPlatformUrl('/faq')}>FAQ</a>
          <a href={buildPlatformUrl('/contact')}>Contact</a>
        </nav>
        <div className="landing-actions">
          <a className="ghost-btn" href={ENGLISH_HUB_URL}>
            English hub
          </a>
          <a className="ghost-btn" href={platformWorkspaceHref}>
            Open platform
          </a>
          {isSignedIn ? (
            <Link className="icon-btn" to={toModulePath('/dashboard')}>
              Dashboard
            </Link>
          ) : (
            <a className="icon-btn" href={signInHref}>
              Log in
            </a>
          )}
          <a className="primary-cta" href={pricingHref}>
            Sign up
          </a>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-mosaic">
          <article className="landing-card landing-stat tilt-left">
            <div className="landing-stat-head">
              <strong>Shelves</strong>
              <span className="landing-arrow">{'->'}</span>
            </div>
            <p>Library, article, intensive route</p>
            <small>one job per screen</small>
          </article>

          <article className="landing-card landing-team tilt-right">
            <span className="landing-pill">Reading salon</span>
            <h3>Structured input</h3>
            <p>Move from discovery to focus reading to report pages without one overloaded workspace trying to do everything.</p>
          </article>

          <article className="landing-card landing-offer tilt-right">
            <h3>Premium reading routes</h3>
            <p className="landing-price">
              12$ <span>35$</span>
            </p>
            <div className="landing-ticket">
              <div className="landing-ticket-row">
                <small>Library</small>
                <small>Report</small>
              </div>
              <strong>Read {'->'} analyze {'->'} transfer</strong>
              <small>with clear separation</small>
            </div>
          </article>

          <article className="landing-card landing-showcase tilt-left">
            <div className="landing-orb" aria-hidden />
            <h3>Connected English</h3>
            <p>Reading now sends precise handoffs into Writing, Grammar, and Vocabulary instead of one generic dashboard jump.</p>
          </article>
        </div>

        <article className="landing-copy card">
          <div className="landing-chip">{SERVICE_LABEL}</div>
          <h2>Reading is now organized like a real learning product, not one crowded page.</h2>
          <p>Browse the article library, open a focused article route, move into intensive analysis, and finish on a debrief page.</p>
          <div className="landing-cta-row">
            <a className="primary-cta" href={isSignedIn ? toModulePath('/dashboard') : signInHref}>
              {isSignedIn ? 'Continue' : 'Get started'}
            </a>
            <a className="ghost-btn" href={pricingHref}>
              See pricing
            </a>
            <a className="ghost-btn" href={platformWorkspaceHref}>
              Open platform
            </a>
          </div>
        </article>
      </section>
    </div>
    <a className="updates-fab" href={buildPlatformUrl('/updates')}>
      Updates
    </a>
  </div>
);

const ReadingDashboardPage = ({
  hasAccess,
  pricingHref,
  accessToken,
  search,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
  search: string;
  context: EnglishRouteContext;
}) => {
  const [articles, setArticles] = useState<ReadingArticle[]>(PREVIEW_ARTICLES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAccess || !accessToken) {
      setArticles(PREVIEW_ARTICLES);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void listReadingArticles(accessToken, { status: 'published', limit: 24 })
      .then((result) => {
        if (cancelled) return;
        setArticles(result.articles.length > 0 ? result.articles : PREVIEW_ARTICLES);
      })
      .catch(() => {
        if (cancelled) return;
        setArticles(PREVIEW_ARTICLES);
        setError('Could not load your live reading catalog right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess]);

  const filtered = useMemo(() => filterArticlesBySearch(articles, search), [articles, search]);
  const featured = filtered[0] ?? DEFAULT_PREVIEW_ARTICLE;
  const featuredMeta = asMetaRecord(featured.presentationMeta);
  const featuredBadges = readMetaList(featuredMeta.target_badges);

  return (
    <SectionGrid>
      <RouteContextRibbon
        context={context}
        cta={
          <Link className="ghost-btn" to={toModulePath('/library')}>
            Open library
          </Link>
        }
      />

      <PageHero
        eyebrow="Reading dashboard"
        title="Use the dashboard to choose the right route, not to read on the same screen."
        copy="Reading now separates discovery, live reading, intensive analysis, and debrief so each screen has one job."
        actions={
          <>
            <Link className="primary-cta" to={toModulePath('/library')}>
              Browse shelves
            </Link>
            <Link className="ghost-btn" to={toModulePath('/intensive')}>
              Open intensive route
            </Link>
          </>
        }
        aside={
          <div className="route-chip-row">
            <span className="route-chip">{hasAccess ? 'Live access' : 'Preview mode'}</span>
            <span className="route-outline-chip">{featured.level}</span>
            <span className="route-outline-chip">{featured.readTimeMinutes} min</span>
          </div>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Reading routes are visible in preview mode"
          message="The route structure is now open to browse, but live articles, scoring, and notebook sync unlock with an active reading plan."
          ctaHref={pricingHref}
        />
      ) : null}

      <section className="route-metric-grid">
        <StatCard
          label="Visible shelves"
          value={String(new Set(filtered.map((article) => article.level)).size || 3)}
          hint="CEFR shelves stay separate from the live reading page."
        />
        <StatCard
          label="Route anchor"
          value={featured.title}
          hint="The highlighted article is today’s best starting point."
        />
        <StatCard
          label="Transfer pressure"
          value={String(featuredBadges.length || 3)}
          hint="Reading still connects outward into Writing, Grammar, and Vocabulary."
        />
      </section>

      {loading ? <section className="route-empty-state">Loading reading dashboard...</section> : null}
      {error ? <section className="route-empty-state">{error}</section> : null}

      <section className="route-split-grid">
        <article className={`card reading-article-feature tone-${featured.tone}`}>
          <div className="reading-article-meta">
            <span>{featured.category}</span>
            <span>{featured.level}</span>
            {readMetaText(featuredMeta.difficulty_badge) ? <span>{readMetaText(featuredMeta.difficulty_badge)}</span> : null}
          </div>
          <h3>{featured.title}</h3>
          <p>{featured.summary}</p>
          <div className="reading-premium-chip-row">
            {(featuredBadges.length > 0 ? featuredBadges : ['Inference', 'Detail', 'Vocabulary']).map((badge) => (
              <span key={`${featured.id}-${badge}`} className="reading-premium-chip">
                {badge}
              </span>
            ))}
          </div>
          <div className="reading-article-footer">
            <small>{featured.theme}</small>
            <small>{featured.readTimeMinutes} min read</small>
          </div>
          <Link className="ghost-btn" to={toModulePath(`/library/${featured.slug}`)}>
            Open article route
          </Link>
        </article>

        <section className="route-queue-card">
          <div className="route-stage-header">
            <div>
              <small className="route-context-kicker">Launch cards</small>
              <h2>Choose a clean next step</h2>
            </div>
          </div>
          <div className="route-stack-list">
            <Link className="route-list-row" to={toModulePath('/library')}>
              <strong>Library shelves</strong>
              <span>Discover by level, category, and theme</span>
            </Link>
            <Link className="route-list-row" to={toModulePath(`/library/${featured.slug}`)}>
              <strong>Article route</strong>
              <span>Open one passage on its own page</span>
            </Link>
            <Link className="route-list-row" to={toModulePath('/intensive')}>
              <strong>Intensive route</strong>
              <span>Use sentence ladders and structured transfer</span>
            </Link>
            <Link className="route-list-row" to={toModulePath('/reports')}>
              <strong>Reading report room</strong>
              <span>Keep feedback and next-step routing separate from the read itself</span>
            </Link>
          </div>
        </section>
      </section>
    </SectionGrid>
  );
};

const ReadingLibraryPage = ({
  hasAccess,
  pricingHref,
  accessToken,
  search,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
  search: string;
  context: EnglishRouteContext;
}) => {
  const [articles, setArticles] = useState<ReadingArticle[]>(PREVIEW_ARTICLES);
  const [libraryCategories, setLibraryCategories] = useState<string[]>([]);
  const [libraryThemes, setLibraryThemes] = useState<string[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<CefrLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTheme, setSelectedTheme] = useState<string>('all');

  const loadArticles = async (): Promise<void> => {
    if (!hasAccess || !accessToken) {
      setArticles(PREVIEW_ARTICLES);
      setLibraryCategories(Array.from(new Set(PREVIEW_ARTICLES.map((article) => article.category))));
      setLibraryThemes(Array.from(new Set(PREVIEW_ARTICLES.map((article) => article.theme))));
      setLoadingArticles(false);
      setArticlesError(null);
      return;
    }

    setLoadingArticles(true);
    setArticlesError(null);
    try {
      const result = await listReadingArticles(accessToken, { status: 'published', limit: 150 });
      setArticles(result.articles.length > 0 ? result.articles : PREVIEW_ARTICLES);
      setLibraryCategories(result.filters.categories);
      setLibraryThemes(result.filters.themes);
    } catch {
      setArticles(PREVIEW_ARTICLES);
      setArticlesError('Could not load live articles right now. Preview shelves are still available.');
    } finally {
      setLoadingArticles(false);
    }
  };

  useEffect(() => {
    void loadArticles();
  }, [accessToken, hasAccess]);

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
    return ['all', ...Array.from(new Set(libraryThemes))];
  }, [articles, libraryThemes, selectedCategory]);

  useEffect(() => {
    if (!availableThemes.includes(selectedTheme)) {
      setSelectedTheme('all');
    }
  }, [availableThemes, selectedTheme]);

  const filteredArticles = useMemo(
    () =>
      filterArticlesBySearch(
        articles.filter((article) => {
          if (selectedLevel !== 'all' && article.level !== selectedLevel) return false;
          if (selectedCategory !== 'all' && article.category !== selectedCategory) return false;
          if (selectedTheme !== 'all' && article.theme !== selectedTheme) return false;
          return true;
        }),
        search,
      ),
    [articles, search, selectedCategory, selectedLevel, selectedTheme],
  );

  const featuredArticle = filteredArticles[0] ?? DEFAULT_PREVIEW_ARTICLE;
  const sideArticles = filteredArticles.slice(1, 4);
  const readingShelves = CEFR_LEVELS.map((level) => ({
    level,
    articles: filteredArticles.filter((article) => article.level === level).slice(0, 3),
  })).filter((entry) => entry.articles.length > 0);
  const featuredPresentation = asMetaRecord(featuredArticle.presentationMeta);
  const featuredBadges = readMetaList(featuredPresentation.target_badges);
  const featuredSupportModes = readMetaList(featuredPresentation.support_mode_labels);

  return (
    <SectionGrid>
      <RouteContextRibbon
        context={context}
        cta={
          <Link className="ghost-btn" to={toModulePath(featuredArticle ? `/library/${featuredArticle.slug}` : '/library')}>
            Open featured article
          </Link>
        }
      />

      <PageHero
        eyebrow="Library shelves"
        title="Discover articles on their own page before you enter the live reading route."
        copy="The library owns discovery, filters, and article selection. It does not try to be the live workbench anymore."
        actions={
          <>
            <button className="ghost-btn" type="button" onClick={() => void loadArticles()} disabled={loadingArticles}>
              {loadingArticles ? 'Refreshing...' : 'Refresh library'}
            </button>
            <Link className="primary-cta" to={toModulePath(featuredArticle ? `/library/${featuredArticle.slug}` : '/library')}>
              Open featured route
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Live library access is locked"
          message="You can still browse the shelf structure and article previews, but full reading content unlocks with an active plan."
          ctaHref={pricingHref}
        />
      ) : null}

      {articlesError ? <section className="route-empty-state">{articlesError}</section> : null}

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

      <section className="reading-route-grid">
        <article className="card reading-route-card">
          <div className="reading-route-head">
            <div>
              <small>Reading route</small>
              <h3>{featuredArticle ? `${featuredArticle.level} ${featuredArticle.category}` : 'Choose a route'}</h3>
            </div>
            <span className="reading-route-mode">{featuredArticle.readTimeMinutes} min</span>
          </div>
          <p>
            Use {featuredArticle.title} as today’s anchor text, then transfer its vocabulary and structure into Grammar or Writing.
          </p>
          <div className="reading-premium-chip-row">
            {(featuredSupportModes.length > 0 ? featuredSupportModes : ['Intensive route', 'Flow reading', 'Summary transfer']).map((badge) => (
              <span key={`route-support-${badge}`} className="reading-premium-chip muted">
                {badge}
              </span>
            ))}
          </div>
          <div className="reading-route-stats">
            <div>
              <span>Visible shelves</span>
              <strong>{readingShelves.length || 1}</strong>
            </div>
            <div>
              <span>Results</span>
              <strong>{filteredArticles.length}</strong>
            </div>
            <div>
              <span>Transfer targets</span>
              <strong>{featuredBadges.length || 3}</strong>
            </div>
          </div>
        </article>

        <article className="card reading-shelf-preview">
          <small>CEFR shelves</small>
          <h3>Article discovery by level</h3>
          <div className="reading-shelf-list">
            {readingShelves.length === 0 ? (
              <div className="reading-shelf-row muted">
                <strong>Library quiet right now</strong>
                <span>Adjust filters to reveal another shelf.</span>
              </div>
            ) : (
              readingShelves.slice(0, 4).map((shelf) => (
                <div key={`shelf-${shelf.level}`} className="reading-shelf-row">
                  <strong>{shelf.level}</strong>
                  <span>{shelf.articles.map((article) => article.title).join(' · ')}</span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="reading-library-grid">
        <article className={`card reading-article-feature tone-${featuredArticle.tone}`}>
          <div className="reading-article-meta">
            <span>{featuredArticle.category}</span>
            <span>{featuredArticle.level}</span>
            {readMetaText(featuredPresentation.difficulty_badge) ? <span>{readMetaText(featuredPresentation.difficulty_badge)}</span> : null}
          </div>
          <h3>{featuredArticle.title}</h3>
          <p>{featuredArticle.summary}</p>
          <div className="reading-premium-chip-row">
            {(featuredBadges.length > 0 ? featuredBadges : ['Structure', 'Detail', 'Vocabulary']).map((badge) => (
              <span key={`${featuredArticle.id}-${badge}`} className="reading-premium-chip">
                {badge}
              </span>
            ))}
          </div>
          <div className="reading-article-footer">
            <small>{featuredArticle.readTimeMinutes} min read</small>
            {featuredArticle.hot ? <span className="reading-hot-pill">Trending</span> : null}
          </div>
          <Link className="ghost-btn" to={toModulePath(`/library/${featuredArticle.slug}`)}>
            Open article route
          </Link>
        </article>

        <div className="reading-library-column">
          {(sideArticles.length > 0 ? sideArticles : PREVIEW_ARTICLES.slice(1, 3)).map((article) => (
            <article key={article.id} className={`card reading-article-mini tone-${article.tone}`}>
              <div className="reading-article-meta">
                <span>{article.category}</span>
                <span>{article.level}</span>
              </div>
              <h4>{article.title}</h4>
              <p>{article.summary}</p>
              <small>{article.readTimeMinutes} min read</small>
              <Link className="ghost-btn" to={toModulePath(`/library/${article.slug}`)}>
                Preview route
              </Link>
            </article>
          ))}
        </div>
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
                <Link className="ghost-btn" to={toModulePath(`/library/${article.slug}`)}>
                  {hasAccess ? 'Read article' : 'Preview route'}
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </SectionGrid>
  );
};

const ReadingArticlePage = ({
  hasAccess,
  pricingHref,
  accessToken,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
  context: EnglishRouteContext;
}) => {
  const navigate = useNavigate();
  const params = useParams<{ articleSlug?: string }>();
  const [article, setArticle] = useState<ReadingArticle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedBlockIndex, setFocusedBlockIndex] = useState<number>(0);
  const [checkInState, setCheckInState] = useState<'idle' | 'saving'>('idle');
  const [syncingWords, setSyncingWords] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const preview = PREVIEW_ARTICLES.find((entry) => entry.slug === params.articleSlug) ?? DEFAULT_PREVIEW_ARTICLE;
    if (!hasAccess || !accessToken || !params.articleSlug) {
      setArticle(preview);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getReadingArticleBySlug(accessToken, params.articleSlug)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setArticle(preview);
          setError('This article is unavailable right now. Showing a preview route instead.');
          return;
        }
        setArticle(data);
      })
      .catch(() => {
        if (cancelled) return;
        setArticle(preview);
        setError('Could not load the live article right now. Showing a preview route instead.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.articleSlug]);

  const contentBlocks = useMemo(() => {
    const source = (article?.contentMarkdown ?? '').trim();
    if (!source) {
      return [
        {
          type: 'paragraph' as const,
          text: article?.summary ?? 'This article preview is being prepared.',
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

  const articlePresentation = asMetaRecord(article?.presentationMeta);
  const articleSupportModes = readMetaList(articlePresentation.support_mode_labels);
  const articleTargetBadges = readMetaList(articlePresentation.target_badges);
  const paragraphStops = contentBlocks
    .map((block, index) => ({ ...block, index }))
    .filter((block) => block.type === 'paragraph' || block.type === 'quote');

  const handleWordSync = async (): Promise<void> => {
    if (!accessToken || !hasAccess) return;
    setSyncingWords(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const result = await captureNotebookWords(
        accessToken,
        READING_VOCAB_SEEDS.map((seed) => ({
          word: seed.word,
          definition: seed.definition,
          example: seed.example,
          context_text: seed.context,
          source_type: 'english-reading',
          source_product_id: READING_PRODUCT_ID,
          source_label: article?.title ?? 'Reading route',
          metadata: { article_slug: article?.slug ?? null },
        })),
      );
      setSyncMessage(`Saved ${result.saved} reading words to Vocabulary.`);
    } catch {
      setSyncError('Could not sync reading words right now.');
    } finally {
      setSyncingWords(false);
    }
  };

  const handleConfidenceCheckIn = async (rating: 'needs-support' | 'good-fit' | 'too-easy'): Promise<void> => {
    if (!accessToken || !article || !hasAccess) return;

    const scorePreset = {
      'needs-support': {
        correctness_ratio: 0.48,
        correction_quality_ratio: 0.54,
        hint_usage_count: 2,
        retry_count: 1,
        issues: [
          {
            category: 'reading',
            subskill_key: 'reading.detail',
            explanation: 'This article still needs supported rereading for detail and structure.',
            correction_hint: 'Retry with sentence breakdown and then move to a shorter reading drill.',
            severity: 0.82,
          },
        ],
      },
      'good-fit': {
        correctness_ratio: 0.79,
        correction_quality_ratio: 0.76,
        hint_usage_count: 0,
        retry_count: 0,
        issues: [],
      },
      'too-easy': {
        correctness_ratio: 0.92,
        correction_quality_ratio: 0.9,
        hint_usage_count: 0,
        retry_count: 0,
        issues: [],
      },
    } as const;

    setCheckInState('saving');
    setError(null);
    try {
      const started = await startLearningAttempt(accessToken, {
        language_code: 'en',
        service_key: 'reading',
        product_id: READING_PRODUCT_ID,
        content_type: 'reading.article',
        source_ref: article.slug,
        title: article.title,
        description: article.summary,
        skill_key: 'reading',
        subskill_keys: ['reading.gist', 'reading.detail', 'reading.inference'],
        cefr_level: article.level,
        estimated_minutes: article.readTimeMinutes,
        learning_objective: article.summary,
        tags: [article.category, article.theme],
        payload_json: {
          tone: article.tone,
          category: article.category,
          theme: article.theme,
        },
      });

      const preset = scorePreset[rating];
      const result = await submitLearningAttempt(accessToken, {
        language_code: 'en',
        attempt_id: started.attempt.id,
        response_json: { rating, source: 'article-confidence-checkin' },
        time_spent_seconds: article.readTimeMinutes * 60,
        correctness_ratio: preset.correctness_ratio,
        correction_quality_ratio: preset.correction_quality_ratio,
        hint_usage_count: preset.hint_usage_count,
        retry_count: preset.retry_count,
        issues: preset.issues,
      });

      navigate(toModulePath(`/reports/${result.attempt.id}`));
    } catch {
      setError('Could not record reading progress right now.');
    } finally {
      setCheckInState('idle');
    }
  };

  return (
    <SectionGrid>
      <RouteContextRibbon
        context={context}
        cta={
          <Link className="ghost-btn" to={toModulePath('/intensive')}>
            Open intensive route
          </Link>
        }
      />

      <PageHero
        eyebrow="Article route"
        title={article?.title ?? 'Reading article route'}
        copy={article?.summary ?? 'Open focused reading content and keep it separate from discovery and debrief.'}
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath('/library')}>
              Back to library
            </Link>
            <Link className="ghost-btn" to={toModulePath(article ? `/intensive?article=${encodeURIComponent(article.slug)}` : '/intensive')}>
              Open intensive route
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Live article reading is locked"
          message="You can preview the route and article framing here, but full reading content, scoring, and vocabulary sync unlock with an active plan."
          ctaHref={pricingHref}
        />
      ) : null}

      {loading ? <section className="route-empty-state">Loading article route...</section> : null}
      {error ? <section className="route-empty-state">{error}</section> : null}

      {article ? (
        <section className="article-detail-layout">
          <article className="card article-detail-content">
            <div className="article-reading-ribbon">
              <div>
                <small>{readMetaText(articlePresentation.scene_label) || 'Focus mode'}</small>
                <strong>{readMetaText(articlePresentation.hero_note) || 'Use the paragraph ladder to hold structure while you read.'}</strong>
              </div>
              <div className="reading-premium-chip-row">
                {(articleSupportModes.length > 0 ? articleSupportModes : ['Focus mode', 'Margin glossary', 'Summary transfer']).map((mode) => (
                  <span key={`${article.id}-${mode}-mode`} className="reading-premium-chip muted">
                    {mode}
                  </span>
                ))}
              </div>
            </div>

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
                  <button
                    type="button"
                    className={focusedBlockIndex === index ? 'article-paragraph-bead active' : 'article-paragraph-bead'}
                    onClick={() => setFocusedBlockIndex(index)}
                    aria-label={`Focus paragraph ${index + 1}`}
                  >
                    {index + 1}
                  </button>
                  <span className={focusedBlockIndex === index ? 'article-detail-paragraph-text focused' : 'article-detail-paragraph-text'}>
                    {block.text}
                  </span>
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
            <div className="article-paragraph-ladder">
              <small>Paragraph ladder</small>
              {paragraphStops.map((block, idx) => (
                <button
                  key={`${article.id}-ladder-${block.index}`}
                  type="button"
                  className={focusedBlockIndex === block.index ? 'article-ladder-row active' : 'article-ladder-row'}
                  onClick={() => setFocusedBlockIndex(block.index)}
                >
                  <strong>{`Step ${idx + 1}`}</strong>
                  <span>{block.text.slice(0, 72)}</span>
                </button>
              ))}
            </div>
            <div className="reading-premium-chip-row">
              {(articleTargetBadges.length > 0 ? articleTargetBadges : ['Inference', 'Detail', 'Summary']).map((badge) => (
                <span key={`${article.id}-${badge}-target`} className="reading-premium-chip">
                  {badge}
                </span>
              ))}
            </div>
            <div className="article-detail-checkin">
              <h4>Reading confidence check-in</h4>
              <p>Send a quick signal into your shared English profile so the hub can adapt the next route.</p>
              <div className="article-detail-checkin-actions">
                <button
                  className="ghost-btn"
                  type="button"
                  disabled={!hasAccess || checkInState === 'saving'}
                  onClick={() => {
                    void handleConfidenceCheckIn('needs-support');
                  }}
                >
                  Need support
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  disabled={!hasAccess || checkInState === 'saving'}
                  onClick={() => {
                    void handleConfidenceCheckIn('good-fit');
                  }}
                >
                  Good fit
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  disabled={!hasAccess || checkInState === 'saving'}
                  onClick={() => {
                    void handleConfidenceCheckIn('too-easy');
                  }}
                >
                  Too easy
                </button>
              </div>
              {checkInState === 'saving' ? <small>Saving reading signal...</small> : null}
            </div>
            <div className="article-detail-checkin">
              <h4>Vocabulary capture</h4>
              <p>Push this reading route’s key words into Vocabulary activation.</p>
              <button className="ghost-btn" type="button" disabled={!hasAccess || syncingWords} onClick={() => void handleWordSync()}>
                {syncingWords ? 'Syncing...' : 'Send reading words'}
              </button>
              {syncMessage ? <small>{syncMessage}</small> : null}
              {syncError ? <small>{syncError}</small> : null}
            </div>
          </aside>
        </section>
      ) : null}
    </SectionGrid>
  );
};

const ReadingIntensivePage = ({
  hasAccess,
  pricingHref,
  search,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  search: string;
  context: EnglishRouteContext;
}) => {
  const location = useLocation();
  const articleSlug = new URLSearchParams(location.search).get('article');
  const selectedArticle = PREVIEW_ARTICLES.find((article) => article.slug === articleSlug) ?? DEFAULT_PREVIEW_ARTICLE;
  const visibleLanes = SERVICE_BLUEPRINT.filter((lane) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${lane.title} ${lane.detail} ${lane.skill}`.toLowerCase().includes(query);
  });

  return (
    <SectionGrid>
      <RouteContextRibbon
        context={context}
        cta={
          <Link className="ghost-btn" to={toModulePath(selectedArticle ? `/library/${selectedArticle.slug}` : '/library')}>
            Return to article
          </Link>
        }
      />

      <PageHero
        eyebrow="Intensive route"
        title="Keep the live workbench on a page that belongs only to analysis and transfer."
        copy="This is the focused reading lab. Discovery stays in the library, and final feedback stays in the report room."
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath('/library')}>
              Back to library
            </Link>
            <Link className="ghost-btn" to={toModulePath(selectedArticle ? `/library/${selectedArticle.slug}` : '/library')}>
              Open anchor article
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Intensive workbench is locked"
          message="You can inspect the route shape, but the full live analysis workflow unlocks with an active reading plan."
          ctaHref={pricingHref}
        />
      ) : null}

      <section className={'route-stage-card' + (!hasAccess ? ' route-disabled' : '')}>
        <div className="route-stage-header">
          <div>
            <small className="route-context-kicker">Anchor article</small>
            <h2>{selectedArticle.title}</h2>
          </div>
          <span className="route-chip">{selectedArticle.level}</span>
        </div>
        <p>{selectedArticle.summary}</p>
        <div className="route-stack-list">
          {visibleLanes.map((lane) => (
            <article key={lane.slug} className="route-list-row static">
              <strong>{lane.title}</strong>
              <span>{lane.detail}</span>
            </article>
          ))}
        </div>
        <div className="route-inline-card">
          <strong>Execution shape</strong>
          <p>Notice {'->'} focus one paragraph {'->'} map structure {'->'} summarize {'->'} route weaknesses outward.</p>
        </div>
        <div className="route-inline-actions">
          <Link className="primary-cta" to={toModulePath('/reports')}>
            Open report room
          </Link>
          <a className="ghost-btn" href={REVIEW_HANDOFFS[0].href}>
            Repair in Grammar
          </a>
        </div>
      </section>
    </SectionGrid>
  );
};

const ReadingReportPage = ({
  hasAccess,
  pricingHref,
  accessToken,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
  context: EnglishRouteContext;
}) => {
  const params = useParams<{ attemptId?: string }>();
  const [attempt, setAttempt] = useState<Record<string, unknown> | null>(null);
  const [feedback, setFeedback] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.attemptId || !hasAccess || !accessToken) {
      setAttempt(null);
      setFeedback(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getLearningAttempt(accessToken, params.attemptId)
      .then((result) => {
        if (cancelled) return;
        setAttempt(result.attempt ?? null);
        setFeedback(result.feedback ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load this reading report yet.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.attemptId]);

  const issues = Array.isArray(feedback?.issues) ? (feedback?.issues as Array<Record<string, unknown>>) : [];
  const overallScore = typeof attempt?.overall_score === 'number' ? Math.round((attempt.overall_score as number) * 100) : null;

  return (
    <SectionGrid>
      <RouteContextRibbon
        context={context}
        cta={
          <Link className="ghost-btn" to={toModulePath('/library')}>
            Return to library
          </Link>
        }
      />

      <PageHero
        eyebrow="Report room"
        title="Keep results and next-step routing off the live reading page."
        copy="The report room owns feedback, issue grouping, and the next connected jump into Vocabulary, Grammar, or Writing."
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath('/intensive')}>
              Back to intensive route
            </Link>
            <Link className="ghost-btn" to={toModulePath('/library')}>
              Open another article
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Report room is preview-only"
          message="The structure is visible now, but live scores and issue grouping appear after a completed reading route."
          ctaHref={pricingHref}
        />
      ) : null}

      <section className="route-split-grid">
        <section className="route-debrief-card">
          {loading ? <div className="route-empty-state">Loading reading report...</div> : null}
          {!loading && error ? <div className="route-empty-state">{error}</div> : null}
          {!loading && !attempt ? (
            <div className="route-empty-state">
              Complete a reading check-in first. The report room will then hold summary, issues, and cross-service routing.
            </div>
          ) : null}

          {attempt ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">Latest report</small>
                  <h2>{typeof feedback?.summary === 'string' && feedback.summary ? feedback.summary : 'Reading route recorded.'}</h2>
                </div>
                {overallScore != null ? <span className="route-chip">{overallScore}% score</span> : null}
              </div>
              <div className="route-metric-grid">
                <div className="route-inline-card">
                  <small className="route-context-kicker">Attempt status</small>
                  <strong>{String(attempt.status ?? 'completed')}</strong>
                </div>
                <div className="route-inline-card">
                  <small className="route-context-kicker">Overall score</small>
                  <strong>{overallScore != null ? `${overallScore}%` : 'Recorded'}</strong>
                </div>
                <div className="route-inline-card">
                  <small className="route-context-kicker">Issue count</small>
                  <strong>{issues.length}</strong>
                </div>
              </div>
              <div className="route-stack-list">
                {(issues.length > 0
                  ? issues
                  : [
                      {
                        category: 'reading',
                        subskill_key: 'reading.transfer',
                        explanation: 'Use this report to decide whether Reading should hand off to Grammar, Vocabulary, or Writing next.',
                        correction_hint: 'Choose one explicit next route below instead of returning to a crowded dashboard.',
                      },
                    ]
                ).map((issue, index) => (
                  <article key={`issue-${index}`} className="route-list-row static">
                    <strong>{String(issue.subskill_key ?? issue.category ?? 'reading')}</strong>
                    <span>{String(issue.explanation ?? issue.correction_hint ?? 'Reading report issue.')}</span>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <aside className="route-sidebar-card">
          <div className="route-stage-header">
            <div>
              <small className="route-context-kicker">Next routes</small>
              <h2>Connected handoffs</h2>
            </div>
          </div>
          <div className="route-stack-list">
            {REVIEW_HANDOFFS.map((handoff) => (
              <a key={handoff.label} className="route-list-row" href={handoff.href}>
                <strong>{handoff.label}</strong>
                <span>Open the exact downstream route</span>
              </a>
            ))}
          </div>
          <Link className="ghost-btn" to={toModulePath('/library')}>
            Read another article
          </Link>
        </aside>
      </section>
    </SectionGrid>
  );
};

const AdminReadingArticlesPage = ({
  accessToken,
  isAdmin,
  search,
}: {
  accessToken: string | null;
  isAdmin: boolean;
  search: string;
}) => {
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | 'all'>('all');
  const [articles, setArticles] = useState<ReadingArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReturnType<typeof emptyArticleDraft>>(emptyArticleDraft());

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
    sceneLabel: readMetaText(article.presentationMeta?.scene_label),
    heroNote: readMetaText(article.presentationMeta?.hero_note),
    coverStyleKey: readMetaText(article.presentationMeta?.cover_style_key),
    coachTone: readMetaText(article.presentationMeta?.coach_tone),
    difficultyBadge: readMetaText(article.presentationMeta?.difficulty_badge),
    supportModeLabels: (article.presentationMeta?.support_mode_labels ?? []).join(', '),
    targetBadges: (article.presentationMeta?.target_badges ?? []).join(', '),
    ambientAudioKey: readMetaText(article.presentationMeta?.ambient_audio_key),
    celebrationCopy: readMetaText(article.presentationMeta?.celebration_copy),
    previewMediaUrl: readMetaText(article.presentationMeta?.preview_media_url),
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
    setDraft(emptyArticleDraft());
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
      const presentationMeta = buildPresentationMeta(draft);
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
          presentation_meta: presentationMeta,
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
          presentation_meta: presentationMeta,
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

  const visibleArticles = useMemo(
    () => filterArticlesBySearch(articles, search),
    [articles, search],
  );

  if (!isAdmin) {
    return (
      <SectionGrid>
        <PageHero
          eyebrow="Reading admin"
          title="Article Studio"
          copy="This route stays separate from the learner flow, but it is still available inside the same service shell."
        />
        <section className="route-empty-state">Admin access required for Reading content authoring.</section>
      </SectionGrid>
    );
  }

  return (
    <SectionGrid>
      <PageHero
        eyebrow="Reading admin"
        title="Article Studio"
        copy="Create, edit, and polish reading content without mixing authoring into the learner routes."
        actions={
          <>
            <button className="ghost-btn" type="button" onClick={resetDraft}>
              New article
            </button>
            <button className="primary-cta" type="button" onClick={() => void onSave()} disabled={saving}>
              {saving ? 'Saving...' : selectedId ? 'Update article' : 'Create article'}
            </button>
          </>
        }
      />

      {error ? <section className="route-empty-state">{error}</section> : null}
      {success ? <section className="route-inline-card"><strong>{success}</strong></section> : null}

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
            {visibleArticles.map((article) => (
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
            <textarea rows={3} value={draft.summary} onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))} />
          </label>

          <div className="admin-form-grid four">
            <label>
              <span>Level</span>
              <select value={draft.level} onChange={(event) => setDraft((prev) => ({ ...prev, level: event.target.value as CefrLevel }))}>
                {CEFR_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tone</span>
              <select value={draft.tone} onChange={(event) => setDraft((prev) => ({ ...prev, tone: event.target.value as ReadingArticleTone }))}>
                {['lime', 'mint', 'sky', 'peach', 'lavender', 'sand'].map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as ArticleStatus }))}>
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

          <section className="admin-presentation-meta">
            <div className="admin-presentation-meta-head">
              <div>
                <small>Presentation meta</small>
                <h4>Salon styling and learner-facing polish</h4>
              </div>
              <span>Optional but recommended</span>
            </div>
            <div className="admin-form-grid two">
              <label>
                <span>Scene label</span>
                <input value={draft.sceneLabel} onChange={(event) => setDraft((prev) => ({ ...prev, sceneLabel: event.target.value }))} />
              </label>
              <label>
                <span>Difficulty badge</span>
                <input value={draft.difficultyBadge} onChange={(event) => setDraft((prev) => ({ ...prev, difficultyBadge: event.target.value }))} />
              </label>
            </div>
            <label className="admin-form-block">
              <span>Hero note</span>
              <textarea rows={3} value={draft.heroNote} onChange={(event) => setDraft((prev) => ({ ...prev, heroNote: event.target.value }))} />
            </label>
            <div className="admin-form-grid four">
              <label>
                <span>Cover style key</span>
                <input value={draft.coverStyleKey} onChange={(event) => setDraft((prev) => ({ ...prev, coverStyleKey: event.target.value }))} />
              </label>
              <label>
                <span>Coach tone</span>
                <input value={draft.coachTone} onChange={(event) => setDraft((prev) => ({ ...prev, coachTone: event.target.value }))} />
              </label>
              <label>
                <span>Ambient audio key</span>
                <input value={draft.ambientAudioKey} onChange={(event) => setDraft((prev) => ({ ...prev, ambientAudioKey: event.target.value }))} />
              </label>
              <label>
                <span>Preview media URL</span>
                <input value={draft.previewMediaUrl} onChange={(event) => setDraft((prev) => ({ ...prev, previewMediaUrl: event.target.value }))} />
              </label>
            </div>
            <div className="admin-form-grid two">
              <label>
                <span>Support mode labels</span>
                <input
                  value={draft.supportModeLabels}
                  onChange={(event) => setDraft((prev) => ({ ...prev, supportModeLabels: event.target.value }))}
                  placeholder="Focus mode, Margin glossary, Summary transfer"
                />
              </label>
              <label>
                <span>Target badges</span>
                <input
                  value={draft.targetBadges}
                  onChange={(event) => setDraft((prev) => ({ ...prev, targetBadges: event.target.value }))}
                  placeholder="Inference, Vocabulary-in-context, Cohesion"
                />
              </label>
            </div>
            <label className="admin-form-block">
              <span>Celebration copy</span>
              <textarea
                rows={2}
                value={draft.celebrationCopy}
                onChange={(event) => setDraft((prev) => ({ ...prev, celebrationCopy: event.target.value }))}
              />
            </label>
          </section>

          <div className="admin-form-grid two">
            <label>
              <span>Sort order</span>
              <input type="number" value={draft.sortOrder} onChange={(event) => setDraft((prev) => ({ ...prev, sortOrder: Number(event.target.value) || 100 }))} />
            </label>
            <label className="admin-checkbox-row">
              <input type="checkbox" checked={draft.hot} onChange={(event) => setDraft((prev) => ({ ...prev, hot: event.target.checked }))} />
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
    </SectionGrid>
  );
};

const ReadingWorkspaceRoutes = ({
  hasAccess,
  pricingHref,
  accessToken,
  search,
  isAdmin,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
  search: string;
  isAdmin: boolean;
}) => {
  const location = useLocation();
  const context = readEnglishRouteContext(location.search);

  return (
    <Routes>
      <Route path="dashboard" element={<ReadingDashboardPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} search={search} context={context} />} />
      <Route path="library" element={<ReadingLibraryPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} search={search} context={context} />} />
      <Route path="library/:articleSlug" element={<ReadingArticlePage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />} />
      <Route path="intensive" element={<ReadingIntensivePage hasAccess={hasAccess} pricingHref={pricingHref} search={search} context={context} />} />
      <Route path="reports" element={<ReadingReportPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />} />
      <Route path="reports/:attemptId" element={<ReadingReportPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />} />
      <Route path="admin/articles" element={<AdminReadingArticlesPage accessToken={accessToken} isAdmin={isAdmin} search={search} />} />
      <Route path="articles" element={<Navigate to={toModulePath('/library')} replace />} />
      <Route path="article-detail" element={<Navigate to={toModulePath('/library')} replace />} />
      <Route path="exercises" element={<Navigate to={toModulePath('/intensive')} replace />} />
      <Route path="*" element={<Navigate to={toModulePath('/dashboard')} replace />} />
    </Routes>
  );
};

const App = () => {
  const location = useLocation();
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [session, setSession] = useState<Session | null>(null);
  const [search, setSearch] = useState('');
  const [profileNameFromDb, setProfileNameFromDb] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('idle');
  const [accessEndsAt, setAccessEndsAt] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
    let cancelled = false;

    const resolveAccess = async () => {
      if (status !== 'signed_in' || !session?.access_token) {
        setAccessStatus('idle');
        setAccessEndsAt(null);
        setAccessError(null);
        setIsAdmin(false);
        return;
      }

      setAccessStatus('checking');
      setAccessError(null);

      try {
        const me = await getMe(session.access_token);
        if (cancelled) return;

        const entitlement =
          me.entitlements.find(
            (entry) => hasActiveProductEntitlement(entry, READING_PRODUCT_ID, READING_PRODUCT_SLUG),
          ) ?? null;

        const adminByUserRole = String(me.user.role ?? '').toLowerCase() === 'admin';
        const adminByMembership = me.memberships.some((membership) => {
          const role = String(membership.role ?? '').toLowerCase();
          return role === 'admin' || role === 'owner';
        });

        setIsAdmin(adminByUserRole || adminByMembership);
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
          return;
        }
        setAccessStatus('denied');
        setAccessError('Could not verify your reading access right now.');
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
  const platformWorkspaceHref = useMemo(() => buildPlatformUrl('/student-center'), []);
  const hasAccess = status === 'signed_in' && accessStatus === 'granted';
  const needsAccess = status === 'signed_in' && accessStatus === 'denied';
  const checkingAccess = status === 'signed_in' && accessStatus === 'checking';
  const profileName = useMemo(() => profileNameFromDb ?? resolveProfileName(session), [profileNameFromDb, session]);

  void profileName;
  void accessEndsAt;

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
  };

  if (status === 'signed_out' || isModulePath(location.pathname, '/')) {
    return (
      <Routes>
        <Route
          path="/"
          element={
            <SignedOutLanding
              signInHref={signInHref}
              pricingHref={pricingHref}
              platformWorkspaceHref={platformWorkspaceHref}
              isSignedIn={status === 'signed_in'}
            />
          }
        />
        <Route path="*" element={<Navigate to={toModulePath(status === 'signed_in' ? '/dashboard' : '/')} replace />} />
      </Routes>
    );
  }

  const menuItems = [
    { label: 'Dashboard', href: toModulePath('/dashboard'), active: isModulePath(location.pathname, '/dashboard') },
    { label: 'Library', href: toModulePath('/library'), active: isModulePathPrefix(location.pathname, '/library') },
    { label: 'Intensive route', href: toModulePath('/intensive'), active: isModulePathPrefix(location.pathname, '/intensive') },
    { label: 'Report room', href: toModulePath('/reports'), active: isModulePathPrefix(location.pathname, '/reports') },
  ];

  return (
    <EnglishSkillWorkspace
      serviceName={SERVICE_LABEL}
      serviceTagline="English Reading service - route-based article library, focused reading, and debrief workflow."
      menuItems={menuItems}
      serviceSwitchLinks={SERVICE_SWITCH_LINKS}
      hubHref={ENGLISH_HUB_URL}
      platformHref={platformWorkspaceHref}
      pricingHref={pricingHref}
      signInHref={signInHref}
      status={status}
      needsAccess={needsAccess}
      checkingAccess={checkingAccess}
      accessError={accessError}
      search={search}
      onSearchChange={setSearch}
      onSignOut={() => {
        void handleSignOut();
      }}
      upgradeTitle="Premium Reading Pack"
      upgradeCopy="Unlock full article shelves, live reading routes, structured debrief pages, and connected English handoffs."
      updatesHref={buildPlatformUrl('/updates')}
    >
      <ReadingWorkspaceRoutes
        hasAccess={hasAccess}
        pricingHref={pricingHref}
        accessToken={session?.access_token ?? null}
        search={search}
        isAdmin={isAdmin}
      />
    </EnglishSkillWorkspace>
  );
};

export default App;
