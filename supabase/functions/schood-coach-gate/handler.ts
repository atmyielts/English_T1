import { formatCertificateCode, normalizeCertificateCode } from '../_shared/english-certificate.ts';
import { levelLabel, overallScale, pick, LOCALES } from '../../../packages/coach-packs/src/mod.ts';
import { dueDeliveries, recordDelivered, type DeliveryDeps } from '../schood-ai/coach/delivery.ts';

// schood-coach-gate: the two coach calls that have no signed-in person, until the
// schood-ai router offers routes for the worker without a user (see
// docs/product/ai-requests/coach.md):
//   POST /due        the cron's due reminders and weekly reports (worker secret)
//   POST /delivered  what Telegram did with them (worker secret)
//   GET  /verify     a certificate's public record, for its share link (public)
// The worker secret is SCHOOD_AI_SERVICE_SECRET, the same one the worker sends to
// schood-ai. Nothing here calls a model.

export interface GateOptions { secret: string | null; deps: DeliveryDeps }

const json = (status: number, value: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function createGateHandler(options: GateOptions) {
  const secret = options.secret && options.secret.length >= 32 ? options.secret : null;
  const workerAllowed = (req: Request) => {
    const presented = req.headers.get('x-schood-service-secret') ?? '';
    return !!secret && !req.headers.get('origin') && safeEqual(presented, secret);
  };
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const action = url.pathname.replace(/\/+$/, '').split('/').pop();
    try {
      if (action === 'verify') {
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (req.method !== 'GET') return json(405, { code: 'method_not_allowed' }, cors);
        const code = normalizeCertificateCode(url.searchParams.get('code'));
        const cert = code ? await options.deps.store.certificateByCode(code) : null;
        const pack = cert ? options.deps.packs.get(cert.pack) : undefined;
        if (!cert || !pack) return json(404, { code: 'not_found' }, cors);
        const rubric = pack.rubricById.get(cert.rubric);
        const milestone = pack.milestones.find((entry) => entry.id === cert.milestone);
        const names = Object.fromEntries(LOCALES.map((locale) => [locale, pick(pack.manifest.name, locale)]));
        return json(200, {
          certificate: {
            code: formatCertificateCode(cert.code), display_name: cert.displayName, coach: names, level: cert.levelLabel,
            title: milestone ? Object.fromEntries(LOCALES.map((locale) => [locale, pick(milestone.name, locale)])) : null,
            rubric: rubric ? Object.fromEntries(LOCALES.map((locale) => [locale, pick(rubric.name, locale)])) : null,
            results: cert.evidence.map((entry) => ({ at: entry.at, overall: entry.overall, label: entry.overall === null || !rubric ? null : levelLabel(overallScale(rubric), entry.overall) })),
            issued_at: cert.issuedAt, revoked: !!cert.revokedAt, accent: pack.manifest.accent ?? null,
          },
        }, { ...cors, 'Cache-Control': 'public, max-age=300' });
      }
      if (req.method !== 'POST') return json(405, { code: 'method_not_allowed' });
      if (!workerAllowed(req)) return json(401, { code: 'unauthorized' });
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      if (action === 'due') {
        const limit = Number.isInteger(body.limit) && (body.limit as number) >= 1 && (body.limit as number) <= 45 ? body.limit as number : 40;
        return json(200, { deliveries: await dueDeliveries(options.deps, limit) });
      }
      if (action === 'delivered') {
        const results = Array.isArray(body.results) ? body.results as { id: string; status: 'sent' | 'failed' | 'blocked'; reason?: string }[] : [];
        return json(200, { updated: await recordDelivered(options.deps.store, results) });
      }
      return json(404, { code: 'not_found' });
    } catch (cause) {
      console.error(JSON.stringify({ event: 'schood_coach_gate_failed', action, error: String(cause).slice(0, 300) }));
      return json(500, { code: 'internal_error' });
    }
  };
}
