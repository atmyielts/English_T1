import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
export interface RosterJob {
  schema_version: "assessment.roster.job.v1";
  tenant_id: string;
  job_id: string;
  lease_token: string;
}
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function rosterJob(value: unknown): RosterJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServiceError(422, "invalid_roster_job", "Invalid roster job");
  }
  const input = value as Record<string, unknown>;
  if (
    input.schema_version !== "assessment.roster.job.v1" ||
    !["tenant_id", "job_id", "lease_token"].every((key) =>
      typeof input[key] === "string" && uuid.test(input[key] as string)
    )
  ) throw new ServiceError(422, "invalid_roster_job", "Invalid roster job");
  return {
    schema_version: "assessment.roster.job.v1",
    tenant_id: input.tenant_id as string,
    job_id: input.job_id as string,
    lease_token: input.lease_token as string,
  };
}
export interface RosterQueue {
  sendBatch(rows: { body: RosterJob; contentType: "json" }[]): Promise<unknown>;
}
export async function dispatchRoster(
  claim: () => Promise<unknown>,
  queue: RosterQueue,
  maxBatches = 20,
  now = () => Date.now(),
) {
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 200) {
    throw new ServiceError(
      503,
      "invalid_dispatch_limit",
      "Invalid roster dispatch limit",
    );
  }
  let count = 0;
  const started = now();
  for (let i = 0; i < maxBatches && now() - started < 50000; i++) {
    const rows = await claim();
    if (!Array.isArray(rows) || rows.length > 100) {
      throw new ServiceError(
        502,
        "invalid_claim_batch",
        "Invalid roster claim batch",
      );
    }
    if (!rows.length) break;
    await queue.sendBatch(
      rows.map((row) => ({ body: rosterJob(row), contentType: "json" })),
    );
    count += rows.length;
    if (rows.length < 100) break;
  }
  return count;
}
export interface RosterMessage {
  body: unknown;
  attempts: number;
  ack(): void;
  retry(options: { delaySeconds: number }): void;
}
export async function consumeRoster(
  messages: readonly RosterMessage[],
  step: (job: RosterJob) => Promise<unknown>,
  metric: (outcome: string, code: string) => void = () => {},
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, messages.length) }, async () => {
      while (cursor < messages.length) {
        const message = messages[cursor++];
        try {
          const job = rosterJob(message.body), result = await step(job);
          if (
            !result || typeof result !== "object" ||
            (result as { id?: string }).id !== job.job_id ||
            ![
              "queued",
              "completed",
              "completed_with_issues",
              "blocked",
              "cancelled",
            ].includes(String((result as { state?: string }).state))
          ) {
            throw new ServiceError(
              502,
              "invalid_roster_receipt",
              "Invalid roster step receipt",
            );
          }
          message.ack();
          metric(String((result as { state: string }).state), "ok");
        } catch (cause) {
          if (
            cause instanceof ServiceError &&
            cause.code === "invalid_roster_lease"
          ) {
            message.ack();
            metric("stale", "invalid_roster_lease");
          } else {
            message.retry({
              delaySeconds: Math.min(
                30 * 2 ** Math.min(message.attempts, 5),
                900,
              ),
            });
            metric(
              "retry",
              cause instanceof ServiceError ? cause.code : "roster_unavailable",
            );
          }
        }
      }
    }),
  );
}
