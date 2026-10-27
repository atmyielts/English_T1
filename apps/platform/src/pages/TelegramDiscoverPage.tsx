import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  GraduationCap,
  Headphones,
  Languages,
  LifeBuoy,
  MessageCircle,
  PenLine,
  Send,
  Sparkles,
  Target,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { edgeBase } from '../lib/supabase';
import { ExamFamilyCards } from '../components/platform/ExamFamilyCards';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        openLink?: (url: string) => void;
        openTelegramLink?: (url: string) => void;
        themeParams?: Record<string, string>;
      };
    };
  }
}

type Tab = 'explore' | 'exams' | 'english' | 'academy' | 'support' | 'profile';
type Role = 'student' | 'parent' | 'teacher' | 'center' | 'partner' | 'exploring';
type LeadStatus = 'idle' | 'sending' | 'sent' | 'error';

type ProductCard = {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  group: Exclude<Tab, 'explore' | 'support' | 'profile'>;
  icon: React.ReactNode;
  cta?: string;
  tone: string;
};

const siteUrl = 'https://schood.online';
const studentBotUrl = 'https://t.me/schoodstudentbot?startapp';

const waitForTelegramWebApp = async () => {
  if (window.Telegram?.WebApp) return window.Telegram.WebApp;
  const scriptId = 'telegram-web-app-sdk';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    document.head.appendChild(script);
  }

  await new Promise<void>((resolve) => {
    const started = Date.now();
    const finish = () => resolve();
    const poll = () => {
      if (window.Telegram?.WebApp || Date.now() - started > 2500) finish();
      else window.setTimeout(poll, 50);
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', finish, { once: true });
    poll();
  });
  return window.Telegram?.WebApp ?? null;
};

const getInitData = () => {
  const qs = new URLSearchParams(window.location.search);
  return qs.get('initData') || window.Telegram?.WebApp?.initData || '';
};

const openExternal = (url: string) => {
  if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
  else window.location.href = url;
};

const openTelegram = (url: string) => {
  if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(url);
  else window.location.href = url;
};

const roles: Array<{ id: Role; label: string; detail: string; icon: React.ReactNode }> = [
  { id: 'student', label: 'Student', detail: 'Courses, scores, practice, payments', icon: <GraduationCap size={17} /> },
  { id: 'parent', label: 'Parent', detail: 'Reports, attendance, tuition clarity', icon: <UsersRound size={17} /> },
  { id: 'teacher', label: 'Teacher', detail: 'Academy OS, gradebook, feedback', icon: <PenLine size={17} /> },
  { id: 'center', label: 'Center', detail: 'Classrooms, CRM, billing, dispatch', icon: <Building2 size={17} /> },
  { id: 'partner', label: 'Partner', detail: 'Vouchers, sales, student referrals', icon: <BriefcaseBusiness size={17} /> },
  { id: 'exploring', label: 'Exploring', detail: 'Find the right Schood path', icon: <Sparkles size={17} /> },
];

