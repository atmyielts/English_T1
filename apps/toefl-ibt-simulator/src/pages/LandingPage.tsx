import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Headphones, Sparkles } from 'lucide-react';
import { buildPlatformUrl, hasPlatformBase } from '../lib/platformUrls';
import { TOEFL_IBT_PRODUCT_ID, TOEFL_IBT_PRODUCT_SLUG } from '../lib/constants';
import { useAccess } from '../lib/useAccess';
import type { MeResponse } from '../lib/platformClient';

type Feature = { title: string; description: string };
type Step = { title: string; description: string };

const hasProductEntitlement = (me: MeResponse | null, productId: string): boolean =>
  Boolean(me?.entitlements?.some((e) => e.resource_type === 'product' && e.resource_id === productId));

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { status, me } = useAccess();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const authed = status === 'authenticated';
  const hasAccess = hasProductEntitlement(me, TOEFL_IBT_PRODUCT_ID);

  const goPlatform = (path: string) => {
    setMobileMenuOpen(false);
    const url = buildPlatformUrl(path, undefined, { product: TOEFL_IBT_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return;
    }
    navigate(url);
  };

  const goPlatformHome = () => {
    setMobileMenuOpen(false);
    if (hasPlatformBase) {
      const url = buildPlatformUrl('/', undefined, { product: TOEFL_IBT_PRODUCT_SLUG });
      window.location.assign(url);
      return;
    }
    navigate('/platform-home');
  };

  const primaryAction = () => {
    setMobileMenuOpen(false);
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
      title: 'Integrated TOEFL flow',
      description: 'Reading, Listening, and Writing in one consistent exam workspace.',
    },
    {
      title: 'Strict timing + autosave',
      description: 'Section timers and reliable autosave keep your simulation close to test-day pressure.',
    },
    {
      title: 'Actionable review',
      description: 'Objective scoring for auto-gradable sections plus writing feedback when enabled.',
    },
  ];

  const steps: Step[] = [
    { title: 'Choose a plan', description: 'Unlock TOEFL iBT access for your account.' },
    { title: 'Run practice or full test', description: 'Train one section or complete a full simulation.' },
    { title: 'Review and improve', description: 'Inspect your results and target the next weak area.' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f1e8]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-orange-300/35 blur-3xl" />
        <div className="absolute top-32 -left-20 h-80 w-80 rounded-full bg-amber-200/35 blur-3xl" />
        <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-stone-300/35 blur-3xl" />
      </div>

      <header className="sticky top-0 z-30 border-b border-[#d7c7b3] bg-[#f7f1e8]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button type="button" onClick={() => navigate('/')} className="text-left">
            <div className="text-sm font-semibold tracking-wide">
              <span className="text-[#c2410c]">Schood</span>{' '}
              <span className="text-[#2b2925]">TOEFL iBT</span>
            </div>
          </button>

          <nav className="hidden items-center gap-6 text-sm font-semibold text-[#5c5144] md:flex">
            <a href="#features" className="hover:text-[#2b2925]">Features</a>
            <a href="#practice" className="hover:text-[#2b2925]">Practice</a>
            <a href="#how" className="hover:text-[#2b2925]">How it works</a>
            <button onClick={goPlatformHome} className="hover:text-[#2b2925]">Platform</button>
            {authed && hasAccess ? (
              <button onClick={() => navigate('/dashboard')} className="rounded-full bg-[#2b2925] px-4 py-2 text-white">
                Dashboard
              </button>
            ) : (
              <button onClick={() => goPlatform('/pricing')} className="rounded-full border border-[#d7c7b3] bg-white px-4 py-2 text-[#2b2925]">
                Pricing
              </button>
            )}
          </nav>

          <button
            type="button"
            className="rounded-full border border-[#d7c7b3] bg-white px-3 py-2 text-sm font-semibold md:hidden"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-expanded={mobileMenuOpen}
            aria-controls="toefl-landing-mobile-nav"
          >
            Menu
          </button>
        </div>

        {mobileMenuOpen ? (
          <div id="toefl-landing-mobile-nav" className="mx-4 mb-4 space-y-2 rounded-2xl border border-[#d7c7b3] bg-white/95 p-3 shadow-sm md:hidden">
            <a
              href="#features"
              className="block rounded-xl border border-[#e4d7c6] px-3 py-2 text-sm font-semibold text-[#3d362f]"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#practice"
              className="block rounded-xl border border-[#e4d7c6] px-3 py-2 text-sm font-semibold text-[#3d362f]"
              onClick={() => setMobileMenuOpen(false)}
            >
              Practice
            </a>
            <a
              href="#how"
              className="block rounded-xl border border-[#e4d7c6] px-3 py-2 text-sm font-semibold text-[#3d362f]"
              onClick={() => setMobileMenuOpen(false)}
            >
              How it works
            </a>
            <button
              onClick={goPlatformHome}
              className="w-full rounded-xl border border-[#e4d7c6] px-3 py-2 text-left text-sm font-semibold text-[#3d362f]"
            >
              Platform
            </button>
            <button
              onClick={primaryAction}
              className="w-full rounded-xl bg-[#c2410c] px-3 py-2 text-left text-sm font-semibold text-white"
            >
              {primaryLabel}
            </button>
          </div>
        ) : null}
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 pb-16 pt-14 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-6">
            <div className="hero-fade hero-fade-1 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#9a3412]">
              <Sparkles size={14} /> TOEFL iBT simulator
            </div>

            <h1 className="hero-fade hero-fade-2 text-4xl font-semibold leading-tight text-[#2b2925] md:text-5xl lg:text-6xl">
              Build confidence for <span className="text-[#c2410c]">test day</span> with focused TOEFL practice.
            </h1>

            <p className="hero-fade hero-fade-3 max-w-xl text-lg text-[#625749]">
              Practice TOEFL Reading, Listening, and Writing in a warm, distraction-free interface with realistic timing and clean review flow.
            </p>

            <div className="hero-fade hero-fade-3 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={primaryAction}
                className="flex items-center justify-center gap-2 rounded-2xl bg-[#2b2925] px-6 py-3 font-semibold text-white"
              >
                {primaryLabel}
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() => navigate('/practice')}
                className="rounded-2xl border border-[#d7c7b3] bg-white/80 px-6 py-3 font-semibold text-[#2b2925]"
              >
                Try section practice
              </button>
              <button
                onClick={() => goPlatform('/contact')}
                className="rounded-2xl border border-[#d7c7b3] bg-white/80 px-6 py-3 font-semibold text-[#2b2925]"
              >
                Contact support
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: '3 skills', value: 'Reading - Listening - Writing' },
                { label: 'Simulation', value: 'Section timers and autosave' },
                { label: 'Review', value: 'Progress and scoring insights' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-[#ddcfbf] bg-white/85 p-3 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8b7e70]">{item.label}</div>
                  <div className="mt-1 text-sm font-semibold text-[#2b2925]">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-[28px] border border-[#ddcfbf] bg-white/90 p-6 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#7a6d5d]">
                <span>Session preview</span>
                <span className="rounded-full bg-[#2b2925] px-3 py-1 text-[11px] text-white">Live timing</span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#e7dccf] bg-[#fffaf4] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8b7e70]">Listening note</div>
                  <p className="mt-3 text-sm leading-relaxed text-[#5d5246]">
                    Lecture excerpt appears with timed playback, then you answer integrated questions with quick review.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-[#7a6d5d]">
                    <Headphones size={14} className="text-[#c2410c]" />
                    Audio controls ready
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e7dccf] bg-[#fffaf4] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8b7e70]">Writing task</div>
                  <p className="mt-3 text-sm font-semibold text-[#3f372f]">
                    Read source prompts, then submit integrated and academic discussion responses in timed blocks.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-[#7a6d5d]">
                    <CheckCircle2 size={14} className="text-[#c2410c]" />
                    Two writing tasks per full test
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between rounded-2xl border border-[#2b2925]/10 bg-[#2b2925] p-4 text-white">
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/65">Next block</div>
                  <div className="text-lg font-semibold">Integrated Writing</div>
                </div>
                <button
                  onClick={() => navigate('/full-exam')}
                  className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/20"
                >
                  Open
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-3xl border border-[#ddcfbf] bg-white/85 p-6 shadow-sm">
                <div className="text-lg font-semibold text-[#2b2925]">{feature.title}</div>
                <p className="mt-2 text-sm text-[#625749]">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="practice" className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid grid-cols-1 gap-6 rounded-3xl border border-[#ddcfbf] bg-white/90 p-8 shadow-sm md:grid-cols-12">
            <div className="md:col-span-7">
              <h2 className="text-2xl font-semibold text-[#2b2925]">Practice the exact section you need.</h2>
              <p className="mt-2 text-[#625749]">
                Focus on one TOEFL skill when time is limited, then return for a complete full-length simulation.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/practice" className="rounded-2xl bg-[#2b2925] px-4 py-2 font-semibold text-white">
                  Start practice
                </Link>
                <Link to="/full-exam" className="rounded-2xl border border-[#d7c7b3] px-4 py-2 font-semibold text-[#2b2925]">
                  Full simulation
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 md:col-span-5">
              <div className="text-sm font-semibold text-[#9a3412]">What you get</div>
              <ul className="mt-3 space-y-2 text-sm text-[#9a3412]">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5" />
                  Timed section flow with autosave
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5" />
                  Clear results and review pages
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5" />
                  Writing feedback pipeline (if enabled)
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {steps.map((step, idx) => (
              <div key={step.title} className="rounded-3xl border border-[#ddcfbf] bg-white/85 p-6 shadow-sm">
                <div className="text-sm font-semibold text-[#8b7e70]">Step {idx + 1}</div>
                <div className="mt-2 text-lg font-semibold text-[#2b2925]">{step.title}</div>
                <p className="mt-2 text-sm text-[#625749]">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-[#2b2925] p-8 text-white md:flex-row md:items-center md:p-10">
            <div>
              <h3 className="text-2xl font-semibold">Ready to train for TOEFL iBT with real pacing?</h3>
              <p className="mt-2 text-white/80">Open your workspace and start your next focused session now.</p>
            </div>
            <button
              onClick={primaryAction}
              className="rounded-2xl bg-white px-6 py-3 font-semibold text-[#2b2925]"
            >
              {primaryLabel}
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#ddcfbf] bg-white/85">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 py-6 text-sm text-[#7a6d5d] sm:flex-row sm:items-center">
          <button type="button" onClick={() => navigate('/')} className="hover:text-[#4b4238]">
            TOEFL iBT Simulator by Schood
          </button>
          <div className="flex items-center gap-4">
            <button onClick={() => goPlatform('/pricing')} className="hover:text-[#4b4238]">Plans</button>
            <button onClick={() => goPlatform('/account')} className="hover:text-[#4b4238]">Account</button>
            <button onClick={goPlatformHome} className="hover:text-[#4b4238]">Platform home</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

