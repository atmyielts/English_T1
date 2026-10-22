import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SeoHead } from '../components/seo/SeoHead';
import { useI18n } from '../i18n';
import { edgeBase, supabaseAnonKey } from '../lib/supabase';

// Schood Courses catalogue (docs/product/41, V-CRS-F10, lead-based): courses
// listed by education centres and independent teachers. "Request a place"
// sends a lead to that centre or teacher; Schood never takes the course fee here.

type CatalogCourse = {
  slug: string;
  headline: string;
  summary: string | null;
  format: 'online' | 'offline' | 'blended';
  city: string | null;
  language: string;
  level: string | null;
  price_text: string | null;
  schedule_text: string | null;
  starts_on: string | null;
  seats: number | null;
  teacher_name: string | null;
  course: { title: string; description: string | null; estimated_minutes: number; modules: { title: string; lessons: number }[] };
  provider: { name: string; kind: 'centre' | 'teacher' };
  results: { learners: number; completion_percent: number | null };
};

const call = async <T,>(action: string, body: Record<string, unknown> = {}): Promise<T> => {
  const res = await fetch(`${edgeBase}/academy-learning`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(payload.error ?? `Request failed (${res.status})`));
  return payload as T;
};

const LANGUAGE_NAMES: Record<string, string> = { uz: 'O‘zbekcha', ru: 'Русский', en: 'English' };
const academyUrl = (String(import.meta.env.VITE_ACADEMY_URL ?? '').trim() || 'https://academy.schood.online').replace(/\/+$/, '');
const input = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900';

