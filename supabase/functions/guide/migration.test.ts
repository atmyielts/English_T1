import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Executes the actual migration in isolated PostgreSQL 17 (WASM), never the linked production DB.
Deno.test("guide migration: RLS, immutable versions, atomic publication, paid events and retention", async (t) => {
  const db = new PGlite();
  const actor = "11111111-1111-4111-8111-111111111111";
  try {
    await db.exec(`create schema auth; create table auth.users(id uuid primary key);
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.payments(id uuid primary key, user_id uuid, status text);
      insert into auth.users values ('${actor}');`);
    await db.exec(
      await Deno.readTextFile(
        new URL("../../migrations/20260902090000_adaptive_onboarding.sql", import.meta.url),
      ),
    );
    const version = (await db.query<{ id: string }>(
      `insert into guide_versions(config,created_by) values ('{"schemaVersion":1}', $1) returning id`,
      [actor],
    )).rows[0].id;
    await t.step("dark by default and no browser access to any private table", async () => {
      assertEquals(
        (await db.query<{ enabled: boolean }>("select enabled from guide_release")).rows[0].enabled,
        false,
      );
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        for (
          const table of [
            "guide_versions",
            "guide_release",
            "guide_sessions",
            "guide_events",
            "guide_payment_links",
            "guide_rate_limits",
            "guide_arrivals",
          ]
        ) await assertRejects(() => db.query(`select * from ${table}`));
        await assertRejects(() => db.query("select guide_cleanup()"));
        await assertRejects(() => db.query("select guide_publish($1,1,1,$2)", [version, actor]));
        await db.exec("reset role");
      }
    });
    await t.step("publication detects stale releases and draft edits", async () => {
      await assertRejects(() => db.query("select guide_publish($1,2,1,$2)", [version, actor]));
      await db.query("select guide_publish($1,1,1,$2)", [version, actor]);
      assertEquals(
        (await db.query<{ enabled: boolean }>("select enabled from guide_release")).rows[0].enabled,
        true,
      );
      await assertRejects(() => db.query("select guide_publish($1,1,1,$2)", [version, actor]));
    });
    await t.step("published content cannot change and rollback reuses an immutable snapshot", async () => {
      await assertRejects(() => db.query(`update guide_versions set config = '{}' where id = $1`, [version]));
      await db.query("select guide_publish($1,1,2,$2)", [version, actor]);
      assertEquals(
        (await db.query<{ revision: number }>("select revision from guide_release")).rows[0].revision,
        3,
      );
    });
    const session = (await db.query<{ id: string }>(
      `insert into guide_sessions(version_id,secret_hash,user_id,locale,answers) values ($1,repeat('a',64),$2,'en','{"audience":"learner"}') returning id`,
      [version, actor],
    )).rows[0].id;
    await t.step("only a confirmed paid status creates conversion, with idempotent replay", async () => {
      const payment = "22222222-2222-4222-8222-222222222222";
      await db.query(`insert into payments values ($1,$2,'pending')`, [payment, actor]);
      await db.query(
        `insert into guide_payment_links(payment_id,session_id,version_id,offer_id) values ($1,$2,$3,'offer')`,
        [payment, session, version],
      );
      assertEquals((await db.query("select * from guide_events")).rows.length, 0);
      await db.query(`update payments set status='paid' where id=$1`, [payment]);
      await db.query(`update payments set status='paid' where id=$1`, [payment]);
      assertEquals((await db.query(`select * from guide_events where event='paid'`)).rows.length, 1);
      const paidBeforeLink = "33333333-3333-4333-8333-333333333333";
      await db.query(`insert into payments values ($1,$2,'paid')`, [paidBeforeLink, actor]);
      await db.query(
        `insert into guide_payment_links(payment_id,session_id,version_id,offer_id) values ($1,$2,$3,'offer')`,
        [paidBeforeLink, session, version],
      );
      assertEquals((await db.query(`select * from guide_events where event='paid'`)).rows.length, 2);
    });
    await t.step(
      "payment belonging to another user does not count as this learner’s conversion",
      async () => {
        const other = "44444444-4444-4444-8444-444444444444";
        await db.query(`insert into payments values ($1,gen_random_uuid(),'paid')`, [other]);
        await db.query(
          `insert into guide_payment_links(payment_id,session_id,version_id,offer_id) values ($1,$2,$3,'offer')`,
          [other, session, version],
        );
        assertEquals((await db.query(`select * from guide_events where event='paid'`)).rows.length, 2);
      },
    );
    await t.step("rate limits are atomic and do not allow requests above the limit", async () => {
      for (let i = 0; i < 3; i++) {
        assertEquals(
          (await db.query<{ allowed: boolean }>(`select guide_rate_limit('test',2,60) as allowed`)).rows[0]
            .allowed,
          i < 2,
        );
      }
    });
    await t.step(
      "retention removes expired personal answers but keeps unlinked aggregate events",
      async () => {
        await db.query(`update guide_sessions set expires_at=now()-interval '1 minute' where id=$1`, [
          session,
        ]);
        await db.query("select guide_cleanup()");
        assertEquals((await db.query("select * from guide_sessions")).rows.length, 0);
        const events =
          (await db.query<{ session_id: string | null }>("select session_id from guide_events")).rows;
        assertEquals(events.length, 2);
        assert(events.every((e) => e.session_id === null));
      },
    );
  } finally {
    await db.close();
  }
});
