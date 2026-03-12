import { useMemo } from 'react';

type ServiceCard = {
  key: string;
  label: string;
  subline: string;
  href: string;
};

const SERVICES: ServiceCard[] = [
  {
    key: 'reading',
    label: 'Reading',
    subline: 'Comprehension, speed, and question strategy',
    href: 'https://reading.english.schood.online',
  },
  {
    key: 'writing',
    label: 'Writing',
    subline: 'Task response, structure, and grammar quality',
    href: 'https://writing.english.schood.online',
  },
  {
    key: 'listening',
    label: 'Listening',
    subline: 'Accuracy under speed with real exam pacing',
    href: 'https://listening.english.schood.online',
  },
  {
    key: 'speaking',
    label: 'Speaking',
    subline: 'Fluency, coherence, pronunciation, confidence',
    href: 'https://speaking.english.schood.online',
  },
  {
    key: 'grammar',
    label: 'Grammar',
    subline: 'Core sentence control and error reduction',
    href: 'https://grammar.english.schood.online',
  },
  {
    key: 'vocabulary',
    label: 'Vocabulary',
    subline: 'High-value lexical range and collocations',
    href: 'https://vocabulary.english.schood.online',
  },
  {
    key: 'immersion',
    label: 'Immersion',
    subline: 'Daily context exposure for retention',
    href: 'https://immersion.english.schood.online',
  },
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

  return (
    <div className="hub-root">
      <div className="ambient-layer" />
      <main className="hub-main">
        <header className="hub-topbar card">
          <a className="hub-brand" href="https://schood.online">
            <span className="dot" />
            <strong>English Hub</strong>
          </a>
          <nav className="hub-links">
            <a href={buildPlatformUrl('/about')}>About us</a>
            <a href={buildPlatformUrl('/programs')}>Programs</a>
            <a href={buildPlatformUrl('/blog')}>Blog</a>
            <a href={buildPlatformUrl('/contact')}>Contact</a>
          </nav>
          <div className="hub-actions">
            <a className="ghost-btn" href={workspaceHref}>Open platform</a>
            <a className="icon-btn" href={signInHref}>Log in</a>
            <a className="primary-cta" href={pricingHref}>Start trial</a>
          </div>
        </header>

        <section className="hub-hero card">
          <div className="hero-headline">
            <small className="eyebrow">Language-scoped experience</small>
            <h1>One English profile. Seven connected services.</h1>
            <p>
              Move between reading, listening, writing, speaking, grammar, vocabulary, and immersion
              without losing context. Your outcomes stay in one English learner profile.
            </p>
            <div className="hero-actions">
              <a className="primary-cta" href={workspaceHref}>Continue learning</a>
              <a className="ghost-btn" href={buildPlatformUrl('/products')}>Browse all products</a>
            </div>
          </div>
          <div className="hero-flow" aria-hidden>
            <div className="flow-step">Reading</div>
            <div className="flow-arrow">{'->'}</div>
            <div className="flow-step">Vocabulary</div>
            <div className="flow-arrow">{'->'}</div>
            <div className="flow-step">Writing</div>
            <div className="flow-arrow">{'->'}</div>
            <div className="flow-step">Speaking</div>
          </div>
        </section>

        <section className="service-grid">
          {SERVICES.map((service) => (
            <article className="service-card card" key={service.key}>
              <div className="service-card-head">
                <span className="service-chip">{service.label}</span>
                <a className="mini-cta" href={service.href}>Open</a>
              </div>
              <h2>{service.label} service</h2>
              <p>{service.subline}</p>
              <a className="service-link" href={service.href}>
                Go to {service.label}
              </a>
            </article>
          ))}
        </section>

        <section className="sync-grid">
          <article className="sync-card card">
            <small>Shared signals</small>
            <strong>Cross-service personalization</strong>
            <p>
              Every English module contributes to one adaptive profile for smarter recommendations and diagnostics.
            </p>
          </article>
          <article className="sync-card card">
            <small>Hard isolation</small>
            <strong>Per-language boundary</strong>
            <p>
              English outcomes stay in English scope only. Future languages will be isolated with the same guardrails.
            </p>
          </article>
          <article className="sync-card card">
            <small>Single account flow</small>
            <strong>Unified auth and billing</strong>
            <p>
              Authentication and plan access stay platform-managed while each service remains focused on its own learning UX.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
};

export default App;
