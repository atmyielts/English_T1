import { Link } from 'react-router-dom';
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

export const LandingPage = () => {
  const { status } = useAccess();
  const returnTo = resolveDashboardReturnTo();
  const authHref = buildPlatformUrl('/auth', returnTo, { mode: 'signin', product: IELTS_PRACTICE_PRODUCT_SLUG });
  const pricingHref = buildPlatformUrl('/pricing', returnTo, { product: IELTS_PRACTICE_PRODUCT_SLUG });

  return (
    <div className="practice-root">
      <PracticeTopNav
        title="Schood IELTS Practice"
        subtitle="Targeted labs for IELTS growth"
        brandHref="https://schood.online"
        actions={[
          status === 'authenticated'
            ? { id: 'today', label: 'Continue', to: '/today' }
            : { id: 'signin', label: 'Sign in', href: authHref },
          { id: 'access', label: 'Get access', href: pricingHref, variant: 'solid' },
        ]}
      />

      <main className="landing-grid">
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
            <Link to="/dashboard" className="btn ghost">View progress</Link>
          </div>
        </section>

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
      </main>
    </div>
  );
};

