import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../components/layout/MainLayout';
import { formatItepFamily, formatItepVariant, type ItepFamily, type ItepVariant } from '../lib/itepScores';
import { ITEP_PRODUCT_ID } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { createSession } from '../services/persistence';
import { useAccess } from '../lib/useAccess';

type ExperienceRow = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
};

type SectionRow = {
  id: string;
  experience_id: string;
  name: string;
  display_order: number;
  metadata: Record<string, unknown> | null;
};

const sectionType = (section: SectionRow): string => String((section.metadata as any)?.type ?? 'unknown').toLowerCase();
const familyOf = (experience: ExperienceRow): ItepFamily | null => {
  const family = String((experience.metadata as any)?.family ?? '').trim().toLowerCase();
  return ['academic', 'slate', 'business'].includes(family) ? (family as ItepFamily) : null;
};
const variantOf = (experience: ExperienceRow): ItepVariant | null => {
  const variant = String((experience.metadata as any)?.variant ?? '').trim().toLowerCase();
  return ['core', 'writing_live'].includes(variant) ? (variant as ItepVariant) : null;
};

export const PracticePage: React.FC = () => {
  const navigate = useNavigate();
  const { userId, accessToken } = useAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [sectionsByExperience, setSectionsByExperience] = useState<Record<string, SectionRow[]>>({});
  const [selectedFamily, setSelectedFamily] = useState<'all' | ItepFamily>('all');
  const [selectedVariant, setSelectedVariant] = useState<'all' | ItepVariant>('all');

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const { data: expRows, error: expError } = await supabase
        .from('experiences')
        .select('id,name,display_order,is_active,metadata')
        .eq('product_id', ITEP_PRODUCT_ID)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (expError) {
        setError(expError.message);
        setExperiences([]);
        setSectionsByExperience({});
        setLoading(false);
        return;
      }

      const activeExperiences = ((expRows ?? []) as ExperienceRow[]).filter((experience) => {
        const variant = variantOf(experience);
        return variant === 'core' || variant === 'writing_live';
      });
      setExperiences(activeExperiences);

      const experienceIds = activeExperiences.map((experience) => experience.id);
      if (experienceIds.length === 0) {
        setSectionsByExperience({});
        setLoading(false);
        return;
      }

      const { data: secRows, error: secError } = await supabase
        .from('sections')
        .select('id,experience_id,name,display_order,metadata')
        .in('experience_id', experienceIds)
        .order('display_order', { ascending: true });

      if (secError) {
        setError(secError.message);
        setSectionsByExperience({});
        setLoading(false);
        return;
      }

      const grouped: Record<string, SectionRow[]> = {};
      for (const section of (secRows ?? []) as SectionRow[]) {
        grouped[section.experience_id] = grouped[section.experience_id] ?? [];
        grouped[section.experience_id].push(section);
      }

      setSectionsByExperience(grouped);
      setLoading(false);
    };

    void run();
  }, []);

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

  const startPractice = async (experienceId: string, type: string) => {
    setError(null);

    if (!userId || !accessToken) {
      setError('Session unavailable. Please refresh.');
      return;
    }

    const section = (sectionsByExperience[experienceId] ?? []).find((candidate) => sectionType(candidate) === type);
    if (!section) {
      setError(`No ${type} section found for this test.`);
      return;
    }

    const result = await createSession(accessToken, experienceId, { mode: 'practice', allowed_section_ids: [section.id] });
    if (!result.sessionId) {
      if (result.code === 'usage_limit_reached') {
        setError(
          result.capabilityKey === 'writing_submissions'
            ? 'Monthly writing feedback limit reached.'
            : 'Monthly section practice limit reached.',
        );
        return;
      }
      if (result.code === 'concurrent_session_limit_reached') {
        setError('An active session is already running on another device for this product.');
        return;
      }
      if (result.code === 'device_limit_reached') {
        setError('Device limit reached for this account. Contact support if this is unexpected.');
        return;
      }
      setError(result.error ?? 'Failed to create session');
      return;
    }

    navigate(`/session/${result.sessionId}/${section.id}`);
  };

  const typeLabel = (type: string): string => {
    if (type === 'reading') return 'Reading';
    if (type === 'listening') return 'Listening';
    if (type === 'grammar') return 'Grammar';
    if (type === 'writing') return 'Writing';
    return type.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
  };

  const orderedTypes = ['reading', 'listening', 'grammar', 'writing'];

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Module training</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-2">Practice by section</h1>
          <p className="text-[#475569] mt-2">
            Choose an iTEP family and variant, then launch Reading, Listening, Grammar, or Writing practice.
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
          <div className="rounded-2xl border border-[#151d2b]/12 bg-white/70 px-4 py-3 text-[#475569]">Loading tests...</div>
        ) : null}
        {error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredExperiences.map((experience) => {
            const family = familyOf(experience);
            const variant = variantOf(experience);
            const sectionTypes = Array.from(
              new Set(
                (sectionsByExperience[experience.id] ?? [])
                  .map((section) => sectionType(section))
                  .filter((type) => type && type !== 'speaking' && type !== 'reading_writing' && type !== 'math'),
              ),
            );
            const orderedSectionTypes = orderedTypes.filter((type) => sectionTypes.includes(type));
            const extraSectionTypes = sectionTypes.filter((type) => !orderedTypes.includes(type));

            return (
              <div
                key={experience.id}
                className="rounded-[28px] border border-[#151d2b]/12 bg-white/75 backdrop-blur p-6 shadow-[0_10px_28px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                  <span className="rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1">iTEP mock</span>
                  {family ? <span className="rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1">{formatItepFamily(family)}</span> : null}
                  {variant ? <span className="rounded-full border border-[#151d2b]/12 bg-white/85 px-3 py-1">{formatItepVariant(variant)}</span> : null}
                </div>

                <div className="font-semibold text-[#0f172a] text-xl mt-3">{experience.name}</div>
                <div className="text-sm text-[#475569] mt-1">
                  {variant === 'core'
                    ? 'Launch an objective section from the Core simulation.'
                    : 'Launch the Writing Live response flow for this family.'}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {[...orderedSectionTypes, ...extraSectionTypes].map((type) => (
                    <button
                      key={type}
                      onClick={() => startPractice(experience.id, type)}
                      className="px-4 py-2 rounded-full border border-[#151d2b]/15 bg-white/80 text-[#111827] font-semibold hover:bg-white transition-colors"
                    >
                      {typeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredExperiences.length === 0 && !loading ? (
            <div className="rounded-[28px] border border-[#151d2b]/12 bg-white/75 p-8 text-[#475569]">
              No iTEP experiences match the current family and variant filters.
            </div>
          ) : null}
        </div>
      </div>
    </MainLayout>
  );
};
