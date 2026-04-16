import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, PlayCircle, Sparkles } from 'lucide-react';
import { buildPlatformUrl, hasPlatformBase } from '../lib/platformUrls';
import { IELTS_PRODUCT_ID, IELTS_PRODUCT_SLUG } from '../lib/constants';
import { useAccess } from '../lib/useAccess';
import type { MeResponse } from '../lib/platformClient';

type Feature = { title: string; description: string };
type Step = { title: string; description: string };

const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';

const hasProductEntitlement = (me: MeResponse | null, productId: string): boolean =>
  Boolean(me?.entitlements?.some((e) => e.resource_type === 'product' && e.resource_id === productId));

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { status, me } = useAccess();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const authed = status === 'authenticated';
  const hasAccess = hasProductEntitlement(me, IELTS_PRODUCT_ID);

  const goPlatform = (path: string) => {
    const url = buildPlatformUrl(path, undefined, { product: IELTS_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return;
    }
    navigate(url);
  };

  const goPlatformHome = () => {
    if (hasPlatformBase) {
      const url = buildPlatformUrl('/', undefined, { product: IELTS_PRODUCT_SLUG });
      window.location.assign(url);
      return;
    }
    navigate('/platform-home');
  };

  const primaryAction = () => {
    if (!authed) {
      goPlatform('/auth');
      return;
    }
    if (!hasAccess) {
      goPlatform('/pricing');
      return;
    }
    navigate('/dashboard');
  };

  const primaryLabel = useMemo(() => {
    if (!authed) return 'Sign in to start';
    if (!hasAccess) return 'View plans';
    return 'Open dashboard';
  }, [authed, hasAccess]);

  const features: Feature[] = [
    {
      title: 'Exam-accurate pacing',
      description: 'Timed sections with autosave and realistic transitions for Listening, Reading, and Writing.',
    },
    {
      title: 'Section practice',
      description: 'Train a single section when time is tight, then return for full mock sessions.',
    },
    {
      title: 'Review and improve',
      description: 'Instant results for objective answers and optional writing feedback after submission.',
    },
  ];

  const steps: Step[] = [
    { title: 'Choose a plan', description: 'Pick a subscription that fits your schedule and goals.' },
    { title: 'Start a session', description: 'Take a full mock or practice a single section.' },
    { title: 'Review and refine', description: 'See results, learn from feedback, and repeat.' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 font-space">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl float-slow" />
        <div className="absolute top-20 -left-20 h-64 w-64 rounded-full bg-amber-200/40 blur-3xl float-slower" />
        <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-slate-200/60 blur-3xl" />
      </div>

      <header className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b border-white/70">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="text-sm font-semibold tracking-wide font-space">
            <button type="button" onClick={() => navigate('/')} className="hover:opacity-80">
              <span className="text-emerald-600">Schood</span>{' '}
              <span className="text-gray-900">IELTS</span>
            </button>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-gray-700">
            <a href="#features" className="hover:text-gray-900">Features</a>
            <a href="#practice" className="hover:text-gray-900">Practice</a>
            <a href="#how" className="hover:text-gray-900">How it works</a>
            <button onClick={goPlatformHome} className="hover:text-gray-900">Platform</button>
            {authed && hasAccess ? (
              <button onClick={() => navigate('/dashboard')} className="px-4 py-2 rounded-full bg-gray-900 text-white">
                Dashboard
              </button>
            ) : (
              <button onClick={() => goPlatform('/pricing')} className="px-4 py-2 rounded-full border border-gray-300 bg-white">
                Pricing
              </button>
            )}
          </nav>
          <button
            type="button"
            className="md:hidden px-3 py-2 rounded-full border border-gray-200 bg-white text-sm font-semibold"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-expanded={mobileMenuOpen}
            aria-controls="ielts-landing-mobile-nav"
          >
            Menu
          </button>
        </div>
        {mobileMenuOpen ? (
          <div id="ielts-landing-mobile-nav" className="md:hidden mx-4 mb-4 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-sm space-y-2">
            <a
              href="#features"
              className="block px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#practice"
              className="block px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800"
              onClick={() => setMobileMenuOpen(false)}
            >
              Practice
            </a>
            <a
              href="#how"
              className="block px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800"
              onClick={() => setMobileMenuOpen(false)}
            >
              How it works
            </a>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                goPlatformHome();
              }}
              className="w-full text-left px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800"
            >
              Platform
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                primaryAction();
              }}
              className="w-full text-left px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold"
            >
              {primaryLabel}
            </button>
          </div>
        ) : null}
      </header>

      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-6 pt-14 pb-16 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-emerald-900 bg-emerald-100/80 border border-emerald-200 rounded-full px-3 py-1 hero-fade hero-fade-1">
              <Sparkles size={14} /> IELTS Academic simulator
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold leading-tight text-gray-900 hero-fade hero-fade-2">
              Train with <span className="text-emerald-600">real exam pacing</span> and a calm, focused interface.
            </h1>
            <p className="text-gray-600 text-lg max-w-xl hero-fade hero-fade-3">
              Practice Listening, Reading, and Writing with strict timers, autosave, and realistic review flows.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 hero-fade hero-fade-3">
              <button
                onClick={primaryAction}
                className="px-6 py-3 rounded-2xl bg-gray-900 text-white font-semibold flex items-center justify-center gap-2"
              >
                {primaryLabel}
                <ArrowRight size={16} />
              </button>
              <a
                href={`${PLAYBOOK_URL}/essentials?source=simulator`}
                className="px-6 py-3 rounded-2xl border border-gray-200 bg-white/70 text-gray-900 font-semibold text-center"
              >
                Open playbook
              </a>
              <button
                onClick={() => navigate('/practice')}
                className="px-6 py-3 rounded-2xl border border-gray-200 bg-white/70 text-gray-900 font-semibold"
              >
                Try section practice
              </button>
              <button
                onClick={() => goPlatform('/contact')}
                className="px-6 py-3 rounded-2xl border border-gray-200 bg-white/70 text-gray-900 font-semibold"
              >
                Contact support
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: '3 sections', value: 'Listening • Reading • Writing' },
                { label: 'Full mock', value: 'Real timing and autosave' },
                { label: 'Results', value: 'Review with feedback' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-gray-200 bg-white/80 p-3 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{item.label}</div>
                  <div className="text-sm font-semibold text-gray-900 mt-1">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative rounded-[28px] border border-white/60 bg-white/80 shadow-xl backdrop-blur p-6">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
                <span className="uppercase tracking-wider">Exam preview</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-900 text-white px-3 py-1 text-[11px]">
                  48:12 left
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Reading passage</div>
                  <p className="text-sm text-gray-700 mt-3 leading-relaxed">
                    The city introduced a new transport plan to reduce congestion and improve air quality. Researchers noted
                    that small policy changes can create large impacts over time.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Highlight mode ready
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Question 12</div>
                  <p className="text-sm text-gray-800 font-semibold mt-3">
                    Choose <span className="text-emerald-600">TRUE</span>, <span className="text-emerald-600">FALSE</span>, or{' '}
                    <span className="text-emerald-600">NOT GIVEN</span>.
                  </p>
                  <div className="mt-4 space-y-2 text-sm text-gray-600">
                    <div className="rounded-xl border border-gray-200 px-3 py-2">TRUE</div>
                    <div className="rounded-xl border border-gray-200 px-3 py-2">FALSE</div>
                    <div className="rounded-xl border border-gray-200 px-3 py-2 bg-emerald-50 border-emerald-200 text-emerald-800">
                      NOT GIVEN
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-900 text-white p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/60">Next section</div>
                  <div className="text-lg font-semibold">Listening Part 2</div>
                </div>
                <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                  <PlayCircle size={22} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                <div className="text-lg font-semibold text-gray-900">{f.title}</div>
                <p className="text-sm text-gray-600 mt-2">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="practice" className="mx-auto max-w-6xl px-6 pb-16">
          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-7">
              <h2 className="text-2xl font-semibold text-gray-900">Practice exactly the section you need.</h2>
              <p className="text-gray-600 mt-2">
                Short on time? Start Listening, Reading, or Writing individually, then come back for a full mock.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/practice" className="px-4 py-2 rounded-2xl bg-gray-900 text-white font-semibold">
                  Start practice
                </Link>
                <Link to="/full-exam" className="px-4 py-2 rounded-2xl border border-gray-200 font-semibold">
                  Full mock exam
                </Link>
              </div>
            </div>
            <div className="md:col-span-5 bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
              <div className="text-sm font-semibold text-emerald-800">What you get</div>
              <ul className="mt-3 space-y-2 text-sm text-emerald-800">
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5" /> Section timers and autosave</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5" /> Review screen with answers</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5" /> Writing feedback if enabled</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((s, idx) => (
              <div key={s.title} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                <div className="text-sm font-semibold text-gray-500">Step {idx + 1}</div>
                <div className="text-lg font-semibold text-gray-900 mt-2">{s.title}</div>
                <p className="text-sm text-gray-600 mt-2">{s.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="rounded-3xl bg-gray-900 text-white p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-semibold">Ready to practice like the real exam?</h3>
              <p className="text-white/80 mt-2">Open the simulator and start your next session now.</p>
            </div>
            <button
              onClick={primaryAction}
              className="px-6 py-3 rounded-2xl bg-white text-gray-900 font-semibold"
            >
              {primaryLabel}
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white/80">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-gray-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/')} className="hover:text-gray-700">
            IELTS Simulator by Schood
          </button>
          <div className="flex items-center gap-4">
            <button onClick={() => goPlatform('/pricing')} className="hover:text-gray-700">Plans</button>
            <button onClick={() => goPlatform('/account')} className="hover:text-gray-700">Account</button>
            <button onClick={goPlatformHome} className="hover:text-gray-700">Platform home</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
