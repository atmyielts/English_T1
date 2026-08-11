import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { handleAcademyRequest } from "../supabase/functions/academy/index.ts";

const url = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceRoleKey) throw new Error("Local Supabase environment unavailable");

const sb = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const { data: secretRow, error: secretError } = await sb.from("internal_runtime_secrets")
  .select("secret").eq("key", "academy_worker_secret").single();
if (secretError || !secretRow?.secret) throw new Error("Academy worker secret unavailable");

const response = await handleAcademyRequest(new Request("http://local/functions/v1/academy", {
  method: "POST",
  headers: { "content-type": "application/json", "x-worker-secret": secretRow.secret },
  body: JSON.stringify({ worker_cycle: "automation_events" }),
}));
const payload = await response.json();
if (!response.ok) throw new Error(`Academy automation worker failed: ${JSON.stringify(payload)}`);
if (Number(payload.failed ?? 0) !== 0) throw new Error(`Academy automation worker recorded failures: ${JSON.stringify(payload)}`);

const fixtureAcademyId = Deno.env.get("ACADEMY_AUTOMATION_FIXTURE_ID");
if (fixtureAcademyId) {
  const [{ data: event }, { data: execution }, { data: effect }] = await Promise.all([
    sb.from("domain_event_outbox").select("status,attempts").contains("payload", { academy_id: fixtureAcademyId, academy_automation_event: true }).eq("event_type", "lead.created").single(),
    sb.from("academy_automation_executions").select("status,source_event_id").eq("academy_id", fixtureAcademyId).single(),
    sb.from("academy_automation_effects").select("status,action_type").eq("academy_id", fixtureAcademyId).single(),
  ]);
  if (event?.status !== "delivered") throw new Error(`Lifecycle outbox event was not delivered: ${JSON.stringify(event)}`);
  if (execution?.status !== "succeeded") throw new Error(`Automation execution did not succeed: ${JSON.stringify(execution)}`);
  if (effect?.status !== "succeeded" || effect.action_type !== "create_task") throw new Error(`Automation effect did not succeed: ${JSON.stringify(effect)}`);
  const { data: actualAction } = await sb.from("academy_action_items").select("status,title,source_type").eq("academy_id", fixtureAcademyId).eq("source_type", "automation").single();
  if (actualAction?.title !== "Contact new lead") throw new Error(`Automation action was not created: ${JSON.stringify(actualAction)}`);
}

console.log(`ACADEMY_AUTOMATION_WORKER_OK ${JSON.stringify(payload)}`);
