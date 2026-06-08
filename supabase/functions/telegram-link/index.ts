import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const bearer = (req: Request) => { const h = req.headers.get("Authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : h || null; };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sbUrl = getEnv("SUPABASE_URL");
    const sb = createClient(sbUrl, getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(url.searchParams.get("action") || body?.action || "generate").toLowerCase();

    // ── Internal: validate a token and link a chat_id (called by the Worker) ──
    if (action === "validate") {
      const token = String(body?.token ?? "").trim();
      const chatId = String(body?.chat_id ?? "").trim();
      if (!token || !chatId) return json(400, { error: "token and chat_id required" });

      const { data: tokenRow, error: tErr } = await sb
        .from("telegram_link_tokens")
        .select("id, user_id, expires_at, used_at")
        .eq("token", token)
        .maybeSingle();

      if (tErr || !tokenRow) return json(404, { error: "Invalid link token" });
      if (tokenRow.used_at) return json(409, { error: "Link token already used" });
      if (new Date(tokenRow.expires_at) < new Date()) return json(410, { error: "Link token expired" });

      // Mark token used
      await sb.from("telegram_link_tokens").update({ used_at: new Date().toISOString() }).eq("id", tokenRow.id);

      // Link chat_id to user — if another user already has this chat_id, unlink them first
      await sb.from("users").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId).neq("id", tokenRow.user_id);
      const { error: linkErr } = await sb.from("users").update({ telegram_chat_id: chatId }).eq("id", tokenRow.user_id);
      if (linkErr) return json(500, { error: "Failed to link account", detail: linkErr.message });

      // Also link on academy_contacts if this user is a contact
      await sb.from("academy_contacts").update({ telegram_id: chatId }).eq("user_id", tokenRow.user_id);

      // Get user display name
      const { data: userRow } = await sb.from("users").select("email, raw_user_meta_data").eq("id", tokenRow.user_id).maybeSingle();
      const name = (userRow?.raw_user_meta_data as any)?.full_name || (userRow?.email as string)?.split("@")[0] || "Student";

      return json(200, { ok: true, user_id: tokenRow.user_id, name });
    }

    // ── Unlink: removes chat_id from user (called by Worker on /unlink) ──────
    if (action === "unlink") {
      const chatId = String(body?.chat_id ?? "").trim();
      if (!chatId) return json(400, { error: "chat_id required" });
      await sb.from("users").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId);
      await sb.from("academy_contacts").update({ telegram_id: null }).eq("telegram_id", chatId);
      return json(200, { ok: true });
    }

    // ── Status: check if a chat_id is linked ─────────────────────────────────
    if (action === "status") {
      const chatId = String(url.searchParams.get("chat_id") || body?.chat_id || "").trim();
      if (!chatId) return json(400, { error: "chat_id required" });
      const { data } = await sb.from("users").select("id, email, raw_user_meta_data").eq("telegram_chat_id", chatId).maybeSingle();
      return json(200, { linked: !!data, user: data ? { id: data.id, name: (data.raw_user_meta_data as any)?.full_name || data.email } : null });
    }

    // ── Generate: creates a one-time link token (called by authenticated user) ─
    const token = bearer(req);
    if (!token) return json(401, { error: "Unauthorized" });
    const authSb = createClient(sbUrl, getEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    const { data: auth } = await authSb.auth.getUser(token);
    if (!auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;

    // Check if already linked
    const { data: userRow } = await sb.from("users").select("telegram_chat_id").eq("id", userId).maybeSingle();
    const alreadyLinked = !!(userRow as any)?.telegram_chat_id;

    // Delete any unused unexpired tokens for this user
    await sb.from("telegram_link_tokens").delete().eq("user_id", userId).is("used_at", null);

    // Create new token
    const { data: tokenRow, error } = await sb
      .from("telegram_link_tokens")
      .insert({ user_id: userId })
      .select("token, expires_at")
      .maybeSingle();

    if (error || !tokenRow) return json(500, { error: "Failed to generate link token" });

    const botName = getEnv("TELEGRAM_BOT_NAME");
    const linkUrl = `https://t.me/${botName}?start=${tokenRow.token}`;

    return json(200, {
      link_url: linkUrl,
      token: tokenRow.token,
      expires_at: tokenRow.expires_at,
      already_linked: alreadyLinked,
    });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "Unknown" });
  }
});
