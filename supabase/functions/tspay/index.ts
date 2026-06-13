import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-timestamp",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const retiredResponse = () =>
  new Response(
    JSON.stringify({
      error: "TsPay has been retired. Schood payments now use Click.",
      error_code: "tspay_retired",
      replacement_provider: "click",
      replacement_function: "click",
    }),
    {
      status: 410,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    },
  );

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  return retiredResponse();
});
