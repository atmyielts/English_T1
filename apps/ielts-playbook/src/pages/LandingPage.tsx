import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardCheck,
  Compass,
  FileText,
  Gauge,
  Headphones,
  PenLine,
  Route,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { playbookCatalogGet, playbookUpdatesGet, type PlaybookCatalog } from '../lib/api';
import { PRACTICE_APP_URL, SIMULATOR_APP_URL } from '../lib/constants';
import { SiteChrome } from '../components/content/SiteChrome';

const fallbackModules: PlaybookCatalog['modules'] = [
  {
    id: 'fallback-essentials',
    slug: 'essentials',
    module_key: 'essentials',
    title: 'IELTS Essentials',
    summary: 'Understand the exam, the score report, test formats, and what actually moves a band score.',
    sort_order: 1,
    metadata: { hero_kicker: 'Start here' },
    published_at: null,
  },
  {
    id: 'fallback-test-path',
    slug: 'test-types-booking',
    module_key: 'test-types-booking',
    title: 'Test Path Finder',
    summary: 'Choose Academic, General Training, UKVI, delivery mode, and retake path with fewer expensive mistakes.',
    sort_order: 2,
    metadata: { hero_kicker: 'Decision' },
    published_at: null,
  },
  {
    id: 'fallback-listening',
    slug: 'listening-master-guide',
    module_key: 'listening',
    title: 'Listening Master Guide',
    summary: 'Fix distractors, answer transfer, spelling pressure, and note-taking before speed becomes the problem.',
    sort_order: 3,
    metadata: { hero_kicker: 'Skill' },
    published_at: null,
  },
  {
    id: 'fallback-writing',
    slug: 'writing-master-guide',
    module_key: 'writing',
    title: 'Writing Master Guide',
    summary: 'Move from template habits to task response, development, coherence, and criteria-based improvement.',
    sort_order: 4,
    metadata: { hero_kicker: 'Skill' },
    published_at: null,
  },
  {
    id: 'fallback-study-plans',
    slug: 'study-plans',
    module_key: 'study-plans',
    title: 'Study Plans',
    summary: 'Pick crash, balanced, improvement, or weak-skill recovery routines based on deadline and evidence.',
    sort_order: 5,
    metadata: { hero_kicker: 'Routine' },
    published_at: null,
  },
];

const fallbackSources = [
  {
    title: 'Official IELTS policy checks',
    summary: 'Booking, delivery, result timing, and retake notes should be checked against current provider guidance.',
    url: '/updates-policy',
  },
  {
    title: 'Simulator evidence loop',
    summary: 'Use scored outcomes to replace vague confidence with a concrete module order.',
    url: `${SIMULATOR_APP_URL}?source=playbook`,
  },
  {
    title: 'Practice handoff',
    summary: 'Move from diagnosis into targeted reps when a weak skill or question type becomes clear.',
    url: `${PRACTICE_APP_URL}/dashboard?source=playbook`,
  },
];

const moduleIcons: LucideIcon[] = [BookOpenCheck, Compass, Headphones, PenLine, ClipboardCheck, FileText];

