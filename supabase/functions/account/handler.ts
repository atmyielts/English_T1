const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
type AccountClient = { auth: {
  getUser(token: string): PromiseLike<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
  admin: { deleteUser(id: string): PromiseLike<{ error: unknown }> };
}; rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
async function confirmation(req: Request): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes))?.confirm_email;
    return typeof value === 'string' && value.trim().length <= 320 ? value.trim().toLowerCase() : null;
  } catch { return null; }
}
export async function handleAccountDeletion(req: Request, client: AccountClient): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'DELETE') return json(405, { error: 'Method not allowed' });
  try {
    const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
    const legacy = req.headers.get('x-user-jwt')?.trim();
    if (!bearer || bearer.length > 8192 || (legacy && legacy !== bearer)) return json(401, { code: 'account_session_required', error: 'Sign in to delete your account.' });
    const { data, error } = await client.auth.getUser(bearer);
    if (error && typeof error === 'object' && 'status' in error && (Number(error.status) >= 500 || Number(error.status) === 429))
      return json(503, { code: 'account_delete_unavailable', error: 'Account verification is temporarily unavailable.' });
    const actor = data.user;
    if (error || !actor || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(actor.id))
      return json(401, { code: 'account_session_required', error: 'Sign in to delete your account.' });
    const email = await confirmation(req);
    if (!email) return json(400, { code: 'account_confirmation_required', error: 'Confirm your current account email before deletion.' });
    if (!actor.email || email !== actor.email.trim().toLowerCase())
      return json(409, { code: 'account_confirmation_changed', error: 'Your account changed. Confirm the current account before deletion.' });
    // The final Auth transaction repeats this guard under database locks; this
    // preflight provides a useful response without weakening that race boundary.
    const readiness = await client.rpc('account_deletion_preflight', { p_actor: actor.id });
    if (readiness.error || !readiness.data || typeof readiness.data !== 'object')
      return json(503, { code: 'account_delete_unavailable', error: 'Account deletion is temporarily unavailable.' });
    const decision = readiness.data as { eligible?: unknown; code?: unknown };
    if (decision.eligible === false && decision.code === 'account_ownership_transfer_required')
      return json(409, { code: 'account_ownership_transfer_required', error: 'Transfer your academy or center ownership before deleting your account.' });
    if (decision.eligible !== true || decision.code !== undefined)
      return json(503, { code: 'account_delete_unavailable', error: 'Account deletion is temporarily unavailable.' });
    // Personal erasure and financial retention are a separate migration gate.
    // Keep hard deletion until that complete lifecycle is qualified; simply
    // soft-deleting Auth would retain personal data in application tables.
    const { error: deleteError } = await client.auth.admin.deleteUser(actor.id);
    if (deleteError) return json(503, { code: 'account_delete_unavailable', error: 'We could not delete your account. Try again or contact support for help reviewing linked records.' });
    return json(200, { ok: true, actor_id: actor.id });
  } catch {
    return json(503, { code: 'account_delete_unavailable', error: 'We could not delete your account. Try again or contact support.' });
  }
}
