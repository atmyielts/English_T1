import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb} from './lib/academy-session-test-db.mjs';
const native=process.argv.includes('--native'),capturePath=process.argv.find(arg=>arg.startsWith('--capture='))?.slice(10)??'scripts/fixtures/academy-installed-contact-policy.json';
const capture=JSON.parse(readFileSync(capturePath,'utf8').replace(/^\uFEFF/,''));
assert.equal(capture.readOnly,true);assert.equal(capture.customerRowsRead,false);
const db=native?await createNativeSessionDb():new PGlite();let checks=0;
const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
const academy='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002';
const tables=['academy_contacts','academy_classrooms','academy_classroom_memberships','academy_payments','academy_staff','academy_role_grants','academy_staff_branch_assignments'];
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
  create function account_is_open() returns boolean language sql stable as $$select true;$$;
  create table tenant_memberships(tenant_id uuid,user_id uuid,role text,status text);
  grant usage on schema auth to authenticated;grant select on tenant_memberships to authenticated;`);
 for(const table of tables)await db.exec(`create table ${table}(id uuid primary key default gen_random_uuid(),academy_id uuid not null,private_value text);alter table ${table} enable row level security;grant all on ${table} to anon,authenticated,service_role;`);
 for(const name of ['is_academy_member','is_academy_admin']){
  const f=capture.catalog.functions.find(f=>f.name===name);assert(f);await db.exec(f.definition);checks++;
 }
 // Install the real captured contact policies (including the account-open
 // restriction), not a hypothetical broadly permissive replacement.
 for(const p of capture.catalog.policies.filter(p=>p.tablename==='academy_contacts')){
  const roles=p.roles.map(role=>'"'+role.replaceAll('"','""')+'"').join(',');
  await db.exec(`create policy "${p.policyname.replaceAll('"','""')}" on academy_contacts as ${p.permissive} for ${p.cmd} to ${roles}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''};`);
 }
 await query("insert into tenant_memberships values($1,$2,'student','active')",[academy,actor]);
 await query("insert into academy_contacts(academy_id,private_value) values($1,'Unrelated peer contact'),($1,'Unrelated staff contact')",[academy]);
 // The native adapter opens a connection per command: bind identity, role and
 // assertion in the same connection so the test cannot lose its JWT context.
 await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);set role authenticated;
  do $$begin if (select count(*) from academy_contacts)<>2 then raise exception 'Existing healthy student peer-read bypass not reproduced';end if;end;$$;reset role;`);checks++;
 // Explicit column/public grants test the paths which a table-only REVOKE
 // would miss. The installed frontend does not require either path.
 await db.exec('grant select(private_value),update(private_value) on academy_contacts to public;');
 await db.exec(readFileSync('supabase/migrations/20261014110000_academy_gateway_table_boundary.sql','utf8'));
 for(const table of tables){
  for(const role of ['anon','authenticated']){
   for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']){
    assert.equal((await query('select has_table_privilege($1,$2,$3) allowed',[role,'public.'+table,privilege]))[0].allowed,false);checks++;
   }
  }
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']){assert.equal((await query('select has_table_privilege($1,$2,$3) allowed',['service_role','public.'+table,privilege]))[0].allowed,true);checks++;}
 }
 for(const role of ['anon','authenticated']){
  await assert.rejects(()=>db.exec('set role '+role+';select private_value from academy_contacts;'),e=>e.code==='42501'||/permission denied/i.test(e.message));checks++;
  await db.exec('reset role');
 }
 await db.exec(`set role service_role;do $$begin if (select count(*) from academy_contacts)<>2 then raise exception 'Service record access changed';end if;end;$$;reset role;`);checks++;
 console.log(JSON.stringify({suite:'installed-academy-policy-bypass-and-gateway-boundary',native,checks,reproducedExistingPeerRead:true,productionTouched:false}));
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code}));process.exitCode=1;}
finally{await db.close();}
