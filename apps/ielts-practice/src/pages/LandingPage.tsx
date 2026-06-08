import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { IELTS_PRACTICE_PRODUCT_SLUG } from '../lib/constants';
import { buildPlatformUrl } from '../lib/platformUrls';
import { useAccess } from '../lib/useAccess';

const resolveDashboardReturnTo = (): string => {
  // Land signed-in learners on the guided daily session (the clear start→finish path),
  // not the dense analytics view.
  if (typeof window === 'undefined') return '/today';
  return `${window.location.origin}/today`;
};

const FULL_ROW = { gridColumn: '1 / -1' } as const;

const STATS: Array<{ value: string; label: string }> = [
  { value: '3', label: 'IELTS sections — Reading, Listening, Writing' },
  { value: 'Daily', label: 'Adaptive plan rebuilt from your results' },
  { value: 'AI', label: 'Band-level feedback on every submission' },
  { value: 'SRS', label: 'Spaced repetition keeps gains from slipping' },
];

const STEPS: Array<{ icon: typeof ClipboardList; title: string; copy: string }> = [
  {
    icon: ClipboardList,
    title: 'Take a mock',
    copy: 'Sit a full test in the IELTS Simulator. Your real answers become the raw material — no separate setup.',
  },
  {
    icon: Target,
    title: 'We diagnose the gaps',
    copy: 'Section bands, weak question types, recurring traps, and distance to your target band — all scored automatically.',
  },
  {
    icon: Sparkles,
    title: 'Daily labs repair them',
    copy: 'Short, focused drills aimed at exactly what you missed — evidence work, distractor traps, rewrites. Not another full mock.',
  },
  {
    icon: TrendingUp,
    title: 'Your band rises',
    copy: 'Every submission updates mastery, your mistake notebook, and tomorrow’s plan — so the system keeps catching up to you.',
  },
];

const LABS: Array<{ title: string; copy: string }> = [
  { title: 'Mistake Coach', copy: 'Explains why each lab was chosen and the trap to watch for.' },
  { title: 'Evidence Locator', copy: 'Prove every Reading answer with the exact sentence or paragraph.' },
  { title: 'Distractor Drill', copy: 'Classify wrong answers by trap type before moving on.' },
  { title: 'Listening Replay', copy: 'Predict, replay, catch the signposts, then answer.' },
  { title: 'Writing Rewrite', copy: 'Analyse, plan, rewrite, and get criterion-level feedback.' },
  { title: 'Mistake Notebook', copy: 'Keeps recurring patterns and due reviews in one place.' },
  { title: 'Band Roadmap', copy: 'Connects every gap to the lab that repairs it.' },
  { title: 'Spaced Review', copy: 'Leitner schedule resurfaces weak types right before you forget.' },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'How is this different from the IELTS Simulator?',
    a: 'The Simulator is for full, timed mock tests. Practice is for repairing what those mocks reveal — targeted drills on your weak question types, not another whole exam.',
  },
  {
    q: 'Do I need to take a mock first?',
    a: 'It works best right after a Simulator attempt, since your results drive the plan. But you can also generate a plan from your target band and start drilling straight away.',
  },
  {
    q: 'Which skills does it cover?',
    a: 'Reading, Listening, and Writing — with AI band-level feedback on writing. Speaking strategy lives in the IELTS Playbook.',
  },
  {
    q: 'How long is a daily session?',
    a: 'About 30 minutes: a short spaced-review warm-up, one focused lab, and a quick mastery check — with skip options at every step.',
  },
];

