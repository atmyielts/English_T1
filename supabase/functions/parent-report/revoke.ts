type RevokeClient = {
  rpc: (name: string, args: Record<string, string>) => PromiseLike<{ data: unknown; error: unknown }>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// The caller ID comes exclusively from index.ts's successful Auth getUser,
// never from a header override, token payload decode, or request body field.
export async function revokeParentReport(
  method: string, verifiedActor: string, body: unknown, client: RevokeClient,
): Promise<Response> {
  if (method !== 'POST') return json(405, { error: 'Use POST to revoke a report link' });
  if (!uuid.test(verifiedActor)) return json(401, { error: 'Unauthorized' });
  const tokenId = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>).token_id : null;
  if (typeof tokenId !== 'string' || !uuid.test(tokenId)) return json(400, { error: 'A valid token_id is required' });
  try {
    const { data, error } = await client.rpc('parent_report_revoke', { p_actor: verifiedActor, p_token_id: tokenId });
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return json(503, { error: 'Report revocation is temporarily unavailable' });
    }
    const result = data as Record<string, unknown>;
    if (result.ok === true && Object.keys(result).length === 1) return json(200, { ok: true });
    if (result.ok === false && result.code === 'report_session_required') return json(401, { error: 'Unauthorized' });
    if (result.ok === false && result.code === 'report_revoke_denied') return json(403, { error: 'Report link cannot be revoked with your current access' });
    return json(503, { error: 'Report revocation is temporarily unavailable' });
  } catch {
    return json(503, { error: 'Report revocation is temporarily unavailable' });
  }
}
