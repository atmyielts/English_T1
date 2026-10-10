import { requireCandidateAccount } from './auth.ts';

const headers = {
  'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
type CandidateClient = { sbAuth: Parameters<typeof requireCandidateAccount>[1]; sbDb: {
  rpc(name: string, args: Record<string, string>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
} };

async function readInput(req: Request): Promise<{ value?: Record<string, unknown>; tooLarge?: boolean }> {
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return { tooLarge: true }; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? { value } : {};
  } catch { return {}; }
}

export async function handleAtomicCandidateEntry(req: Request, clients: CandidateClient): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const identity = await requireCandidateAccount(req, clients.sbAuth);
    if (!identity.ok) return json(identity.status, { error: identity.error });
    const input = await readInput(req);
    if (input.tooLarge) return json(413, { error: 'Candidate details are too large.' });
    const body = input.value;
    if (!body || Object.entries({ token_code: 90, first_name: 100, last_name: 100, email: 320, phone: 80 }).some(([key, max]) =>
      typeof body[key] !== 'string' || (body[key] as string).length > max || !(body[key] as string).trim())) {
      return json(400, { error: 'Enter valid candidate details.' });
    }
    const code = (body.token_code as string).trim().toUpperCase().replace(/\s+/g, '');
    const email = (body.email as string).trim().toLowerCase();
    if (!/^[A-Z0-9-]{6,90}$/.test(code)) return json(400, { error: 'Enter a valid Candidate ID.' });
    if (email !== identity.email) return json(403, { error: 'Use the email of your signed-in account.' });
    const { data, error } = await clients.sbDb.rpc('admit_candidate_exam', {
      p_actor: identity.userId, p_code: code, p_email: identity.email,
      p_first_name: (body.first_name as string).trim(), p_last_name: (body.last_name as string).trim(), p_phone: (body.phone as string).trim(),
    });
    if (error) {
      if (error.code === 'P0002') return json(404, { code: 'candidate_not_found', error: 'Candidate ID not found.' });
      if (error.code === '42501') return json(403, { code: 'candidate_account_unavailable', error: 'This code is unavailable for your verified account. Ask your center to review it.' });
      if (['22023', '22P02', '23505', '23514'].includes(error.code ?? '')) return json(409, { code: 'candidate_review_required', error: 'Candidate entry requires review. Contact your teacher or center with the same candidate code.' });
      return json(503, { code: 'candidate_retry', error: 'Exam entry is temporarily unavailable. Retry the same candidate code.' });
    }
    const result = data as Record<string, unknown> | null;
    if (!result || result.actor_id !== identity.userId || !uuid(result.session_id) || !uuid(result.experience_id)
      || !uuid(result.first_section_id) || !uuid(result.product_id) || result.strict_mode !== true
      || !['candidate_id', 'center_voucher'].includes(String(result.launch_kind))) throw new Error('Invalid admission result');
    const app = new URL(String(result.app_url));
    if (!['https://ielts.schood.online', 'https://sat.schood.online', 'https://toefl.schood.online', 'https://itep.schood.online'].includes(app.origin)
      || app.username || app.password || app.pathname !== '/' || app.search || app.hash) throw new Error('Invalid exam origin');
    if (result.launch_kind === 'center_voucher' && (!uuid(result.voucher_id) || !uuid(result.center_tenant_id)
      || typeof result.voucher_code !== 'string' || !/^[A-Z0-9-]{6,90}$/.test(result.voucher_code))) throw new Error('Invalid voucher result');
    if (result.classroom_id !== null && result.classroom_id !== undefined && !uuid(result.classroom_id)) throw new Error('Invalid classroom result');
    // No table writes or compatibility fallback: a lost reply can only retry the same durable claim.
    return json(200, {
      actor_id: identity.userId, session_id: result.session_id, experience_id: result.experience_id,
      first_section_id: result.first_section_id, product_id: result.product_id,
      product_slug: typeof result.product_slug === 'string' ? result.product_slug : null,
      app_url: app.origin, strict_mode: true, launch_kind: result.launch_kind, deduped: result.deduped === true,
      voucher_id: result.voucher_id ?? null, voucher_code: result.voucher_code ?? null,
      center_tenant_id: result.center_tenant_id ?? null, classroom_id: result.classroom_id ?? null,
    });
  } catch {
    return json(503, { code: 'candidate_retry', error: 'Exam entry is temporarily unavailable. Retry the same candidate code.' });
  }
}
