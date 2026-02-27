import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../components/layout/MainLayout';
import { SAT_PRODUCT_ID } from '../lib/constants';
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

const sectionType = (s: SectionRow): string => String((s.metadata as any)?.type ?? 'unknown');

export const PracticePage: React.FC = () => {
  const navigate = useNavigate();
  const { userId, accessToken } = useAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [sectionsByExperience, setSectionsByExperience] = useState<Record<string, SectionRow[]>>({});

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const { data: expRows, error: expError } = await supabase
        .from('experiences')
        .select('id,name,display_order,is_active,metadata')
        .eq('product_id', SAT_PRODUCT_ID)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (expError) {
        setError(expError.message);
        setExperiences([]);
        setSectionsByExperience({});
        setLoading(false);
        return;
      }

      const exps = (expRows ?? []) as ExperienceRow[];
      setExperiences(exps);

      const expIds = exps.map((e) => e.id);
      if (expIds.length === 0) {
        setSectionsByExperience({});
        setLoading(false);
        return;
      }

      const { data: secRows, error: secError } = await supabase
        .from('sections')
        .select('id,experience_id,name,display_order,metadata')
        .in('experience_id', expIds)
        .order('display_order', { ascending: true });

      if (secError) {
        setSectionsByExperience({});
        setLoading(false);
        return;
      }

      const by: Record<string, SectionRow[]> = {};
      for (const s of (secRows ?? []) as SectionRow[]) {
        by[s.experience_id] = by[s.experience_id] ?? [];
        by[s.experience_id].push(s);
      }

      setSectionsByExperience(by);
      setLoading(false);
    };

    run();
  }, []);

  const startPractice = async (experienceId: string, type: string) => {
    setError(null);

    if (!userId || !accessToken) {
      setError('Session unavailable. Please refresh.');
      return;
    }

    const secs = sectionsByExperience[experienceId] ?? [];
    const section = secs.find((s) => sectionType(s) === type);

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
      setError('Failed to create session');
      return;
    }

    navigate(`/session/${result.sessionId}/${section.id}`);
  };

  const typeLabel = (type: string): string => {
    if (type === 'reading_writing') return 'Reading & Writing';
    if (type === 'math') return 'Math';
    return type.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const orderedTypes = useMemo(() => ['reading_writing', 'math'], []);

  return (
    <MainLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">Module training</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0f172a] mt-2">Practice by section</h1>
          <p className="text-[#475569] mt-2">Start one SAT section at a time: Reading & Writing or Math.</p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#151d2b]/12 bg-white/70 px-4 py-3 text-[#475569]">Loading tests...</div>
        ) : null}
        {error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {experiences.map((exp) => (
            <div key={exp.id} className="rounded-[28px] border border-[#151d2b]/12 bg-white/75 backdrop-blur p-6 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
              <div className="text-xs uppercase tracking-[0.12em] text-[#64748b] font-semibold">SAT mock</div>
              <div className="font-semibold text-[#0f172a] text-xl mt-2">{exp.name}</div>
              <div className="text-sm text-[#475569] mt-1">Choose a section:</div>

              <div className="mt-5 flex flex-wrap gap-2">
                {(() => {
                  const sectionTypes = Array.from(
                    new Set((sectionsByExperience[exp.id] ?? []).map((s) => sectionType(s)).filter(Boolean)),
                  );
                  const ordered = orderedTypes.filter((type) => sectionTypes.includes(type));
                  const extras = sectionTypes.filter((type) => !orderedTypes.includes(type));
                  return [...ordered, ...extras].map((type) => (
                    <button
                      key={type}
                      onClick={() => startPractice(exp.id, type)}
                      className="px-4 py-2 rounded-full border border-[#151d2b]/15 bg-white/80 text-[#111827] font-semibold hover:bg-white transition-colors"
                    >
                      {typeLabel(type)}
                    </button>
                  ));
                })()}
              </div>
            </div>
          ))}

          {experiences.length === 0 && !loading ? (
            <div className="rounded-[28px] border border-[#151d2b]/12 bg-white/75 p-8 text-[#475569]">
              No tests found.
            </div>
          ) : null}
        </div>
      </div>
    </MainLayout>
  );
};