const Facts: React.FC<{ item: CatalogCourse }> = ({ item }) => {
  const { t } = useI18n();
  const facts = [
    t(`courses.format.${item.format}` as 'courses.format.online'),
    item.city,
    LANGUAGE_NAMES[item.language] ?? null,
    item.level,
    item.starts_on ? t('courses.starts', { date: new Date(item.starts_on).toLocaleDateString() }) : null,
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-wrap gap-1.5">
      {facts.map((fact) => <span key={fact} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700">{fact}</span>)}
    </div>
  );
};

const RequestForm: React.FC<{ slug: string }> = ({ slug }) => {
  const { t } = useI18n();
  const [requestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ full_name: '', phone: '', telegram: '', message: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setError('');
    try {
      await call('public_course_lead', { slug, request_id: requestId, ...form });
      setState('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('courses.request.failed'));
      setState('idle');
    }
  };
  if (state === 'sent') {
    return <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{t('courses.request.sent')}</div>;
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827]">
      <h2 className="text-lg font-black">{t('courses.request.title')}</h2>
      <p className="text-sm text-gray-600">{t('courses.request.body')}</p>
      <label className="block text-sm font-semibold">{t('courses.request.name')}
        <input required minLength={2} maxLength={180} className={`${input} mt-1`} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      </label>
      <label className="block text-sm font-semibold">{t('courses.request.phone')}
        <input type="tel" inputMode="tel" maxLength={20} className={`${input} mt-1`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998 90 123 45 67" />
      </label>
      <label className="block text-sm font-semibold">{t('courses.request.telegram')}
        <input maxLength={33} className={`${input} mt-1`} value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} placeholder="@username" />
      </label>
      <label className="block text-sm font-semibold">{t('courses.request.message')}
        <textarea rows={3} maxLength={1000} className={`${input} mt-1`} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </label>
      {error ? <p role="alert" className="text-sm font-semibold text-red-700">{error}</p> : null}
      <button type="submit" disabled={state === 'sending' || (!form.phone.trim() && !form.telegram.trim())} className="w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300">
        {state === 'sending' ? t('courses.request.sending') : t('courses.request.submit')}
      </button>
      <p className="text-xs text-gray-500">{t('courses.request.privacy')}</p>
    </form>
  );
};

const CourseDetail: React.FC<{ slug: string }> = ({ slug }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [item, setItem] = useState<CatalogCourse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    call<{ course: CatalogCourse }>('public_course', { slug })
      .then((value) => { if (active) setItem(value.course); })
      .catch(() => { if (active) setError(t('courses.notFound')); });
    return () => { active = false; };
  }, [slug, t]);
  if (error) return <div className="mx-auto max-w-3xl px-4 py-10"><p role="alert">{error}</p><button type="button" className="mt-4 font-bold underline" onClick={() => navigate('/courses')}>{t('courses.back')}</button></div>;
  if (!item) return <p role="status" className="mx-auto max-w-3xl px-4 py-10 text-sm text-gray-600">{t('common.loading')}</p>;
  const lessons = item.course.modules.reduce((sum, m) => sum + m.lessons, 0);
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <SeoHead title={`${item.headline} · Schood Courses`} description={(item.summary ?? item.course.description ?? item.headline).slice(0, 155)} path={`/courses/${item.slug}`} />
      <article className="min-w-0 space-y-5">
        <button type="button" className="text-sm font-bold text-gray-600 underline" onClick={() => navigate('/courses')}>{t('courses.back')}</button>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{item.provider.name} · {t(item.provider.kind === 'centre' ? 'courses.provider.centre' : 'courses.provider.teacher')}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{item.headline}</h1>
          {item.teacher_name ? <p className="mt-1 text-sm text-gray-600">{t('courses.teacher', { name: item.teacher_name })}</p> : null}
        </div>
        <Facts item={item} />
        {item.summary || item.course.description ? <p className="whitespace-pre-line text-sm leading-6 text-gray-800">{item.summary ?? item.course.description}</p> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {item.price_text ? <div className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-sm font-black">{item.price_text}</div><div className="text-xs text-gray-500">{t('courses.price')}</div></div> : null}
          {item.schedule_text ? <div className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-sm font-black">{item.schedule_text}</div><div className="text-xs text-gray-500">{t('courses.schedule')}</div></div> : null}
          <div className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-sm font-black">{item.course.modules.length} / {lessons}</div><div className="text-xs text-gray-500">{t('courses.modulesLessons')}</div></div>
          {item.seats ? <div className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-sm font-black">{item.seats}</div><div className="text-xs text-gray-500">{t('courses.seats')}</div></div> : null}
        </div>
        {item.results.completion_percent != null ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-2xl font-black text-emerald-900">{item.results.completion_percent}%</div>
            <div className="text-sm text-emerald-900">{t('courses.results', { n: item.results.learners })}</div>
          </div>
        ) : null}
        {item.course.modules.length ? (
          <section>
            <h2 className="text-lg font-black">{t('courses.programme')}</h2>
            <ol className="mt-2 space-y-2">
              {item.course.modules.map((m, i) => (
                <li key={`${i}:${m.title}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{i + 1}. {m.title}</span>
                  <span className="shrink-0 text-xs text-gray-500">{t('courses.lessons', { n: m.lessons })}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <p className="text-xs text-gray-500">{t('courses.howItWorks')}</p>
      </article>
      <aside className="lg:sticky lg:top-4 lg:self-start"><RequestForm slug={item.slug} /></aside>
    </div>
  );
};

const CourseList: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('');
  const [format, setFormat] = useState('');
  const [result, setResult] = useState<{ key: string; courses: CatalogCourse[]; error: string } | null>(null);
  const key = useMemo(() => JSON.stringify([query.trim(), language, format]), [query, language, format]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      call<{ courses: CatalogCourse[] }>('public_courses', { query: query.trim(), language, format })
        .then((value) => { if (active) setResult({ key, courses: value.courses, error: '' }); })
        .catch((e) => { if (active) setResult({ key, courses: [], error: e instanceof Error ? e.message : t('courses.loadFailed') }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [key, query, language, format, t]);
  const loading = result?.key !== key;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <SeoHead title={t('courses.seoTitle')} description={t('courses.subtitle')} path="/courses" />
      <h1 className="text-3xl font-black tracking-tight">{t('courses.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{t('courses.subtitle')}</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_160px]">
        <input aria-label={t('courses.search')} placeholder={t('courses.search')} className={input} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label={t('courses.language')} className={input} value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">{t('courses.anyLanguage')}</option>
          <option value="uz">O‘zbekcha</option><option value="ru">Русский</option><option value="en">English</option>
        </select>
        <select aria-label={t('courses.formatLabel')} className={input} value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="">{t('courses.anyFormat')}</option>
          <option value="online">{t('courses.format.online')}</option>
          <option value="offline">{t('courses.format.offline')}</option>
          <option value="blended">{t('courses.format.blended')}</option>
        </select>
      </div>
      {loading ? <p role="status" className="py-8 text-sm text-gray-600">{t('common.loading')}</p> : null}
      {!loading && result?.error ? <p role="alert" className="py-8 text-sm text-red-700">{result.error}</p> : null}
      {!loading && !result?.error && result?.courses.length === 0 ? <p className="py-8 text-sm text-gray-600">{t('courses.empty')}</p> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(loading ? [] : result?.courses ?? []).map((item) => (
          <button key={item.slug} type="button" onClick={() => navigate(`/courses/${item.slug}`)}
            className="flex min-w-0 flex-col gap-3 rounded-2xl border border-gray-900 bg-white p-4 text-left shadow-[0_2px_0_#111827] transition hover:-translate-y-0.5">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{item.provider.name}</div>
            <div className="text-lg font-black leading-tight">{item.headline}</div>
            <Facts item={item} />
            {item.summary ? <p className="line-clamp-3 text-sm text-gray-600">{item.summary}</p> : null}
            <div className="mt-auto flex items-center justify-between gap-2 text-sm">
              <span className="font-bold">{item.price_text ?? t('courses.askPrice')}</span>
              {item.results.completion_percent != null ? <span className="text-xs font-semibold text-emerald-700">{t('courses.completionShort', { p: item.results.completion_percent })}</span> : null}
            </div>
          </button>
        ))}
      </div>
      <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-black">{t('courses.teach.title')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('courses.teach.body')}</p>
        <a href={academyUrl} className="mt-3 inline-flex rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-bold text-white">{t('courses.teach.cta')}</a>
      </section>
    </div>
  );
};

export const CoursesCatalogPage: React.FC = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <main className="min-h-screen bg-[#f6f1e8] pb-12 text-gray-900">
      <SiteHeader
        navItems={[
          { id: 'home', label: t('courses.nav.home'), onClick: () => navigate('/') },
          { id: 'courses', label: t('courses.nav.courses'), onClick: () => navigate('/courses'), active: true },
        ]}
      />
      {slug ? <CourseDetail slug={slug} /> : <CourseList />}
    </main>
  );
};