export const LandingPage = () => {
  const { status } = useAccess();
  const returnTo = resolveDashboardReturnTo();
  const authHref = buildPlatformUrl('/auth', returnTo, { mode: 'signin', product: IELTS_PRACTICE_PRODUCT_SLUG });
  const pricingHref = buildPlatformUrl('/pricing', returnTo, { product: IELTS_PRACTICE_PRODUCT_SLUG });
  const authed = status === 'authenticated';

  return (
    <div className="practice-root">
      <PracticeTopNav
        title="Schood IELTS Practice"
        subtitle="Targeted labs for IELTS growth"
        brandHref="https://schood.online"
        actions={[
          authed
            ? { id: 'today', label: 'Continue', to: '/today' }
            : { id: 'signin', label: 'Sign in', href: authHref },
          { id: 'access', label: 'Get access', href: pricingHref, variant: 'solid' },
        ]}
      />

      <main className="landing-grid">
        {/* Hero */}
        <section className="hero-panel glass">
          <p className="eyebrow">IELTS Practice Lab</p>
          <h1>From mock results to a sharper band — every session.</h1>
          <p>
            Every wrong answer in the simulator becomes a focused drill here.
            Spaced repetition keeps the patterns close; AI coaching tells you
            why each miss happened and what to do next time. Built for serious
            test-takers who want their study time to compound.
          </p>
          <div className="hero-actions">
            <Link to="/today" className="btn solid">Start today’s session</Link>
            <a href={pricingHref} className="btn ghost">See plans</a>
          </div>
        </section>

        {/* Value pillars */}
        <section className="metric-panel glass">
          <article>
            <h3>Diagnostic-led</h3>
            <p>Section gaps, type weaknesses, recency, and target-band distance all feed every day’s plan.</p>
          </article>
          <article>
            <h3>Repair, not retake</h3>
            <p>Strategy primers, evidence drills, distractor work, and writing rewrites — not another full mock.</p>
          </article>
          <article>
            <h3>Loop that learns</h3>
            <p>Each submission updates mastery, mistakes, and the next lab so the system keeps catching up to you.</p>
          </article>
        </section>

        {/* Trust / stat band */}
        <section className="glass" style={{ ...FULL_ROW, padding: 22 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 18,
              textAlign: 'center',
            }}
          >
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0e4955', lineHeight: 1 }}>{stat.value}</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="glass" style={{ ...FULL_ROW, padding: 28 }}>
          <p className="eyebrow">How it works</p>
          <h2 style={{ margin: '6px 0 18px', maxWidth: '24ch' }}>Four steps from a mock score to a higher band.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <article
                  key={step.title}
                  style={{ display: 'grid', gap: 8, alignContent: 'start', borderTop: '2px solid #0e4955', paddingTop: 14 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 26, height: 26, borderRadius: 999, background: '#0e4955', color: '#fff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                      }}
                    >
                      {i + 1}
                    </span>
                    <Icon size={18} style={{ color: '#0e4955' }} />
                  </div>
                  <strong style={{ fontSize: '1.02rem' }}>{step.title}</strong>
                  <p className="muted" style={{ margin: 0, fontSize: 14 }}>{step.copy}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* What's inside — lab showcase */}
        <section className="glass" style={{ ...FULL_ROW, padding: 28 }}>
          <p className="eyebrow">What’s inside</p>
          <h2 style={{ margin: '6px 0 6px', maxWidth: '26ch' }}>Labs that fix the specific way you lose marks.</h2>
          <p className="muted" style={{ marginTop: 0, maxWidth: '60ch' }}>
            Each lab targets a different failure mode — from finding textual evidence to rewriting weak paragraphs —
            so practice time goes straight to your gaps.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 16 }}>
            {LABS.map((lab) => (
              <article key={lab.title} className="service-card glass" style={{ display: 'grid', gap: 4 }}>
                <h4 style={{ margin: 0 }}>{lab.title}</h4>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{lab.copy}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Section coverage */}
        <section className="cards-row">
          <article className="service-card glass reading">
            <h4>Reading</h4>
            <p>Evidence locators, matching headings, TFNG, completion drills, distractor elimination, and timed mini tests.</p>
          </article>
          <article className="service-card glass listening">
            <h4>Listening</h4>
            <p>Prediction work, replay chunks, transcript and signpost checks, paraphrase repair, and timed mini tasks.</p>
          </article>
          <article className="service-card glass writing">
            <h4>Writing</h4>
            <p>Task analysis, plan building, sentence and paragraph rewrites, and AI-graded feedback against IELTS rubrics.</p>
          </article>
        </section>

        {/* FAQ */}
        <section className="glass" style={{ ...FULL_ROW, padding: 28 }}>
          <p className="eyebrow">FAQ</p>
          <h2 style={{ margin: '6px 0 18px' }}>Common questions</h2>
          <div style={{ display: 'grid', gap: 14 }}>
            {FAQS.map((item) => (
              <details key={item.q} style={{ borderBottom: '1px solid #e7e1d6', paddingBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, listStyle: 'revert' }}>{item.q}</summary>
                <p className="muted" style={{ margin: '8px 0 0', maxWidth: '70ch' }}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA band */}
        <section
          className="glass"
          style={{
            ...FULL_ROW,
            padding: 32,
            textAlign: 'center',
            background: 'linear-gradient(135deg, #0e4955, #11363f)',
            color: '#fff',
            display: 'grid',
            gap: 14,
            justifyItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, color: '#fff', maxWidth: '24ch' }}>Turn your next mock into your highest band yet.</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.82)', maxWidth: '56ch' }}>
            Start today’s guided session, or get access to unlock the full adaptive plan.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            {authed ? (
              <Link to="/today" className="btn solid">Start today’s session</Link>
            ) : (
              <a href={authHref} className="btn solid">Sign in to start</a>
            )}
            <a href={pricingHref} className="btn ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
              Get access
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};