export const LandingPage: React.FC = () => {
  const [catalog, setCatalog] = useState<PlaybookCatalog | null>(null);
  const [updates, setUpdates] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([playbookCatalogGet(), playbookUpdatesGet()])
      .then(([catalogPayload, updatesPayload]) => {
        if (!active) return;
        setCatalog(catalogPayload);
        setUpdates(updatesPayload);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const modules = catalog?.modules.length ? catalog.modules : fallbackModules;
  const recentSources = Array.isArray(updates?.recent_sources) ? updates.recent_sources.slice(0, 3) : fallbackSources;
  const moduleCount = catalog?.modules.length ?? 12;
  const guideCount = catalog?.premium_guides.length ?? 18;

  return (
    <SiteChrome>
      <section className="playbook-hero">
        <div className="hero-copy">
          <p className="eyebrow">IELTS strategy operating system</p>
          <h1>IELTS Playbook</h1>
          <p className="hero-summary">
            Understand the exam, choose the right test path, and turn scored simulator evidence into a realistic study
            sequence. Public guides explain the system; premium diagnostics decide what deserves your next hour.
          </p>
          <div className="hero-actions">
            <Link to="/onboarding" className="button button-primary">
              <Sparkles size={17} />
              Start Diagnostic
            </Link>
            <a href={`${SIMULATOR_APP_URL}?source=playbook`} className="button button-secondary">
              <Gauge size={17} />
              Open Simulator
            </a>
          </div>
        </div>

        <div className="hero-board" aria-label="IELTS Playbook overview">
          <article className="board-panel board-primary">
            <div className="board-topline">
              <span>Today</span>
              <span>Live strategy</span>
            </div>
            <h2>Band evidence becomes a study order.</h2>
            <p>Target band, deadline, weak skill, market rules, and simulator outcomes feed one recommendation.</p>
            <div className="skill-meter-list" aria-label="IELTS skill focus">
              {[
                ['Listening', 78],
                ['Reading', 70],
                ['Writing', 54],
                ['Speaking', 64],
              ].map(([label, value]) => (
                <div key={label} className="skill-meter">
                  <span>{label}</span>
                  <div>
                    <i style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <Link to="/diagnostic" className="board-panel board-action">
            <Target size={22} />
            <span>Next best action</span>
            <strong>Generate a priority map</strong>
            <ArrowRight size={18} className="panel-arrow" />
          </Link>

          <Link to="/test-types-booking" className="board-panel board-route">
            <Route size={22} />
            <span>Before booking</span>
            <strong>Academic, General, UKVI, OSR</strong>
          </Link>

          <article className="board-panel board-tags">
            {['Band 7+', 'Task 2', 'TFNG', 'Part 3', 'Retake', 'Deadline'].map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </article>
        </div>
      </section>

      <section className="section-band" id="modules">
        <div className="section-heading">
          <p className="eyebrow">Playbook library</p>
          <h2>Start with the module that removes the biggest uncertainty.</h2>
          <p>
            The structure is intentionally practical: exam decisions first, skill mechanics second, and study planning
            only after the bottleneck is visible.
          </p>
        </div>
        {error ? <p className="notice-banner">Live catalog unavailable, showing the core structure.</p> : null}
        <div className="module-showcase">
          {modules.map((module, index) => {
            const Icon = moduleIcons[index % moduleIcons.length] ?? BookOpenCheck;
            return (
              <Link key={module.id} to={`/${module.slug}`} className={`module-card${index === 0 ? ' module-card-featured' : ''}`}>
                <span className="card-icon">
                  <Icon size={18} />
                </span>
                <span className="card-kicker">{module.metadata?.hero_kicker ? String(module.metadata.hero_kicker) : 'Module'}</span>
                <h3>{module.title}</h3>
                <p>{module.summary}</p>
                <span className="card-link">
                  Open module
                  <ArrowRight size={15} />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="workflow-band">
        <article className="workflow-copy">
          <p className="eyebrow">Connected workflow</p>
          <h2>Strategy, simulation, and practice are one loop.</h2>
          <p>
            Run a scored mock, read the playbook interpretation, then move into targeted practice. The point is not more
            content; it is less guessing.
          </p>
          <div className="stat-strip">
            <article>
              <strong>{moduleCount}</strong>
              <span>core modules</span>
            </article>
            <article>
              <strong>{guideCount}</strong>
              <span>premium deep dives</span>
            </article>
            <article>
              <strong>4</strong>
              <span>skills mapped</span>
            </article>
          </div>
          <div className="inline-actions">
            <a href={`${SIMULATOR_APP_URL}?source=playbook`} className="button button-secondary">
              <Gauge size={17} />
              Simulator
            </a>
            <a href={`${PRACTICE_APP_URL}/dashboard?source=playbook`} className="button button-primary">
              <TrendingUp size={17} />
              Practice
            </a>
          </div>
        </article>

        <article className="source-panel">
          <p className="eyebrow">Verified updates</p>
          <h2>Source-linked IELTS guidance</h2>
          <div className="mini-feed">
            {recentSources.map((source, index) => (
              <a key={index} href={String((source as Record<string, unknown>).url ?? '#')} className="feed-item">
                <strong>{String((source as Record<string, unknown>).title ?? 'Source')}</strong>
                <span>{String((source as Record<string, unknown>).summary ?? '')}</span>
              </a>
            ))}
          </div>
        </article>
      </section>
    </SiteChrome>
  );
};
