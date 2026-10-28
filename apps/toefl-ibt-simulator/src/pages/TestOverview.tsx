import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Play } from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { supabase } from '../lib/supabase';
import { createSession } from '../services/persistence';
import { useAccess } from '../lib/useAccess';
import { useAppT, type AppKey } from '../i18n';
import { is2026Metadata } from '../features/toefl2026/tasks';

type ExperienceRow = {
  id: string;
  name: string;
  metadata: Record<string, unknown> | null;
};

type SectionRow = {
  id: string;
  name: string;
  display_order: number;
  metadata: Record<string, unknown> | null;
};

type SessionRow = {
  id: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const sectionType = (s: SectionRow): string => String((s.metadata as any)?.type ?? 'unknown');

export const TestOverview: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { testId } = useParams<{ testId: string }>();
  const { userId, accessToken } = useAccess();
  const t = useAppT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experience, setExperience] = useState<ExperienceRow | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [resumeSession, setResumeSession] = useState<SessionRow | null>(null);

  const firstSectionId = useMemo(() => sections.slice().sort((a, b) => a.display_order - b.display_order)[0]?.id ?? null, [sections]);
  const isAdminPreview = location.pathname.startsWith('/admin/test/');
  const sessionBasePath = isAdminPreview ? '/admin/session' : '/session';

  useEffect(() => {
    const run = async () => {
      if (!testId) return;
      if (!userId) {
        setLoading(true);
        return;
      }

      setLoading(true);
      setError(null);

      const [{ data: exp, error: expError }, { data: secs, error: secsError }, { data: sessionsData, error: sessionsError }] =
        await Promise.all([
          supabase.from('experiences').select('id, name, metadata').eq('id', testId).maybeSingle(),
          supabase.from('sections').select('id, name, display_order, metadata').eq('experience_id', testId).order('display_order', { ascending: true }),
          supabase
            .from('sessions')
            .select('id, status, metadata, created_at')
            .eq('user_id', userId)
            .eq('experience_id', testId)
            .in('status', ['created', 'active', 'paused'])
            .order('created_at', { ascending: false })
            .limit(1),
        ]);

      if (expError) {
        setError(expError.message);
        setLoading(false);
        return;
      }

      if (!exp) {
        setError('Test not found');
        setLoading(false);
        return;
      }

      if (secsError) {
        setError(secsError.message);
        setLoading(false);
        return;
      }

      if (sessionsError) {
        setError(sessionsError.message);
        setLoading(false);
        return;
      }

      setExperience(exp as ExperienceRow);
      setSections((secs ?? []) as SectionRow[]);
      setResumeSession(((sessionsData ?? [])[0] ?? null) as SessionRow | null);
      setLoading(false);
    };

    run();
  }, [navigate, testId, userId]);

  const startOrResume = async (mode: 'new' | 'resume') => {
    if (!testId) return;

    setError(null);

    if (!userId || !accessToken) {
      setError('Session unavailable. Please refresh.');
      return;
    }

    if (!firstSectionId) {
      setError('No sections found for this test');
      return;
    }

    if (mode === 'resume' && resumeSession) {
      const currentSection = String((resumeSession.metadata as any)?.current_section_id ?? firstSectionId);
      navigate(`${sessionBasePath}/${resumeSession.id}/${currentSection}`);
      return;
    }

    const result = await createSession(accessToken, testId);
    if (!result.sessionId) {
      if (result.code === 'usage_limit_reached') {
        setError(
          result.capabilityKey === 'writing_submissions'
            ? 'Monthly writing feedback limit reached.'
            : 'Monthly full test limit reached.',
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

    navigate(`${sessionBasePath}/${result.sessionId}/${firstSectionId}`);
  };

  const startSectionOnly = async (sectionId: string, groupIds?: string[]) => {
    if (!testId) return;

    setError(null);

    if (!userId || !accessToken) {
      setError('Session unavailable. Please refresh.');
      return;
    }

    const result = await createSession(accessToken, testId, {
      mode: 'section_only',
      allowed_section_ids: groupIds && groupIds.length ? groupIds : [sectionId],
    });

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

    navigate(`${sessionBasePath}/${result.sessionId}/${sectionId}`);
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate(isAdminPreview ? '/admin/tests' : '/dashboard')}
          className="flex items-center text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={18} className="mr-2" /> Back to Dashboard
        </button>

        {loading ? <div className="text-gray-600">Loading...</div> : null}
        {error ? (
          <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        ) : null}

        {experience ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-900 p-8 text-white">
              <h1 className="text-3xl font-bold mb-2">{experience.name}</h1>
              <p className="text-gray-300">Computer-based format. Your answers are saved automatically.</p>
            </div>

            <div className="p-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{t('overview.sections')}</h2>
              {is2026Metadata(experience.metadata) ? (
                <div className="space-y-3" data-testid="overview-2026">
                  <p className="text-sm text-gray-600">{t('overview.intro')}</p>
                  <p className="text-sm text-gray-600">{t('overview.adaptive')}</p>
                  {Array.from(new Set(sections.map(sectionType))).map((type) => {
                    const group = sections.filter((s) => sectionType(s) === type);
                    const seconds = group.reduce((sum, s) => sum + (Number((s.metadata as any)?.duration_seconds) || 0), 0);
                    return (
                      <div key={type} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50">
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900">{t(`section.${type}` as AppKey)}</div>
                          <div className="text-sm text-gray-600 break-words">{group.map((s) => s.name).join(' · ')}</div>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          <div className="text-sm text-gray-600 flex items-center gap-2"><Clock size={16} /> {t('overview.minutes', { count: Math.round(seconds / 60) })}</div>
                          <button onClick={() => void startSectionOnly(group[0].id, group.map((s) => s.id))} className="min-h-[44px] px-4 py-2 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-white transition-colors">
                            {t('overview.take_skill')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div className="space-y-3">
                {sections.map((s) => {
                  const duration = (s.metadata as any)?.duration_seconds as number | undefined;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50">
                      <div>
                        <div className="font-bold text-gray-900">{s.name}</div>
                        <div className="text-sm text-gray-600">Type: {sectionType(s)}</div>
                      </div>
                      <div className="shrink-0 flex items-center gap-3">
                        <div className="text-sm text-gray-600 flex items-center gap-2">
                          <Clock size={16} /> {typeof duration === 'number' ? `${Math.round(duration / 60)} min` : 'n/a'}
                        </div>
                        <button
                          onClick={() => void startSectionOnly(s.id)}
                          className="px-4 py-2 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-white transition-colors"
                        >
                          Take section
                        </button>
                      </div>
                    </div>
                  );
                })}

                {sections.length === 0 ? <div className="text-gray-600">No sections found.</div> : null}
              </div>
              )}

              <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-gray-100">
                {resumeSession ? (
                  <button
                    onClick={() => startOrResume('resume')}
                    className="px-6 py-3 border border-gray-300 text-gray-900 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    {t('overview.resume')}
                  </button>
                ) : null}

                <button
                  onClick={() => startOrResume('new')}
                  className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
                >
                  <Play size={18} /> {is2026Metadata(experience.metadata) ? t('overview.start') : 'Start'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </MainLayout>
  );
};
