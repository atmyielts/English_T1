import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Calculator,
  ChevronDown,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { buildPlatformUrl, hasPlatformBase } from '../lib/platformUrls';
import { SAT_PRODUCT_ID, SAT_PRODUCT_SLUG } from '../lib/constants';
import { useAccess } from '../lib/useAccess';
import type { MeResponse } from '../lib/platformClient';

const hasProductEntitlement = (me: MeResponse | null, productId: string): boolean =>
  Boolean(me?.entitlements?.some((e) => e.resource_type === 'product' && e.resource_id === productId));

const productPills = ['Reading & Writing', 'Math', 'Full SAT', 'Score Review'];

const cards = [
  {
    title: 'Reading & Writing Module Drills',
    subtitle: 'Skill blocks and mixed passages',
    tone: 'bg-rose-100/90 border-rose-200',
  },
  {
    title: 'Math Module Practice',
    subtitle: 'Algebra, advanced math, problem solving',
    tone: 'bg-amber-100/90 border-amber-200',
  },
  {
    title: 'Adaptive Full-Length Mocks',
    subtitle: 'Digital SAT pacing and section transitions',
    tone: 'bg-indigo-100/90 border-indigo-200',
  },
  {
    title: 'Score Breakdown + Review',
    subtitle: 'See weak domains and missed question types',
    tone: 'bg-emerald-100/90 border-emerald-200',
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { status, me } = useAccess();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const authed = status === 'authenticated';
  const hasAccess = hasProductEntitlement(me, SAT_PRODUCT_ID);

  const goPlatform = (path: string) => {
    setMobileMenuOpen(false);
    const url = buildPlatformUrl(path, undefined, { product: SAT_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return;
    }
    navigate(url);
  };

  const goPlatformHome = () => {
    setMobileMenuOpen(false);
    if (hasPlatformBase) {
      const url = buildPlatformUrl('/', undefined, { product: SAT_PRODUCT_SLUG });
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

  const mobilePrimaryLabel = useMemo(() => {
    if (!authed) return 'Sign in';
    if (!hasAccess) return 'Plans';
    return 'Dashboard';
  }, [authed, hasAccess]);

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-[#111827]">
      <header className="sticky top-0 z-30 border-b border-[#151d2b]/10 bg-[#f6f1e8]/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <div className="hidden md:flex items-center justify-between gap-3">
            <button type="button" onClick={() => navigate('/')} className="text-sm font-semibold tracking-wide hover:opacity-80">
              <span className="text-[#0f172a]">Schood</span> <span className="text-[#475569]">SAT</span>
            </button>
            <div className="flex items-center gap-3 text-sm">
              <button onClick={goPlatformHome} className="px-3 py-2 rounded-full hover:bg-white/70">
                Platform
              </button>
              <button onClick={() => goPlatform('/pricing')} className="px-3 py-2 rounded-full hover:bg-white/70">
                Pricing
              </button>
              <button onClick={() => goPlatform('/contact')} className="px-3 py-2 rounded-full hover:bg-white/70">
                Contact
              </button>
              <button
                onClick={primaryAction}
                className="px-4 py-2 rounded-full bg-[#0f172a] text-white font-semibold"
              >
                {primaryLabel}
              </button>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => navigate('/')} className="text-sm font-semibold tracking-wide hover:opacity-80">
                <span className="text-[#0f172a]">Schood</span> <span className="text-[#475569]">SAT</span>
              </button>
              <button
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="px-4 py-2 rounded-2xl border border-[#151d2b]/15 bg-white/85 text-[#111827] text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1.5"
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle quick actions"
              >
                Actions
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${mobileMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            <div className={`overflow-hidden transition-all duration-200 ${mobileMenuOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="rounded-2xl border border-[#151d2b]/12 bg-white/65 p-2 space-y-2">
                <button
                  onClick={primaryAction}
                  className="w-full min-h-10 rounded-xl bg-[#0f172a] text-white text-sm font-semibold"
                >
                  {mobilePrimaryLabel}
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={goPlatformHome}
                    className="min-h-9 rounded-xl border border-[#151d2b]/10 bg-white/90 text-xs font-semibold"
                  >
                    Platform
                  </button>
                  <button
                    onClick={() => goPlatform('/pricing')}
                    className="min-h-9 rounded-xl border border-[#151d2b]/10 bg-white/90 text-xs font-semibold"
                  >
                    Pricing
                  </button>
                  <button
                    onClick={() => goPlatform('/contact')}
                    className="min-h-9 rounded-xl border border-[#151d2b]/10 bg-white/90 text-xs font-semibold"
                  >
                    Contact
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10 lg:py-12">
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-7">
          <div className="xl:col-span-8">
            <div className="rounded-[30px] border border-[#151d2b]/15 bg-white/70 p-6 sm:p-7 md:p-10">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] font-semibold text-[#475569] bg-white rounded-full px-3 py-1.5 border border-[#151d2b]/10">
                <Sparkles size={14} />
                Digital SAT exam simulator
              </div>

              <h1 className="mt-5 text-3xl sm:text-4xl md:text-6xl font-semibold leading-tight hero-fade hero-fade-2">
                Invest in your SAT score with focused, adaptive practice.
              </h1>
              <p className="mt-5 text-[#475569] text-base sm:text-lg max-w-3xl hero-fade hero-fade-3">
                Train with SAT-style modules, strict pacing, autosave, and instant analytics for Reading and Writing plus
                Math.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {productPills.map((pill, index) => (
                  <div
                    key={pill}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                      index === 0 ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white/80 border-[#151d2b]/15 text-[#334155]'
                    }`}
                  >
                    {pill}
                  </div>
                ))}
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                {cards.map((card) => (
                  <div key={card.title} className={`rounded-3xl border p-5 ${card.tone}`}>
                    <div className="text-xl font-semibold text-[#111827]">{card.title}</div>
                    <div className="mt-2 text-sm text-[#334155]">{card.subtitle}</div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={primaryAction}
                  className="px-6 py-3 rounded-2xl bg-[#0f172a] text-white font-semibold flex items-center justify-center gap-2"
                >
                  {primaryLabel}
                  <ArrowRight size={16} />
                </button>
                <Link
                  to="/practice"
                  className="px-6 py-3 rounded-2xl border border-[#151d2b]/15 bg-white/80 font-semibold text-center"
                >
                  Try module practice
                </Link>
                <button
                  onClick={() => goPlatform('/contact')}
                  className="px-6 py-3 rounded-2xl border border-[#151d2b]/15 bg-white/80 font-semibold"
                >
                  Contact support
                </button>
              </div>
            </div>
          </div>

          <div className="xl:col-span-4">
            <div className="rounded-[30px] border border-[#151d2b]/15 bg-white/70 p-6 md:sticky md:top-24">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">SAT desk</div>
                <div className="text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1">Live</div>
              </div>
              <div className="mt-4 text-xl font-semibold">Today focus: Math Module 2</div>
              <div className="mt-2 text-sm text-[#475569]">Estimated remaining: 34 minutes</div>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-[#151d2b]/10 bg-white p-4">
                  <div className="text-sm font-semibold flex items-center gap-2"><BookOpen size={15} /> Reading & Writing</div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full w-[68%] bg-rose-300 rounded-full" />
                  </div>
                  <div className="mt-2 text-xs text-[#64748b]">68% recent accuracy</div>
                </div>
                <div className="rounded-2xl border border-[#151d2b]/10 bg-white p-4">
                  <div className="text-sm font-semibold flex items-center gap-2"><Calculator size={15} /> Math</div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full w-[74%] bg-emerald-300 rounded-full" />
                  </div>
                  <div className="mt-2 text-xs text-[#64748b]">74% recent accuracy</div>
                </div>
                <div className="rounded-2xl border border-[#151d2b]/10 bg-white p-4">
                  <div className="text-sm font-semibold flex items-center gap-2"><Clock3 size={15} /> Time management</div>
                  <div className="mt-2 text-xs text-[#64748b]">Average 1m 08s per question over the last 3 sessions.</div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => navigate('/full-exam')}
                  className="px-3 py-2.5 rounded-xl bg-[#0f172a] text-white text-sm font-semibold"
                >
                  Full test
                </button>
                <button
                  onClick={() => navigate('/review')}
                  className="px-3 py-2.5 rounded-xl border border-[#151d2b]/15 bg-white text-sm font-semibold"
                >
                  Review
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-9 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-3xl border border-[#151d2b]/15 bg-white/75 p-6">
            <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">SAT structure</div>
            <div className="mt-2 text-lg font-semibold">2 sections / 4 modules</div>
            <div className="mt-2 text-sm text-[#475569]">Reading & Writing (2 modules) plus Math (2 modules).</div>
          </div>
          <div className="rounded-3xl border border-[#151d2b]/15 bg-white/75 p-6">
            <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Timing</div>
            <div className="mt-2 text-lg font-semibold">Real pacing + autosave</div>
            <div className="mt-2 text-sm text-[#475569]">Every module tracks time and preserves in-progress answers.</div>
          </div>
          <div className="rounded-3xl border border-[#151d2b]/15 bg-white/75 p-6">
            <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Analytics</div>
            <div className="mt-2 text-lg font-semibold">Domain-level score insights</div>
            <div className="mt-2 text-sm text-[#475569]">See error patterns by skill to target your next practice.</div>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-[#151d2b]/15 bg-[#111827] text-white p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-white/70 font-semibold">
              <GraduationCap size={14} />
              Built for exam day confidence
            </div>
            <h2 className="mt-3 text-2xl md:text-3xl font-semibold">Start SAT practice now and track each improvement.</h2>
          </div>
          <button
            onClick={primaryAction}
            className="px-6 py-3 rounded-2xl bg-white text-[#111827] font-semibold whitespace-nowrap"
          >
            {primaryLabel}
          </button>
        </section>

        <section className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-3xl border border-[#151d2b]/15 bg-white/75 p-6">
            <div className="text-sm font-semibold flex items-center gap-2"><CheckCircle2 size={16} /> Step 1</div>
            <div className="mt-2 text-lg font-semibold">Choose your plan</div>
            <div className="mt-1 text-sm text-[#475569]">Unlock SAT service and open your dashboard.</div>
          </div>
          <div className="rounded-3xl border border-[#151d2b]/15 bg-white/75 p-6">
            <div className="text-sm font-semibold flex items-center gap-2"><BarChart3 size={16} /> Step 2</div>
            <div className="mt-2 text-lg font-semibold">Practice by module</div>
            <div className="mt-1 text-sm text-[#475569]">Run focused drills for Reading & Writing or Math.</div>
          </div>
          <div className="rounded-3xl border border-[#151d2b]/15 bg-white/75 p-6">
            <div className="text-sm font-semibold flex items-center gap-2"><Sparkles size={16} /> Step 3</div>
            <div className="mt-2 text-lg font-semibold">Review and iterate</div>
            <div className="mt-1 text-sm text-[#475569]">Use results to choose the next weak domain fast.</div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#151d2b]/10 bg-white/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 text-sm text-[#64748b] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/')} className="hover:text-[#334155]">
            SAT Simulator by Schood
          </button>
          <div className="flex items-center gap-4">
            <button onClick={() => goPlatform('/pricing')} className="hover:text-[#334155]">Plans</button>
            <button onClick={() => goPlatform('/account')} className="hover:text-[#334155]">Account</button>
            <button onClick={goPlatformHome} className="hover:text-[#334155]">Platform home</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
