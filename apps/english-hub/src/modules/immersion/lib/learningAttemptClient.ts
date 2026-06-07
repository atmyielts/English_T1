import { edgeBase, supabaseAnonKey } from './runtimeConfig';

const readJsonOrText = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
};

const call = async (
  accessToken: string,
  pathname: string,
  init: RequestInit,
): Promise<unknown> => {
  const res = await fetch(`${edgeBase}/learning-attempts${pathname}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`learning-attempts failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return readJsonOrText(res);
};

export const getLearningAttempt = async (
  accessToken: string,
  attemptId: string,
): Promise<{
  attempt: Record<string, unknown>;
  content_item?: Record<string, unknown> | null;
  feedback?: Record<string, unknown> | null;
}> =>
  (await call(accessToken, `/${encodeURIComponent(attemptId)}`, {
    method: 'GET',
  })) as {
    attempt: Record<string, unknown>;
    content_item?: Record<string, unknown> | null;
    feedback?: Record<string, unknown> | null;
  };
