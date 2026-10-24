import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Flame, Repeat2, Sparkles } from 'lucide-react';
import { useTgEnglishT, type TgEnglishKey } from './strings';
import { TelegramEnglishReview } from './TelegramEnglishReview';
import type { EnglishTask, EnglishToday, TelegramAppCall } from './types';

// Schood English inside the Telegram Mini App: today's streak, XP and level,
// the next tasks of the learner's daily plan (each opens its exact English
// app route) and due review cards answered right here.

const SKILL_KEYS: Record<string, TgEnglishKey> = {
  reading: 'skill.reading',
  writing: 'skill.writing',
  listening: 'skill.listening',
  speaking: 'skill.speaking',
  grammar: 'skill.grammar',
  vocabulary: 'skill.vocabulary',
  immersion: 'skill.immersion',
};

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827]">{children}</section>
);

const Tile: React.FC<{ label: string; value: React.ReactNode; tone: string; icon: React.ReactNode }> = ({ label, value, tone, icon }) => (
  <div className={`rounded-xl border border-gray-200 px-3 py-3 ${tone}`}>
    <div className="flex items-center gap-1 text-xl font-black text-gray-950">{icon}{value}</div>
    <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
  </div>
);

export const TelegramEnglishSection: React.FC<{
  call: TelegramAppCall;
  openLink: (url: string) => void;
  /** Open straight into review (bot "Review now" button). */
  startInReview?: boolean;
}> = ({ call, openLink, startInReview = false }) => {
  const { t } = useTgEnglishT();
  const [today, setToday] = useState<EnglishToday | null>(null);
  const [error, setError] = useState(false);
  const [reviewing, setReviewing] = useState(startInReview);

  const load = useCallback(async () => {
    setError(false);
    try {
      setToday((await call('english_today')) as unknown as EnglishToday);
    } catch {
      setError(true);
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  if (reviewing) {
    return (
      <TelegramEnglishReview
        call={call}
        onExit={(changed) => {
          setReviewing(false);
          if (changed || !today) void load();
        }}
      />
    );
  }

  if (error) {
    return (
      <Card>
        <p className="text-sm font-black text-red-700" role="alert">{t('error.title')}</p>
        <button type="button" onClick={() => void load()} className="mt-3 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white">
          {t('error.retry')}
        </button>
      </Card>
    );
  }

  if (!today) {
    return (
      <Card>
        <div aria-busy="true">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{t('eyebrow')}</div>
          <div className="mt-2 text-sm text-gray-600">{t('loading')}</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((n) => <div key={n} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}
          </div>
        </div>
      </Card>
    );
  }

  const app = today.app_url.replace(/\/$/, '');
  const due = today.due.total;
  const openTask = (task: EnglishTask) => (task.kind === 'review' ? setReviewing(true) : openLink(task.href));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label={t('streak')} value={today.streak} tone="bg-amber-50" icon={<Flame size={18} aria-hidden className="text-amber-600" />} />
        <Tile label={t('xpToday')} value={today.xp_today} tone="bg-emerald-50" icon={<Sparkles size={18} aria-hidden className="text-emerald-600" />} />
        <Tile label={t('level')} value={today.level ?? t('level.none')} tone="bg-blue-50" icon={<BookOpen size={18} aria-hidden className="text-blue-600" />} />
      </div>

      {!today.placement_done ? (
        <Card>
          <div className="text-sm font-black">{t('placement.title')}</div>
          <p className="mt-1 text-sm text-gray-600">{t('placement.body')}</p>
          <button type="button" onClick={() => openLink(`${app}/check`)} className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white">
            {t('placement.cta')}
          </button>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center gap-2 text-sm font-black"><Repeat2 size={17} aria-hidden /> {t('review.title')}</div>
        <p className="mt-2 text-sm text-gray-600">
          {due === 0 ? t('review.none') : due === 1 ? t('review.dueOne') : t('review.due', { count: due })}
        </p>
        {due > 0 ? (
          <button type="button" onClick={() => setReviewing(true)} className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white">
            {t('review.cta')} ({due})
          </button>
        ) : null}
      </Card>

      {today.placement_done ? (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-black">{t('next.title')}</div>
            {today.plan.ready && today.plan.total > 0 ? (
              <span className="text-xs font-semibold text-gray-500">{t('next.progress', { done: today.plan.done, total: today.plan.total })}</span>
            ) : null}
          </div>
          {!today.plan.ready ? (
            <>
              <p className="mt-2 text-sm text-gray-600">{t('next.noPlan')}</p>
              <button type="button" onClick={() => openLink(`${app}/today`)} className="mt-3 w-full rounded-xl border border-gray-900 bg-white px-4 py-3 text-sm font-bold">
                {t('next.openToday')}
              </button>
            </>
          ) : today.plan.next.length === 0 ? (
            <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800">{t('next.allDone')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {today.plan.next.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => openTask(task)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                        {SKILL_KEYS[task.skill] ? t(SKILL_KEYS[task.skill]!) : task.skill} · {t('next.minutes', { minutes: task.minutes })}
                      </span>
                      <span className="mt-0.5 block break-words font-bold" lang={task.kind === 'review' ? undefined : 'en'}>
                        {task.kind === 'review' ? t('next.reviewTask') : task.title}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-lg bg-gray-950 px-3 py-1.5 text-xs font-bold text-white">{t('next.start')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <button
        type="button"
        onClick={() => openLink(app)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-900 bg-white px-4 py-3 text-sm font-bold"
      >
        <ExternalLink size={16} aria-hidden /> {t('openApp')}
      </button>
    </div>
  );
};
