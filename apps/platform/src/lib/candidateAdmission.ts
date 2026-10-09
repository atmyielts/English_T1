export const candidateAppBase = (value: unknown): string => {
  const url = new URL(String(value ?? '').trim());
  if (!['https://ielts.schood.online', 'https://sat.schood.online', 'https://toefl.schood.online', 'https://itep.schood.online'].includes(url.origin)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Exam app URL is not configured correctly');
  }
  return url.origin;
};

type CandidateSession = { access_token: string; refresh_token: string; expires_in: number; token_type: string; user: { id: string; email?: string } };
export const admitCandidateResponse = <T extends { session_id: string; app_url: string | null; actor_id?: string }>(
  response: T, initial: CandidateSession, current: CandidateSession | null,
): T & { session: CandidateSession } => {
  if (!current || current.user.id !== initial.user.id || (response.actor_id && response.actor_id !== initial.user.id)) {
    throw new Error('Your account changed. Sign in and retry the same candidate code.');
  }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(response.session_id)) {
    throw new Error('Exam entry returned an invalid session. Retry the same candidate code.');
  }
  candidateAppBase(response.app_url);
  // Older published functions return credentials. Always replace those with this account's session.
  return { ...response, session: current };
};
