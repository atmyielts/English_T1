import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  buildDailyPlanForUser,
  corsHeaders,
  extractRoute,
  getEnv,
  json,
  resolveEnglishProducts,
  resolveLanguageScope,
  toText,
} from "../_shared/english-learning.ts";

const routeMarker = "/hub";

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

    if (req.method === "GET" && route === "/plan") {
      const rebuild = String(url.searchParams.get("rebuild") ?? "").toLowerCase() === "true"
        || String(url.searchParams.get("rebuild") ?? "") === "1";
      const payload = await buildDailyPlanForUser(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        products,
        rebuild,
      });
      return json(200, payload);
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
