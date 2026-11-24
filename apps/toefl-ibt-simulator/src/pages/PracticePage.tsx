import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '../components/layout/MainLayout';
import { TOEFL_IBT_PRODUCT_ID } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { createSession } from '../services/persistence';
import { useAccess } from '../lib/useAccess';
import { useAppT, type AppKey } from '../i18n';
import { is2026Metadata, resolveTaskParam, TASKS_BY_SECTION, type Toefl2026Task } from '../features/toefl2026/tasks';

type ExperienceRow = { id: string; name: string; display_order: number; is_active: boolean; metadata: Record<string, unknown> | null };
type SectionRow = { id: string; experience_id: string; name: string; display_order: number; metadata: Record<string, unknown> | null };

const sectionType = (s: SectionRow): string => String((s.metadata as any)?.type ?? 'unknown');

export const PracticePage: React.FC = () => {
  const navigate = useNavigate();
  const t = useAppT();
  const [params] = useSearchParams();
  const selectedTask = resolveTaskParam(params.get('task'));
  const { userId, accessToken } = useAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [sectionsByExperience, setSectionsByExperience] = useState<Record<string, SectionRow[]>>({});
  const selectedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      const { data: expRows, error: expError } = await supabase
        .from('experiences')
        .select('id,name,display_order,is_active,metadata')
        .eq('product_id', TOEFL_IBT_PRODUCT_ID)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (expError) {
        setError(t('errors.load_failed'));
        setLoading(false);
        return;
      }
      const exps = (expRows ?? []) as ExperienceRow[];
      setExperiences(exps);
      const expIds = exps.map((e) => e.id);
      if (expIds.length > 0) {
        const { data: secRows } = await supabase
          .from('sections')
          .select('id,experience_id,name,display_order,metadata')
          .in('experience_id', expIds)
          .order('display_order', { ascending: true });
        const by: Record<string, SectionRow[]> = {};
        for (const s of (secRows ?? []) as SectionRow[]) (by[s.experience_id] ??= []).push(s);
        setSectionsByExperience(by);
      }
      setLoading(false);
    };
    void run();
  }, [t]);

  const banks = useMemo(() => experiences.filter(e => is2026Metadata(e.metadata) && e.metadata?.catalog === 'practice_bank_2026'), [experiences]);
  const bankSections = useMemo(() => {
    const out = new Map<string, SectionRow[]>();
    for (const s of banks.flatMap(bank => sectionsByExperience[bank.id] ?? [])) {
      const task = String(s.metadata?.practice_task ?? '');
      if (task) out.set(task, [...(out.get(task) ?? []), s]);
    }
    return out;
  }, [banks, sectionsByExperience]);
  const legacy = useMemo(() => experiences.filter((e) => !is2026Metadata(e.metadata)), [experiences]);

  useEffect(() => {
    if (!loading && selectedTask) selectedRef.current?.scrollIntoView?.({ block: 'center' });
  }, [loading, selectedTask]);

  const start = async (experienceId: string, sectionId: string) => {
    setError(null);
    if (!userId || !accessToken) {
      setError(t('errors.session_unavailable'));
      return;
    }
    setStarting(sectionId);
    const result = await createSession(accessToken, experienceId, { mode: 'practice', allowed_section_ids: [sectionId] });
    setStarting(null);
    if (!result.sessionId) {
      if (result.code === 'usage_limit_reached') setError(result.capabilityKey === 'writing_submissions' ? t('errors.writing_limit') : t('errors.usage_limit'));
      else if (result.code === 'concurrent_session_limit_reached') setError(t('errors.concurrent'));
      else if (result.code === 'device_limit_reached') setError(t('errors.device_limit'));
      else setError(result.error ? t('errors.start_failed') : t('errors.start_failed'));
      return;
    }
    navigate(`/session/${result.sessionId}/${sectionId}`);
  };

  const taskCard = (task: Toefl2026Task) => {
    const sets = bankSections.get(task) ?? [];
    const selected = task === selectedTask;
    return (
      <div
        key={task}
        ref={selected ? selectedRef : undefined}
        id={`task-${task}`}
        data-testid={`practice-task-${task}`}
        data-selected={selected ? 'true' : 'false'}
        className={`rounded-[22px] border p-5 bg-white/80 shadow-sm min-w-0 ${selected ? 'border-[#c2410c] ring-2 ring-[#c2410c]/40' : 'border-[#151d2b]/12'}`}
      >
        {selected ? <div className="text-xs font-semibold uppercase tracking-wider text-[#c2410c] mb-1">{t('practice.selected')}</div> : null}
        <h3 className="font-semibold text-[#0f172a] text-lg break-words">{t(`task.${task}` as AppKey)}</h3>
        <p className="text-sm text-[#475569] mt-1 break-words">{t(`task_desc.${task}` as AppKey)}</p>
        {sets.length ? (
          <ul className="mt-2 divide-y divide-[#151d2b]/12">
            {sets.map(section => {
              const short = section.metadata?.practice_short_set === true;
              const minutes = Math.max(1, Math.round(Number(section.metadata?.duration_seconds ?? 0) / 60));
              const items = Number(section.metadata?.item_sets ?? 0);
              const title = short ? section.name : t('practice.fullBank');
              return <li key={section.id} className="py-2">
                {sets.length > 1 ? <p className="text-sm font-semibold">{title}{short && task === 'take_interview' ? ` · ${t('practice.textCue')}` : ''}</p> : null}
                <p className="text-xs text-[#64748b]">{items > 0 ? t('practice.items', { count: items }) : null}{items > 0 ? ' · ' : ''}{t('practice.minutes', { count: minutes })}</p>
                <button type="button" aria-label={`${t('practice.start')} — ${t(`task.${task}` as AppKey)} — ${title}`}
                  onClick={() => void start(section.experience_id, section.id)} disabled={starting != null}
                  className="mt-2 min-h-[44px] w-full sm:w-auto px-4 py-2 rounded-full bg-[#0f172a] text-white font-semibold disabled:opacity-60">
                  {starting === section.id ? t('practice.starting') : t('practice.start')}
                </button>
              </li>;
            })}
          </ul>
        ) : (
          <p className="text-sm text-[#64748b] mt-2">{t('practice.unavailable')}</p>
        )}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto" data-testid="practice-page">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">{t('format.2026')}</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-2">{t('practice.heading')}</h1>
          <p className="text-[#475569] mt-2">{t('practice.intro')}</p>
          <p className="text-sm text-[#64748b] mt-1">{t('practice.ai_note')}</p>
        </div>

        {loading ? <div className="rounded-2xl border border-[#151d2b]/12 bg-white/70 px-4 py-3 text-[#475569]">{t('common.loading')}</div> : null}
        {error ? <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3">{error}</div> : null}

        {!loading && !banks.length ? <div className="rounded-2xl border border-[#151d2b]/12 bg-white/75 p-6 text-[#475569]">{t('practice.none')}</div> : null}

        {TASKS_BY_SECTION.map(({ section, tasks }) => (
          <section key={section}>
            <h2 className="text-xl font-semibold text-[#0f172a] mb-3">{t(`section.${section}` as AppKey)}</h2>
            {section === 'listening' ? <p className="mb-3 text-sm text-[#475569]">{t('practice.listeningSoon')}</p> : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{tasks.map(taskCard)}</div>
          </section>
        ))}

        <div className="rounded-[22px] border border-[#151d2b]/12 bg-white/75 p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <p className="text-[#334155]">{t('practice.full_test_cta')}</p>
          <Link to="/full-exam" className="min-h-[44px] inline-flex items-center justify-center px-4 py-2 rounded-full border border-[#151d2b]/15 bg-white font-semibold">{t('practice.open_full_exam')}</Link>
        </div>

        {legacy.length > 0 ? (
          <details className="rounded-[22px] border border-[#151d2b]/12 bg-white/60 p-5" data-testid="legacy-archive">
            <summary className="cursor-pointer font-semibold text-[#0f172a] min-h-[44px] flex items-center">{t('format.legacy_archive')}</summary>
            <p className="text-sm text-[#64748b] mt-2">{t('format.legacy_archive_note')}</p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {legacy.map((exp) => (
                <div key={exp.id} className="rounded-2xl border border-[#151d2b]/10 bg-white/80 p-4 min-w-0">
                  <div className="font-semibold text-[#0f172a] break-words">{exp.name}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(sectionsByExperience[exp.id] ?? [])
                      .filter((s) => ['reading', 'listening', 'writing'].includes(sectionType(s)))
                      .map((s) => (
                        <button key={s.id} type="button" disabled={starting != null} onClick={() => void start(exp.id, s.id)} className="min-h-[44px] px-4 py-2 rounded-full border border-[#151d2b]/15 bg-white font-semibold">
                          {t(`section.${sectionType(s)}` as AppKey)}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </MainLayout>
  );
};
