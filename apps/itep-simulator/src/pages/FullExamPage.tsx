import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, FileText, Play } from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { formatItepFamily, formatItepVariant, type ItepFamily, type ItepVariant } from '../lib/itepScores';
import { ITEP_PRODUCT_ID } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

type ExperienceRow = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  metadata: Json | null;
};

type SessionRow = {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metadata: Json | null;
  experience_id: string;
};

const familyOf = (experience: ExperienceRow): ItepFamily | null => {
  const family = String((experience.metadata as any)?.family ?? '').trim().toLowerCase();
  return ['academic', 'slate', 'business'].includes(family) ? (family as ItepFamily) : null;
};

const variantOf = (experience: ExperienceRow): ItepVariant | null => {
  const variant = String((experience.metadata as any)?.variant ?? '').trim().toLowerCase();
  return ['core', 'writing_live'].includes(variant) ? (variant as ItepVariant) : null;
};

const isFullSession = (session: SessionRow): boolean => {
  const metadata: any = session.metadata ?? {};
  const allowedSectionIds = metadata.allowed_section_ids;
  return !(Array.isArray(allowedSectionIds) && allowedSectionIds.length > 0);
};

export const FullExamPage: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useAccess();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [resumeByExperience, setResumeByExperience] = useState<Record<string, SessionRow>>({});
  const [selectedFamily, setSelectedFamily] = useState<'all' | ItepFamily>('all');
  const [selectedVariant, setSelectedVariant] = useState<'all' | ItepVariant>('all');

  useEffect(() => {
    const run = async () => {
      if (!userId) {
        setLoading(true);
        return;
      }

      setLoading(true);
      setError(null);
      setExperiences([]);
      setResumeByExperience({});

      const { data: expRows, error: expError } = await supabase
        .from('experiences')
        .select('id, name, display_order, is_active, metadata')
        .eq('product_id', ITEP_PRODUCT_ID)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (expError) {
        setError(expError.message);
        setLoading(false);
        return;
      }

      const visibleExperiences = ((expRows ?? []) as ExperienceRow[]).filter((experience) => {
        const variant = variantOf(experience);
        return variant === 'core' || variant === 'writing_live';
      });
      setExperiences(visibleExperiences);

      const experienceIds = visibleExperiences.map((experience) => experience.id);
      if (experienceIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: sessionRows, error: sessionError } = await supabase
        .from('sessions')
        .select('id,status,created_at,started_at,completed_at,metadata,experience_id')
        .eq('user_id', userId)
        .in('experience_id', experienceIds)
        .in('status', ['created', 'active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (!sessionError) {
        const grouped: Record<string, SessionRow> = {};
        for (const session of (sessionRows ?? []) as SessionRow[]) {
          if (!isFullSession(session)) continue;
          if (!grouped[session.experience_id]) grouped[session.experience_id] = session;
        }
        setResumeByExperience(grouped);
      }

      setLoading(false);
    };

    void run();
  }, [userId]);

  const availableFamilies = useMemo(
    () =>
      Array.from(new Set(experiences.map((experience) => familyOf(experience)).filter((value): value is ItepFamily => value != null))),
    [experiences],
  );

  const availableVariants = useMemo(
    () =>
      Array.from(new Set(experiences.map((experience) => variantOf(experience)).filter((value): value is ItepVariant => value != null))),
    [experiences],
  );

  const filteredExperiences = useMemo(
    () =>
      experiences.filter((experience) => {
        const family = familyOf(experience);
        const variant = variantOf(experience);
        if (selectedFamily !== 'all' && family !== selectedFamily) return false;
        if (selectedVariant !== 'all' && variant !== selectedVariant) return false;
        return true;
      }),
    [experiences, selectedFamily, selectedVariant],
  );

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Simulation mode</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-2">Full iTEP exam</h1>
          <p className="text-[#475569] mt-2">
            Launch complete Core or Writing Live sessions for Academic, SLATE, and Business.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-[26px] border border-[#151d2b]/12 bg-white/75 backdrop-blur p-5">
            <div className="text-xs font-semibold tracking-[0.12em] uppercase text-[#64748b]">Family</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedFamily('all')}
                className={`px-4 py-2 rounded-full border font-semibold ${selectedFamily === 'all' ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white/85 text-[#0f172a] border-[#151d2b]/15'}`}
              >
                All families
              </button>
              {availableFamilies.map((family) => (
                <button
                  key={family}
                  type="button"
                  onClick={() => setSelectedFamily(family)}
                  className={`px-4 py-2 rounded-full border font-semibold ${selectedFamily === family ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white/85 text-[#0f172a] border-[#151d2b]/15'}`}
                >
                  {formatItepFamily(family)}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-[#151d2b]/12 bg-white/75 backdrop-blur p-5">
            <div className="text-xs font-semibold tracking-[0.12em] uppercase text-[#64748b]">Variant</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedVariant('all')}
                className={`px-4 py-2 rounded-full border font-semibold ${selectedVariant === 'all' ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white/85 text-[#0f172a] border-[#151d2b]/15'}`}
              >
                All variants
              </button>
              {availableVariants.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  onClick={() => setSelectedVariant(variant)}
                  className={`px-4 py-2 rounded-full border font-semibold ${selectedVariant === variant ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white/85 text-[#0f172a] border-[#151d2b]/15'}`}
                >
                  {formatItepVariant(variant)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#151d2b]/12 bg-white/70 px-4 py-3 text-[#475569]">Loading full mock tests...</div>
        ) : null}
        {error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3">{error}</div>
        ) : null}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#0f172a]">Available mock tests</h2>
            <div className="text-sm text-[#64748b]">{filteredExperiences.length} visible tests</div>
          </div>

          {filteredExperiences.length === 0 && !loading ? (
            <div className="rounded-[28px] border border-[#151d2b]/12 bg-white/75 shadow-sm p-8 text-[#334155]">
              No full mock tests match the current family and variant filters.
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredExperiences.map((experience) => {
              const durationSeconds = Number((experience.metadata as any)?.duration_seconds ?? 0);
              const resume = resumeByExperience[experience.id] ?? null;
              const currentSectionId = resume ? String((resume.metadata as any)?.current_section_id ?? '') : '';
              const family = familyOf(experience);
              const variant = variantOf(experience);

              return (
                <div
                  key={experience.id}
                  className="rounded-[28px] border border-[#151d2b]/12 bg-white/75 backdrop-blur shadow-[0_10px_28px_rgba(15,23,42,0.06)] p-6"
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-[#64748b] text-sm">
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1.5">
                        <FileText size={15} />
                        Full iTEP mock
                      </span>
                      {family ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1.5">
                          {formatItepFamily(family)}
                        </span>
                      ) : null}
                      {variant ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1.5">
                          {formatItepVariant(variant)}
                        </span>
                      ) : null}
                      {durationSeconds > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1.5">
                          <Clock size={15} />
                          {Math.round(durationSeconds / 60)} min
                        </span>
                      ) : null}
                      {resume ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-700/10 bg-emerald-600/10 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                          Resume available
                        </span>
                      ) : null}
                    </div>

                    <h3 className="text-lg font-semibold text-[#0f172a] leading-snug break-words">{experience.name}</h3>
                    <p className="text-sm text-[#475569]">
                      {variant === 'core'
                        ? 'Reading, Listening, and Grammar in one paced run.'
                        : 'Writing Live session with future-ready scoring foundation.'}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                      {resume ? (
                        <button
                          onClick={() => {
                            if (currentSectionId) {
                              navigate(`/session/${resume.id}/${currentSectionId}`);
                              return;
                            }
                            navigate(`/test/${experience.id}`);
                          }}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 justify-center"
                        >
                          <Play size={16} /> Continue
                        </button>
                      ) : null}
                      <button
                        onClick={() => navigate(`/test/${experience.id}`)}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-[#0f172a] hover:bg-black text-white font-semibold"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </MainLayout>
  );
};
