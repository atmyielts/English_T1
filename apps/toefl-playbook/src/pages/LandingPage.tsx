import { ArrowRight, BookOpenCheck, Compass, Map, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LandingPage = () => (
  <main className="landing-page">
    <header className="landing-nav">
      <img src="/schood-logo.png" alt="Schood" />
      <strong>TOEFL Playbook</strong>
      <Link to="/dashboard" className="btn ghost">Open app</Link>
    </header>
    <section className="landing-hero">
      <div>
        <p className="eyebrow">Schood TOEFL</p>
        <h1>TOEFL Playbook</h1>
        <p>
          Authoritative TOEFL iBT strategy, a diagnostic that reads your simulator results, and a personalised
          study plan that targets the skills worth the most points.
        </p>
        <div className="hero-actions">
          <Link to="/dashboard" className="btn solid">
            Open my plan
            <ArrowRight size={17} />
          </Link>
          <a className="btn ghost" href="https://toefl.schood.online">Take a mock first</a>
        </div>
      </div>
    </section>
    <section className="feature-grid">
      {[
        { icon: Compass, title: 'Know the iBT', copy: 'Format, scoring engine, and what actually moves your score.' },
        { icon: Target, title: 'Target the right skills', copy: 'Reading, Listening, Speaking, Writing ranked by point-impact for you.' },
        { icon: Map, title: 'Personal study plan', copy: 'Built from your score goal, test date, and diagnostic.' },
        { icon: BookOpenCheck, title: 'Strategy modules', copy: 'Deep guides per skill, with test-day protocol.' },
      ].map((item) => {
        const Icon = item.icon;
        return (
          <article className="feature-card" key={item.title}>
            <Icon size={22} />
            <h2>{item.title}</h2>
            <p>{item.copy}</p>
          </article>
        );
      })}
    </section>
  </main>
);
