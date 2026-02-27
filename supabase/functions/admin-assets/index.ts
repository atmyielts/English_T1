import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getS3Config, signStoredPath, uploadFileToS3 } from "../_shared/media-storage.ts";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const sanitizeFilename = (name: string): string =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "file";

serve(async (req) => {
  let requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "x-request-id": requestId, ...corsHeaders },
    });
  const logError = (event: string, detail: Record<string, unknown>, error: unknown): void => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        domain: "admin-assets",
        level: "error",
        event,
        request_id: requestId,
        route: new URL(req.url).pathname,
        ...detail,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: { "x-request-id": requestId, ...corsHeaders } });

  const url = new URL(req.url);

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.assets.manage",
      action: "admin.assets",
    });
    if (!authz.ok) return authz.response;
    requestId = authz.context.requestId;
    const authedUserId = authz.context.userId;

    if (req.method === "GET" && url.pathname.endsWith("/list")) {
      const kind = url.searchParams.get("kind");
      const q = url.searchParams.get("q");
      const includeSigned = String(url.searchParams.get("signed") ?? "").toLowerCase() === "true";
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

      let query = sb
        .from("assets")
        .select("id, kind, bucket, path, filename, mime_type, size_bytes, created_by, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (kind) query = query.eq("kind", kind);
      if (q && q.trim().length > 0) query = query.ilike("filename", `%${q.trim()}%`);

      const { data: rows, error: listErr } = await query;
      if (listErr) throw listErr;

      const assets = await Promise.all(
        (rows ?? []).map(async (r: any) => {
          if (!includeSigned) return { ...r, signed_url: null };
          const signedUrl = await signStoredPath(sb, String(r.bucket), String(r.path), SIGNED_URL_TTL_SECONDS, {
            requestId,
            route: url.pathname,
            userId: authedUserId,
          });
          return { ...r, signed_url: signedUrl };
        }),
      );

      return json(200, { assets });
    }

    if (req.method === "POST" && url.pathname.endsWith("/upload")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return json(400, { error: "file is required (multipart/form-data)" });
      }

      const kind = String(form.get("kind") ?? "audio").toLowerCase();
      const s3Config = getS3Config({ required: true });
      const bucket = s3Config!.bucket;

      const safeName = sanitizeFilename(file.name || "file");
      const ext = safeName.includes(".") ? safeName.split(".").pop() : "";
      const path = `${kind}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}-${safeName}`;

      const contentType = file.type || (kind === "audio" ? "audio/mpeg" : "application/octet-stream");
      const durationRaw = form.get("duration_seconds");
      const durationSeconds =
        typeof durationRaw === "string" && durationRaw.trim().length > 0 ? Number(durationRaw) : Number.NaN;
      const metadata: Record<string, unknown> = {};
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        metadata.duration_seconds = Math.round(durationSeconds);
      }
      metadata.storage_provider = "s3";

      await uploadFileToS3(path, file, contentType, {
        requestId,
        route: url.pathname,
        userId: authedUserId,
      });

      // Record the asset for reuse in admin UI.
      const { data: assetRow } = await sb
        .from("assets")
        .upsert(
          {
            kind,
            bucket,
            path,
            filename: safeName,
            mime_type: contentType,
            size_bytes: (file as any).size ?? null,
            created_by: authedUserId,
            metadata,
          },
          { onConflict: "bucket,path" },
        )
        .select("id")
        .maybeSingle();

      const signedUrl = await signStoredPath(sb, bucket, path, SIGNED_URL_TTL_SECONDS, {
        requestId,
        route: url.pathname,
        userId: authedUserId,
      });

      return json(200, { asset_id: assetRow?.id ?? null, bucket, path, signed_url: signedUrl });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    logError("request_failed", {}, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message, request_id: requestId });
  }
});
