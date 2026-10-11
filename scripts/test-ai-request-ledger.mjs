// Real independent PostgreSQL connections, using a disposable local container.
// No linked Supabase commands, host ports, mounted volumes or production keys.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const container = `schood-ai-qa-${randomUUID().slice(0, 8)}`;
const image =
  "postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa";
const results = [];
let containerId;
function run(args, input = "", timeout = 30000) {
  return new Promise((resolve, reject) => {
    const process = spawn("docker", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "", error = "";
    process.stdout.on("data", (data) => output += data);
    process.stderr.on("data", (data) => error += data);
    const timer = setTimeout(() => {
      process.kill();
      reject(new Error("Local Docker operation timed out"));
    }, timeout);
    process.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    process.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output.trim())
        : reject(new Error(error.trim() || `Docker exit ${code}`));
    });
    process.stdin.end(input);
  });
}
const sql = (query) =>
  run([
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-Atq",
    "-v",
    "ON_ERROR_STOP=1",
  ], query);
const actor = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const hash = "a".repeat(64);
const reserveSql = (
  id,
  user = actor,
  limit = 2,
  globalLimit = 100,
  digest = hash,
) =>
  `select reserve_ai_request('${user}','writing-tutor','${id}','${digest}',${limit},${globalLimit})`;
const reserve = async (...args) =>
  JSON.parse(await sql("set role service_role; " + reserveSql(...args)));
const begin = (id, lease, user = actor) =>
  sql(
    `set role service_role; select begin_ai_request('${user}','writing-tutor','${id}','${lease}')`,
  );
const finish = async (
  id,
  lease,
  status,
  payload = null,
  code = null,
  user = actor,
) =>
  JSON.parse(
    await sql(
      `set role service_role; select finish_ai_request('${user}','writing-tutor','${id}','${lease}','${status}',${
        payload === null
          ? "null"
          : "'" + JSON.stringify(payload).replaceAll("'", "''") + "'::jsonb"
      },${code ? "'" + code + "'" : "null"})`,
    ),
  );
const reset = () =>
  sql(
    "truncate public.ai_request_ledger, public.ai_request_usage_daily, public.writing_tutor_sessions, public.speaking_coach_sessions;",
  );
