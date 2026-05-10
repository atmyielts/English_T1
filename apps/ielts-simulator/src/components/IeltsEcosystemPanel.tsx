import React, { useEffect, useState } from 'react';
import { ArrowRight, BookMarked, GraduationCap, Sparkles } from 'lucide-react';
import { formatBand } from '@schood/ielts-core';

const PRACTICE_URL = 'https://practice.ielts.schood.online';
const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';

interface PlaybookDashboard {
  profile?: {
    target_overall_band?: number | null;
    weakest_skill?: string | null;
    evidence_updated_at?: string | null;
  } | null;
  recommendation?: {
    created_at?: string | null;
    plan_template?: { title?: string | null } | null;
    planning?: { realistic_timeline?: string | null } | null;
  } | null;
  practice_evidence?: {
    weak_question_types?: Array<{ question_type?: string }> | null;
  } | null;
}

interface SrsListResponse {
  items?: Array<unknown>;
  summary?: {
    due?: number;
    mastered?: number;
    total?: number;
  };
}

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const edgeBase = supabaseUrl ? `${supabaseUrl}/functions/v1` : null;

const fetchEcosystem = async (accessToken: string): Promise<{
  playbook: PlaybookDashboard | null;
  srs: SrsListResponse | null;
}> => {
  if (!edgeBase || !supabaseAnonKey) return { playbook: null, srs: null };

  const headers: HeadersInit = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${accessToken}`,
  };

  const [playbookRes, srsRes] = await Promise.allSettled([
    fetch(`${edgeBase}/ielts-playbook/dashboard`, { headers }).then(async (r) =>
      r.ok ? ((await r.json()) as PlaybookDashboard) : null,
    ),
    fetch(`${edgeBase}/ielts-srs?mode=daily&limit=1`, { headers }).then(async (r) =>
      r.ok ? ((await r.json()) as SrsListResponse) : null,
    ),
  ]);

  return {
    playbook: playbookRes.status === 'fulfilled' ? playbookRes.value : null,
    srs: srsRes.status === 'fulfilled' ? srsRes.value : null,
  };
};

const isPlanStale = (
  evidenceAt: string | null | undefined,
  planCreatedAt: string | null | undefined,
): boolean => {
  if (!evidenceAt) return false;
  if (!planCreatedAt) return true;
  return new Date(evidenceAt).getTime() > new Date(planCreatedAt).getTime();
};

interface Props {
  accessToken: string | null;
  latestBand: number | null;
}

export const IeltsEcosystemPanel: React.FC<Props> = ({ accessToken, latestBand }) => {
  const [playbook, setPlaybook] = useState<PlaybookDashboard | null>(null);
  const [srs, setSrs] = useState<SrsListResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) {
      setLoaded(true);
      return;
    }
    (async () => {
      const data = await fetchEcosystem(accessToken).catch(() => ({ playbook: null, srs: null }));
      if (cancelled) return;
      setPlaybook(data.playbook);
      setSrs(data.srs);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [accessToken]);

  if (!loaded) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-sm text-gray-500">Loading IELTS ecosystem...</div>
      </section>
    );
  }

  const targetBand = playbook?.profile?.target_overall_band ?? null;
  const weakestSkill = playbook?.profile?.weakest_skill ?? null;
  const planTitle = playbook?.recommendation?.plan_template?.title ?? null;
  const planTimeline = playbook?.recommendation?.planning?.realistic_timeline ?? null;
  const stale = isPlanStale(
    playbook?.profile?.evidence_updated_at,
    playbook?.recommendation?.created_at,
  );
  const dueCount = srs?.summary?.due ?? 0;
  const queueTotal = srs?.summary?.total ?? 0;
  const weakTypeCount = playbook?.practice_evidence?.weak_question_types?.length ?? 0;

  return (
    <section className="space-y-3">
      {stale ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <Sparkles size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              Your latest mock results came in after your current plan was generated.
              Regenerate your IELTS Playbook plan to fold them in.
            </div>
          </div>
          <a
            href={`${PLAYBOOK_URL}/dashboard?source=simulator&intent=regenerate`}
            className="flex-shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Regenerate plan
          </a>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            <GraduationCap size={14} /> Simulator
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-2xl font-semibold text-gray-900">{formatBand(latestBand)}</div>
            <div className="text-xs text-gray-500">latest mock band</div>
          </div>
          {targetBand != null ? (
            <div className="mt-1 text-xs text-gray-500">Target {formatBand(targetBand)}</div>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            <BookMarked size={14} /> Practice
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-2xl font-semibold text-gray-900">{dueCount}</div>
            <div className="text-xs text-gray-500">due now / {queueTotal} in queue</div>
          </div>
          <a
            href={`${PRACTICE_URL}/practice/reviews?source=simulator`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
          >
            Open queue <ArrowRight size={12} />
          </a>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            <Sparkles size={14} /> Playbook
          </div>
          <div className="mt-2 text-sm font-semibold text-gray-900">
            {planTitle ?? 'No plan yet'}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {planTimeline
              ? planTimeline
              : weakestSkill
                ? `Weak skill: ${weakestSkill}`
                : weakTypeCount > 0
                  ? `${weakTypeCount} weak types tracked`
                  : 'Run diagnostic to start'}
          </div>
          <a
            href={`${PLAYBOOK_URL}/dashboard?source=simulator`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
          >
            Open playbook <ArrowRight size={12} />
          </a>
        </div>
      </div>
    </section>
  );
};
