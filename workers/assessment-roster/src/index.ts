import { boundedJson } from "../../../packages/assessment-worker/src/http.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
import { consumeRoster, dispatchRoster, type RosterJob } from "./jobs.ts";
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ASSESSMENT_ROSTER_SECRET: string;
  ROSTER_QUEUE: Queue<RosterJob>;
  ROSTER_BATCH_LIMIT?: string;
}
function configured(env: Env) {
  let url: URL;
  try {
    url = new URL(env.SUPABASE_URL);
  } catch {
    throw new ServiceError(
      503,
      "roster_unconfigured",
      "The roster service is not configured",
    );
  }
  if (
    url.protocol !== "https:" || url.pathname !== "/" || url.username ||
    url.password || url.search || url.hash || !env.SUPABASE_ANON_KEY ||
    !env.ASSESSMENT_ROSTER_SECRET || env.ASSESSMENT_ROSTER_SECRET.length < 32
  ) {
    throw new ServiceError(
      503,
      "roster_unconfigured",
      "The roster service is not configured",
    );
  }
}
async function call(env: Env, action: string, data: unknown) {
  const { ok, status, payload } = await boundedJson<
    { data: unknown; code?: string; error?: string }
  >(
    `${
      env.SUPABASE_URL.replace(/\/$/, "")
    }/functions/v1/assessment-cloud/cohorts/internal`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_ANON_KEY,
        "x-assessment-roster-key": env.ASSESSMENT_ROSTER_SECRET,
      },
      body: JSON.stringify({ action, data }),
    },
  );
  if (!ok) {
    throw new ServiceError(
      status,
      payload.code ?? "roster_unavailable",
      "Canonical roster request failed",
    );
  }
  return payload.data;
}
export default {
  async fetch() {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    configured(env);
    if (!env.ROSTER_QUEUE) {
      throw new ServiceError(
        503,
        "roster_unconfigured",
        "The roster queue is not configured",
      );
    }
    const count = await dispatchRoster(
      () => call(env, "job.claim", { limit: 100 }),
      env.ROSTER_QUEUE,
      Number(env.ROSTER_BATCH_LIMIT ?? 20),
    );
    console.log({ event: "assessment.roster.dispatch", count });
  },
  async queue(batch: MessageBatch<unknown>, env: Env) {
    configured(env);
    await consumeRoster(
      batch.messages,
      (job) => call(env, "job.step", job),
      (outcome, code) =>
        console.log({ event: "assessment.roster.consumer", outcome, code }),
    );
  },
};
