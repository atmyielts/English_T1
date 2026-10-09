import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleCandidateEntry } from './handler.ts';
import { admitCandidateResponse, candidateAppBase } from '../../../apps/platform/src/lib/candidateAdmission.ts';

const actor = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const tokenId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const body = { token_code: 'QA-EXAM-123', first_name: 'QA', last_name: 'Student', email: 'qa@example.test', phone: '+998900000001' };
type Step = { table: string; operation?: string; columns?: string; data?: unknown; error?: unknown };
function fixture(steps: Step[] = [], user: unknown = { id: actor, email: body.email, email_confirmed_at: '2026-01-01' }, authError: unknown = null) {
  const calls: { table: string; operation: string; payload?: any; filters: unknown[][] }[] = [];
  const authTokens: string[] = [];
  const sbAuth = { auth: { getUser: (token: string) => { authTokens.push(token); return Promise.resolve({ data: { user }, error: authError }); } } };
  const sbDb = { from(table: string) {
    const call = { table, operation: 'select', payload: undefined as any, filters: [] as unknown[][] };
    let columns = '';
    calls.push(call);
    const run = () => {
      const expected = steps.shift();
      assert(expected, `Unexpected query on ${table}`);
      assertEquals(table, expected.table);
      if (expected.operation) assertEquals(call.operation, expected.operation);
      if (expected.columns) assertEquals(columns.replaceAll(' ', ''), expected.columns.replaceAll(' ', ''));
      return Promise.resolve({ data: expected.data ?? null, error: expected.error ?? null });
    };
    const query: any = {
      select(value: string) { columns = value; return query; },
      maybeSingle: run,
      then(resolve: any, reject: any) { return run().then(resolve, reject); },
    };
    for (const operation of ['insert', 'update', 'upsert']) query[operation] = (payload: any) => { call.operation = operation; call.payload = payload; return query; };
    for (const filter of ['eq', 'in', 'is', 'or', 'order', 'limit', 'contains', 'ilike']) query[filter] = (...args: unknown[]) => { call.filters.push([filter, ...args]); return query; };
    return query;
  } };
  const request = (value: unknown = body, header: string | null = 'Bearer own-token', method = 'POST') => new Request('https://example.test/candidate-entry', {
    method, headers: { 'Content-Type': 'application/json', ...(header ? { Authorization: header } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(value) } : {}),
  });
  return { calls, authTokens, steps, sbDb, sbAuth, request, handle: (req: Request) => handleCandidateEntry(req, { sbDb, sbAuth }) };
}
function admission(status = 'active', claimed_by: string | null = null, voucher: unknown = null, appUrl = 'https://ielts.schood.online') : Step[] {
  return [
    { table: 'exam_tokens', data: { id: tokenId, tenant_id: tokenId, experience_id: tokenId, status, claimed_by, uses_count: claimed_by ? 1 : 0, max_uses: 1 } },
    { table: 'experiences', data: { id: tokenId, product_id: tokenId, is_active: true } },
    { table: 'products', columns: 'id,status,metadata', data: { id: tokenId, status: 'active', metadata: { slug: 'ielts', app_url: appUrl } } },
    { table: 'sections', data: { id: tokenId } },
    { table: 'partner_vouchers', data: voucher },
  ];
}
for (const header of [null, 'Bearer', 'Basic own-token', 'Bearer own-token second', `Bearer ${'x'.repeat(8193)}`]) {
  Deno.test(`candidate HTTP rejects missing/malformed authentication (${header?.slice(0, 20) ?? 'none'}) without queries`, async () => {
    const f = fixture();
    assertEquals((await f.handle(f.request(body, header))).status, 401);
    assertEquals(f.calls.length, 0); assertEquals(f.authTokens.length, 0);
  });
}
Deno.test('candidate HTTP rejects invalid and unconfirmed accounts before code lookup', async () => {
  for (const [user, error, status] of [[null, 'invalid', 401], [{id:actor,email:body.email}, null, 403], [{id:'bad',email:body.email,email_confirmed_at:'yes'},null,401]] as const) {
    const f = fixture([], user, error);
    assertEquals((await f.handle(f.request())).status, status); assertEquals(f.calls.length, 0);
  }
});
Deno.test('candidate HTTP does not leak authentication provider failures', async () => {
  const f = fixture(); f.sbAuth.auth.getUser = () => { throw new Error('private auth details'); };
  const res = await f.handle(f.request()); assertEquals(res.status, 503); assert(!(await res.text()).includes('private'));
});
Deno.test('candidate HTTP rejects another email and malformed input without queries', async () => {
  for (const [value, status] of [[{...body,email:'victim@example.test'},403], [[],400], [null,400], [{...body, phone:12},400], [{...body,first_name:'x'.repeat(101)},400], [{...body,token_code:'bad/code'},400]] as const) {
    const f = fixture(); assertEquals((await f.handle(f.request(value))).status,status); assertEquals(f.calls.length,0);
  }
});
Deno.test('candidate HTTP preflight works without authentication and methods cannot write', async () => {
  const f = fixture(); assertEquals((await f.handle(f.request(null,null,'OPTIONS'))).status,200);
  assertEquals((await f.handle(f.request(null,null,'GET'))).status,405); assertEquals(f.calls.length,0);
});
Deno.test('candidate HTTP bounds the actual body stream before lookup even without Content-Length', async () => {
  const f=fixture(); const res=await f.handle(f.request({...body,extra:'x'.repeat(8192)}));
  assertEquals(res.status,413); assertEquals(f.calls.length,0);
  assertEquals((await f.handle(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer own-token'},body:'{'}))).status,400);
});
Deno.test('candidate HTTP claimed-code holder cannot recover another account session', async () => {
  const f = fixture([...admission('claimed',other),{table:'exam_tokens',data:{status:'claimed',claimed_by:other}}]);
  assertEquals((await f.handle(f.request())).status,400);
  assertEquals(f.calls.filter(c=>c.table==='sessions').length,0); assert(f.calls.every(c=>c.operation==='select')); assertEquals(f.steps.length,0);
});
Deno.test('candidate HTTP owner can recover only their own session without minted credentials', async () => {
  const f = fixture([...admission('claimed',actor),
    {table:'exam_tokens',data:{status:'claimed',claimed_by:actor}},
    {table:'sessions',data:{id:sessionId,experience_id:tokenId}},
    {table:'partner_vouchers'}, {table:'sessions',data:{metadata:{}}},{table:'sessions',operation:'update'},
  ]);
  const res = await f.handle(f.request()); assertEquals(res.status,200);
  const payload = await res.json(); assertEquals(payload.actor_id,actor); assertEquals(payload.session_id,sessionId);
  assertEquals(payload.session,undefined); assertEquals(payload.access_token,undefined);
  assertEquals(res.headers.get('Cache-Control'),'no-store');
  assert(f.calls.find(c=>c.table==='sessions')!.filters.some(args=>JSON.stringify(args)===JSON.stringify(['eq','user_id',actor])));
  assertEquals(f.calls.filter(c=>['user_profiles','users'].includes(c.table)).length,0); assertEquals(f.steps.length,0);
});
Deno.test('candidate HTTP binds new claim, profile, session and registration to verified actor', async () => {
  const f = fixture([...admission(), {table:'user_profiles',operation:'upsert',data:{user_id:actor}},
    {table:'exam_tokens',operation:'update',data:{id:tokenId}}, {table:'sessions',operation:'insert',data:{id:sessionId}},
    {table:'exam_registrations',operation:'insert',data:{id:tokenId}}, {table:'sessions',operation:'update'}, {table:'partner_vouchers'},
  ]);
  const res = await f.handle(f.request({...body,user_id:other,claimed_by:other})); assertEquals(res.status,200);
  const payload = await res.json(); assertEquals(payload.actor_id,actor); assertEquals(payload.session,undefined);
  for (const table of ['user_profiles','sessions','exam_registrations']) assertEquals(f.calls.find(c=>c.table===table&&c.payload?.user_id)!.payload.user_id,actor);
  assertEquals(f.calls.find(c=>c.table==='exam_tokens'&&c.operation==='update')!.payload.claimed_by,actor);
  assertEquals(f.authTokens,['own-token']); assertEquals(f.steps.length,0);
});
Deno.test('candidate voucher retry cannot overwrite an academy contact linked to another account', async () => {
  const voucher={id:tokenId,tenant_id:tokenId,code:body.token_code,access_kind:'mock_exam',status:'redeemed',redeemed_by:actor,classroom_id:tokenId};
  const f=fixture([...admission('claimed',actor,voucher),
    {table:'exam_tokens',data:{status:'claimed',claimed_by:actor}},
    {table:'sessions',data:{id:sessionId,experience_id:tokenId}},
    {table:'partner_vouchers',data:voucher},{table:'partner_vouchers',operation:'update'},
    {table:'partner_center_students'}, {table:'partner_center_students',operation:'insert'},
    {table:'academy_classrooms',data:{id:tokenId,academy_id:tokenId}}, {table:'tenants',data:{id:tokenId}},
    {table:'academy_contacts'}, {table:'academy_contacts',columns:'id,user_id,email,metadata',data:{id:tokenId,user_id:other,email:body.email}},
    {table:'sessions',data:{metadata:{}}}, {table:'sessions',operation:'update'},
  ]);
  const response=await f.handle(f.request());assertEquals(response.status,200);assertEquals(f.steps.length,0);
  assertEquals(f.calls.filter(c=>c.table==='academy_contacts'&&c.operation!=='select').length,0);
  assertEquals(f.calls.filter(c=>c.table==='academy_classroom_memberships').length,0);
  assert(f.calls.filter(c=>c.table==='academy_contacts').every(c=>!c.filters.some(args=>args[1]==='phone')));
  const patch=f.calls.find(c=>c.table==='partner_vouchers'&&c.operation==='update')!;
  assertEquals(patch.payload.assigned_email,undefined);assertEquals(patch.payload.assigned_name,undefined);
  assert(patch.filters.some(args=>args[0]==='or'&&String(args[1]).includes(actor)));
});
for (const voucher of [
  {access_kind:'mock_exam',status:'unused',assigned_email:'victim@example.test'},
  {access_kind:'mock_exam',status:'redeemed',redeemed_by:other},
  {access_kind:'mock_exam',status:'disabled'},
  {access_kind:'mock_exam',status:'unused',expires_at:'invalid'},
  {access_kind:'mock_exam',status:'unused',expires_at:'2000-01-01'},
]) Deno.test(`candidate HTTP refuses foreign or unavailable voucher ${JSON.stringify(voucher)}`, async () => {
  const f=fixture(admission('active',null,voucher)); const res=await f.handle(f.request()); assert([403,409].includes(res.status)); assert(f.calls.every(c=>c.operation==='select')); assertEquals(f.steps.length,0);
});
Deno.test('candidate HTTP voucher query failures stop all claim writes', async () => {
  const steps=admission(); steps[4].error={message:'private db error'};
  const f=fixture(steps); const res=await f.handle(f.request()); assertEquals(res.status,503); assert(!(await res.text()).includes('private')); assert(f.calls.every(c=>c.operation==='select'));
});
Deno.test('candidate HTTP rejects untrusted exam destination before using code', async () => {
  for(const url of ['https://evil.example','https://ielts.schood.online.evil.example','https://ielts.schood.online/path','https://ielts.schood.online/?next=evil']) {
    const f=fixture(admission('active',null,null,url).slice(0,3)); assertEquals((await f.handle(f.request())).status,400); assert(f.calls.every(c=>c.operation==='select')); assertEquals(f.steps.length,0);
  }
});
Deno.test('candidate HTTP refuses disabled exam service before claiming access', async () => {
  const steps=admission().slice(0,3); (steps[2].data as {status:string}).status='disabled';
  const f=fixture(steps); assertEquals((await f.handle(f.request())).status,409); assert(f.calls.every(c=>c.operation==='select')); assertEquals(f.steps.length,0);
});
const localSession={access_token:'own-access',refresh_token:'own-refresh',expires_in:3600,token_type:'bearer',user:{id:actor,email:body.email}};
Deno.test('candidate client overwrites credentials from legacy server with current account session',()=>{
  const result=admitCandidateResponse({session_id:sessionId,app_url:'https://sat.schood.online',session:{access_token:'victim'}},localSession,localSession);
  assertEquals(result.session,localSession);
});
Deno.test('candidate client refuses signed-out, changed-account and mismatched actor responses',()=>{
  for(const [current,returned] of [[null,actor],[{...localSession,user:{id:other}},actor],[localSession,other]] as const) {
    let rejected=false; try{admitCandidateResponse({actor_id:returned,session_id:sessionId,app_url:'https://sat.schood.online'},localSession,current);}catch{rejected=true;} assert(rejected);
  }
});
Deno.test('candidate destination allowlist admits only the four exact exam roots',()=>{
  for(const host of ['ielts','sat','toefl','itep']) assertEquals(candidateAppBase(`https://${host}.schood.online/`),`https://${host}.schood.online`);
  for(const url of ['javascript:alert(1)','https://ielts.schood.online@evil.example','https://evil.example','http://sat.schood.online','https://sat.schood.online/?token=x','https://sat.schood.online/#token=x']) {
    let rejected=false;try{candidateAppBase(url);}catch{rejected=true;}assert(rejected);
  }
});
