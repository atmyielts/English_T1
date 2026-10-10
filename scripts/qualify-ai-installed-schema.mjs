// Local-only qualification of a schema-only provider capture. Never reads
// credentials, connects to production, or loads customer rows.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const schemaFile = option("--schema-file"),
  expected = option("--expected-sha256");
if (!schemaFile || !expected || !/^[a-f0-9]{64}$/.test(expected)) {
  throw Error(
    "An explicit schema-only capture and expected SHA256 are required",
  );
}
const source = readFileSync(schemaFile, "utf8"),
  sha256 = createHash("sha256").update(source).digest("hex");
if (
  sha256 !== expected || source.length < 100000 ||
  /COPY\s+.*FROM stdin|^INSERT INTO/m.test(source)
) throw Error("Capture identity or schema-only boundary failed");
const runtimeFile = option("--runtime-catalog");
if (!runtimeFile) {
  throw Error("Explicit metadata-only runtime catalogue required");
}
const runtimeCapture = JSON.parse(
    readFileSync(runtimeFile, "utf8").replace(/^\uFEFF/, ""),
  ),
  runtime = runtimeCapture.catalog;
if (
  runtimeCapture.readOnly !== true ||
  runtimeCapture.customerRowsRead !== false ||
  !runtime.roles?.some((role) =>
    role.name === "postgres" && role.superuser === false
  ) || runtime.postgresPrivileges?.authTrigger !== true
) throw Error("Runtime privilege catalogue invalid");
const allowedSettings = new Set([
  "shared_preload_libraries",
  "session_preload_libraries",
  "local_preload_libraries",
  "supautils.privileged_role",
  "supautils.privileged_role_allowed_configs",
  "supautils.superuser",
  "supautils.reserved_roles",
  "supautils.reserved_memberships",
]);
if (
  !runtime.runtimeSettings?.some((setting) =>
    setting.name === "session_preload_libraries" &&
    setting.setting.includes("supautils")
  ) || runtime.runtimeSettings.some((setting) =>
    !allowedSettings.has(setting.name) || typeof setting.setting !== "string"
  )
) throw Error("Privileged runtime settings unavailable");
const postgresArgs = [
  "postgres",
  "-c",
  "cron.database_name=postgres",
  ...runtime.runtimeSettings.flatMap(
    (setting) => ["-c", setting.name + "=" + setting.setting],
  ),
];
const ident = (name) => {
  if (!/^[a-z_][a-z0-9_-]*$/.test(name)) {
    throw Error("Invalid catalogue identifier");
  }
  return '"' + name + '"';
};
const image =
  "public.ecr.aws/supabase/postgres@sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426";
const name = "schood-ai-schema-" + randomUUID().slice(0, 8),
  label = "ai-installed-schema";
const root = "supabase/.temp/ai-release";
mkdirSync(root, { recursive: true });
writeFileSync(
  root + "/installed-schema-owned-container.json",
  JSON.stringify(
    { name, label, image, createdAt: new Date().toISOString() },
    null,
    2,
  ) + "\n",
);
const migrations = [
  "20261010154000_account_deletion_ownership_guard.sql",
  "20261010155000_account_closed_principal_boundary.sql",
  "20261010160000_account_personal_erasure_transaction.sql",
  "20261010161000_account_api_request_guard.sql",
];
const aiMigrations = [
  "20261010175000_ai_request_ledger.sql",
  "20261010180000_writing_tutor_atomic_result.sql",
  "20261010181000_speaking_coach_atomic_result.sql",
];
const checks = [];
let owned = false,
  cleanupVerified = false,
  passed = false,
  stage = "start",
  catalog;
function run(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Owned schema operation timed out"));
    }, 120000);
    child.stdout.on("data", (data) => out += data);
    child.stderr.on("data", (data) => err += data);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdin.on("error", () => {}); // Child exit controls failure and cleanup.
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve((args[0] === "logs" ? out + "\n" + err : out).trim());
      } else {
        writeFileSync(root + "/installed-schema-private-error.log", err);
        reject(Error("Owned schema operation failed at " + stage));
      }
    });
    child.stdin.end(input);
  });
}
const sql = (text, role = "supabase_admin") =>
  run([
    "exec",
    "-i",
    name,
    "psql",
    "-U",
    role,
    "-d",
    "postgres",
    "-Atq",
    "-v",
    "ON_ERROR_STOP=1",
  ], text);
