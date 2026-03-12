import { useEffect, useMemo, useState } from 'react';

type HubPath = '/' | '/dashboard';

type Service = {
  key: string;
  label: string;
  summary: string;
  href: string;
  className: string;
  progress: number;
};

const SERVICES: Service[] = [
  {
    key: 'reading',
    label: 'Reading',
    summary: 'Passage comprehension, timing control, and answer strategy.',
    href: 'https://reading.english.schood.online',
    className: 'is-reading',
    progress: 82,
  },
  {
    key: 'listening',
    label: 'Listening',
    summary: 'Audio focus, note-taking rhythm, and fast answer selection.',
    href: 'https://listening.english.schood.online',
    className: 'is-listening',
    progress: 78,
  },
  {
    key: 'writing',
    label: 'Writing',
    summary: 'Task response, structure quality, grammar, and coherence.',
    href: 'https://writing.english.schood.online',
    className: 'is-writing',
    progress: 73,
  },
  {
    key: 'speaking',
    label: 'Speaking',
    summary: 'Fluency, pronunciation, confidence, and part-wise response flow.',
    href: 'https://speaking.english.schood.online',
    className: 'is-speaking',
    progress: 69,
  },
  {
    key: 'grammar',
    label: 'Grammar',
    summary: 'Error correction loops and sentence-level control practice.',
    href: 'https://grammar.english.schood.online',
    className: 'is-grammar',
    progress: 81,
  },
  {
    key: 'vocabulary',
    label: 'Vocabulary',
    summary: 'Topic lexicon, collocations, and active recall routines.',
    href: 'https://vocabulary.english.schood.online',
    className: 'is-vocabulary',
    progress: 76,
  },
  {
    key: 'immersion',
    label: 'Immersion',
    summary: 'Daily exposure tasks to keep English active beyond drills.',
    href: 'https://immersion.english.schood.online',
    className: 'is-immersion',
    progress: 71,
  },
];

const platformUrl = ((import.meta.env.VITE_PLATFORM_URL as string | undefined) ?? '').trim() || 'https://schood.online';

const buildPlatformUrl = (pathname: string): string => `${platformUrl.replace(/\/$/, '')}${pathname}`;

const resolvePath = (): HubPath => {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname === '/dashboard' ? '/dashboard' : '/';
};

const resolveReturnTo = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

const App = () => {
  const [path, setPath] = useState<HubPath>(resolvePath);
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onPopState = () => {
      setPath(resolvePath());
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextPath: HubPath): void => {
    if (typeof window === 'undefined') return;

    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }

    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const completedServices = SERVICES.filter((service) => service.progress >= 75).length;

  return (
    <div className="hub-root">
      <div className="hub-ambient" aria-hidden />
      <main className="hub-shell">
        <header className="hub-nav frame">
          <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }}>
            <img className="brand-logo" src="/schood-logo.png" alt="Schood" />
            <span className="brand-copy">
              <strong>Schood English</strong>
              <small>Unified English services</small>
            </span>
          </a>

          <nav className="hub-links" aria-label="Hub routes">
            <button className={path === '/' ? 'route-btn active' : 'route-btn'} type="button" onClick={() => navigate('/')}>Home</button>
            <button className={path === '/dashboard' ? 'route-btn active' : 'route-btn'} type="button" onClick={() => navigate('/dashboard')}>Dashboard</button>
          </nav>

          <div className="hub-controls">
            <a className="btn btn-ghost" href={workspaceHref}>Platform</a>
            <a className="btn btn-ghost" href={signInHref}>Sign in</a>
            <a className="btn btn-solid" href={pricingHref}>Get access</a>
          </div>
        </header>

        {path === '/' ? (
          <>
            <section className="hero frame">
              <p className="kicker">Main entry point</p>
              <h1>One place to move through all English services.</h1>
              <p className="hero-copy">
                Start in Schood English, jump to any module, and keep one connected English learning profile.
              </p>
              <div className="hero-actions">
                <button className="btn btn-solid" type="button" onClick={() => navigate('/dashboard')}>Open dashboard</button>
                <a className="btn btn-ghost" href={workspaceHref}>Open platform account</a>
              </div>
            </section>

            <section className="services-grid" aria-label="English services">
              {SERVICES.map((service) => (
                <article className={`service-card frame ${service.className}`} key={service.key}>
                  <p className="service-tag">{service.label}</p>
                  <h2>English {service.label}</h2>
                  <p className="service-summary">{service.summary}</p>
                  <div className="service-actions">
                    <a className="btn btn-ghost" href={service.href}>Open service</a>
                    <a className="btn btn-soft" href={`${service.href}/dashboard`}>Open dashboard</a>
                  </div>
                </article>
              ))}
            </section>

            <section className="connection frame">
              <h3>How the connection works</h3>
              <ul>
                <li>Use the same account across reading, listening, writing, speaking, grammar, vocabulary, and immersion.</li>
                <li>English progress signals stay shared inside English scope for personalization and analytics.</li>
                <li>Move between services from here without restarting your profile context.</li>
              </ul>
            </section>
          </>
        ) : (
          <>
            <section className="dashboard-hero frame">
              <p className="kicker">Schood English dashboard</p>
              <h1>Connected progress across all English services.</h1>
              <p>
                {completedServices}/{SERVICES.length} services are currently above the target progress threshold.
              </p>
            </section>

            <section className="dashboard-grid">
              <article className="progress-panel frame">
                <h3>Service progress</h3>
                <ul className="progress-list">
                  {SERVICES.map((service) => (
                    <li key={`${service.key}-progress`}>
                      <div className="progress-row">
                        <span>{service.label}</span>
                        <strong>{service.progress}%</strong>
                      </div>
                      <div className={`progress-track ${service.className}`} aria-hidden>
                        <span style={{ width: `${service.progress}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="quick-jump frame">
                <h3>Quick jump to services</h3>
                <div className="jump-list">
                  {SERVICES.map((service) => (
                    <a className={`jump-chip ${service.className}`} href={`${service.href}/dashboard`} key={`${service.key}-jump`}>
                      {service.label}
                    </a>
                  ))}
                </div>
                <a className="btn btn-ghost" href={workspaceHref}>Open full platform workspace</a>
              </article>

              <article className="insights frame">
                <h3>Focus for this week</h3>
                <ul>
                  <li>Pair one listening session before speaking to improve live response speed.</li>
                  <li>Follow writing sessions with grammar correction for stronger accuracy retention.</li>
                  <li>Keep immersion daily to improve vocabulary recall inside reading passages.</li>
                </ul>
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default App;
