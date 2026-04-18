import { supabase } from '../lib/supabase';
import { startSession } from '../lib/platformClient';
import type { Response } from '../domain/models';

export type CreateSessionResult = { sessionId: string | null; code?: string; capabilityKey?: string; error?: string };

const extractErrorCode = (message: string): string | undefined => {
  if (message.includes('usage_limit_reached')) return 'usage_limit_reached';
  if (message.includes('No entitlement')) return 'no_entitlement';
  if (message.includes('concurrent_session_limit_reached')) return 'concurrent_session_limit_reached';
  if (message.includes('device_limit_reached')) return 'device_limit_reached';
  return undefined;
};

const extractJsonFromMessage = (message: string): Record<string, unknown> | null => {
  const match = message.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const createSession = async (
  accessToken: string,
  experienceId: string,
  metadata?: Record<string, unknown>,
): Promise<CreateSessionResult> => {
  try {
    const body = {
      experience_id: experienceId,
      metadata: metadata ?? {},
    };

    const res = await startSession(accessToken, body);
    return { sessionId: res.session_id ?? null };
  } catch (err) {
    // Token can expire between guard check and start-session call; retry once with refreshed session.
    const status = (err as { status?: number } | null)?.status;
    if (status === 401) {
      try {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
          const retried = await startSession(refreshed.session.access_token, {
            experience_id: experienceId,
            metadata: metadata ?? {},
          });
          return { sessionId: retried.session_id ?? null };
        }
      } catch {
        // fall through to normalized error handling
      }
    }

    const message = err instanceof Error ? err.message : 'Failed to create session';
    const details = extractJsonFromMessage(message);
    const code =
      typeof details?.code === 'string' ? (details.code as string) : extractErrorCode(message);
    const capabilityKey = typeof details?.capability_key === 'string' ? (details.capability_key as string) : undefined;
    return { sessionId: null, error: message, code, capabilityKey };
  }
};

export const insertResponse = async (
  sessionId: string,
  contentUnitId: string,
  unitType: string,
  value: any,
): Promise<void> => {
  const { error } = await supabase.from('responses').insert({
    session_id: sessionId,
    content_unit_id: contentUnitId,
    type: unitType,
    data: value,
    submitted_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to insert response:', error);
  }
};

export const finalizeSession = async (sessionId: string): Promise<void> => {
  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to finalize session:', error);
  }
};

export const abandonSession = async (sessionId: string): Promise<void> => {
  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'abandoned',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to abandon session:', error);
  }
};

export const getResponses = async (sessionId: string): Promise<Response[]> => {
  const { data, error } = await supabase.from('responses').select('*').eq('session_id', sessionId);

  if (error) {
    console.error('Failed to fetch responses:', error);
    return [];
  }

  return (data ?? []).map((r: any) => ({
    id: r.id,
    sessionId: r.session_id,
    contentUnitId: r.content_unit_id,
    type: r.type,
    data: r.data,
    submittedAt: r.submitted_at,
  }));
};

export const persistEvaluation = async (sessionId: string, result: any): Promise<void> => {
  const { error } = await supabase.from('evaluations').insert({
    session_id: sessionId,
    method: 'auto',
    status: 'completed',
    result,
    evaluated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to persist evaluation:', error);
  }
};