const products: ProductCard[] = [
  {
    id: 'ielts-simulator',
    title: 'IELTS Simulator',
    subtitle: 'Full mock tests, realistic band outcomes, certificates.',
    url: 'https://ielts.schood.online',
    group: 'exams',
    icon: <Award size={20} />,
    tone: 'bg-blue-50 border-blue-200',
  },
  {
    id: 'ielts-practice',
    title: 'IELTS Practice OS',
    subtitle: 'Adaptive labs, SRS, diagnostics, writing and speaking loops.',
    url: 'https://practice.ielts.schood.online',
    group: 'exams',
    icon: <Target size={20} />,
    tone: 'bg-emerald-50 border-emerald-200',
  },
  {
    id: 'sat',
    title: 'Digital SAT',
    subtitle: 'Practice, simulator, playbook, and performance review.',
    url: 'https://sat.schood.online',
    group: 'exams',
    icon: <BookOpen size={20} />,
    tone: 'bg-amber-50 border-amber-200',
  },
  {
    id: 'toefl',
    title: 'TOEFL iBT',
    subtitle: 'Exam practice and guided preparation for TOEFL learners.',
    url: 'https://toefl.schood.online',
    group: 'exams',
    icon: <Headphones size={20} />,
    tone: 'bg-cyan-50 border-cyan-200',
  },
  {
    id: 'itep',
    title: 'iTEP Simulator',
    subtitle: 'Fast assessment workflow for iTEP-style readiness.',
    url: 'https://itep.schood.online',
    group: 'exams',
    icon: <CheckCircle2 size={20} />,
    tone: 'bg-lime-50 border-lime-200',
  },
  {
    id: 'english-hub',
    title: 'English Hub',
    subtitle: 'Reading, listening, writing, speaking, grammar, vocabulary.',
    url: 'https://english.schood.online',
    group: 'english',
    icon: <Languages size={20} />,
    tone: 'bg-rose-50 border-rose-200',
  },
  {
    id: 'writing',
    title: 'Writing Tutor',
    subtitle: 'Focused writing feedback and next-step practice loops.',
    url: `${siteUrl}/writing-tutor`,
    group: 'english',
    icon: <PenLine size={20} />,
    tone: 'bg-purple-50 border-purple-200',
  },
  {
    id: 'vocab',
    title: 'Vocabulary Drill',
    subtitle: 'Telegram-friendly spaced review and academic word growth.',
    url: `${siteUrl}/vocab-drill`,
    group: 'english',
    icon: <BookOpen size={20} />,
    tone: 'bg-orange-50 border-orange-200',
  },
  {
    id: 'academy-student',
    title: 'Student Command Center',
    subtitle: 'Assignments, grades, attendance, billing, and class schedule.',
    url: studentBotUrl,
    group: 'academy',
    icon: <Bot size={20} />,
    cta: 'Open student bot',
    tone: 'bg-gray-50 border-gray-300',
  },
  {
    id: 'academy-os',
    title: 'Academy OS',
    subtitle: 'Teacher, admin, CRM, classroom, billing, and parent reports.',
    url: `${siteUrl}/academy`,
    group: 'academy',
    icon: <Building2 size={20} />,
    tone: 'bg-indigo-50 border-indigo-200',
  },
  {
    id: 'center-office',
    title: 'Center Office',
    subtitle: 'Dispatch vouchers, manage learners, and operate your center.',
    url: `${siteUrl}/center-office`,
    group: 'academy',
    icon: <BriefcaseBusiness size={20} />,
    tone: 'bg-teal-50 border-teal-200',
  },
  {
    id: 'pricing',
    title: 'Pricing and Checkout',
    subtitle: 'Plans, trials, coupons, Click payments, and subscriptions.',
    url: `${siteUrl}/pricing`,
    group: 'academy',
    icon: <CreditCard size={20} />,
    tone: 'bg-yellow-50 border-yellow-200',
  },
];

const roleRecommendations: Record<Role, string[]> = {
  student: ['academy-student', 'ielts-practice', 'english-hub', 'vocab'],
  parent: ['academy-student', 'pricing', 'academy-os'],
  teacher: ['academy-os', 'writing', 'english-hub'],
  center: ['center-office', 'academy-os', 'pricing'],
  partner: ['center-office', 'ielts-simulator', 'sat'],
  exploring: ['ielts-practice', 'english-hub', 'academy-student', 'pricing'],
};

const tabItems: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'explore', label: 'Explore', icon: <Sparkles size={18} /> },
  { id: 'exams', label: 'Exams', icon: <Award size={18} /> },
  { id: 'english', label: 'English', icon: <Languages size={18} /> },
  { id: 'academy', label: 'Academy', icon: <Building2 size={18} /> },
  { id: 'support', label: 'Support', icon: <LifeBuoy size={18} /> },
  { id: 'profile', label: 'Profile', icon: <UserRound size={18} /> },
];

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  textarea?: boolean;
}> = ({ label, value, onChange, placeholder, textarea }) => (
  <label className="block">
    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
    {textarea ? (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-gray-950"
        placeholder={placeholder}
      />
    ) : (
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-gray-950"
        placeholder={placeholder}
      />
    )}
  </label>
);

const MiniCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827] ${className}`}>{children}</section>
);

const ProductButton: React.FC<{ product: ProductCard }> = ({ product }) => (
  <button
    type="button"
    onClick={() => (product.url.startsWith('https://t.me/') ? openTelegram(product.url) : openExternal(product.url))}
    className={`w-full rounded-2xl border p-4 text-left transition active:translate-y-px ${product.tone}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="rounded-xl border border-gray-900 bg-white p-2 text-gray-950 shadow-[0_1px_0_#111827]">{product.icon}</span>
        <span className="min-w-0">
          <span className="block font-black leading-snug text-gray-950">{product.title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-gray-600">{product.subtitle}</span>
        </span>
      </div>
      <ChevronRight className="mt-1 shrink-0 text-gray-500" size={18} />
    </div>
    <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-gray-700">
      {product.cta ?? 'Open'} <ExternalLink size={12} />
    </div>
  </button>
);

export const TelegramDiscoverPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('explore');
  const [role, setRole] = useState<Role>('student');
  const [initData, setInitData] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [goal, setGoal] = useState('');
  const [message, setMessage] = useState('');
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('idle');
  const [leadError, setLeadError] = useState<string | null>(null);

  useEffect(() => {
    void waitForTelegramWebApp().then((app) => {
      app?.ready?.();
      app?.expand?.();
      setInitData(getInitData());
    });
  }, []);

  const recommended = useMemo(() => {
    const ids = new Set(roleRecommendations[role]);
    return products.filter((product) => ids.has(product.id));
  }, [role]);

  const visibleProducts = tab === 'explore' ? recommended : products.filter((product) => product.group === tab);

  const submitLead = useCallback(async () => {
    setLeadError(null);
    if (!contact.trim() || !message.trim()) {
      setLeadError('Add your Telegram, phone, or email and a short message.');
      return;
    }
    setLeadStatus('sending');
    try {
      const res = await fetch(`${edgeBase}/telegram-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lead_create',
          initData,
          name,
          contact,
          role,
          goal,
          message,
          source_url: window.location.href,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Could not send request');
      setLeadStatus('sent');
      setMessage('');
      setGoal('');
      window.setTimeout(() => setLeadStatus('idle'), 4500);
    } catch (error) {
      setLeadStatus('error');
      setLeadError(error instanceof Error ? error.message : 'Could not send request');
    }
  }, [contact, goal, initData, message, name, role]);

  return (
    <div className="min-h-screen bg-[#f6f1e8] pb-24 text-gray-900">
      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        <header className="rounded-[1.5rem] border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-gray-500">
                <Bot size={16} /> @schoodonlinebot
              </div>
              <h1 className="mt-2 text-3xl font-black leading-tight">Schood ecosystem</h1>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Find the right Schood path for exams, English, academy learning, center operations, payments, certificates, and support.
              </p>
            </div>
            <img src="/schood-logo.png" alt="Schood" className="h-14 w-14 shrink-0 rounded-2xl border border-gray-200 object-contain bg-white p-1" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openTelegram(studentBotUrl)}
              className="rounded-xl bg-gray-950 px-3 py-3 text-sm font-bold text-white"
            >
              Student login
            </button>
            <button
              type="button"
              onClick={() => setTab('support')}
              className="rounded-xl border border-gray-900 bg-white px-3 py-3 text-sm font-bold"
            >
              Ask Schood
            </button>
          </div>
        </header>

        {tab === 'explore' ? (
          <>
            <MiniCard>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-gray-500">Start with your role</div>
                  <div className="mt-1 text-lg font-black">What are you trying to do?</div>
                </div>
                <Sparkles size={20} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {roles.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRole(item.id)}
                    className={`rounded-xl border px-3 py-3 text-left ${role === item.id ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-gray-50 text-gray-900'}`}
                  >
                    <div className="flex items-center gap-2 text-sm font-black">{item.icon}{item.label}</div>
                    <div className={`mt-1 text-[11px] leading-snug ${role === item.id ? 'text-gray-200' : 'text-gray-500'}`}>{item.detail}</div>
                  </button>
                ))}
              </div>
            </MiniCard>

            <MiniCard>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-gray-500">Recommended</div>
                  <div className="mt-1 text-lg font-black">Best Schood entrypoints</div>
                </div>
                <Target size={20} />
              </div>
              <div className="mt-4 space-y-3">
                {recommended.map((product) => <ProductButton key={product.id} product={product} />)}
              </div>
            </MiniCard>
          </>
        ) : null}

        {tab !== 'explore' && tab !== 'support' && tab !== 'profile' ? (
          <MiniCard>
            <div className="text-xs font-black uppercase tracking-wide text-gray-500">{tab}</div>
            <div className="mt-1 text-lg font-black">Choose a Schood surface</div>
            <div className="mt-4 space-y-3">
              {visibleProducts.map((product) => <ProductButton key={product.id} product={product} />)}
            </div>
          </MiniCard>
        ) : null}

        {tab === 'exams' ? <ExamFamilyCards compact onOpen={openExternal} /> : null}

        {tab === 'support' ? (
          <MiniCard>
            <div className="flex items-center gap-2 text-sm font-black"><MessageCircle size={17} /> Schood support and onboarding</div>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Tell us what you need. We will route it to the right Schood path: student access, academy setup, center operations, partnerships, or billing.
            </p>
            {leadStatus === 'sent' ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800">
                Sent. Schood will follow up through your preferred contact.
              </div>
            ) : null}
            {leadError ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-bold text-red-700">{leadError}</div>
            ) : null}
            <div className="mt-4 space-y-3">
              <Field label="Name" value={name} onChange={setName} placeholder="Your name" />
              <Field label="Telegram, phone, or email" value={contact} onChange={setContact} placeholder="@username, phone, or email" />
              <Field label="Goal" value={goal} onChange={setGoal} placeholder="IELTS, English, academy, center, partnership..." />
              <Field label="Message" value={message} onChange={setMessage} placeholder="What should Schood help you with?" textarea />
            </div>
            <button
              type="button"
              onClick={() => void submitLead()}
              disabled={leadStatus === 'sending'}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300"
            >
              <Send size={16} /> {leadStatus === 'sending' ? 'Sending...' : 'Send to Schood'}
            </button>
          </MiniCard>
        ) : null}

        {tab === 'profile' ? (
          <div className="space-y-4">
            <MiniCard>
              <div className="flex items-center gap-2 text-sm font-black"><UserRound size={17} /> Telegram paths</div>
              <div className="mt-4 space-y-3">
                <button type="button" onClick={() => openTelegram(studentBotUrl)} className="w-full rounded-xl border border-gray-900 bg-gray-950 px-4 py-3 text-left text-sm font-bold text-white">
                  Open linked student bot
                  <span className="mt-1 block text-xs font-semibold text-gray-300">Assignments, grades, billing, attendance, vocab, support.</span>
                </button>
                <button type="button" onClick={() => openExternal(`${siteUrl}/auth`)} className="w-full rounded-xl border border-gray-900 bg-white px-4 py-3 text-left text-sm font-bold">
                  Sign in to Schood
                  <span className="mt-1 block text-xs font-semibold text-gray-500">Use your normal Schood account in the browser.</span>
                </button>
              </div>
            </MiniCard>
            <MiniCard>
              <div className="text-sm font-black">What this bot is for</div>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                @schoodonlinebot is the public map of Schood. Use @schoodstudentbot after login for private student data.
              </p>
            </MiniCard>
          </div>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pb-3 pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
          {tabItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex h-14 flex-col items-center justify-center rounded-xl text-[10px] font-bold ${tab === item.id ? 'bg-gray-950 text-white' : 'text-gray-500'}`}
            >
              {item.icon}
              <span className="mt-0.5">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};
