import { ArrowRight, Brain, NotebookTabs, Repeat, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LandingPage = () => (
  <main className="landing-page">
    <header className="landing-nav">
      <img src="/schood-logo.png" alt="Schood" />
      <strong>SAT Practice Lab</strong>
      <Link to="/dashboard" className="btn ghost">Open app</Link>
    </header>
    <section className="landing-hero">
      <div>
        <p className="eyebrow">Schood SAT</p>
        <h1>SAT Practice Lab</h1>
        <p>
          Adaptive drills, mistake notebook, spaced reviews, and AI explanations built around the full SAT simulator.
        </p>
        <div className="hero-actions">
          <Link to="/dashboard" className="btn solid">
            Start practice
            <ArrowRight size={17} />
          </Link>
          <a className="btn ghost" href="https://sat.schood.online">Take a mock first</a>
        </div>
      </div>
    </section>
    <section className="feature-grid">
      {[
        { icon: Brain, title: 'Adaptive drills', copy: 'Escalates by rolling accuracy across Reading & Writing and Math.' },
        { icon: NotebookTabs, title: 'Mistake notebook', copy: 'Missed simulator and lab questions become retryable evidence.' },
        { icon: Repeat, title: 'Spaced review', copy: 'Leitner queue keeps repaired skills from slipping.' },
        { icon: Sparkles, title: 'AI tutor', copy: 'Explain, simplify, generate similar, and diagnose why wrong.' },
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
