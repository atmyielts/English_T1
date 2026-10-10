type Session = { access_token: string; user: { id: string; email?: string } };
type Client = {
  auth: {
    getSession(): PromiseLike<{ data: { session: Session | null } }>;
    getUser(token: string): PromiseLike<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
  };
  functions: { invoke(name: string, options: { method: 'DELETE'; headers: Record<string, string>; body: { confirm_email: string } }): PromiseLike<{ data: unknown; error: unknown }> };
};
export class AccountDeletionError extends Error {
  readonly code: 'account_changed' | 'session_required' | 'delete_unavailable';
  constructor(code: 'account_changed' | 'session_required' | 'delete_unavailable') { super(code); this.code = code; }
}
export async function deleteOwnAccount(client: Client, actor: string, confirmedEmail: string, mounted: () => boolean) {
  const email = confirmedEmail.trim().toLowerCase();
  const current = async () => {
    const { data } = await client.auth.getSession();
    if (!mounted() || data.session?.user.id !== actor || data.session.user.email?.trim().toLowerCase() !== email)
      throw new AccountDeletionError('account_changed');
    return data.session;
  };
  const session = await current();
  const verified = await client.auth.getUser(session.access_token);
  if (verified.error && typeof verified.error === 'object' && 'status' in verified.error
    && (Number(verified.error.status) >= 500 || Number(verified.error.status) === 429)) throw new AccountDeletionError('delete_unavailable');
  if (verified.error || !verified.data.user) throw new AccountDeletionError('session_required');
  if (verified.data.user.id !== actor || verified.data.user.email?.trim().toLowerCase() !== email)
    throw new AccountDeletionError('account_changed');
  await current();
  const { data, error } = await client.functions.invoke('account', {
    method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}`, 'x-user-jwt': session.access_token }, body: { confirm_email: email },
  });
  if (error || !data || typeof data !== 'object' || !('ok' in data) || data.ok !== true
    || ('actor_id' in data && data.actor_id !== actor)) throw new AccountDeletionError('delete_unavailable');
  // The installed older endpoint returns only {ok:true}; it already used the captured verified token.
  return { actor };
}
