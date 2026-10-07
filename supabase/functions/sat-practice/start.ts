import { bankFilters, type BankFilters } from './bank.ts';
import { AttemptError } from './completion.ts';
import { isObject } from '../_shared/sat-practice-core.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readStartBody(req: Request): Promise<Record<string, unknown>> {
  if (!req.body) return {}; // Support an older client's explicit empty POST.
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();if (next.done) break;
      size += next.value.length;
      if (size > 16384) {
        await reader.cancel().catch(() => {});
        throw new AttemptError(413, 'The drill selection is too large.');
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (!size) return {};
  const buffer = new Uint8Array(size);let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset);offset += chunk.length; }
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(buffer));
    if (isObject(parsed)) return parsed;
  } catch { /* Invalid input must not silently start an unrestricted drill. */ }
  throw new AttemptError(400, 'Invalid drill start request.');
}

export async function startAttempt(
  sb: any, userId: string, body: Record<string, unknown>,
  review?: { id: string; section_type: string; domain: string; difficulty: string },
) {
  if (body.request_id !== undefined && (typeof body.request_id !== 'string' || !uuid.test(body.request_id))) {
    throw new AttemptError(400, 'Invalid drill start request.');
  }
  // Older clients still work during the rolling release. New clients retain this
  // ID until a confirmed result, so a lost response can replay the same start.
  const requestId = typeof body.request_id === 'string' ? body.request_id.toLowerCase() : crypto.randomUUID();
  const filters: BankFilters & { retry_notebook_id?: string } = review
    ? { ...bankFilters({ ...review, limit: 6 }), retry_notebook_id: review.id }
    : bankFilters({ ...body, limit: body.question_count }, 10);
  const { data, error } = await sb.rpc('start_sat_practice_attempt', {
    p_user_id: userId, p_request_id: requestId, p_filters: filters,
  });
  if (error) {
    if (error.code === 'P0002') throw new AttemptError(404, 'Drill or review not found.');
    if (error.code === 'P0001') throw new AttemptError(409, 'No questions match this drill. Try different filters in the question bank.');
    if (error.code === '23505') throw new AttemptError(409, 'This start request was already used for another drill.');
    if (['22023', '22P02'].includes(error.code)) throw new AttemptError(400, 'Invalid drill selection.');
    throw new AttemptError(503, 'The drill start could not be confirmed. Retry with the same selection.');
  }
  if (!data?.attempt || data.attempt.id !== requestId || !Array.isArray(data.questions) || !data.questions.length) {
    throw new AttemptError(503, 'The drill start could not be confirmed. Please retry.');
  }
  return data;
}
