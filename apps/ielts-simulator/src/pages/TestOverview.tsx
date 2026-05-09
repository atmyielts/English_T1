import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Play, ShieldCheck } from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { supabase } from '../lib/supabase';
import { createSession } from '../services/persistence';
import { useAccess } from '../lib/useAccess';

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

  const startSectionOnly = async (sectionId: string) => {
    if (!testId) return;

    setError(null);

    if (!userId || !accessToken) {
      setError('Session unavailable. Please refresh.');
      return;
    }

    const result = await createSession(accessToken, testId, {
      mode: 'section_only',
      allowed_section_ids: [sectionId],
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
      <div className="max-w-4xl mx-auto">
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

            {isAdminPreview ? (
              <AdminStrictModePanel
                experienceId={experience.id}
                metadata={(experience.metadata ?? {}) as Record<string, unknown>}
                onUpdated={(nextMeta) => setExperience((prev) => (prev ? { ...prev, metadata: nextMeta } : prev))}
              />
            ) : null}

            <div className="p-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Sections</h2>
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

              <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-gray-100">
                {resumeSession ? (
                  <button
                    onClick={() => startOrResume('resume')}
                    className="px-6 py-3 border border-gray-300 text-gray-900 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Resume
                  </button>
                ) : null}

                <button
                  onClick={() => startOrResume('new')}
                  className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
                >
                  <Play size={18} /> Start
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </MainLayout>
  );
};

interface AdminStrictModePanelProps {
  experienceId: string;
  metadata: Record<string, unknown>;
  onUpdated: (nextMeta: Record<string, unknown>) => void;
}

const AdminStrictModePanel: React.FC<AdminStrictModePanelProps> = ({ experienceId, metadata, onUpdated }) => {
  const initialStrict = Boolean((metadata as any)?.strict_mode);
  const initialReview =
    typeof (metadata as any)?.listening_review_seconds === 'number'
      ? Number((metadata as any).listening_review_seconds)
      : 120;

  const [strict, setStrict] = useState<boolean>(initialStrict);
  const [reviewSeconds, setReviewSeconds] = useState<number>(initialReview);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = strict !== initialStrict || reviewSeconds !== initialReview;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const nextMeta: Record<string, unknown> = {
        ...metadata,
        strict_mode: strict,
        listening_review_seconds: Math.max(0, Math.floor(reviewSeconds)),
      };
      const { error: updateError } = await supabase.from('experiences').update({ metadata: nextMeta }).eq('id', experienceId);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      onUpdated(nextMeta);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-8 pt-6 pb-2">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-slate-700" />
          <h3 className="text-sm font-bold text-slate-900">Admin: exam runtime</h3>
          {savedAt ? <span className="ml-2 text-xs text-emerald-700">Saved {savedAt}</span> : null}
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Controls applied to all sessions of this test until changed.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => setStrict(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-900">Strict exam mode</div>
              <div className="text-xs text-slate-600">
                Pre-test instructions, headphone check, full-screen prompt, integrity event log, paste blocking in Writing.
              </div>
            </div>
          </label>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <label className="text-sm font-semibold text-slate-900">Listening review window (seconds)</label>
            <div className="text-xs text-slate-600 mt-0.5">
              Computer IELTS uses 2 minutes (120s). The audio runtime auto-extends the section deadline by this much.
            </div>
            <input
              type="number"
              min={0}
              max={600}
              step={30}
              value={reviewSeconds}
              onChange={(e) => setReviewSeconds(Number(e.target.value))}
              className="mt-2 w-32 px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm p-2">{error}</div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-black disabled:bg-slate-400 text-sm"
          >
            {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>
    </div>
  );
};
