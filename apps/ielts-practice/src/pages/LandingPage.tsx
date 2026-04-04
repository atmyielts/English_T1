import { Link } from 'react-router-dom';

const platformUrl = ((import.meta.env.VITE_PLATFORM_URL as string | undefined) ?? '').trim() || 'https://schood.online';

const authHref = `${platformUrl.replace(/\/$/, '')}/auth?mode=signin&product=ielts-practice&returnTo=${encodeURIComponent('https://practice.ielts.schood.online/dashboard')}`;
const pricingHref = `${platformUrl.replace(/\/$/, '')}/pricing?product=ielts-practice&returnTo=${encodeURIComponent('https://practice.ielts.schood.online/dashboard')}`;

export const LandingPage = () => {
  return (
    <div className="practice-root">
      <header className="top-nav glass">
        <a className="brand" href="https://schood.online">
          <img src="/schood-logo.png" alt="Schood" />
          <div>
            <strong>Schood IELTS Practice</strong>
            <span>Adaptive twin service for IELTS progression</span>
          </div>
        </a>
        <div className="top-nav-actions">
          <a href={authHref} className="btn ghost">Sign in</a>
          <a href={pricingHref} className="btn solid">Get access</a>
        </div>
      </header>

      <main className="landing-grid">
        <section className="hero-panel glass">
          <p className="eyebrow">Practice.ielts.schood.online</p>
          <h1>Stay band-focused with daily IELTS drills built from your real simulator outcomes.</h1>
          <p>
            Reading, Listening, and Writing loops stay connected to your target band. Every completed task contributes signals into
            your English personalization layer.
          </p>
          <div className="hero-actions">
            <Link to="/dashboard" className="btn solid">Open dashboard</Link>
            <Link to="/plan" className="btn ghost">See daily plan</Link>
          </div>
        </section>

        <section className="metric-panel glass">
          <article>
            <h3>Diagnostics</h3>
            <p>Weakness vectors by section and question type from scored IELTS simulator sessions.</p>
          </article>
          <article>
            <h3>Deterministic plans</h3>
            <p>Rule-weighted daily tasks with explicit rationale for each selected exercise.</p>
          </article>
          <article>
            <h3>Shared profile</h3>
            <p>Scored attempts emit `language.signal.v1` with `source_type=ielts.practice` into English scope.</p>
          </article>
        </section>

        <section className="cards-row">
          <article className="service-card glass reading">
            <h4>Reading</h4>
            <p>Question-type targeting for heading match, TFNG, completion, and more.</p>
          </article>
          <article className="service-card glass listening">
            <h4>Listening</h4>
            <p>Replay-focused drills aligned to concentration and speed weaknesses.</p>
          </article>
          <article className="service-card glass writing">
            <h4>Writing</h4>
            <p>Task loops with optional `grade-writing-v2` integration for tighter feedback.</p>
          </article>
        </section>
      </main>
    </div>
  );
};

