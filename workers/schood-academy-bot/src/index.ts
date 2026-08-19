/** Thin, least-privilege Telegram webhook for Schood Academy operations. */
export interface Env {
  SUPABASE_URL: string;
  ACADEMY_TELEGRAM_INTERNAL_SECRET: string;
  ACADEMY_TELEGRAM_WEBHOOK_SECRET: string;
  ACADEMY_TELEGRAM_WEBHOOK_SECRET_PREVIOUS?: string;
}

const digest = async (value: string): Promise<Uint8Array> => new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
);
const equal = async (left: string, right: string): Promise<boolean> => {
  if (!left || !right) return false;
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
};
const validWebhookSecret = async (env: Env, supplied: string): Promise<boolean> =>
  await equal(supplied, env.ACADEMY_TELEGRAM_WEBHOOK_SECRET)
  || Boolean(env.ACADEMY_TELEGRAM_WEBHOOK_SECRET_PREVIOUS && await equal(supplied, env.ACADEMY_TELEGRAM_WEBHOOK_SECRET_PREVIOUS));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return Response.json({ ok: true, service: "schood-academy-bot" });
    }
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token")?.trim() ?? "";
    if (!(await validWebhookSecret(env, supplied))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const update = await request.json().catch(() => null);
    if (!update || typeof update !== "object") return Response.json({ error: "Invalid update" }, { status: 400 });
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/academy-telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": env.ACADEMY_TELEGRAM_INTERNAL_SECRET },
      body: JSON.stringify({ action: "process_webhook_update", update }),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ event: "academy_telegram_edge_failed", status: response.status }));
      return Response.json({ error: "Upstream unavailable" }, { status: 502 });
    }
    return Response.json({ ok: true });
  },
};
