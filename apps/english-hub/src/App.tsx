import { useMemo } from 'react';

type ServiceCard = {
  key: string;
  label: string;
  title: string;
  teaser: string;
  coach: string;
  learners: string;
  lesson: string;
  duration: string;
  completed: number;
  total: number;
  href: string;
  className: string;
};

type SkillMetric = {
  key: string;
  label: string;
  score: number;
};

const SERVICES: ServiceCard[] = [
  {
    key: 'reading',
    label: 'Reading',
    title: 'Constructivism',
    teaser: 'Decode long passages faster with structure-first reading moves.',
    coach: 'Guided by the Reading studio team',
    learners: '15K learners',
    lesson: 'Lesson 8 / 14',
    duration: '26 min',
    completed: 8,
    total: 14,
    href: 'https://reading.english.schood.online',
    className: 'is-reading',
  },
  {
    key: 'writing',
    label: 'Writing',
    title: 'Renaissance Essays',
    teaser: 'Practice task response, cohesion, grammar, and lexical control.',
    coach: 'Mentor feedback + AI scoring loop',
    learners: '12K learners',
    lesson: 'Lesson 6 / 12',
    duration: '24 min',
    completed: 6,
    total: 12,
    href: 'https://writing.english.schood.online',
    className: 'is-writing',
  },
  {
    key: 'listening',
    label: 'Listening',
    title: 'Matisse Audio Lab',
    teaser: 'Train concentration and answer timing under realistic speed.',
    coach: 'Adaptive accent exposure',
    learners: '18K learners',
    lesson: 'Lesson 10 / 14',
    duration: '22 min',
    completed: 10,
    total: 14,
    href: 'https://listening.english.schood.online',
    className: 'is-listening',
  },
  {
    key: 'speaking',
    label: 'Speaking',
    title: 'Fluency Sessions',
    teaser: 'Build coherent answers with pacing, stress, and confidence drills.',
    coach: 'Part-based interview training',
    learners: '11K learners',
    lesson: 'Lesson 5 / 10',
    duration: '18 min',
    completed: 5,
    total: 10,
    href: 'https://speaking.english.schood.online',
    className: 'is-speaking',
  },
  {
    key: 'grammar',
    label: 'Grammar',
    title: 'Grammar Forge',
    teaser: 'Close error patterns and lock sentence accuracy for exams.',
    coach: 'Targeted correction sets',
    learners: '9K learners',
    lesson: 'Lesson 7 / 11',
    duration: '20 min',
    completed: 7,
    total: 11,
    href: 'https://grammar.english.schood.online',
    className: 'is-grammar',
  },
  {
    key: 'vocabulary',
    label: 'Vocabulary',
    title: 'Lexicon Studio',
    teaser: 'Expand topic range with collocations and active recall cycles.',
    coach: 'Context bundles by theme',
    learners: '13K learners',
    lesson: 'Lesson 9 / 13',
    duration: '16 min',
    completed: 9,
    total: 13,
    href: 'https://vocabulary.english.schood.online',
    className: 'is-vocabulary',
  },
  {
    key: 'immersion',
    label: 'Immersion',
    title: 'Daily Immersion',
    teaser: 'Keep language active through real-world English media loops.',
    coach: 'Habit streak support',
    learners: '8K learners',
    lesson: 'Lesson 4 / 9',
    duration: '14 min',
    completed: 4,
    total: 9,
    href: 'https://immersion.english.schood.online',
    className: 'is-immersion',
  },
];

const SKILL_METRICS: SkillMetric[] = [
  { key: 'reading', label: 'Reading comprehension', score: 84 },
  { key: 'listening', label: 'Listening accuracy', score: 78 },
  { key: 'writing', label: 'Writing coherence', score: 73 },
  { key: 'speaking', label: 'Speaking fluency', score: 69 },
  { key: 'grammar', label: 'Grammar control', score: 81 },
  { key: 'vocabulary', label: 'Vocabulary depth', score: 76 },
  { key: 'immersion', label: 'Immersion consistency', score: 71 },
];

const platformUrl = ((import.meta.env.VITE_PLATFORM_URL as string | undefined) ?? '').trim() || 'https://schood.online';

const buildPlatformUrl = (pathname: string): string => `${platformUrl.replace(/\/$/, '')}${pathname}`;

const resolveReturnTo = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

