import {
  createRecordingHandler,
  type RecordingRepository,
} from "./recording-handler.ts";
import { canonicalJson } from "../../../packages/assessment-core/src/mod.ts";
function equal(a: unknown, b: unknown) {
  if (canonicalJson(a) !== canonicalJson(b)) {
    throw new Error("Recording API differs");
  }
}
const id = "00000000-0000-4000-8000-000000000001", secret = "s".repeat(40);
let calls: unknown[] = [];
const repository: RecordingRepository = {
  checkpoint: async (...args) => {
    calls.push(args);
    return {};
  },
  catalog: async (...args) => {
    calls.push(args);
    return {};
  },
  user: async (t) => t === "candidate" ? id : null,
  command: async (...args) => {
    calls.push(args);
    return { id };
  },
  read: async (...args) => {
    calls.push(args);
    return {};
  },
  transport: async (...args) => {
    calls.push(args);
    return {};
  },
};
const handler = createRecordingHandler(repository, ["https://exam.invalid"], {
  enabled: true,
  transportSecret: secret,
});
Deno.test("recording candidate checkpoints and reviewer catalogs normalize paging without accepting actor overrides", async () => {
  calls = [];
  const make = (path: string) =>
    new Request(
      `https://api.invalid/functions/v1/proctor/recordings/${path}&tenant_id=${id}&actor_id=forged`,
      { headers: { authorization: "Bearer candidate" } },
    );
  equal((await handler(make(`candidate/${id}?sequence=2`))).status, 200);
  equal(calls[0], [id, id, id, 2]);
  equal(
    (await handler(make(`sessions/${id}?after=${id}&limit=1`))).status,
    200,
  );
  equal(calls[1], [id, id, id, id, 1]);
  equal((await handler(make(`candidate/${id}?sequence=1.5`))).status, 422);
  equal(calls.length, 2);
});
const req = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(
    `https://api.invalid/functions/v1/proctor/recordings/${path}?tenant_id=${id}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer candidate",
        "idempotency-key": "recording-command-001",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
Deno.test("recording release gate, auth, origin and worker-secret fail before authority", async () => {
  calls = [];
  equal(
    (await createRecordingHandler(repository, [], {
      enabled: false,
      transportSecret: secret,
    })(req(id))).status,
    503,
  );
  equal(
    (await handler(req(id, undefined, { authorization: "Bearer unknown" })))
      .status,
    401,
  );
  equal(
    (await handler(req(id, undefined, { origin: "https://foreign.invalid" })))
      .status,
    403,
  );
  equal(
    (await handler(
      req("transport", {
        action: "segment.read",
        data: { recording_id: id, sequence: 1 },
      }),
    )).status,
    403,
  );
  equal(calls, []);
});
Deno.test("recording read is paginated and command normalizes captured actor independently", async () => {
  calls = [];
  equal(
    (await handler(
      new Request(
        `https://api.invalid/functions/v1/proctor/recordings/${id}?tenant_id=${id}&after=2&limit=1`,
        { headers: { authorization: "Bearer candidate" } },
      ),
    )).status,
    200,
  );
  equal(calls[0], [id, id, id, 2, 1]);
  calls = [];
  equal(
    (await handler(
      req("commands", {
        action: "recording.begin",
        data: {
          recording_id: id,
          session_id: id,
          source: "screen",
          mime: "video/webm",
          actor_id: "forged",
        },
      }),
    )).status,
    200,
  );
  equal(calls[0], [id, id, "recording-command-001", "recording.begin", {
    recording_id: id,
    session_id: id,
    source: "screen",
    mime: "video/webm",
  }]);
});
Deno.test("recording transport accepts dual credentials and never client supplied object identity", async () => {
  calls = [];
  equal(
    (await handler(
      req("transport", {
        action: "part.authorize",
        data: {
          recording_id: id,
          sequence: 1,
          index: 0,
          object_key: "foreign",
          tenant_id: "forged",
        },
      }, { "x-proctor-evidence-key": secret }),
    )).status,
    200,
  );
  equal(calls[0], [id, id, "part.authorize", {
    recording_id: id,
    sequence: 1,
    index: 0,
  }]);
});
