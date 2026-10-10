type Session = { access_token: string; user: { id: string; email?: string } };
type Client = {
  auth: {
    getSession(): PromiseLike<{ data: { session: Session | null } }>;
    getUser(token: string): PromiseLike<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
  };
  functions: { invoke(name: string, options: { method: 'DELETE'; headers: Record<string, string>; body: { confirm_email: string } }): PromiseLike<{ data: unknown; error: unknown }> };
};
export class AccountDeletionError extends Error {
  readonly code: 'account_changed' | 'session_required' | 'delete_unavailable' | 'ownership_transfer_required';
  constructor(code: 'account_changed' | 'session_required' | 'delete_unavailable' | 'ownership_transfer_required') { super(code); this.code = code; }
}
async function requiresOwnershipTransfer(error: unknown): Promise<boolean> {
  const response=error && typeof error==='object' && 'context' in error ? error.context : null;
  if (!(response instanceof Response) || response.status!==409 || !response.body) return false;
  const reader=response.clone().body!.getReader();
  const chunks: Uint8Array[]=[];let size=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>1024){await reader.cancel();return false;}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder().decode(bytes))?.code==='account_ownership_transfer_required';
  }catch{return false;}finally{reader.releaseLock();}
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
  if (await requiresOwnershipTransfer(error)) throw new AccountDeletionError('ownership_transfer_required');
  if (error || !data || typeof data !== 'object' || !('ok' in data) || data.ok !== true
    || ('actor_id' in data && data.actor_id !== actor)) throw new AccountDeletionError('delete_unavailable');
  // The installed older endpoint returns only {ok:true}; it already used the captured verified token.
  return { actor };
}
