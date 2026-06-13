import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const CandidateHandoff: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [firstSectionId, setFirstSectionId] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const parseParams = (raw: string): URLSearchParams => {
        const trimmed = raw.startsWith('#') ? raw.slice(1) : raw;
        const cleaned = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
        return new URLSearchParams(cleaned);
      };

      const hashParams = parseParams(location.hash);
      const queryParams = new URLSearchParams(location.search);

      const accessToken = hashParams.get('access_token') ?? queryParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') ?? queryParams.get('refresh_token');
      const session = hashParams.get('session_id') ?? queryParams.get('session_id');
      const firstSection = hashParams.get('first_section_id') ?? queryParams.get('first_section_id');
      const strictMode = (hashParams.get('strict_mode') ?? queryParams.get('strict_mode')) !== '0';
      const launchKind = hashParams.get('launch_kind') ?? queryParams.get('launch_kind') ?? 'candidate_id';
      const voucherCode = hashParams.get('voucher_code') ?? queryParams.get('voucher_code');
      const centerTenantId = hashParams.get('center_tenant_id') ?? queryParams.get('center_tenant_id');
      const classroomId = hashParams.get('classroom_id') ?? queryParams.get('classroom_id');
      const centerSlug = hashParams.get('center_slug') ?? queryParams.get('center_slug');

      if (!accessToken || !refreshToken || !session) {
        setError('Missing candidate session details. Please request a new access link from your teacher.');
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        setError('Unable to start your session. Please try again.');
        return;
      }

      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/candidate');
      }

      const { data: sessionRow, error: loadSessionError } = await supabase
        .from('sessions')
        .select('id, status')
        .eq('id', session)
        .maybeSingle();

      if (loadSessionError || !sessionRow?.id) {
        setError('Unable to load your exam session. Please request a new access code from your teacher.');
        return;
      }

      const currentStatus = String(sessionRow.status ?? '').toLowerCase();
      if (currentStatus === 'completed') {
        localStorage.removeItem('sat:candidate_session');
        navigate(`/candidate/session/${session}/results`, { replace: true });
        return;
      }

      if (currentStatus === 'abandoned' || currentStatus === 'expired') {
        setError('This one-time session has already ended. Please ask your teacher for a new Candidate ID.');
        return;
      }

      if (currentStatus === 'created') {
        await supabase
          .from('sessions')
          .update({ status: 'active', started_at: new Date().toISOString() })
          .eq('id', session)
          .eq('status', 'created');
      } else if (currentStatus === 'paused') {
        await supabase
          .from('sessions')
          .update({ status: 'active', resumed_at: new Date().toISOString() })
          .eq('id', session)
          .eq('status', 'paused');
      }

      localStorage.setItem(
        'sat:candidate_session',
        JSON.stringify({
          sessionId: session,
          firstSectionId: firstSection ?? null,
          startedAt: new Date().toISOString(),
          strictMode,
          launchKind,
          voucherCode,
          centerTenantId,
          classroomId,
          centerSlug,
        }),
      );

      setSessionId(session);
      setFirstSectionId(firstSection);
      setReady(true);
    };

    void run();
  }, [location.hash, location.search, navigate]);

  const startExam = () => {
    if (!sessionId || !firstSectionId) {
      setError('This test is not ready to start. Please ask your teacher for a new access code.');
      return;
    }
    navigate(`/candidate/session/${sessionId}/${firstSectionId}`, { replace: true });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900">Candidate Access</h1>
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>
          <div className="mt-6">
            <button
              onClick={() => navigate('/', { replace: true })}
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
            >
              Back to landing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="text-xs font-semibold tracking-wider uppercase text-emerald-700 mb-2">Candidate Access</div>
        <h1 className="text-2xl font-bold text-gray-900">Your one-time mock test is ready</h1>
        <p className="mt-3 text-sm text-gray-600">
          This access is single-use. If you leave the exam before submitting, it will be marked as abandoned and cannot be
          restarted. Make sure you are ready before starting.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={startExam}
            disabled={!ready}
            className="px-5 py-3 rounded-full bg-gray-900 text-white font-semibold disabled:opacity-60"
          >
            Start exam
          </button>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-5 py-3 rounded-full border border-gray-200 bg-white font-semibold"
          >
            Back to landing
          </button>
        </div>
      </div>
    </div>
  );
};
