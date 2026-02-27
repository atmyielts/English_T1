import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../components/layout/MainLayout';
import { IELTS_PRODUCT_ID } from '../lib/constants';
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
        .eq('product_id', IELTS_PRODUCT_ID)
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

  const startPractice = async (experienceId: string, type: 'listening' | 'reading' | 'writing') => {
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

  const availableTypes = useMemo(() => ['listening', 'reading', 'writing'] as const, []);

  return (
    <MainLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Practice</h1>
          <p className="text-gray-500 mt-1">Start a single section (Listening, Reading, or Writing).</p>
        </div>

        {loading ? <div className="text-gray-600">Loading tests...</div> : null}
        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div> : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {experiences.map((exp) => (
            <div key={exp.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="font-bold text-gray-900 text-lg">{exp.name}</div>
              <div className="text-sm text-gray-600 mt-1">Choose a section:</div>

              <div className="mt-5 flex flex-wrap gap-2">
                {availableTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => startPractice(exp.id, t)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-50 transition-colors"
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {experiences.length === 0 && !loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-gray-600">
              No tests found.
            </div>
          ) : null}
        </div>
      </div>
    </MainLayout>
  );
};
