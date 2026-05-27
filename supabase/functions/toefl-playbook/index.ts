import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PLAYBOOK_PRODUCT_SLUG,
  authUser,
  buildDashboardPayload,
  corsHeaders,
  extractRoute,
  generateRecommendation,
  getEnv,
  hasPremiumAccess,
  json,
  listCatalog,
  loadCurrentRecommendation,
  loadPageDetail,
  loadPlanTemplates,
  loadProfile,
  parseBody,
  persistRecommendation,
  recordEvent,
  resolveScope,
  saveProfile,
  toText,
} from "../_shared/toefl-playbook.ts";

const routeMarker = "/toefl-playbook";

const unauthorizedPayload = {
  error: "Unauthorized",
  product_slug: PLAYBOOK_PRODUCT_SLUG,
};

const premiumPayload = {
  error: "Premium access required",
  code: "premium_required",
  product_slug: PLAYBOOK_PRODUCT_SLUG,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, supabaseServiceRole, { auth: { persistSession: false } });
    const scope = await resolveScope(sb);
    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const auth = await authUser(sb, req);

    const requirePremium = async () => {
      if (!auth) return { ok: false as const, response: json(401, unauthorizedPayload) };
      const allowed = await hasPremiumAccess(supabaseUrl, supabaseAnonKey, auth.token, scope.playbookProductId);
      if (!allowed) return { ok: false as const, response: json(403, premiumPayload) };
      return { ok: true as const };
    };

    // --- Public catalog ---
    if (req.method === "GET" && route === "/catalog") {
      return json(200, await listCatalog(sb, scope));
    }

    // --- Page fetch (public, authenticated, or premium based on page.visibility) ---
    if (req.method === "GET" && route.startsWith("/pages/")) {
      const slug = toText(route.replace("/pages/", ""), 160);
      if (!slug) return json(404, { error: "Page not found" });
      const payload = await loadPageDetail(sb, scope, slug);
      if (!payload) return json(404, { error: "Page not found" });

      const page = payload.page as Record<string, unknown>;
      const visibility = String(page.visibility ?? "public");
      if (visibility === "authenticated" && !auth) {
        return json(401, { ...unauthorizedPayload, page_slug: slug });
      }
      if (visibility === "premium") {
        const gate = await requirePremium();
        if (!gate.ok) return gate.response;
      }
      return json(200, payload);
    }

    // --- Plan template fetch ---
    if (req.method === "GET" && route.startsWith("/plans/")) {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const slug = toText(route.replace("/plans/", ""), 160);
      const templates = await loadPlanTemplates(sb, scope);
      const plan = templates.find((row) => row.slug === slug);
      if (!plan) return json(404, { error: "Plan not found" });

      const recommendation = auth ? await loadCurrentRecommendation(sb, scope, auth.userId) : null;
      return json(200, {
        plan,
        latest_recommendation: recommendation,
      });
    }

    // --- Dashboard ---
    if (req.method === "GET" && route === "/dashboard") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const base = await buildDashboardPayload(sb, scope, auth!.userId);
      return new Response(JSON.stringify(base), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=20",
          ...corsHeaders,
        },
      });
    }

    // --- Profile (own) ---
    if (req.method === "GET" && route === "/profile") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      return json(200, { profile: await loadProfile(sb, scope, auth!.userId) });
    }

    if (req.method === "PATCH" && route === "/profile") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const profile = await saveProfile(sb, scope, auth!.userId, body);
      return json(200, { ok: true, profile });
    }

    // --- Recommendation generation ---
    if (req.method === "POST" && route === "/recommendations/generate") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const profile = await saveProfile(sb, scope, auth!.userId, body);
      const recommendation = await generateRecommendation(sb, scope, auth!.userId, profile);
      const snapshot = await persistRecommendation(sb, scope, auth!.userId, profile, recommendation);
      return json(200, { ok: true, snapshot, recommendation });
    }

    // --- Event tracking ---
    if (req.method === "POST" && route === "/events") {
      const body = await parseBody(req);
      await recordEvent(sb, scope, body, auth?.userId ?? null);
      return json(200, { ok: true });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
