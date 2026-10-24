// Level certificates: issue from the latest tested placement or monthly check,
// list and revoke the learner's own, and a public lookup by code (no session).
// Pure rules live in _shared/english-certificate.ts.
import { corsHeaders, json, parseBody } from "../_shared/english-learning.ts";
import {
  type CertificateRow,
  cleanDisplayName,
  generateCertificateCode,
  latestMeasurement,
  normalizeCertificateCode,
  ownCertificate,
  publicCertificate,
} from "../_shared/english-certificate.ts";
import { readLevelHistory } from "../_shared/english-levels.ts";
import { TODAY_SKILLS } from "../_shared/english-today.ts";

const COLUMNS = "id, code, user_id, display_name, overall, per_skill, measured_by, measured_at, activities_count, issued_at, revoked_at";
/** Revoke-and-reissue is allowed, but not without limit. */
const MAX_CERTIFICATES_PER_LEARNER = 30;

const PUBLIC_PREFIX = "/public/certificate/";

export const isPublicCertificateRoute = (method: string, route: string): boolean =>
  method === "GET" && route.startsWith(PUBLIC_PREFIX);

/** GET /hub/public/certificate/:code — anyone with the link; 404 for unknown or revoked. */
export const handlePublicCertificate = async (sb: any, route: string): Promise<Response> => {
  const code = normalizeCertificateCode(decodeURIComponent(route.slice(PUBLIC_PREFIX.length)));
  if (!code) return json(404, { error: "Certificate not found", code: "certificate_not_found" });
  const { data, error } = await sb.from("english_certificates")
    .select(COLUMNS)
    .eq("code", code)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load certificate: ${error.message}`);
  const certificate = publicCertificate(data as CertificateRow | null);
  if (!certificate) return json(404, { error: "Certificate not found", code: "certificate_not_found" });
  return new Response(JSON.stringify({ ok: true, certificate }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Short, so a revocation takes effect quickly.
      "Cache-Control": "public, max-age=60",
      ...corsHeaders,
    },
  });
};

type Context = { sb: any; req: Request; route: string; userId: string; languageId: string };

const loadMeta = async (sb: any, userId: string, languageId: string): Promise<Record<string, unknown>> => {
  const { data, error } = await sb.from("learner_language_goals")
    .select("metadata")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load level history: ${error.message}`);
  const meta = (data as Record<string, unknown> | null)?.metadata;
  return meta && typeof meta === "object" && !Array.isArray(meta) ? meta as Record<string, unknown> : {};
};

/** The name on the learner's account, offered as the default; it is only shown to them. */
const profileName = async (sb: any, userId: string): Promise<string | null> => {
  const { data } = await sb.from("users").select("full_name").eq("id", userId).maybeSingle();
  return cleanDisplayName((data as Record<string, unknown> | null)?.full_name);
};

const activitiesCompleted = async (sb: any, userId: string, languageId: string): Promise<number> => {
  const { count, error } = await sb.from("learning_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .in("service_key", TODAY_SKILLS as unknown as string[])
    // "failed" means a low score, not a broken attempt; it still counts as done.
    .in("status", ["submitted", "scored", "failed"])
    .not("submitted_at", "is", null);
  if (error) throw new Error(`Failed to count activities: ${error.message}`);
  return Number(count ?? 0);
};

const activeFor = async (sb: any, userId: string, measuredAt: string): Promise<CertificateRow | null> => {
  const { data, error } = await sb.from("english_certificates")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("measured_at", measuredAt)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load certificate: ${error.message}`);
  return (data as CertificateRow | null) ?? null;
};

/** Learner routes. Returns null when the route is not a certificate route. */
export const handleCertificateRoute = async ({ sb, req, route, userId, languageId }: Context): Promise<Response | null> => {
  if (req.method === "GET" && route === "/certificates") {
    const [meta, rowsRes, defaultName] = await Promise.all([
      loadMeta(sb, userId, languageId),
      sb.from("english_certificates").select(COLUMNS).eq("user_id", userId).order("issued_at", { ascending: false }).limit(50),
      profileName(sb, userId),
    ]);
    if (rowsRes.error) throw new Error(`Failed to load certificates: ${rowsRes.error.message}`);
    const lookup = latestMeasurement(readLevelHistory(meta));
    return json(200, {
      ok: true,
      latest: lookup.status === "ok"
        ? { status: "ok", ...lookup.measurement }
        : lookup.status === "self_assessed"
          ? { status: "self_assessed", measured_at: lookup.at }
          : { status: "none" },
      default_name: defaultName,
      certificates: ((rowsRes.data ?? []) as CertificateRow[]).map(ownCertificate),
    });
  }

  if (req.method === "POST" && route === "/certificate") {
    const body = await parseBody(req) as Record<string, unknown>;
    const lookup = latestMeasurement(readLevelHistory(await loadMeta(sb, userId, languageId)));
    if (lookup.status === "none") {
      return json(409, { error: "Take the level test first", code: "no_measurement" });
    }
    if (lookup.status === "self_assessed") {
      return json(409, { error: "Your latest level was chosen, not tested. Take the level test to get a certificate.", code: "self_assessed" });
    }
    const measurement = lookup.measurement;

    const existing = await activeFor(sb, userId, measurement.measured_at);
    if (existing) return json(200, { ok: true, created: false, certificate: ownCertificate(existing) });

    const displayName = cleanDisplayName(body.display_name) ?? await profileName(sb, userId);
    if (!displayName) return json(422, { error: "Enter the name to show on the certificate", code: "name_required" });

    const { count: issuedCount, error: countError } = await sb.from("english_certificates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (countError) throw new Error(`Failed to count certificates: ${countError.message}`);
    if (Number(issuedCount ?? 0) >= MAX_CERTIFICATES_PER_LEARNER) {
      return json(429, { error: "You have created the maximum number of certificates", code: "certificate_limit" });
    }

    const activities = await activitiesCompleted(sb, userId, languageId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await sb.from("english_certificates")
        .insert({
          code: generateCertificateCode(),
          user_id: userId,
          display_name: displayName,
          overall: measurement.overall,
          per_skill: measurement.per_skill,
          measured_by: measurement.measured_by,
          measured_at: measurement.measured_at,
          activities_count: activities,
        })
        .select(COLUMNS)
        .single();
      if (!error) return json(201, { ok: true, created: true, certificate: ownCertificate(data as CertificateRow) });
      if (error.code !== "23505") throw new Error(`Failed to create certificate: ${error.message}`);
      // A double click raced us to the same measurement: return that one.
      const raced = await activeFor(sb, userId, measurement.measured_at);
      if (raced) return json(200, { ok: true, created: false, certificate: ownCertificate(raced) });
      // Otherwise the random code collided; try another.
    }
    throw new Error("Failed to create certificate: no free code");
  }

  if (req.method === "POST" && route === "/certificate/revoke") {
    const body = await parseBody(req) as Record<string, unknown>;
    const code = normalizeCertificateCode(body.code);
    if (!code) return json(404, { error: "Certificate not found", code: "certificate_not_found" });
    const { data, error } = await sb.from("english_certificates")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("code", code)
      .is("revoked_at", null)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`Failed to revoke certificate: ${error.message}`);
    if (!data) return json(404, { error: "Certificate not found", code: "certificate_not_found" });
    return json(200, { ok: true, certificate: ownCertificate(data as CertificateRow) });
  }

  return null;
};
