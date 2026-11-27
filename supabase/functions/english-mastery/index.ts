import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnglishSuiteAccess } from '../_shared/english-access.ts';
import { authUser, corsHeaders, extractRoute, getEnv, json, parseBody, resolveEnglishProducts } from '../_shared/english-learning.ts';
import { isServicePaused, loadEnglishSettings } from '../_shared/english-settings.ts';

const functionPath = '/english-mastery';
const phases = ['diagnostic', 'transfer', 'retention'];
const slugPath = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

const reply = (status: number, body: Record<string, unknown>) => {
  const response = json(status, body);
  response.headers.set('Cache-Control', 'no-store');
  return response;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  const path = extractRoute(new URL(req.url), functionPath);
  const slug = slugPath.exec(path)?.[1] ?? null;
  const catalog = req.method === 'GET' && (path === '' || path === '/');
  if (!catalog && (!slug || slug.length > 80)) return reply(404, { error: 'Competency not found' });

  try {
    const sb = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const user = await authUser(sb, req);
    if (!user) return reply(401, { error: 'Unauthorized' });

    const products = await resolveEnglishProducts(sb);
    const [access, settings] = await Promise.all([
      requireEnglishSuiteAccess(sb, user.userId, products),
      loadEnglishSettings(sb),
    ]);
    if (!access.admin && isServicePaused(settings, 'grammar')) {
      return reply(403, { error: 'Grammar is paused', code: 'service_paused' });
    }
    if (!access.admin && !access.entitlementProductIds.includes(String(products.grammar?.productId ?? ''))) {
      return reply(403, { error: 'Grammar mastery checks require Grammar access', code: 'mastery_entitlement' });
    }

    const scope = { p_user: user.userId, p_skill: 'grammar', p_slug: slug };
    let receipt = null;
    if (req.method === 'POST') {
      const { phase, round, request_id, answers } = await parseBody(req);
      if (typeof phase !== 'string' || !phases.includes(phase) ||
          typeof round !== 'number' || !Number.isInteger(round) || round < 1 || round > 32767 ||
          typeof request_id !== 'string' || !uuid.test(request_id) ||
          !Array.isArray(answers) || answers.length < 2 || answers.length > 8 ||
          answers.some((answer) => typeof answer === 'string' ? answer.length > 160 :
            !Number.isInteger(answer) || answer < 0 || answer > 7)) {
        return reply(422, { error: 'Invalid mastery submission', code: 'invalid_answers' });
      }
      const { data, error } = await sb.rpc('english_competency_submit', {
        ...scope, p_phase: phase, p_round: round, p_request: request_id, p_answers: answers,
      });
      if (error) throw error;
      if (data?.code === 'not_found') return reply(404, { error: 'Competency not found' });
      if (data?.code === 'invalid_answers') {
        return reply(422, { error: 'Check every answer and try again', code: data.code });
      }
      if (data?.code) return reply(409, { error: 'This check has changed', code: data.code });
      if (!data?.receipt) throw new Error('Missing submission receipt');
      receipt = data.receipt;
    }

    const { data, error } = await sb.rpc('english_competency_view', scope);
    if (error) throw error;
    if (catalog) return reply(200, { competencies: data });
    if (!data?.[0]) return reply(404, { error: 'Competency not found' });
    return reply(200, { competency: data[0], receipt });
  } catch (cause) {
    console.error('English mastery request failed', cause);
    return reply(500, { error: 'Could not load mastery checks' });
  }
});
