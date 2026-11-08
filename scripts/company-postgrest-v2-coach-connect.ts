// V2 journeys through the real handler and PostgREST. Outbound switches stay off.
// deno-lint-ignore-file no-explicit-any
import type { V2Harness } from './company-postgrest-v2-harness.ts';
import { KUDOS_MESSAGES } from '../supabase/functions/company/coach/team.ts';
import type { ConnectConfig } from '../supabase/functions/company/connect/shared.ts';

export async function coachConnectV2(h: V2Harness) {
  const { call, sql, area, eq, ok, need, state: S, users: U } = h;
  const o = `orgs/${S.org}`, c = `${o}/coach`, x = `${o}/connect`;
  const today = await sql("select to_char(now() at time zone 'Asia/Tashkent','YYYY-MM-DD')");
  const sent: { telegram: any[]; email: any[]; webhook: any[] } = { telegram: [], email: [], webhook: [] };
  const testAdapters: ConnectConfig = {
    telegramEnabled: true, emailEnabled: true, webhooksEnabled: true, telegramBot: 'schood_test_bot',
    telegram: (message) => { sent.telegram.push(message); return Promise.resolve({ ok: true }); },
    email: (message) => { sent.email.push(message); return Promise.resolve({ ok: true }); },
    webhook: (message) => { sent.webhook.push(message); return Promise.resolve({ ok: true, status: 204 }); },
  };

  await area('v2 coach: daily plan, personal deck, practice and privacy', async () => {
    await sql(`update company_members set status='active',seat=true,consent_at=now() where id in ('${S.emp1Member}','${S.emp2Member}')`);
    await call('GET', `${c}/today`, { as: U.otherOwner, expect: 403 });
    const plan = await call('GET', `${c}/today`, { as: U.employee });
    ok('daily plan has real steps', plan.body.plan.items.length > 0);
    await call('POST', `${c}/today/skip`, { as: U.employee, body: { index: 0, skipped: true } });
    await call('PUT', `${c}/settings`, { as: U.employee, body: { weekly_goal: 4, daily_minutes: 5, rest_days: [0] } });
    await call('POST', `${c}/leave`, { as: U.employee, body: { until: today } });
    await call('DELETE', `${c}/leave`, { as: U.employee });
    const phrasebook = await call('GET', `${c}/phrasebook`, { as: U.employee });
    ok('phrasebook includes 300 original phrases', phrasebook.body.total >= 300);
    await call('GET', `${c}/finder`, { as: U.employee });
    await call('POST', `${c}/finder`, { as: U.employee, body: { text: 'Please confirm the booking', situation: 'any', tone: 'neutral', locale: 'ru' } });
    const card = (await call('POST', `${c}/cards`, { as: U.employee, body: { front: 'Could you confirm the booking?', ru: 'Подтвердите бронирование', uz: 'Bandlovni tasdiqlang' } })).body.card;
    need(card?.id, 'new personal phrase');
    await call('PATCH', `${c}/cards/${card.id}`, { as: U.employee, body: { note: 'Reception desk' } });
    await call('PATCH', `${c}/cards/${card.id}`, { as: U.employee2, body: { note: 'Private' }, expect: 404 });
    await call('GET', `${c}/queue`, { as: U.employee });
    const reviewed = await call('POST', `${c}/reviews`, { as: U.employee, body: { card: card.id, reps: 0, mode: 'intro', grade: 3 } });
    eq('first review recorded', reviewed.body.status, 'ok');
    const double = await call('POST', `${c}/reviews`, { as: U.employee, body: { card: card.id, reps: 0, mode: 'intro', grade: 3 } });
    eq('second tab cannot double count', double.body.status, 'duplicate');
    await call('GET', `${c}/deck`, { as: U.employee });
    await call('GET', `${c}/deck/export`, { as: U.employee });
    const shadow = await call('GET', `${c}/shadow`, { as: U.employee });
    const phrase = need(shadow.body.items[0], 'shadow phrase');
    const result = await call('POST', `${c}/shadow`, { as: U.employee, body: { ref: phrase.ref, said: phrase.en, input: 'typed' } });
    eq('shadow checks transcript', result.body.score, 100);
    await call('GET', `${c}/shadow?situation=deck`, { as: U.employee });
    await call('GET', `${c}/shadow?situation=lesson`, { as: U.employee });
    await call('GET', `${c}/progress`, { as: U.employee });
    await call('GET', `${c}/adoption`, { as: U.admin });
    await call('GET', `${c}/adoption`, { as: U.manager });
    await call('GET', `${c}/adoption`, { as: U.employee, expect: 403 });
    await call('DELETE', `${c}/cards/${card.id}`, { as: U.employee });
  });

  await area('v2 coach: opt-in team feed and HR controls', async () => {
    const closed = await call('GET', `${c}/team`, { as: U.employee });
    eq('feed starts private', closed.body.joined, false);
    for (const as of [U.employee, U.employee2]) await call('PUT', `${c}/team/membership`, { as, body: { joined: true } });
    await call('POST', `${c}/team/kudos`, { as: U.employee, body: { to: S.emp2Member, message: KUDOS_MESSAGES[0], note: 'Thanks for the handover' } });
    const feed = (await call('GET', `${c}/team`, { as: U.employee2 })).body.feed;
    const entry = need(feed.find((row: any) => row.note === 'Thanks for the handover'), 'team kudos');
    await call('DELETE', `${c}/team/kudos/${entry.id}`, { as: U.employee2 });
    // Seed an earned badge from the person's own completed plan, then share by choice.
    await sql(`insert into company_coach_log(org_id,member_id,user_id,day,kind,ref) values ('${S.org}','${S.emp1Member}','${U.employee}','${today}','plan_done','rest-harness') on conflict do nothing`);
    await call('POST', `${c}/team/share`, { as: U.employee, body: { badge: 'first_plan' } });
    await call('PUT', `${c}/team/settings`, { as: U.admin, body: { kudos_off: true } });
    eq('HR can pause the feed', (await call('GET', `${c}/team`, { as: U.employee })).body.enabled, false);
    await call('PUT', `${c}/team/settings`, { as: U.admin, body: { kudos_off: false } });
    await call('PUT', `${c}/team/membership`, { as: U.employee, body: { joined: false } });
    eq('leaving hides shared entries', (await call('GET', `${c}/team`, { as: U.employee2 })).body.feed.length, 0);
  });

  await area('v2 connect: notifications and messaging switches stay off', async () => {
    const overview = (await call('GET', `${x}/overview`, { as: U.admin })).body;
    eq('all external messaging defaults off', overview.switches, { telegram: false, email: false, webhooks: false });
    await call('GET', `${x}/overview`, { as: U.employee, expect: 403 });
    await call('PATCH', `${x}/settings`, { as: U.admin, body: { telegram_enabled: false, email_enabled: false, quiet_start: 21, quiet_end: 9, daily_cap: 3 } });
    await call('GET', `${x}/me`, { as: U.employee });
    await call('PATCH', `${x}/me`, { as: U.employee, body: { telegram_opt_in: false, locale: 'uz' } });
    await call('PATCH', `${x}/me`, { as: U.employee, body: { telegram_opt_in: true }, expect: 409 });
    await call('POST', `${x}/telegram/link`, { as: U.employee, expect: 409 });
    // Format validation stops an invalid token before the shared Telegram RPC is needed.
    await call('POST', `${x}/telegram/confirm`, { as: U.employee, body: { token: 'invalid' }, expect: 400 });
    await call('GET', `${x}/email/invited`, { as: U.admin });
    await call('POST', `${x}/email/invites`, { as: U.admin, body: { member_ids: [S.emp1Member] }, expect: 409 });
    await call('GET', `${x}/notices/count`, { as: U.employee });
    const noticeId = await sql(`insert into company_notices(org_id,member_id,kind,dedupe_key,params) values ('${S.org}','${S.emp1Member}','seat_on','rest-harness','{}') returning id`);
    const list = await call('GET', `${x}/notices`, { as: U.employee });
    ok('own notice is visible', list.body.notices.some((row: any) => row.id === noticeId));
    await call('POST', `${x}/notices/${noticeId}/read`, { as: U.employee2, expect: 404 });
    await call('POST', `${x}/notices/${noticeId}/read`, { as: U.employee });
    await call('POST', `${x}/notices/read-all`, { as: U.employee });
    await call('POST', 'internal/connect/run', { expect: 401 });
  });

  await area('v2 connect: hashed API keys, scopes and tenant boundaries', async () => {
    await call('GET', `${x}/api-keys`, { as: U.admin });
    const read = (await call('POST', `${x}/api-keys`, { as: U.admin, body: { name: 'Read regression', scope: 'read', expires_days: 1 } })).body;
    const write = (await call('POST', `${x}/api-keys`, { as: U.admin, body: { name: 'Write regression', scope: 'write', expires_days: 1 } })).body;
    need(read.secret, 'read API key'); need(write.secret, 'write API key');
    eq('only hashes stored', await sql(`select key_hash <> '${read.secret}' from company_api_keys where id='${read.key.id}'`), 't');
    await call('GET', 'api/v1/workspace', { as: read.secret });
    const people = await call('GET', 'api/v1/people?limit=2', { as: read.secret });
    ok('API is paginated', people.body.data.length <= 2);
    await call('GET', `api/v1/people/${S.emp1Member}`, { as: read.secret });
    await call('POST', 'api/v1/people', { as: read.secret, body: { full_name: 'Forbidden' }, expect: 403 });
    const person = (await call('POST', 'api/v1/people', { as: write.secret, body: { full_name: 'API new member', email: 'v2-api@example.uz' } })).body;
    need(person.data?.id, 'API-created member');
    S.v2ApiPerson = person.data.id;
    await call('POST', `api/v1/people/${person.data.id}/invite`, { as: write.secret, body: {} });
    await call('GET', `orgs/${S.otherOrg}/connect/api-keys`, { as: U.admin, expect: 403 });
    await call('GET', 'api/v1/tests', { as: read.secret });
    await call('GET', `api/v1/tests/${S.test}/results`, { as: read.secret });
    await call('GET', 'api/v1/candidates', { as: read.secret });
    await call('GET', 'api/v1/levels', { as: read.secret });
    await call('GET', 'api/v1/activity/summary', { as: read.secret });
    await call('POST', `${x}/api-keys/${read.key.id}/revoke`, { as: U.admin });
    await call('GET', 'api/v1/workspace', { as: read.secret, expect: 401 });
    await call('POST', `${x}/api-keys/${write.key.id}/revoke`, { as: U.admin });
  });

  await area('v2 connect: opt-in delivery through synthetic adapters only', async () => {
    h.configureConnect(testAdapters);
    try {
      await sql(`alter table users add column if not exists telegram_chat_id text;
        update users set telegram_chat_id='synthetic-company-test' where id='${U.employee}';
        create table if not exists internal_runtime_secrets(key text primary key, secret text not null);
        insert into internal_runtime_secrets(key,secret) values ('company_connect_secret','${'t'.repeat(40)}') on conflict(key) do update set secret=excluded.secret`);
      await call('PATCH', `${x}/settings`, { as: U.admin, body: { telegram_enabled: true, email_enabled: true, quiet_start: 0, quiet_end: 0 } });
      const link = (await call('POST', `${x}/telegram/link`, { as: U.employee })).body;
      need(link.token, 'real shared Telegram token');
      ok('real link points to the configured test bot', link.link_url.startsWith('https://t.me/schood_test_bot?start='));
      // Mimic only the bot's presentation step. Issue and confirmation execute the
      // actual platform SQL functions loaded by the driver, with no real Telegram call.
      await sql(`update telegram_link_tokens set pending_chat_id='synthetic-company-test' where token='${link.token}' and user_id='${U.employee}'`);
      eq('shared confirmation completes', (await call('POST', `${x}/telegram/confirm`, { as: U.employee, body: { token: link.token } })).body.linked, true);
      eq('shared token is consumed', await sql(`select used_at is not null from telegram_link_tokens where token='${link.token}'`), 't');
      await call('PATCH', `${x}/me`, { as: U.employee, body: { telegram_opt_in: true, quiet_start: 0, quiet_end: 0 } });
      await call('POST', `${x}/email/invites`, { as: U.admin, body: { member_ids: [need(S.v2ApiPerson, 'API invite target')] } });
      eq('email handed to synthetic adapter once', sent.email.length, 1);
      const first = await call('POST', 'internal/connect/run', { headers: { 'x-worker-secret': 't'.repeat(40) } });
      ok('job reached opted-in synthetic Telegram adapter', first.body.telegram.sent > 0 && sent.telegram.some((message) => message.user_id === U.employee));
      await call('PATCH', `${x}/me`, { as: U.employee, body: { telegram_opt_in: false } });
    } finally { h.configureConnect({}); }
  });

  await area('v2 connect: concurrent pushes share a local-day allowance', async () => {
    const member = await sql(`insert into company_members(org_id,full_name,role,status) values ('${S.org}','Push race','employee','active') returning id`);
    const notices = (await sql(`insert into company_notices(org_id,member_id,kind,dedupe_key)
      select '${S.org}','${member}','test_todo','race:'||n from generate_series(1,8) n returning id`)).split('\n');
    const results = await Promise.all(notices.map((id) => h.db.rpc('company_claim_push_notice', {
      p_org: S.org, p_member: member, p_notice: id, p_limit: 2, p_at: new Date().toISOString(),
    })));
    ok('concurrent reservations returned no database errors', results.every((result) => !result.error));
    eq('only two concurrent notices reserved', results.filter((result) => result.data === true).length, 2);
    eq('two notices hold the budget in Postgres', await sql(`select count(*) from company_notices where member_id='${member}' and push_state='sending'`), '2');
    const day = (at: string) => h.db.rpc('company_connect_day_hit', { p_bucket: `boundary:${member}`, p_limit: 1, p_at: at });
    eq('late-night email allowed', (await day('2026-11-06T23:59:00Z')).data, true);
    eq('UTC midnight does not reset Tashkent cap', (await day('2026-11-07T00:01:00Z')).data, false);
    eq('next Tashkent day resets cap', (await day('2026-11-07T19:00:00Z')).data, true);
    await sql(`delete from company_members where id='${member}'`);
  });

  await area('v2 connect: webhook configuration, secrets and disabled delivery', async () => {
    await call('GET', `${x}/webhooks`, { as: U.admin });
    await call('POST', `${x}/webhooks`, { as: U.admin, body: { url: 'https://127.0.0.1/private', events: ['test.graded'] }, expect: 400 });
    const hook = (await call('POST', `${x}/webhooks`, { as: U.admin, body: { url: 'https://hooks.example.uz/company', events: ['test.graded'], description: 'Regression endpoint, never contacted' } })).body;
    need(hook.webhook?.id, 'webhook id'); need(hook.secret, 'one-time signing secret');
    const p = `${x}/webhooks/${hook.webhook.id}`;
    await call('PATCH', p, { as: U.admin, body: { active: true, description: 'Updated endpoint' } });
    await call('POST', `${p}/rotate`, { as: U.admin });
    eq('test cannot send while disabled', (await call('POST', `${p}/test`, { as: U.admin })).body.sent, false);
    await call('GET', `${p}/deliveries`, { as: U.admin });
    await call('POST', `${p}/deliveries/70000000-0000-4000-8000-000000000001/retry`, { as: U.admin, expect: 409 });
    h.configureConnect(testAdapters);
    try {
      eq('test endpoint uses synthetic adapter', (await call('POST', `${p}/test`, { as: U.admin })).body.sent, true);
      const deliveryId = await sql(`insert into company_webhook_deliveries(org_id,webhook_id,event,event_id,payload,status) values ('${S.org}','${hook.webhook.id}','test.graded','rest-retry','{}','dead') returning id`);
      await call('POST', `${p}/deliveries/${deliveryId}/retry`, { as: U.admin });
      await call('POST', 'internal/connect/run', { headers: { 'x-worker-secret': 't'.repeat(40) } });
      ok('synthetic webhook requests are signed', sent.webhook.some((request) => Boolean(request.headers['X-Schood-Signature'])));
      // A backlog in one workspace does not hold up another's event (real PostgREST filters).
      const otherHook = need((await call('POST', `orgs/${S.otherOrg}/connect/webhooks`, { as: U.otherOwner, body: { url: 'https://hooks.example.uz/other', events: ['test.graded'] } })).body.webhook?.id, 'other webhook');
      await sql(`insert into company_webhook_deliveries(org_id,webhook_id,event,event_id,payload,status,next_attempt_at)
        select '${S.org}','${hook.webhook.id}','test.graded','backlog:'||n,'{}','queued', now() - interval '1 hour' + n * interval '1 second' from generate_series(1,130) n`);
      const theirs = await sql(`insert into company_webhook_deliveries(org_id,webhook_id,event,event_id,payload,status,next_attempt_at) values ('${S.otherOrg}','${otherHook}','test.graded','fair-other','{}','queued', now() - interval '1 minute') returning id`);
      await call('POST', 'internal/connect/run', { headers: { 'x-worker-secret': 't'.repeat(40) } });
      eq('another workspace is picked in the same run as a backlog', await sql(`select status <> 'queued' from company_webhook_deliveries where id='${theirs}'`), 't');
      ok('the run still uses its capacity on the backlog', Number(await sql(`select count(*) from company_webhook_deliveries where event_id like 'backlog:%' and status <> 'queued'`)) >= 90);
      await sql(`delete from company_webhook_deliveries where event_id like 'backlog:%' or id='${theirs}'`);
      await call('DELETE', `orgs/${S.otherOrg}/connect/webhooks/${otherHook}`, { as: U.otherOwner });
    } finally { h.configureConnect({}); }
    await call('DELETE', `orgs/${S.otherOrg}/connect/webhooks/${hook.webhook.id}`, { as: U.otherOwner, expect: 404 });
    await call('DELETE', p, { as: U.admin });
  });

  await area('v2 connect: HRIS preview, branding and privacy exports', async () => {
    await call('GET', `${x}/import`, { as: U.admin });
    const source = { text: 'Full Name,Email,Department,Job Role\nV2 Import,v2-import@example.uz,Operations,general\n' };
    const preview = (await call('POST', `${x}/import/preview`, { as: U.admin, body: source })).body;
    need(preview.fingerprint, 'HRIS preview fingerprint');
    await call('POST', `${x}/import/apply`, { as: U.admin, body: { ...source, fingerprint: 'stale' }, expect: 409 });
    await call('POST', `${x}/import/apply`, { as: U.admin, body: { ...source, fingerprint: preview.fingerprint } });
    await call('GET', `${x}/brand`, { as: U.admin });
    await call('PUT', `${x}/brand`, { as: U.admin, body: { display_name: 'Company regression workspace', brand_color: '#17342b', logo: null } });
    const brand = (await call('GET', `public/brand/${S.org}`)).body.brand;
    eq('public brand contains approved name only', brand.name, 'Company regression workspace');
    await call('GET', `${x}/privacy/summary`, { as: U.admin });
    await call('GET', `${x}/privacy/people?q=V2`, { as: U.admin });
    await call('GET', `${x}/privacy/people/${S.emp1Member}/export`, { as: U.admin });
    const own = (await call('GET', `${x}/privacy/me/export`, { as: U.employee })).body;
    ok('own export includes voluntarily shared badge', own.learning.coach_kudos.some((row: any) => row.kind === 'badge' && row.badge === 'first_plan'));
    await call('GET', `${x}/privacy/people/${S.emp1Member}/export`, { as: U.manager, expect: 403 });
    await call('GET', `orgs/${S.otherOrg}/connect/privacy/people/${S.emp1Member}/export`, { as: U.otherOwner, expect: 404 });
    // Use the freshly imported empty learner: exercise erasure without disturbing
    // earlier learning journeys and the final cross-feature invariants.
    const imported = await sql(`select id from company_members where org_id='${S.org}' and email='v2-import@example.uz'`);
    await sql(`insert into company_coach_kudos(org_id,from_member,kind,badge,day) values ('${S.org}','${imported}','badge','first_plan','${today}')`);
    await call('POST', `${x}/privacy/people/${imported}/erase-learning`, { as: U.admin, body: { confirm: 'ERASE' } });
    eq('erase removes shared learning evidence', await sql(`select count(*) from company_coach_kudos where org_id='${S.org}' and from_member='${imported}'`), '0');
    await call('GET', `${x}/audit?action=privacy.`, { as: U.admin });
    await call('GET', `${x}/audit/export?action=privacy.`, { as: U.admin });
  });
}