const App = () => {
  const returnTo = resolveReturnTo();

  const signInHref = useMemo(
    () => `${buildPlatformUrl('/auth?mode=signin')}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );

  const workspaceHref = useMemo(() => buildPlatformUrl('/workspace/student'), []);

  const pricingHref = useMemo(
    () => `${buildPlatformUrl('/pricing?product=english-reading')}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );

  const completedLessons = SERVICES.reduce((sum, service) => sum + service.completed, 0);
  const totalLessons = SERVICES.reduce((sum, service) => sum + service.total, 0);
  const completionPercent = Math.round((completedLessons / totalLessons) * 100);

  return (
    <div className="hub-root">
      <div className="hub-ambient" aria-hidden />
      <main className="hub-shell">
        <header className="hub-nav frame">
          <a className="hub-logo" href="https://schood.online">
            <span className="logo-mark">EN</span>
            <span className="logo-copy">
              <strong>English Hub</strong>
              <small>Schood language suite</small>
            </span>
          </a>

          <label className="hub-search" aria-label="Search">
            <span className="search-dot" aria-hidden />
            <input type="search" placeholder="Search lessons, services, goals..." />
          </label>

          <nav className="hub-primary-nav" aria-label="Primary">
            <a className="active" href={workspaceHref}>My lessons</a>
            <a href={buildPlatformUrl('/products')}>Browse</a>
            <a href={buildPlatformUrl('/academy')}>Community</a>
          </nav>

          <div className="hub-controls">
            <a className="ghost-pill" href={workspaceHref}>Platform</a>
            <a className="ghost-pill" href={signInHref}>Log in</a>
            <a className="solid-pill" href={pricingHref}>Get access</a>
          </div>
        </header>

        <section className="hub-progress frame">
          <div className="progress-head">
            <div>
              <p className="section-kicker">Connected English experience</p>
              <h1>Your lessons ({SERVICES.length})</h1>
              <p className="progress-copy">
                <strong>{completedLessons}</strong>/{totalLessons} lessons completed across reading, listening,
                writing, speaking, grammar, vocabulary, and immersion.
              </p>
            </div>
            <a className="show-all" href={workspaceHref}>Show all</a>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent}>
            <span style={{ width: `${completionPercent}%` }} />
          </div>
        </section>

        <section className="lesson-rail" aria-label="English services">
          {SERVICES.map((service) => (
            <article className={`lesson-card ${service.className}`} key={service.key}>
              <div className="lesson-overlay" aria-hidden />
              <div className="lesson-content">
                <p className="lesson-label">{service.label}</p>
                <h2>{service.title}</h2>
                <p className="lesson-teaser">{service.teaser}</p>
                <p className="lesson-coach">{service.coach}</p>
                <div className="lesson-meta">
                  <span>{service.lesson}</span>
                  <span>{service.duration}</span>
                </div>
                <div className="lesson-footer">
                  <span className="lesson-learners">{service.learners}</span>
                  <a className="lesson-action" href={`${service.href}/dashboard`}>Continue</a>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="hub-grid">
          <article className="switcher-panel frame">
            <h3>Switch services without losing context</h3>
            <p>
              Every English service contributes to one profile, so your recommendations and analytics
              stay synced when you jump between modules.
            </p>
            <div className="switcher-list">
              {SERVICES.map((service) => (
                <a className={`switch-chip ${service.className}`} href={service.href} key={`${service.key}-chip`}>
                  {service.label}
                </a>
              ))}
            </div>
            <div className="switcher-actions">
              <a className="ghost-pill" href={workspaceHref}>Open unified dashboard</a>
              <a className="solid-pill" href={buildPlatformUrl('/workspace/student')}>View profile analytics</a>
            </div>
          </article>

          <article className="analytics-panel frame">
            <h3>Shared English analytics</h3>
            <ul className="skill-list">
              {SKILL_METRICS.map((metric) => (
                <li key={metric.key}>
                  <div className="skill-row">
                    <span>{metric.label}</span>
                    <strong>{metric.score}%</strong>
                  </div>
                  <div className="skill-meter" aria-hidden>
                    <span style={{ width: `${metric.score}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article className="insights-panel frame">
            <h3>Next best actions</h3>
            <ul>
              <li>Complete one listening drill before your next speaking task to improve response timing.</li>
              <li>Use the writing module after grammar correction sessions to reinforce structure accuracy.</li>
              <li>Keep the immersion streak active for better vocabulary retention in reading passages.</li>
            </ul>
            <a className="ghost-pill" href={buildPlatformUrl('/academy')}>Open weekly plan</a>
          </article>
        </section>
      </main>
    </div>
  );
};

export default App;
