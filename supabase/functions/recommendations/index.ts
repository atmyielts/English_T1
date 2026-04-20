import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  corsHeaders,
  extractRoute,
  getEnv,
  json,
  loadActiveRecommendations,
  rebuildRecommendationsForUser,
  resolveEnglishProducts,
  resolveLanguageScope,
  toText,
} from "../_shared/english-learning.ts";

const routeMarker = "/recommendations";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const scope = await resolveLanguageScope(sb, toText(url.searchParams.get("language_code"), 16) || "en");
    const products = await resolveEnglishProducts(sb);

    if (req.method === "GET" && route === "/queue") {
      const queue = await loadActiveRecommendations(sb, auth.userId, scope.languageId);
      return json(200, {
        scope: { user_id: auth.userId, language_id: scope.languageId, language_code: scope.languageCode },
        queue,
      });
    }

    if (req.method === "POST" && route === "/rebuild") {
      const queue = await rebuildRecommendationsForUser(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        products,
      });
      return json(200, {
        ok: true,
        scope: { user_id: auth.userId, language_id: scope.languageId, language_code: scope.languageCode },
        queue,
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