const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const check = async (label, action) => {
  stage = label;
  await action();
  checks.push(label);
  console.log("PASS: " + label);
};
try {
  await run([
    "run",
    "--detach",
    "--name",
    name,
    "--network",
    "none",
    "--label",
    "schood.qa=" + label,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    image,
    ...postgresArgs,
  ]);
  owned = true;
  assert.equal(
    await run([
      "inspect",
      name,
      "--format",
      '{{index .Config.Labels "schood.qa"}}',
    ]),
    label,
  );
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if (
        await sql("select current_setting('listen_addresses')<>'';") === "t"
      ) {
        ready = true;
        break;
      }
    } catch {
      if (
        await run(["inspect", name, "--format", "{{.State.Running}}"]) !==
          "true"
      ) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) {
    writeFileSync(
      root + "/installed-schema-startup.log",
      await run(["logs", name]),
    );
    throw Error("Owned full-schema database startup failed");
  }
  await check(
    "restore complete installed Auth/public/Storage schema without customer rows",
    async () => {
      assert.equal(
        await run([
          "inspect",
          name,
          "--format",
          '{{index .Config.Labels "schood.qa"}}',
        ]),
        label,
      );
      // The image contains an older empty Auth bootstrap. Replace only namespaces
      // inside this verified, newly-created, network-isolated fixture database.
      await sql(
        `do $$ declare rows_count bigint;begin if to_regclass('auth.users') is not null then select count(*) into rows_count from auth.users;if rows_count<>0 then raise exception 'Fixture Auth bootstrap is not empty';end if;end if;end;$$;
      drop schema if exists auth cascade;drop schema if exists public cascade;drop schema if exists storage cascade;`,
      );
      await sql(
        `do $$ declare role_name text; begin foreach role_name in array array[${
          runtime.roles.map((role) => q(role.name)).join(",")
        }] loop if not exists(select 1 from pg_roles where rolname=role_name) then execute format('create role %I',role_name);end if;end loop;end;$$;
      alter role service_role bypassrls;grant anon,authenticated,service_role to authenticator;
      create schema if not exists extensions;create schema if not exists public;`,
      );
      for (const extension of runtime.extensions) {
        if (extension.name === "plpgsql") continue;
        if (extension.schema !== "pg_catalog") {
          await sql(
            "create schema if not exists " + ident(extension.schema) + ";",
          );
        }
        await sql(
          `create extension if not exists ${
            ident(extension.name)
          } with schema ${ident(extension.schema)};`,
        );
        assert.equal(
          await sql(
            `select extversion from pg_extension where extname=${
              q(extension.name)
            };`,
          ),
          extension.version,
          "Installed extension version differs: " + extension.name,
        );
      }
      await sql(source);
      catalog = JSON.parse(
        await sql(
          `select jsonb_build_object('tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','auth','storage') and c.relkind in('r','p')),'publicTriggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),'authTriggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and not t.tgisinternal),'publicForeignKeys',(select count(*) from pg_constraint k join pg_namespace n on n.oid=k.connamespace where n.nspname='public' and k.contype='f'));`,
        ),
      );
      assert.equal(catalog.tables, 406);
      assert.ok(catalog.publicTriggers > 50);
      assert.ok(catalog.authTriggers > 0);
      assert.equal(await sql("select count(*) from auth.users;"), "0");
      assert.equal(await sql("select count(*) from public.users;"), "0");
    },
  );
  await check(
    "database role attributes and relevant memberships match installed metadata",
    async () => {
      const existing = JSON.parse(
        await sql(
          `select coalesce(jsonb_agg(jsonb_build_object('member',member.rolname,'role',role.rolname)),'[]') from pg_auth_members m join pg_roles member on member.oid=m.member join pg_roles role on role.oid=m.roleid where member.rolname in('postgres','authenticator','supabase_auth_admin','supabase_storage_admin');`,
        ),
      );
      await sql(
        "begin;\n" + runtime.roles.map((role) =>
          `alter role ${ident(role.name)} ${
            role.superuser ? "superuser" : "nosuperuser"
          } ${role.bypassRls ? "bypassrls" : "nobypassrls"} ${
            role.createRole ? "createrole" : "nocreaterole"
          } ${role.createDb ? "createdb" : "nocreatedb"} ${
            role.inherit ? "inherit" : "noinherit"
          };`
        ).join("\n") + "\n" + existing.map((grant) =>
          `revoke ${ident(grant.role)} from ${ident(grant.member)};`
        ).join("\n") + "\n" + runtime.roleMemberships.map((grant) =>
          `grant ${ident(grant.role)} to ${ident(grant.member)} with admin ${
            grant.admin ? "true" : "false"
          }, inherit ${grant.inherit ? "true" : "false"}, set ${
            grant.set ? "true" : "false"
          };`
        ).join("\n") + "\ncommit;",
      );
      const actual = JSON.parse(
        await sql(
          `select jsonb_build_object('authUsage',has_schema_privilege('postgres','auth','USAGE'),'authCreate',has_schema_privilege('postgres','auth','CREATE'),'authTrigger',has_table_privilege('postgres','auth.users','TRIGGER'),'authSelect',has_table_privilege('postgres','auth.users','SELECT'));`,
        ),
      );
      assert.deepEqual(actual, runtime.postgresPrivileges);
    },
  );
  await check(
    "installed lifecycle migrations and AI foundation compose without financial activation",
    async () => {
      for (const file of migrations) {
        await sql(
          readFileSync("supabase/migrations/" + file, "utf8"),
          "postgres",
        );
      }
      const prior = JSON.parse(
        await sql("select to_jsonb(account_personal_erasure_tables());"),
      );
      const identity = await sql(
        "select oid||':'||proowner||':'||coalesce(proacl::text,'') from pg_proc where oid='account_personal_erasure_tables()'::regprocedure",
      );
      for (const file of aiMigrations) {
        await sql(
          readFileSync("supabase/migrations/" + file, "utf8"),
          "postgres",
        );
      }
      assert.deepEqual(
        JSON.parse(
          await sql("select to_jsonb(account_personal_erasure_tables());"),
        ),
        [...prior, "ai_request_ledger", "ai_request_usage_daily"],
      );
      assert.equal(
        await sql(
          "select oid||':'||proowner||':'||coalesce(proacl::text,'') from pg_proc where oid='account_personal_erasure_tables()'::regprocedure",
        ),
        identity,
      );
      assert.equal(
        await sql(
          "select to_regclass('public.payment_fulfillment_receipts') is null",
        ),
        "t",
      );
    },
  );
  const actor = randomUUID(),
    writingId = randomUUID(),
    speakingId = randomUUID(),
    pendingId = randomUUID(),
    payment = randomUUID();
  let writingLease, speakingLease, pendingLease, globalBefore, paymentBefore;
  const hash = "a".repeat(64);
  const writing = {
    exam_type: "ielts",
    task_type: "task2",
    word_count: 250,
    overall_band: 6.5,
    criteria: { TR: 6.5, CC: 6, LR: 7, GRA: 6.5 },
    strengths: ["Clear argument"],
    improvements: ["Support claims"],
    actionable_feedback: ["Add an example"],
    feedback: "Synthetic private feedback",
    word_count_comment: "Suitable length",
    model: "synthetic-model",
    tokens_used: 200,
  };
  const speaking = {
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
    feedback: "Synthetic private transcript feedback.",
    topic: "Describe your hometown.",
    task_type: "part1",
    word_count: 20,
    duration_secs: null,
    model: "synthetic",
  };
  const reserve = async (id, service) =>
    JSON.parse(
      await sql(
        `set role service_role;select reserve_ai_request(${q(actor)},${
          q(service)
        },${q(id)},${q(hash)},20,100);`,
        "postgres",
      ),
    );
  const beginRequest = (id, service, lease) =>
    sql(
      `set role service_role;select begin_ai_request(${q(actor)},${
        q(service)
      },${q(id)},${q(lease)});`,
      "postgres",
    );
  await check(
    "real Auth mirror and service role atomically save both owned feedback receipts",
    async () => {
      await sql(
        `insert into auth.users(id,email,aud,role,email_confirmed_at,raw_user_meta_data) values(${
          q(actor)
        },${
          q("ai-schema-" + actor + "@example.invalid")
        },'authenticated','authenticated',now(),'{"full_name":"Owned local AI fixture"}');`,
        "supabase_auth_admin",
      );
      assert.equal(
        await sql(`select is_active from public.users where id=${q(actor)};`),
        "t",
      );
      // The additive foundation must remain compatible with the current live
      // service-role writers until the separately qualified client transition.
      await sql(
        `set role service_role;
      insert into public.writing_tutor_sessions(user_id,feedback) values(${
          q(actor)
        },'Synthetic legacy writing feedback');
      insert into public.speaking_coach_sessions(user_id,topic,task_type,transcript,overall_band,criteria,feedback)
        values(${
          q(actor)
        },'Synthetic legacy topic','part1','Synthetic legacy transcript',6.5,'{"P":6.5}','Synthetic legacy feedback');`,
        "postgres",
      );
      assert.equal(
        await sql(
          `select assessment_scope='legacy_unverified' and overall_band=6.5 from public.speaking_coach_sessions where user_id=${
            q(actor)
          };`,
        ),
        "t",
      );
      writingLease = (await reserve(writingId, "writing-tutor")).lease_token;
      speakingLease = (await reserve(speakingId, "speaking-coach")).lease_token;
      pendingLease = (await reserve(pendingId, "writing-tutor")).lease_token;
      assert.equal(
        await beginRequest(writingId, "writing-tutor", writingLease),
        "t",
      );
      assert.equal(
        await beginRequest(speakingId, "speaking-coach", speakingLease),
        "t",
      );
      const writingSaved = JSON.parse(
        await sql(
          `set role service_role;select complete_writing_tutor_request(${
            q(actor)
          },${q(writingId)},${q(writingLease)},${
            q(JSON.stringify(writing))
          }::jsonb);`,
          "postgres",
        ),
      );
      const speakingSaved = JSON.parse(
        await sql(
          `set role service_role;select complete_speaking_coach_request(${
            q(actor)
          },${q(speakingId)},${q(speakingLease)},${
            q(JSON.stringify(speaking))
          }::jsonb,'A synthetic private transcript about a hometown.');`,
          "postgres",
        ),
      );
      assert.ok(writingSaved.session_id);
      assert.ok(speakingSaved.session_id);
      assert.equal(speakingSaved.overall_band, null);
      assert.equal(
        await sql(
          `select count(*) from public.ai_request_ledger where user_id=${
            q(actor)
          };`,
        ),
        "3",
      );
      assert.equal(
        await sql(
          `select count(*) from public.ai_request_usage_daily where user_id=${
            q(actor)
          };`,
        ),
        "2",
      );
      await sql(
        `insert into public.payments(id,user_id,provider,provider_transaction_id,amount,currency,status,metadata) values(${
          q(payment)
        },${q(actor)},'local_ai_schema_fixture',${
          q(payment)
        },1000,'UZS','paid','{"fixture":"retained-evidence"}');
      insert into public.account_closure_qualifications(user_id,expires_at) values(${
          q(actor)
        },clock_timestamp()+interval '30 minutes');`,
        "postgres",
      );
      globalBefore = await sql(
        "select jsonb_agg(to_jsonb(u) order by service,usage_date)::text from public.ai_request_usage_daily u where scope='global';",
      );
      paymentBefore = await sql(
        `select to_jsonb(p)::text from public.payments p where id=${
          q(payment)
        };`,
      );
    },
  );
  await check(
    "actual Auth erasure purges private AI stores and preserves global budget and payment evidence",
    async () => {
      await sql(
        `update auth.users set deleted_at=clock_timestamp(),email='closed-ai-local@example.invalid',raw_user_meta_data='{}',raw_app_meta_data='{}' where id=${
          q(actor)
        };`,
        "supabase_auth_admin",
      );
      for (
        const table of [
          "ai_request_ledger",
          "ai_request_usage_daily",
          "writing_tutor_sessions",
          "speaking_coach_sessions",
        ]
      ) {
        assert.equal(
          await sql(
            `select count(*) from public.${table} where user_id=${q(actor)};`,
          ),
          "0",
        );
      }
      const counts = JSON.parse(
        await sql(
          `select erased_counts from public.account_closure_receipts where user_id=${
            q(actor)
          };`,
        ),
      );
      assert.equal(counts.ai_request_ledger, 3);
      assert.equal(counts.ai_request_usage_daily, 2);
      assert.equal(
        await sql(
          "select jsonb_agg(to_jsonb(u) order by service,usage_date)::text from public.ai_request_usage_daily u where scope='global';",
        ),
        globalBefore,
      );
      assert.equal(
        await sql(
          `select to_jsonb(p)::text from public.payments p where id=${
            q(payment)
          };`,
        ),
        paymentBefore,
      );
      assert.equal(
        await sql(
          `select not is_active from public.users where id=${q(actor)};`,
        ),
        "t",
      );
    },
  );
  await check(
    "late provider and stale reservation commands cannot repopulate a real closed principal",
    async () => {
      await assert.rejects(reserve(randomUUID(), "writing-tutor"));
      await assert.rejects(
        beginRequest(pendingId, "writing-tutor", pendingLease),
      );
      await assert.rejects(
        sql(
          `set role service_role;select complete_writing_tutor_request(${
            q(actor)
          },${q(writingId)},${q(writingLease)},${
            q(JSON.stringify(writing))
          }::jsonb);`,
          "postgres",
        ),
      );
      await assert.rejects(
        sql(
          `set role service_role;select complete_speaking_coach_request(${
            q(actor)
          },${q(speakingId)},${q(speakingLease)},${
            q(JSON.stringify(speaking))
          }::jsonb,'A synthetic private transcript about a hometown.');`,
          "postgres",
        ),
      );
      await assert.rejects(
        sql(
          `insert into public.ai_request_usage_daily(scope,service,usage_date) values(${
            q("user:" + actor)
          },'writing-tutor',current_date);`,
          "postgres",
        ),
      );
      assert.equal(
        await sql(
          `select count(*) from public.ai_request_ledger where user_id=${
            q(actor)
          };`,
        ),
        "0",
      );
      assert.equal(
        await sql(
          "select jsonb_agg(to_jsonb(u) order by service,usage_date)::text from public.ai_request_usage_daily u where scope='global';",
        ),
        globalBefore,
      );
    },
  );
  await check(
    "actual browser roles cannot access private AI ledger or mutate tutor history",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const table of ["ai_request_ledger", "ai_request_usage_daily"]) {
          await assert.rejects(
            sql(`set role ${role};select * from public.${table};`, "postgres"),
          );
        }
        for (
          const table of ["writing_tutor_sessions", "speaking_coach_sessions"]
        ) {
          assert.equal(
            await sql(
              `select has_table_privilege(${q(role)},${
                q("public." + table)
              },'INSERT,UPDATE,DELETE') or has_any_column_privilege(${
                q(role)
              },${q("public." + table)},'INSERT,UPDATE');`,
            ),
            "f",
          );
        }
      }
    },
  );
  passed = true;
} finally {
  if (owned) {
    const marker = await run([
      "inspect",
      name,
      "--format",
      '{{index .Config.Labels "schood.qa"}}',
    ]);
    assert.equal(marker, label);
    await run(["rm", "--force", name]);
    assert.equal(
      await run([
        "ps",
        "--all",
        "--filter",
        "name=^/" + name + "$",
        "--format",
        "{{.ID}}",
      ]),
      "",
    );
    cleanupVerified = true;
  }
  const proof = {
    recordedAt: new Date().toISOString(),
    passed,
    cleanupVerified,
    stage,
    count: checks.length,
    checks,
    catalog,
    schema: { sha256, tableCount: 406, customerRowsIncluded: false },
    runtimeCatalog: {
      capturedAt: runtimeCapture.capturedAt,
      sha256: createHash("sha256").update(readFileSync(runtimeFile)).digest(
        "hex",
      ),
      roles: runtime.roles,
      extensions: runtime.extensions,
    },
    image,
    migrations: [...migrations, ...aiMigrations].map((file) => ({
      file,
      sha256LF: createHash("sha256").update(
        readFileSync("supabase/migrations/" + file, "utf8").replaceAll(
          "\r\n",
          "\n",
        ),
      ).digest("hex"),
    })),
    productionChanged: false,
    limits: [
      "Local complete-schema compatibility only; no hosted AI/provider activation proof.",
      "Schema captures contain definitions, not production seed/catalogue/customer records.",
      "The local PostgreSQL exercises real captured Auth triggers, not the live Auth service.",
    ],
  };
  writeFileSync(
    root + "/ai-installed-schema-native-proof.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({ passed, count: checks.length, cleanupVerified, stage }),
  );
}
