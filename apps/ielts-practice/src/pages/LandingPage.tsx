import { Link } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { IELTS_PRACTICE_PRODUCT_SLUG } from '../lib/constants';
import { buildPlatformUrl } from '../lib/platformUrls';
import { useAccess } from '../lib/useAccess';

const resolveDashboardReturnTo = (): string => {
  if (typeof window === 'undefined') return '/dashboard';
  return `${window.location.origin}/dashboard`;
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
        subtitle="Practice Labs for IELTS progression"
        brandHref="https://schood.online"
        actions={[
          status === 'authenticated'
            ? { id: 'dashboard', label: 'Dashboard', to: '/dashboard' }
            : { id: 'signin', label: 'Sign in', href: authHref },
          { id: 'access', label: 'Get access', href: pricingHref, variant: 'solid' },
        ]}
      />

      <main className="landing-grid">
        <section className="hero-panel glass">
          <p className="eyebrow">Practice.ielts.schood.online</p>
          <h1>Turn simulator results into focused IELTS Practice Labs.</h1>
          <p>
            Mistake Coach, Evidence Locator, Distractor Drill, Listening Replay, Writing Rewrite, Notebook, and Band Roadmap turn
            real Reading, Listening, and Writing source material into targeted repair work.
          </p>
          <div className="hero-actions">
            <Link to="/dashboard" className="btn solid">Open dashboard</Link>
            <Link to="/plan" className="btn ghost">See daily plan</Link>
          </div>
        </section>

        <section className="metric-panel glass">
          <article>
            <h3>Diagnostics</h3>
            <p>Section gaps, question-type weaknesses, recency, confidence, and target-band distance from simulator outcomes.</p>
          </article>
          <article>
            <h3>Lab plans</h3>
            <p>Daily tasks are selected from lab-ready builds and boosted by due notebook reviews and roadmap gaps.</p>
          </article>
          <article>
            <h3>Mastery loop</h3>
            <p>Submissions update mastery, mistake patterns, diagnostics, and the next recommended lab.</p>
          </article>
        </section>

        <section className="cards-row">
          <article className="service-card glass reading">
            <h4>Reading</h4>
            <p>Evidence-location, heading match, TFNG, completion, distractor elimination, timed mini, and mastery checks.</p>
          </article>
          <article className="service-card glass listening">
            <h4>Listening</h4>
            <p>Prediction, replay chunks, transcript/signpost checks, paraphrase repair, distractors, and timed mini tasks.</p>
          </article>
          <article className="service-card glass writing">
            <h4>Writing</h4>
            <p>Task analysis, plan builder, sentence and paragraph rewrite, full rewrite, and grade-writing-v2 feedback.</p>
          </article>
        </section>
      </main>
    </div>
  );
};

