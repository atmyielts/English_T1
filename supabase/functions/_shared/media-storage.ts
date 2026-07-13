import { GetObjectCommand, PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.1085.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.1085.0";

type S3Config = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type StorageRef = {
  provider?: unknown;
  bucket?: unknown;
  path?: unknown;
  key?: unknown;
};

type MediaOpContext = {
  requestId?: string | null;
  route?: string | null;
  userId?: string | null;
};

const readEnv = (key: string): string | null => {
  const value = Deno.env.get(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseStorageRef = (storage: unknown): { provider: string | null; bucket: string; path: string } | null => {
  if (!storage || typeof storage !== "object") return null;
  const ref = storage as StorageRef;
  const provider = typeof ref.provider === "string" ? ref.provider.trim().toLowerCase() : null;
  const bucket = typeof ref.bucket === "string" ? ref.bucket.trim() : "";
  const pathCandidate = typeof ref.path === "string" ? ref.path : typeof ref.key === "string" ? ref.key : "";
  const path = pathCandidate.trim();
  if (!bucket || !path) return null;
  return { provider, bucket, path };
};

const logMediaEvent = (
  level: "info" | "warn" | "error",
  event: string,
  detail: Record<string, unknown>,
): void => {
  const payload = {
    ts: new Date().toISOString(),
    domain: "media-storage",
    level,
    event,
    ...detail,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

const emitMediaAlert = (event: string, detail: Record<string, unknown>): void => {
  const hook = readEnv("MEDIA_ALERT_WEBHOOK_URL");
  if (!hook) return;
  const body = {
    source: "supabase-edge",
    domain: "media-storage",
    severity: "error",
    event,
    at: new Date().toISOString(),
    detail,
  };
  void fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((error) => {
    logMediaEvent("warn", "alert_delivery_failed", {
      event,
      message: error instanceof Error ? error.message : String(error),
      request_id: detail.request_id ?? null,
    });
  });
};

const logMediaError = (event: string, detail: Record<string, unknown>, error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  const payload = { ...detail, message };
  logMediaEvent("error", event, payload);
  emitMediaAlert(event, payload);
};

let cachedS3Config: S3Config | null | undefined;
let cachedS3Client: S3Client | null | undefined;

export const getS3Config = (opts?: { required?: boolean }): S3Config | null => {
  if (cachedS3Config !== undefined) {
    if (!cachedS3Config && opts?.required) throw new Error("S3 is not configured");
    return cachedS3Config;
  }

  const bucket = readEnv("S3_BUCKET");
  const region = readEnv("S3_REGION");
  const accessKeyId = readEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("AWS_SECRET_ACCESS_KEY");
  const sessionToken = readEnv("AWS_SESSION_TOKEN");

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    cachedS3Config = null;
    if (opts?.required) {
      throw new Error("Missing S3 env vars: S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
    }
    return null;
  }

  cachedS3Config = { bucket, region, accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
  return cachedS3Config;
};

const getS3Client = (): S3Client => {
  if (cachedS3Client) return cachedS3Client;
  const cfg = getS3Config({ required: true })!;
  cachedS3Client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      ...(cfg.sessionToken ? { sessionToken: cfg.sessionToken } : {}),
    },
  });
  return cachedS3Client;
};

const isS3Ref = (bucket: string, provider: string | null): boolean => {
  if (provider === "s3" || provider === "aws_s3" || provider === "aws") return true;
  const cfg = getS3Config();
  return !!cfg && cfg.bucket === bucket;
};

export const uploadFileToS3 = async (
  key: string,
  file: File,
  contentType: string,
  context?: MediaOpContext,
): Promise<{ bucket: string; path: string }> => {
  const cfg = getS3Config({ required: true })!;
  const client = getS3Client();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    return { bucket: cfg.bucket, path: key };
  } catch (error) {
    logMediaError(
      "upload_failed",
      {
        provider: "s3",
        bucket: cfg.bucket,
        path: key,
        content_type: contentType,
        request_id: context?.requestId ?? null,
        route: context?.route ?? null,
        user_id: context?.userId ?? null,
      },
      error,
    );
    throw error;
  }
};

const signS3Object = async (
  bucket: string,
  path: string,
  ttlSeconds: number,
  context?: MediaOpContext,
): Promise<string | null> => {
  try {
    const client = getS3Client();
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: path,
      }),
      { expiresIn: ttlSeconds },
    );
  } catch (error) {
    logMediaError(
      "sign_failed",
      {
        provider: "s3",
        bucket,
        path,
        ttl_seconds: ttlSeconds,
        request_id: context?.requestId ?? null,
        route: context?.route ?? null,
        user_id: context?.userId ?? null,
      },
      error,
    );
    return null;
  }
};

export const signStoredPath = async (
  sb: any,
  bucket: string,
  path: string,
  ttlSeconds: number,
  context?: MediaOpContext,
): Promise<string | null> => {
  const safeBucket = String(bucket ?? "").trim();
  const safePath = String(path ?? "").trim();
  if (!safeBucket || !safePath) return null;

  if (isS3Ref(safeBucket, null)) {
    return await signS3Object(safeBucket, safePath, ttlSeconds, context);
  }

  const { data, error } = await sb.storage.from(safeBucket).createSignedUrl(safePath, ttlSeconds);
  if (error || !data?.signedUrl) {
    if (error) {
      logMediaError(
        "sign_failed",
        {
          provider: "supabase-storage",
          bucket: safeBucket,
          path: safePath,
          ttl_seconds: ttlSeconds,
          request_id: context?.requestId ?? null,
          route: context?.route ?? null,
          user_id: context?.userId ?? null,
        },
        error,
      );
    }
    return null;
  }
  return data.signedUrl;
};

export const signStorageRef = async (
  sb: any,
  storage: unknown,
  ttlSeconds: number,
  context?: MediaOpContext,
): Promise<string | null> => {
  const parsed = parseStorageRef(storage);
  if (!parsed) return null;

  if (isS3Ref(parsed.bucket, parsed.provider)) {
    return await signS3Object(parsed.bucket, parsed.path, ttlSeconds, context);
  }

  const { data, error } = await sb.storage.from(parsed.bucket).createSignedUrl(parsed.path, ttlSeconds);
  if (error || !data?.signedUrl) {
    if (error) {
      logMediaError(
        "sign_failed",
        {
          provider: parsed.provider ?? "supabase-storage",
          bucket: parsed.bucket,
          path: parsed.path,
          ttl_seconds: ttlSeconds,
          request_id: context?.requestId ?? null,
          route: context?.route ?? null,
          user_id: context?.userId ?? null,
        },
        error,
      );
    }
    return null;
  }
  return data.signedUrl;
};