async function check(name, test) {
  await reset();
  await test();
  results.push({ name, status: "passed" });
  console.log("PASS: " + name);
}
try {
  containerId = await run(
    [
      "run",
      "--detach",
      "--name",
      container,
      "--label",
      "schood.qa=ai-ledger",
      "--network",
      "none",
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      image,
    ],
    "",
    60000,
  );
  assert.match(containerId, /^[0-9a-f]{64}$/);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    // Ignore the temporary initialization server; PID1 becomes postgres only
    // after the entrypoint starts the final database process.
    try {
      if (
        await run(["exec", container, "cat", "/proc/1/comm"]) === "postgres"
      ) {
        await sql("select 1");
        ready = true;
        break;
      }
    } catch { /* final socket still opening */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.ok(ready, "Disposable PostgreSQL must become ready");
  await sql(
    `create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select '${actor}'::uuid $$;
    create table auth.users(id uuid primary key,deleted_at timestamptz);
    create table public.users(id uuid primary key,is_active boolean not null default true); create table public.tenants(id uuid primary key);
    insert into auth.users(id) values('${actor}'),('${other}');
    insert into public.users(id) values('${actor}'),('${other}');
    create function public.account_personal_erasure_tables() returns text[] language sql immutable as $$ select array['writing_tutor_sessions','speaking_coach_sessions']::text[] $$;`,
  );
  await sql(
    readFileSync(
      "supabase/migrations/20261010155000_account_closed_principal_boundary.sql",
      "utf8",
    ),
  );
  const writingSchema = readFileSync(
    "supabase/migrations/20260608130000_monetization_features.sql",
    "utf8",
  );
  await sql(
    writingSchema.slice(
      writingSchema.indexOf(
        "create table if not exists public.writing_tutor_sessions",
      ),
    ),
  );
  await sql(
    readFileSync(
      "supabase/migrations/20261010175000_ai_request_ledger.sql",
      "utf8",
    ),
  );
  await sql(
    "grant insert,update,delete on writing_tutor_sessions to authenticated; grant update(overall_band) on writing_tutor_sessions to authenticated;",
  );
  await sql(
    readFileSync(
      "supabase/migrations/20261010180000_writing_tutor_atomic_result.sql",
      "utf8",
    ),
  );
  const speakingSchema = readFileSync(
    "supabase/migrations/20260608155000_features_5_to_11.sql",
    "utf8",
  );
  await sql(
    speakingSchema.slice(
      speakingSchema.indexOf(
        "create table if not exists public.speaking_coach_sessions",
      ),
      speakingSchema.indexOf("-- ── 6. Learning Path"),
    ),
  );
  await sql(
    "grant insert,update,delete on speaking_coach_sessions to authenticated; grant update(overall_band) on speaking_coach_sessions to authenticated;",
  );
  await sql(
    readFileSync(
      "supabase/migrations/20261010181000_speaking_coach_atomic_result.sql",
      "utf8",
    ),
  );
  // Minimal closure fixture for deterministic race checks. The separate full
  // installed-schema qualification executes the real Auth/erasure chain.
  await sql(
    `create function fixture_ai_erasure() returns trigger language plpgsql as $$
    declare relation_name text;
    begin
      if old.deleted_at is not null or new.deleted_at is null then return new; end if;
      perform 1 from public.users where id=old.id for update;
      foreach relation_name in array public.account_personal_erasure_tables() loop
        execute format('delete from public.%I where user_id=$1',relation_name) using old.id;
      end loop;
      update public.users set is_active=false where id=old.id;
      insert into public.account_closure_receipts(user_id,purge_version) values(old.id,1);
      return new;
    end $$;
    create trigger fixture_ai_erasure after update of deleted_at on auth.users for each row execute function fixture_ai_erasure();`,
  );
  await check(
    "20 independent reservations cannot exceed a two-request user allowance",
    async () => {
      const responses = await Promise.all(
        Array.from({ length: 20 }, () => reserve(randomUUID())),
      );
      assert.equal(responses.filter((result) => result.lease_token).length, 2);
      assert.equal(
        responses.filter((result) => result.status === "user_limit").length,
        18,
      );
      assert.equal(
        await sql(
          "select charged from ai_request_usage_daily where scope='global'",
        ),
        "2",
      );
    },
  );
  await check(
    "cross-user contention cannot exceed the global service allowance",
    async () => {
      const responses = await Promise.all(
        Array.from(
          { length: 20 },
          (_, index) => reserve(randomUUID(), index % 2 ? actor : other, 20, 3),
        ),
      );
      assert.equal(responses.filter((result) => result.lease_token).length, 3);
      assert.equal(
        responses.filter((result) => result.status === "service_limit").length,
        17,
      );
    },
  );
  await check(
    "duplicate reservation and begin races permit one provider dispatch",
    async () => {
      const id = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 16 }, () => reserve(id)),
      );
      const winners = responses.filter((result) => result.lease_token);
      assert.equal(winners.length, 1);
      assert.ok(
        responses.filter((result) => result.replay).every((result) =>
          !result.lease_token
        ),
      );
      const starts = await Promise.all(
        Array.from({ length: 16 }, () => begin(id, winners[0].lease_token)),
      );
      assert.equal(starts.filter((result) => result === "t").length, 1);
      assert.equal(
        (await reserve(id, actor, 2, 100, "b".repeat(64))).status,
        "conflict",
      );
    },
  );
  await check(
    "successful result is replayed; changed completion and wrong actor/lease are denied",
    async () => {
      const id = randomUUID(), reservation = await reserve(id);
      await begin(id, reservation.lease_token);
      const payload = {
        session_id: randomUUID(),
        feedback: "Synthetic feedback",
      };
      await finish(id, reservation.lease_token, "succeeded", payload);
      assert.deepEqual((await reserve(id)).result, payload);
      assert.equal(await begin(id, reservation.lease_token), "f");
      await assert.rejects(
        finish(id, reservation.lease_token, "succeeded", {
          feedback: "Changed",
        }),
        /conflicts/,
      );
      await assert.rejects(
        finish(id, randomUUID(), "succeeded", payload),
        /not found/,
      );
      await assert.rejects(
        finish(id, reservation.lease_token, "succeeded", payload, null, other),
        /not found/,
      );
      assert.equal(
        await sql(
          "select charged from ai_request_usage_daily where scope='global'",
        ),
        "1",
      );
    },
  );
  await check(
    "pre-dispatch cancellations refund once but cannot bypass the attempt ceiling",
    async () => {
      for (let index = 0; index < 3; index++) {
        const id = randomUUID(), reservation = await reserve(id, actor, 1);
        await finish(
          id,
          reservation.lease_token,
          "cancelled",
          null,
          "not_dispatched",
        );
        await finish(
          id,
          reservation.lease_token,
          "cancelled",
          null,
          "not_dispatched",
        );
      }
      assert.equal(
        (await reserve(randomUUID(), actor, 1)).status,
        "user_limit",
      );
      assert.equal(
        await sql(
          "select attempts||':'||charged from ai_request_usage_daily where scope='global'",
        ),
        "3:0",
      );
    },
  );
  await check(
    "expired reservations refund once and stale holders cannot dispatch",
    async () => {
      const id = randomUUID(), reservation = await reserve(id, actor, 1);
      await sql(
        `update ai_request_ledger set lease_expires_at=now()-interval '1 second' where request_id='${id}'`,
      );
      assert.equal(await begin(id, reservation.lease_token), "f");
      assert.equal((await reserve(randomUUID(), actor, 1)).status, "reserved");
      assert.equal((await reserve(id, actor, 1)).status, "cancelled");
      assert.equal(
        await sql(
          "select attempts||':'||charged from ai_request_usage_daily where scope='global'",
        ),
        "2:1",
      );
    },
  );
  await check(
    "cancellation racing dispatch either refunds an unused call or preserves its charge",
    async () => {
      for (let index = 0; index < 8; index++) {
        const id = randomUUID(), reservation = await reserve(id, actor, 20);
        const [start, cancel] = await Promise.allSettled([
          begin(id, reservation.lease_token),
          finish(id, reservation.lease_token, "cancelled"),
        ]);
        assert.equal(start.status, "fulfilled");
        if (start.value === "t") assert.equal(cancel.status, "rejected");
        else assert.equal(cancel.status, "fulfilled");
      }
      const charged = Number(
        await sql(
          "select charged from ai_request_usage_daily where scope='global'",
        ),
      );
      const started = Number(
        await sql(
          "select count(*) from ai_request_ledger where status='started'",
        ),
      );
      assert.equal(charged, started);
    },
  );
  await check(
    "request identity survives a UTC usage-day rollover",
    async () => {
      const id = randomUUID(), reservation = await reserve(id, actor, 1);
      await begin(id, reservation.lease_token);
      await finish(id, reservation.lease_token, "succeeded", {
        feedback: "Previous day",
      });
      // Move only synthetic accounting timestamps to model an existing prior-day
      // request. No host clock or production setting is changed.
      await sql(
        "update ai_request_ledger set usage_date=(clock_timestamp() at time zone 'UTC')::date-1; update ai_request_usage_daily set usage_date=(clock_timestamp() at time zone 'UTC')::date-1;",
      );
      const replay = await reserve(id, actor, 1);
      assert.equal(replay.result.feedback, "Previous day");
      assert.equal(replay.lease_token, undefined);
      assert.equal((await reserve(randomUUID(), actor, 1)).status, "reserved");
      assert.equal(
        await sql(
          "select sum(charged) from ai_request_usage_daily where scope='global'",
        ),
        "2",
      );
    },
  );
  await check(
    "uncertain provider outcomes stay charged and accept only the original late result",
    async () => {
      const id = randomUUID(), reservation = await reserve(id, actor, 1);
      await begin(id, reservation.lease_token);
      await finish(
        id,
        reservation.lease_token,
        "uncertain",
        null,
        "provider_timeout",
      );
      await assert.rejects(
        finish(id, reservation.lease_token, "cancelled"),
        /cannot be automatically refunded/,
      );
      assert.equal(
        (await reserve(randomUUID(), actor, 1)).status,
        "user_limit",
      );
      await finish(id, reservation.lease_token, "succeeded", {
        feedback: "Late result",
      });
      assert.equal(
        (await reserve(id, actor, 1)).result.feedback,
        "Late result",
      );
    },
  );
  await check(
    "history deletion and account deletion cannot replenish the global budget",
    async () => {
      await reserve(randomUUID(), actor, 1, 1);
      await sql(
        `insert into writing_tutor_sessions(user_id) values('${actor}'); delete from writing_tutor_sessions where user_id='${actor}';`,
      );
      assert.equal(
        (await reserve(randomUUID(), actor, 1, 1)).status,
        "user_limit",
      );
      await sql(`delete from public.users where id='${actor}';`);
      assert.equal(
        (await reserve(randomUUID(), other, 1, 1)).status,
        "service_limit",
      );
      await sql(`insert into public.users(id) values('${actor}');`);
    },
  );
  await check(
    "browser roles cannot inspect or mutate the ledger or execute commands",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const table of ["ai_request_ledger", "ai_request_usage_daily"]) {
          for (
            const operation of [
              `select * from ${table}`,
              `delete from ${table}`,
              `update ${table} set service=service`,
              `insert into ${table} default values`,
            ]
          ) {
            await assert.rejects(
              sql(`set role ${role}; ${operation}`),
              /permission denied/,
            );
          }
        }
        await assert.rejects(
          sql(`set role ${role}; ${reserveSql(randomUUID())}`),
          /permission denied/,
        );
        await assert.rejects(
          sql(
            `set role ${role}; select begin_ai_request('${actor}','writing-tutor','${randomUUID()}','${randomUUID()}')`,
          ),
          /permission denied/,
        );
        await assert.rejects(
          sql(
            `set role ${role}; select finish_ai_request('${actor}','writing-tutor','${randomUUID()}','${randomUUID()}','cancelled')`,
          ),
          /permission denied/,
        );
      }
      await assert.rejects(
        sql("set role service_role; delete from ai_request_usage_daily"),
        /permission denied/,
      );
    },
  );
  await check(
    "invalid policy/input and forged completion roll back without consuming allowance",
    async () => {
      await assert.rejects(
        reserve(randomUUID(), actor, -1),
        /Invalid AI reservation/,
      );
      await assert.rejects(
        reserve(randomUUID(), actor, 501),
        /Invalid AI reservation/,
      );
      await assert.rejects(
        reserve(randomUUID(), actor, 2, 100, "not-a-hash"),
        /Invalid AI reservation/,
      );
      const id = randomUUID(), reservation = await reserve(id);
      await assert.rejects(
        finish(id, reservation.lease_token, "succeeded", { result: true }),
        /has not started/,
      );
      await begin(id, reservation.lease_token);
      await assert.rejects(
        finish(id, reservation.lease_token, "succeeded", {
          result: "x".repeat(65536),
        }),
        /Invalid AI completion/,
      );
      assert.equal((await reserve(id)).status, "started");
    },
  );
  const feedback = {
    exam_type: "ielts",
    task_type: "task2",
    word_count: 250,
    overall_band: 6.5,
    criteria: { TR: 6.5, CC: 6, LR: 7, GRA: 6.5 },
    strengths: ["Clear argument"],
    improvements: ["Support claims"],
    actionable_feedback: ["Add a concrete example"],
    feedback: "Synthetic practice feedback",
    word_count_comment: "Suitable length",
    model: "synthetic-model",
    tokens_used: 200,
  };
  const complete = async (id, lease, payload = feedback, user = actor) =>
    JSON.parse(
      await sql(
        `set role service_role; select complete_writing_tutor_request('${user}','${id}','${lease}','${
          JSON.stringify(payload).replaceAll("'", "''")
        }'::jsonb)`,
      ),
    );
  await check(
    "concurrent writing completion saves exactly one history row and one replayable result",
    async () => {
      const id = randomUUID(), reservation = await reserve(id);
      await begin(id, reservation.lease_token);
      const saved = await Promise.all(
        Array.from({ length: 12 }, () => complete(id, reservation.lease_token)),
      );
      assert.equal(new Set(saved.map((row) => row.session_id)).size, 1);
      assert.equal(
        await sql("select count(*) from writing_tutor_sessions"),
        "1",
      );
      assert.deepEqual((await reserve(id)).result, saved[0]);
      await assert.rejects(
        complete(id, reservation.lease_token, { ...feedback, overall_band: 8 }),
        /conflicts/,
      );
      await assert.rejects(complete(id, randomUUID()), /not found/);
    },
  );
  await check(
    "writing history and replay receipt roll back together on either persistence failure",
    async () => {
      const id = randomUUID(), reservation = await reserve(id);
      await begin(id, reservation.lease_token);
      await sql(
        `create function fail_qa_writing_save() returns trigger language plpgsql as $$ begin raise exception 'synthetic persistence failure'; end $$;
      create trigger fail_qa_history before insert on writing_tutor_sessions for each row execute function fail_qa_writing_save();`,
      );
      await assert.rejects(
        complete(id, reservation.lease_token),
        /synthetic persistence failure/,
      );
      assert.equal((await reserve(id)).status, "started");
      await sql(
        "drop trigger fail_qa_history on writing_tutor_sessions; create trigger fail_qa_receipt before update on ai_request_ledger for each row when (new.status='succeeded') execute function fail_qa_writing_save();",
      );
      await assert.rejects(
        complete(id, reservation.lease_token),
        /synthetic persistence failure/,
      );
      assert.equal(
        await sql("select count(*) from writing_tutor_sessions"),
        "0",
      );
      assert.equal((await reserve(id)).status, "started");
      await sql(
        "drop trigger fail_qa_receipt on ai_request_ledger; drop function fail_qa_writing_save();",
      );
      assert.ok((await complete(id, reservation.lease_token)).session_id);
    },
  );
  await check(
    "writing completion rejects forged scores and browser history writes including column grants",
    async () => {
      const id = randomUUID(), reservation = await reserve(id);
      await begin(id, reservation.lease_token);
      for (
        const payload of [
          { ...feedback, overall_band: 10 },
          { ...feedback, criteria: { ...feedback.criteria, TR: -1 } },
          { ...feedback, extra: "forged" },
          { ...feedback, strengths: [42] },
        ]
      ) {
        await assert.rejects(complete(id, reservation.lease_token, payload));
      }
      assert.equal(
        await sql("select count(*) from writing_tutor_sessions"),
        "0",
      );
      for (
        const query of [
          "delete from writing_tutor_sessions",
          "update writing_tutor_sessions set overall_band=9",
          `insert into writing_tutor_sessions(user_id) values('${actor}')`,
        ]
      ) {
        await assert.rejects(
          sql("set role authenticated; " + query),
          /permission denied/,
        );
      }
      await assert.rejects(
        sql(
          `set role authenticated; select complete_writing_tutor_request('${actor}','${id}','${reservation.lease_token}','{}')`,
        ),
        /permission denied/,
      );
    },
  );
  const spoken = {
    assessment_scope: "transcript_only",
    overall_band: null,
    criteria: null,
    observations: {
      coherence: "Connected ideas",
      vocabulary: "Specific terms",
      grammar: "Consistent tense",
    },
    strengths: ["Clear example"],
    improvements: ["Expand the conclusion"],
    feedback: "Develop your example.",
    topic: "Describe your hometown.",
    task_type: "part1",
    word_count: 20,
    duration_secs: null,
    model: "synthetic",
  };
  const speakingReserve = async (id, user = actor, limit = 2) =>
    JSON.parse(
      await sql(
        "set role service_role; select reserve_ai_request('" + user +
          "','speaking-coach','" + id + "','" + hash + "'," + limit + ",100)",
      ),
    );
  const speakingBegin = (id, lease) =>
    sql(
      "set role service_role; select begin_ai_request('" + actor +
        "','speaking-coach','" + id + "','" + lease + "')",
    );
  const spokenText = "A synthetic practice transcript about a hometown.";
  const speakingComplete = async (
    id,
    lease,
    payload = spoken,
    text = spokenText,
    user = actor,
  ) =>
    JSON.parse(
      await sql(
        "set role service_role; select complete_speaking_coach_request('" +
          user + "','" + id + "','" + lease + "','" +
          JSON.stringify(payload).replaceAll("'", "''") + "'::jsonb,'" +
          text.replaceAll("'", "''") + "')",
      ),
    );
  await check(
    "speaking allowance is atomic and independent of writing allowance",
    async () => {
      const requests = await Promise.all(
        Array.from({ length: 12 }, () => speakingReserve(randomUUID())),
      );
      assert.equal(requests.filter((r) => r.lease_token).length, 2);
      assert.equal((await reserve(randomUUID())).status, "reserved");
    },
  );
  await check(
    "speaking completion is replay-safe and cannot fabricate audio scores",
    async () => {
      const id = randomUUID(), r = await speakingReserve(id);
      await speakingBegin(id, r.lease_token);
      for (
        const payload of [{ ...spoken, overall_band: 8 }, {
          ...spoken,
          criteria: { P: 8 },
        }, {
          ...spoken,
          observations: { ...spoken.observations, pronunciation: "Great" },
        }, { ...spoken, duration_secs: 901 }]
      ) await assert.rejects(speakingComplete(id, r.lease_token, payload));
      const replies = await Promise.all(
        Array.from({ length: 12 }, () => speakingComplete(id, r.lease_token)),
      );
      assert.equal(new Set(replies.map((r) => r.session_id)).size, 1);
      assert.equal(
        await sql(
          "select count(*) from speaking_coach_sessions where overall_band is null and assessment_scope='transcript_only'",
        ),
        "1",
      );
      assert.equal(replies[0].overall_band, null);
      assert.equal(replies[0].criteria, null);
      await assert.rejects(
        speakingComplete(id, r.lease_token, spoken, spokenText + " changed"),
        /conflicts/,
      );
      await assert.rejects(
        speakingComplete(id, r.lease_token, spoken, spokenText, other),
        /not found/,
      );
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(
          sql(
            "set role " + role +
              "; update speaking_coach_sessions set overall_band=9",
          ),
          /permission denied/,
        );
        await assert.rejects(
          sql("set role " + role + "; delete from speaking_coach_sessions"),
          /permission denied/,
        );
        await assert.rejects(
          sql(
            "set role " + role + "; select complete_speaking_coach_request('" +
              actor + "','" + id + "','" + r.lease_token + "','{}','text')",
          ),
          /permission denied/,
        );
      }
      await sql("delete from speaking_coach_sessions");
      assert.deepEqual((await speakingReserve(id)).result, replies[0]);
      assert.equal(
        await sql(
          "select charged from ai_request_usage_daily where service='speaking-coach' and scope='global'",
        ),
        "1",
      );
    },
  );
  await check(
    "speaking history and receipt roll back atomically on persistence failure",
    async () => {
      const id = randomUUID(), r = await speakingReserve(id);
      await speakingBegin(id, r.lease_token);
      await sql(
        "create function fail_qa_speaking() returns trigger language plpgsql as $$ begin raise exception 'synthetic speaking failure'; end $$; create trigger fail_qa_speaking before insert on speaking_coach_sessions for each row execute function fail_qa_speaking();",
      );
      await assert.rejects(
        speakingComplete(id, r.lease_token),
        /synthetic speaking failure/,
      );
      assert.equal((await speakingReserve(id)).status, "started");
      await sql(
        "drop trigger fail_qa_speaking on speaking_coach_sessions; create trigger fail_qa_speaking before update on ai_request_ledger for each row when (new.status='succeeded') execute function fail_qa_speaking();",
      );
      await assert.rejects(
        speakingComplete(id, r.lease_token),
        /synthetic speaking failure/,
      );
      assert.equal(
        await sql("select count(*) from speaking_coach_sessions"),
        "0",
      );
      await sql(
        "drop trigger fail_qa_speaking on ai_request_ledger; drop function fail_qa_speaking();",
      );
      assert.ok((await speakingComplete(id, r.lease_token)).session_id);
    },
  );

  const newActor = async () => {
    const user = randomUUID();
    await sql(
      `insert into auth.users(id) values('${user}');insert into public.users(id) values('${user}');`,
    );
    return user;
  };
  const closeActor = (user) =>
    sql(
      `update auth.users set deleted_at=clock_timestamp() where id='${user}'`,
    );
  const globalSnapshot = () =>
    sql(
      "select coalesce(jsonb_agg(to_jsonb(u) order by service,usage_date),'[]') from ai_request_usage_daily u where scope='global'",
    );
  await check(
    "erasure registry preserves existing stores and adds private AI stores",
    async () => {
      assert.equal(
        await sql(
          "select account_personal_erasure_tables()=array['writing_tutor_sessions','speaking_coach_sessions','ai_request_ledger','ai_request_usage_daily']",
        ),
        "t",
      );
      assert.equal(
        await sql(
          "select count(*) from ai_request_usage_daily where user_id is not null",
        ),
        "0",
      );
      await assert.rejects(
        sql(`set role service_role;select require_open_ai_actor('${actor}')`),
        /permission denied/,
      );
    },
  );
  await check(
    "deactivated and missing Auth actors cannot consume or replay allowance",
    async () => {
      const disabled = await newActor();
      await sql(
        `update public.users set is_active=false where id='${disabled}'`,
      );
      await assert.rejects(reserve(randomUUID(), disabled), /account_closed/);
      const missing = randomUUID();
      await sql(`insert into public.users(id) values('${missing}')`);
      await assert.rejects(reserve(randomUUID(), missing), /account_closed/);
      assert.equal(
        await sql("select count(*) from ai_request_usage_daily"),
        "0",
      );
    },
  );
  await check(
    "soft closure erases saved and in-flight AI data without refunding global allowance",
    async () => {
      const user = await newActor(),
        savedId = randomUUID(),
        lateId = randomUUID(),
        speakingId = randomUUID();
      const saved = await reserve(savedId, user, 20);
      await begin(savedId, saved.lease_token, user);
      await complete(savedId, saved.lease_token, feedback, user);
      const late = await reserve(lateId, user, 20);
      await begin(lateId, late.lease_token, user);
      const speaking = await speakingReserve(speakingId, user, 20);
      await sql(
        `set role service_role;select begin_ai_request('${user}','speaking-coach','${speakingId}','${speaking.lease_token}')`,
      );
      const before = await globalSnapshot();
      await closeActor(user);
      assert.equal(
        await sql(
          `select count(*) from ai_request_ledger where user_id='${user}'`,
        ),
        "0",
      );
      assert.equal(
        await sql(
          `select count(*) from ai_request_usage_daily where user_id='${user}'`,
        ),
        "0",
      );
      assert.equal(
        await sql(
          `select count(*) from writing_tutor_sessions where user_id='${user}'`,
        ),
        "0",
      );
      assert.equal(await globalSnapshot(), before);
      await assert.rejects(reserve(randomUUID(), user, 20), /account_closed/);
      await assert.rejects(reserve(savedId, user, 20), /account_closed/);
      await assert.rejects(
        begin(lateId, late.lease_token, user),
        /account_closed/,
      );
      await assert.rejects(
        finish(
          lateId,
          late.lease_token,
          "uncertain",
          null,
          "provider_timeout",
          user,
        ),
        /account_closed/,
      );
      await assert.rejects(
        complete(lateId, late.lease_token, feedback, user),
        /account_closed/,
      );
      await assert.rejects(
        sql(
          `set role service_role;select complete_speaking_coach_request('${user}','${speakingId}','${speaking.lease_token}','${
            JSON.stringify(spoken)
          }'::jsonb,'${spokenText}')`,
        ),
        /account_closed/,
      );
      await assert.rejects(
        sql(
          `insert into ai_request_usage_daily(scope,service,usage_date) values('user:${user}','writing-tutor',current_date)`,
        ),
        /account_closed/,
      );
      assert.equal(await globalSnapshot(), before);
      assert.equal(
        (await reserve(randomUUID(), other, 20, 2)).status,
        "service_limit",
      );
    },
  );
  const waitSleeping = async (app) => {
    for (let i = 0; i < 30; i++) {
      if (
        await sql(
          `select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event='PgSleep')`,
        ) === "t"
      ) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error("Race fixture did not reach its locked transaction barrier");
  };
  await check(
    "closure holding the actor lock prevents a delayed reservation from recreating private state",
    async () => {
      const user = await newActor(), app = "close-" + randomUUID();
      const closing = sql(
        `set application_name='${app}';begin;select 1 from public.users where id='${user}' for update;select pg_sleep(2);update auth.users set deleted_at=clock_timestamp() where id='${user}';commit;`,
      );
      await waitSleeping(app);
      const delayed = reserve(randomUUID(), user);
      await assert.rejects(delayed, /account_closed/);
      await closing;
      assert.equal(
        await sql(
          `select count(*) from ai_request_ledger where user_id='${user}'`,
        ),
        "0",
      );
      assert.equal(
        await sql(
          `select count(*) from ai_request_usage_daily where user_id='${user}'`,
        ),
        "0",
      );
    },
  );
  await check(
    "a reservation holding the actor lock completes before closure erases its state",
    async () => {
      const user = await newActor(), app = "reserve-" + randomUUID();
      const reserving = sql(
        `set application_name='${app}';begin;set role service_role;${
          reserveSql(randomUUID(), user)
        };select pg_sleep(2);commit;`,
      );
      await waitSleeping(app);
      const closing = closeActor(user);
      await reserving;
      await closing;
      assert.equal(
        await sql(
          `select count(*) from ai_request_ledger where user_id='${user}'`,
        ),
        "0",
      );
      assert.equal(
        await sql(
          `select count(*) from ai_request_usage_daily where user_id='${user}'`,
        ),
        "0",
      );
      assert.equal(
        await sql(
          "select charged from ai_request_usage_daily where scope='global'",
        ),
        "1",
      );
    },
  );
  await check("SAT reservations enforce a global cap across concurrent actors", async () => {
    const ids = [randomUUID(), randomUUID()];
    const replies = await Promise.all([actor, other].map(async (user, index) => JSON.parse(await sql(
      `set role service_role;select reserve_ai_request('${user}','sat-tutor','${ids[index]}','${hash}',2,1);`,
    ))));
    assert.deepEqual(replies.map(row => row.status).sort(), ['reserved', 'service_limit']);
    assert.equal(await sql("select charged from ai_request_usage_daily where scope='global' and service='sat-tutor'"), '1');
  });
  await check("SAT feedback finish and replay preserve the same private receipt", async () => {
    const id = randomUUID(), payload = { ok: true, ai_status: 'ok', data: { steps: ['Saved solution'], key_concept: 'Algebra', why_distractors_wrong: {} } };
    const reservation = JSON.parse(await sql(`set role service_role;select reserve_ai_request('${actor}','sat-tutor','${id}','${hash}',2,100);`));
    assert.equal(await sql(`set role service_role;select begin_ai_request('${actor}','sat-tutor','${id}','${reservation.lease_token}');`), 't');
    const command = `set role service_role;select finish_ai_request('${actor}','sat-tutor','${id}','${reservation.lease_token}','succeeded','${JSON.stringify(payload)}'::jsonb,null);`;
    const first = JSON.parse(await sql(command)), replay = JSON.parse(await sql(command));
    assert.deepEqual(first, replay);
    assert.deepEqual(first.result, payload);
    const repeated = JSON.parse(await sql(`set role service_role;select reserve_ai_request('${actor}','sat-tutor','${id}','${hash}',2,0);`));
    assert.equal(repeated.status, 'succeeded');
    assert.deepEqual(repeated.result, payload);
    assert.equal(await sql("select charged from ai_request_usage_daily where scope='global' and service='sat-tutor'"), '1');
    await assert.rejects(sql(`set role service_role;select finish_ai_request('${other}','sat-tutor','${id}','${reservation.lease_token}','succeeded','${JSON.stringify(payload)}'::jsonb,null);`));
    await assert.rejects(sql(command.replace('Saved solution', 'Changed solution')));
  });
  await check("SAT user limits remain atomic across simultaneous fresh requests", async () => {
    const replies = await Promise.all(Array.from({ length: 4 }, async () => JSON.parse(await sql(
      `set role service_role;select reserve_ai_request('${actor}','sat-tutor','${randomUUID()}','${hash}',2,100);`,
    ))));
    assert.equal(replies.filter(row => row.status === 'reserved').length, 2);
    assert.equal(replies.filter(row => row.status === 'user_limit').length, 2);
    assert.equal(await sql("select charged from ai_request_usage_daily where scope='user:" + actor + "' and service='sat-tutor'"), '2');
  });
} finally {
  if (containerId) {
    const label = await run([
      "inspect",
      "--format",
      '{{index .Config.Labels "schood.qa"}}',
      containerId,
    ]);
    assert.equal(
      label,
      "ai-ledger",
      "Only the container created by this test may be removed",
    );
    await run(["rm", "--force", containerId]);
  }
}
const output = process.argv.find((arg) => arg.startsWith("--output="))?.slice(
  9,
);
if (output) {
  writeFileSync(
    output,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        image,
        mode:
          "isolated PostgreSQL container; independent psql connections; no published ports or mounted volumes",
        containerRemoved: true,
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
