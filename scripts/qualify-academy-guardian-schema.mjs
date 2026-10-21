// Local-only qualification of a schema-only provider capture. Never reads
// credentials, connects to production, or loads customer rows.
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const option=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const schemaFile=option('--schema-file'),expected=option('--expected-sha256');
if(!schemaFile||!expected||!/^[a-f0-9]{64}$/.test(expected))throw Error('An explicit schema-only capture and expected SHA256 are required');
const source=readFileSync(schemaFile,'utf8'),sha256=createHash('sha256').update(source).digest('hex');
if(sha256!==expected||source.length<100000||/COPY\s+.*FROM stdin|^INSERT INTO/m.test(source))throw Error('Capture identity or schema-only boundary failed');
const runtimeFile=option('--runtime-catalog');if(!runtimeFile)throw Error('Explicit metadata-only runtime catalogue required');
const runtimeSource=readFileSync(runtimeFile,'utf8');
const runtimeCapture=JSON.parse(runtimeSource.replace(/^\uFEFF/,'')),runtime=runtimeCapture.catalog;
if(runtimeCapture.readOnly!==true||runtimeCapture.customerRowsRead!==false||!runtime.roles?.some(role=>role.name==='postgres'&&role.superuser===false)||runtime.postgresPrivileges?.authTrigger!==true)throw Error('Runtime privilege catalogue invalid');
const allowedSettings=new Set(['shared_preload_libraries','session_preload_libraries','local_preload_libraries','supautils.privileged_role','supautils.privileged_role_allowed_configs','supautils.superuser','supautils.reserved_roles','supautils.reserved_memberships']);
if(!runtime.runtimeSettings?.some(setting=>setting.name==='session_preload_libraries'&&setting.setting.includes('supautils'))||runtime.runtimeSettings.some(setting=>!allowedSettings.has(setting.name)||typeof setting.setting!=='string'))throw Error('Privileged runtime settings unavailable');
const postgresArgs=['postgres','-c','cron.database_name=postgres',...runtime.runtimeSettings.flatMap(setting=>['-c',setting.name+'='+setting.setting])];
const ident=name=>{if(!/^[a-z_][a-z0-9_-]*$/.test(name))throw Error('Invalid catalogue identifier');return '"'+name+'"';};
const image='public.ecr.aws/supabase/postgres@sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426';
const name='schood-guardian-schema-'+randomUUID().slice(0,8),label='guardian-portal-installed-schema';
const root=option('--output-dir')||'supabase/.temp/guardian-schema';mkdirSync(root,{recursive:true});
writeFileSync(root+'/installed-schema-owned-container.json',JSON.stringify({name,label,image,createdAt:new Date().toISOString()},null,2)+'\n');
const migrations=[...new Set([...JSON.parse(readFileSync(option('--migration-manifest')||'release/manifest.json','utf8')).migrations,'20261020120000_academy_guardian_portal_reads.sql','20261020121000_academy_guardian_binding_identity.sql'])];
// Freeze tested sources before any asynchronous work. Evidence must describe the
// bytes installed/tested, even if another edit arrives while qualification runs.
const candidates=migrations.map(file=>({file,source:readFileSync('supabase/migrations/'+file,'utf8')}));
const canarySource=readFileSync('scripts/fixtures/academy-guardian-portal.sql','utf8');
const audioFixtureSource=migrations.includes('20261020210000_academy_private_assignment_audio.sql')?readFileSync('scripts/fixtures/academy-private-audio.sql','utf8'):null;
const handoverFixtureSource=migrations.includes('20261020220000_academy_cash_handover_continuity.sql')?readFileSync('scripts/fixtures/academy-cash-handover.sql','utf8'):null;
const commandFixtures=process.argv.includes('--release-commands')?[
  {file:'scripts/verify-academy-student-import-schema.sql',marker:'student-import-captured-schema-ok'},
  {file:'scripts/fixtures/academy-release-commands.sql',marker:'staff-and-learner-captured-schema-ok'},
].map(fixture=>({...fixture,source:readFileSync(fixture.file,'utf8')})):[];
if(option('--command-fixture'))commandFixtures.push({file:option('--command-fixture'),marker:option('--command-marker'),source:readFileSync(option('--command-fixture'),'utf8')});
const extras=process.argv.flatMap((arg,index)=>arg==='--extra-fixture'?[process.argv[index+1]]:[]),markers=process.argv.flatMap((arg,index)=>arg==='--extra-marker'?[process.argv[index+1]]:[]);
assert.equal(extras.length,markers.length,'Each owned extra fixture requires its expected marker');
for(let index=0;index<extras.length;index++)commandFixtures.push({file:extras[index],marker:markers[index],source:readFileSync(extras[index],'utf8')});
const checks=[];let owned=false,cleanupVerified=false,passed=false,stage='start',catalog,fixtureChecks=0;const held=new Set();
function run(args,input=''){
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
    const timer=setTimeout(()=>{child.kill();reject(Error('Owned schema operation timed out'));},120000);
    child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>err+=data);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.stdin.on('error',()=>{}); // Child exit controls failure and cleanup.
    child.on('close',code=>{clearTimeout(timer);if(code===0)resolve((args[0]==='logs'?out+'\n'+err:out).trim());else{writeFileSync(root+'/installed-schema-private-error.log',err);reject(Error('Owned schema operation failed at '+stage));}});
    child.stdin.end(input);
  });
}
const sql=(text,role='supabase_admin')=>run(['exec','-i',name,'psql','-U',role,'-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],text);
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const check=async(label,action)=>{stage=label;await action();checks.push(label);console.log('PASS: '+label);};
async function hold(source,applicationName){
 const child=spawn('docker',['exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const marker='held_'+randomUUID().replaceAll('-','');let out='',err='';let resolveDone,rejectDone;
 const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});done.catch(()=>{});
 const timer=setTimeout(()=>{child.kill();rejectDone(Error('Owned parent lock transaction timed out'));},60000);
 child.on('error',rejectDone);child.stderr.on('data',b=>err+=b);child.on('close',code=>{clearTimeout(timer);code===0?resolveDone():rejectDone(Error('Owned parent lock transaction failed'));});
 const ready=new Promise((resolve,reject)=>{child.stdout.on('data',b=>{out+=b;if(out.includes(marker))resolve();});done.catch(reject);});
 child.stdin.on('error',()=>{});child.stdin.write('begin;set statement_timeout=\'30s\';set application_name='+q(applicationName)+';\n'+source+';\n\\echo '+marker+'\n');
 const handle={finish:async(commit=true)=>{held.delete(handle);child.stdin.end(commit?'commit;\n\\q\n':'rollback;\n\\q\n');await done;}};held.add(handle);await ready;return handle;
}
async function waitForLock(applicationName){
 const until=Date.now()+15000;
 while(Date.now()<until){if(await sql("select count(*) from pg_stat_activity where application_name="+q(applicationName)+" and wait_event_type='Lock';",'postgres')==='1')return;await new Promise(resolve=>setTimeout(resolve,25));}
 throw Error('Owned parent contender did not reach the lock barrier');
}
try{
  await run(['run','--detach','--name',name,'--network','none','--label','schood.qa='+label,'-e','POSTGRES_HOST_AUTH_METHOD=trust',image,...postgresArgs]);owned=true;
  assert.equal(await run(['inspect',name,'--format','{{index .Config.Labels "schood.qa"}}']),label);
  let ready=false;for(let i=0;i<120;i++){try{if(await sql("select current_setting('listen_addresses')<>'';")==='t'){ready=true;break;}}catch{if(await run(['inspect',name,'--format','{{.State.Running}}'])!=='true')break;}await new Promise(resolve=>setTimeout(resolve,100));}
  if(!ready){writeFileSync(root+'/installed-schema-startup.log',await run(['logs',name]));throw Error('Owned full-schema database startup failed');}
  await check('restore complete installed Auth/public/Storage schema without customer rows',async()=>{
    assert.equal(await run(['inspect',name,'--format','{{index .Config.Labels "schood.qa"}}']),label);
    // The image contains an older empty Auth bootstrap. Replace only namespaces
    // inside this verified, newly-created, network-isolated fixture database.
    await sql(`do $$ declare rows_count bigint;begin if to_regclass('auth.users') is not null then select count(*) into rows_count from auth.users;if rows_count<>0 then raise exception 'Fixture Auth bootstrap is not empty';end if;end if;end;$$;
      drop schema if exists auth cascade;drop schema if exists public cascade;drop schema if exists storage cascade;`);
    await sql(`do $$ declare role_name text; begin foreach role_name in array array[${runtime.roles.map(role=>q(role.name)).join(',')}] loop if not exists(select 1 from pg_roles where rolname=role_name) then execute format('create role %I',role_name);end if;end loop;end;$$;
      alter role service_role bypassrls;grant anon,authenticated,service_role to authenticator;
      create schema if not exists extensions;create schema if not exists public;`);
    for(const extension of runtime.extensions){
      if(extension.name==='plpgsql')continue;
      if(extension.schema!=='pg_catalog')await sql('create schema if not exists '+ident(extension.schema)+';');
      await sql(`create extension if not exists ${ident(extension.name)} with schema ${ident(extension.schema)};`);
      assert.equal(await sql(`select extversion from pg_extension where extname=${q(extension.name)};`),extension.version,'Installed extension version differs: '+extension.name);
    }
    await sql(source);
    catalog=JSON.parse(await sql(`select jsonb_build_object('tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','auth','storage') and c.relkind in('r','p')),'publicTriggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),'authTriggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and not t.tgisinternal),'publicForeignKeys',(select count(*) from pg_constraint k join pg_namespace n on n.oid=k.connamespace where n.nspname='public' and k.contype='f'));`));
    assert.equal(catalog.tables,runtime.tableCount);assert.ok(catalog.publicTriggers>50);assert.ok(catalog.authTriggers>0);
    assert.equal(await sql('select count(*) from auth.users;'),'0');assert.equal(await sql('select count(*) from public.users;'),'0');
  });
  await check('database role attributes and relevant memberships match installed metadata',async()=>{
    const existing=JSON.parse(await sql(`select coalesce(jsonb_agg(jsonb_build_object('member',member.rolname,'role',role.rolname)),'[]') from pg_auth_members m join pg_roles member on member.oid=m.member join pg_roles role on role.oid=m.roleid where member.rolname in('postgres','authenticator','supabase_auth_admin','supabase_storage_admin');`));
    await sql('begin;\n'+runtime.roles.filter(role=>!role.name.startsWith('pg_')).map(role=>`alter role ${ident(role.name)} ${role.superuser?'superuser':'nosuperuser'} ${role.bypassRls?'bypassrls':'nobypassrls'} ${role.createRole?'createrole':'nocreaterole'} ${role.createDb?'createdb':'nocreatedb'} ${role.inherit?'inherit':'noinherit'};`).join('\n')+'\n'+existing.map(grant=>`revoke ${ident(grant.role)} from ${ident(grant.member)};`).join('\n')+'\n'+runtime.roleMemberships.map(grant=>`grant ${ident(grant.role)} to ${ident(grant.member)} with admin ${grant.admin?'true':'false'}, inherit ${grant.inherit?'true':'false'}, set ${grant.set?'true':'false'};`).join('\n')+'\ncommit;');
    const roleAttributes=JSON.parse(await sql(`select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole,'createDb',rolcreatedb,'inherit',rolinherit) order by rolname) from pg_roles where rolname in(${runtime.roles.map(role=>q(role.name)).join(',')});`));
    assert.deepEqual(roleAttributes,runtime.roles,'Captured role attributes differ, including reserved built-in roles');
    const actual=JSON.parse(await sql(`select jsonb_build_object('authUsage',has_schema_privilege('postgres','auth','USAGE'),'authCreate',has_schema_privilege('postgres','auth','CREATE'),'authTrigger',has_table_privilege('postgres','auth.users','TRIGGER'),'authSelect',has_table_privilege('postgres','auth.users','SELECT'));`));
    assert.deepEqual(actual,runtime.postgresPrivileges);
  });
  await check('frozen reviewed migrations install under captured production roles',async()=>{
    for(const candidate of candidates)await sql(candidate.source,'postgres');
  });
  for(const fixture of commandFixtures)await check('production-schema command fixture: '+fixture.file,async()=>{
    assert.equal(await sql(fixture.source,'postgres'),fixture.marker);
    assert.equal(await sql('select count(*) from auth.users;'),'0');
  });
  await check('actual Auth triggers, foreign keys and views qualify parent privacy and child selection',async()=>{
    const marker=await sql(canarySource,'postgres');assert.match(marker,/^guardian-captured-schema-ok:\d+$/);
    fixtureChecks=Number(marker.split(':')[1]);assert.ok(fixtureChecks>=36);
    assert.equal(await sql('select count(*) from auth.users;'),'0');
  });

  await check('parent reads serialize with consent revocation and account closure under captured roles',async()=>{
    // Commit a second owned fixture only inside this isolated container, so
    // independent connections can observe real row-lock contention. The first
    // canary above still proves rollback; physical cleanup removes this copy.
    const persistent=canarySource.replace(" perform set_config('schood.qa.guardian_result'", " perform set_config('schood.qa.guardian_context',jsonb_build_object('actor',actor,'relationship',r,'guardian',g)::text,true);\n perform set_config('schood.qa.guardian_result'")
      .replace(/rollback;\s*$/,"select current_setting('schood.qa.guardian_context');\ncommit;");
    const output=await sql(persistent,'postgres');const context=JSON.parse(output.split('\n').find(line=>line.startsWith('{')));
    for(const value of Object.values(context))assert.match(value,/^[0-9a-f-]{36}$/i);
    const payload=q(JSON.stringify({relationship_id:context.relationship}));
    const read='select public.academy_guardian_portal_read('+q(context.actor)+'::uuid,'+payload+'::jsonb)';
    const revoke="update public.academy_student_guardian_relationships set consent_status='revoked' where id="+q(context.relationship)+'::uuid';
    const allow="update public.academy_student_guardian_relationships set consent_status='granted',consent_expires_at=null where id="+q(context.relationship)+'::uuid';
    const deniedRead="do $$begin begin perform public.academy_guardian_portal_read("+q(context.actor)+'::uuid,'+payload+"::jsonb);raise exception 'Expected current parent access refusal';exception when insufficient_privilege then null;end;end;$$;";
    const reader=await hold(read,'qa_parent_read_first');
    const revoker=sql("set application_name='qa_parent_revoke_wait';"+revoke+';','postgres');revoker.catch(()=>{});
    await waitForLock('qa_parent_revoke_wait');await reader.finish();await revoker;await sql(deniedRead,'postgres');
    await sql(allow+';','postgres');
    const revocation=await hold(revoke,'qa_parent_revoke_first');
    const blockedRead=sql("set application_name='qa_parent_read_wait';"+deniedRead,'postgres');blockedRead.catch(()=>{});
    await waitForLock('qa_parent_read_wait');await revocation.finish();await blockedRead;
    await sql(allow+';','postgres');
    const closing=await hold('update public.users set is_active=false where id='+q(context.actor)+'::uuid','qa_parent_close_first');
    const closedRead=sql("set application_name='qa_parent_closed_wait';"+deniedRead,'postgres');closedRead.catch(()=>{});
    await waitForLock('qa_parent_closed_wait');await closing.finish();await closedRead;
    await sql('update public.users set is_active=true where id='+q(context.actor)+'::uuid;','postgres');
    // Expiry must use the fresh clock after waiting, not transaction start time.
    const profile=await hold('select id from public.academy_guardians where id='+q(context.guardian)+'::uuid for update','qa_parent_expiry_profile');
    await sql("update public.academy_student_guardian_relationships set consent_expires_at=clock_timestamp()+interval '2 seconds' where id="+q(context.relationship)+'::uuid;','postgres');
    const expiredRead=sql("set application_name='qa_parent_expiry_wait';"+deniedRead,'postgres');expiredRead.catch(()=>{});
    await waitForLock('qa_parent_expiry_wait');await sql('select pg_sleep(3);','postgres');await profile.finish();await expiredRead;
  });

  if(migrations.includes('20261020150000_academy_parent_write_commands.sql'))await check('parent writes serialize with revocation and roll back expiry after a blocked insert',async()=>{
    const ctx=JSON.parse(await sql("select jsonb_build_object('actor',g.user_id,'relationship',r.id) from public.academy_student_guardian_relationships r join public.academy_guardians g on g.id=r.guardian_id where g.user_id is not null and r.status='active' order by r.id limit 1;",'postgres'));
    await sql("update public.academy_student_guardian_relationships set consent_status='granted',consent_expires_at=null,can_message_academy=true where id="+q(ctx.relationship)+"::uuid;",'postgres');
    const payload=q(JSON.stringify({relationship_id:ctx.relationship,body:'Owned contended parent message'}));
    const call="public.academy_parent_write_command("+q(ctx.actor)+"::uuid,'guardian_send_message',"+payload+"::jsonb,'owned-contended-write')";
    const denied="do $$begin begin perform "+call+";raise exception 'Expected parent write refusal';exception when insufficient_privilege then null;end;end;$$;";
    const revoke="update public.academy_student_guardian_relationships set consent_status='revoked' where id="+q(ctx.relationship)+"::uuid";
    const revocation=await hold(revoke,'qa_parent_write_revoke_first');
    const blocked=sql("set application_name='qa_parent_write_wait';"+denied,'postgres');blocked.catch(()=>{});
    await waitForLock('qa_parent_write_wait');await revocation.finish();await blocked;
    await sql("update public.academy_student_guardian_relationships set consent_status='granted',consent_expires_at=clock_timestamp()+interval '2 seconds' where id="+q(ctx.relationship)+"::uuid;",'postgres');
    const before=await sql("select count(*) from public.academy_guardian_messages where relationship_id="+q(ctx.relationship)+"::uuid;",'postgres');
    const tableLock=await hold('lock table public.academy_guardian_messages in access exclusive mode','qa_parent_write_expiry_block');
    const expires=sql("set application_name='qa_parent_write_expiry_wait';"+denied,'postgres');expires.catch(()=>{});
    await waitForLock('qa_parent_write_expiry_wait');await sql('select pg_sleep(3);','postgres');await tableLock.finish();await expires;
    assert.equal(await sql("select count(*) from public.academy_guardian_messages where relationship_id="+q(ctx.relationship)+"::uuid;",'postgres'),before,'Expired blocked write must roll back its message');
    assert.equal(await sql("select count(*) from public.academy_parent_command_receipts where actor_id="+q(ctx.actor)+"::uuid and request_key='owned-contended-write';",'postgres'),'0');
  });

  if(migrations.includes('20261020165000_academy_staff_guardian_commands.sql'))await check('legacy receipts and staff-parent writes serialize with current revocation and expiry',async()=>{
    const ctx=JSON.parse(await sql("select jsonb_build_object('actor',g.user_id,'relationship',r.id,'academy',r.academy_id,'branch',c.primary_branch_id) from public.academy_student_guardian_relationships r join public.academy_guardians g on g.id=r.guardian_id join public.academy_contacts c on c.id=r.contact_id where g.user_id is not null order by r.id limit 1;",'postgres'));
    await sql('insert into public.tenant_memberships(tenant_id,user_id,role,status) values('+q(ctx.academy)+'::uuid,'+q(ctx.actor)+"::uuid,'owner','active');update public.academy_student_guardian_relationships set consent_status='granted',consent_expires_at=null where id="+q(ctx.relationship)+'::uuid;','postgres');
    const call="public.academy_staff_guardian_command("+q(ctx.academy)+'::uuid,'+q(ctx.actor)+"::uuid,'send_guardian_message',"+q(JSON.stringify({relationship_id:ctx.relationship,body:'Owned contended staff message'}))+"::jsonb,'owned-staff-revocation')";
    const denied="do $$begin begin perform "+call+";raise exception 'Expected revoked staff-parent refusal';exception when insufficient_privilege then null;end;end;$$;";
    const revocation=await hold("update public.academy_student_guardian_relationships set consent_status='revoked' where id="+q(ctx.relationship)+'::uuid','qa_staff_parent_revoke_first');
    const blocked=sql("set application_name='qa_staff_parent_revoke_wait';"+denied,'postgres');blocked.catch(()=>{});
    await waitForLock('qa_staff_parent_revoke_wait');await revocation.finish();await blocked;
    await sql('update public.tenant_memberships set status=\'disabled\' where tenant_id='+q(ctx.academy)+'::uuid and user_id='+q(ctx.actor)+'::uuid;','postgres');
    await sql("insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,starts_at,expires_at) values("+q(ctx.academy)+'::uuid,'+q(ctx.actor)+"::uuid,'parent-"+ctx.actor+"@example.invalid','admin','academy','[]','active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes');",'postgres');
    const create="public.academy_legacy_import_command("+q(ctx.academy)+'::uuid,'+q(ctx.actor)+'::uuid,';
    const job=JSON.parse(await sql('select '+create+"'create',null,"+q(JSON.stringify({import_type:'contacts',source_filename:'owned-expiry.csv',import_mode:'commit',duplicate_strategy:'reject',idempotency_key:'owned-import-expiry'}))+"::jsonb);",'postgres')).import_job.id;
    await sql('select '+create+"'stage',"+q(job)+'::uuid,'+q(JSON.stringify({row_number:1,mapped_data:{first_name:'Owned expiring import',email:'owned-expiry@example.invalid',branch_id:ctx.branch}}))+'::jsonb);','postgres');
    const before=await sql('select count(*) from public.academy_contacts where academy_id='+q(ctx.academy)+'::uuid;','postgres');
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds' where academy_id="+q(ctx.academy)+'::uuid and user_id='+q(ctx.actor)+'::uuid;','postgres');
    const barrier=await hold('lock table public.academy_import_effects in access exclusive mode','qa_legacy_receipt_expiry_barrier');
    const expires=sql("set application_name='qa_legacy_receipt_expiry_wait';do $$begin begin perform "+create+"'commit',"+q(job)+"::uuid,'{}');raise exception 'Expected expired import refusal';exception when insufficient_privilege then null;end;end;$$;",'postgres');expires.catch(()=>{});
    await waitForLock('qa_legacy_receipt_expiry_wait');await sql('select pg_sleep(3);','postgres');await barrier.finish();await expires;
    assert.equal(await sql('select count(*) from public.academy_contacts where academy_id='+q(ctx.academy)+'::uuid;','postgres'),before,'Expiry rolls back target and receipt together');
    assert.equal(await sql('select count(*) from public.academy_import_effects where import_job_id='+q(job)+'::uuid;','postgres'),'0');
  });
  if(migrations.includes('20261020201000_academy_financial_command_authority.sql'))await check('financial business rows and receipts roll back after blocked expiry and current revocation',async()=>{
    const ctx=JSON.parse(await sql("select jsonb_build_object('actor',g.user_id,'academy',r.academy_id,'branch',c.primary_branch_id) from public.academy_student_guardian_relationships r join public.academy_guardians g on g.id=r.guardian_id join public.academy_contacts c on c.id=r.contact_id where g.user_id is not null and c.primary_branch_id is not null order by r.id limit 1;",'postgres'));
    const grants=' where academy_id='+q(ctx.academy)+'::uuid and user_id='+q(ctx.actor)+'::uuid';
    await sql("update public.academy_role_grants set status='active',expires_at=clock_timestamp()+interval '30 minutes'"+grants+';','postgres');
    const call="public.academy_finance_command("+q(ctx.academy)+'::uuid,'+q(ctx.actor)+"::uuid,'create_cashbox',"+q(JSON.stringify({branch_id:ctx.branch,name:'Owned contended finance box',currency:'UZS'}))+"::jsonb,'owned-finance-contention')";
    const denied="do $$begin begin perform "+call+";raise exception 'Expected current finance refusal';exception when insufficient_privilege then null;end;end;$$;";
    const revoke=await hold("update public.academy_role_grants set status='revoked'"+grants,'qa_finance_revoke_first');
    const blocked=sql("set application_name='qa_finance_revoke_wait';"+denied,'postgres');blocked.catch(()=>{});
    await waitForLock('qa_finance_revoke_wait');await revoke.finish();await blocked;
    await sql("update public.academy_role_grants set status='active',expires_at=clock_timestamp()+interval '2 seconds'"+grants+';','postgres');
    const before=await sql('select count(*) from public.academy_cashboxes where academy_id='+q(ctx.academy)+'::uuid;','postgres');
    const barrier=await hold('lock table public.academy_finance_command_receipts in share mode','qa_finance_receipt_expiry_barrier');
    const expires=sql("set application_name='qa_finance_receipt_expiry_wait';"+denied,'postgres');expires.catch(()=>{});
    await waitForLock('qa_finance_receipt_expiry_wait');await sql('select pg_sleep(3);','postgres');await barrier.finish();await expires;
    assert.equal(await sql('select count(*) from public.academy_cashboxes where academy_id='+q(ctx.academy)+'::uuid;','postgres'),before);
    assert.equal(await sql('select count(*) from public.academy_finance_command_receipts where academy_id='+q(ctx.academy)+"::uuid and request_key='owned-finance-contention';",'postgres'),'0');
  });
  if(audioFixtureSource)await check('audio and written attempts serialize; blocked audio expiry and revoked feedback leave no business write',async()=>{
    await sql(audioFixtureSource.replace('rollback;','commit;'),'postgres');
    const ctx=JSON.parse(await sql("select jsonb_build_object('actor',actor_id,'academy',academy_id,'assignment',assignment_id,'classroom',classroom_id,'student', (select user_id from public.academy_contacts where id=a.contact_id),'contact',contact_id) from public.academy_assignment_audio a where request_key='owned-feedback';",'postgres'));
    const call=(actor,command,payload,key)=>'public.academy_audio_command('+q(ctx.academy)+'::uuid,'+q(actor)+'::uuid,'+q(command)+','+q(JSON.stringify(payload))+'::jsonb,'+q(key)+')';
    const denied=(expression,code='insufficient_privilege')=>"do $$begin begin perform "+expression+";raise exception 'Expected current audio refusal';exception when "+code+" then null;end;end;$$;";
    await sql('update public.academy_assignments set attempts_allowed=3 where id='+q(ctx.assignment)+'::uuid;','postgres');
    const recording=JSON.parse(await sql('select '+call(ctx.student,'reserve',{assignment_id:ctx.assignment,kind:'submission',content_hash:'a'.repeat(64),mime_type:'audio/webm',size_bytes:1000,text_context:'Owned concurrent final attempt'},'owned-concurrent-audio')+';','postgres')).audio;
    const written='public.academy_assignment_written_command('+q(ctx.academy)+'::uuid,'+q(ctx.student)+'::uuid,'+q(ctx.assignment)+"::uuid,'{\"submission_content\":\"Owned final written attempt\",\"metadata\":{\"response_kind\":\"text\"}}'::jsonb)";
    const writer=await hold('select '+written,'qa_audio_written_first');
    const contender=sql("set application_name='qa_audio_attempt_wait';"+denied(call(ctx.student,'commit',{audio_id:recording.id,object_key:recording.object_key,bucket:'academy-assignment-audio-private-v1'},'owned-concurrent-audio'),'unique_violation'),'postgres');contender.catch(()=>{});
    await waitForLock('qa_audio_attempt_wait');await writer.finish();await contender;
    assert.equal(await sql('select attempt_number from public.academy_submissions where assignment_id='+q(ctx.assignment)+'::uuid and contact_id='+q(ctx.contact)+'::uuid;','postgres'),'3');
    assert.equal(await sql('select state from public.academy_assignment_audio where id='+q(recording.id)+'::uuid;','postgres'),'reserved');
    await sql('update public.tenant_memberships set status=\'disabled\' where tenant_id='+q(ctx.academy)+'::uuid and user_id='+q(ctx.actor)+"::uuid;insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,starts_at,expires_at) values("+q(ctx.academy)+'::uuid,'+q(ctx.actor)+"::uuid,'owned-audio-"+ctx.actor+"@example.invalid','teacher','classrooms',"+q(JSON.stringify([ctx.classroom]))+"::jsonb,'active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes');",'postgres');
    const grants=' where academy_id='+q(ctx.academy)+'::uuid and user_id='+q(ctx.actor)+'::uuid';
    const payload={assignment_id:ctx.assignment,submission_id:recording.submission_id,kind:'feedback',expected_attempt_number:3,content_hash:'b'.repeat(64),mime_type:'audio/ogg',size_bytes:1000,text_context:'Owned contended feedback'};
    // The reserved student row has no submission_id; use the committed subject.
    payload.submission_id=await sql('select id from public.academy_submissions where assignment_id='+q(ctx.assignment)+'::uuid and contact_id='+q(ctx.contact)+'::uuid;','postgres');
    const revoke=await hold("update public.academy_role_grants set status='revoked'"+grants,'qa_audio_revoke_first');
    const revoked=sql("set application_name='qa_audio_revoke_wait';"+denied(call(ctx.actor,'reserve',payload,'owned-revoked-audio')),'postgres');revoked.catch(()=>{});
    await waitForLock('qa_audio_revoke_wait');await revoke.finish();await revoked;
    await sql("update public.academy_role_grants set status='active',expires_at=clock_timestamp()+interval '2 seconds'"+grants+';','postgres');
    const barrier=await hold('lock table public.academy_assignment_audio in share mode','qa_audio_reserve_expiry_barrier');
    const expires=sql("set application_name='qa_audio_reserve_expiry_wait';"+denied(call(ctx.actor,'reserve',payload,'owned-expired-reserve')),'postgres');expires.catch(()=>{});
    await waitForLock('qa_audio_reserve_expiry_wait');await sql('select pg_sleep(3);','postgres');await barrier.finish();await expires;
    assert.equal(await sql("select count(*) from public.academy_assignment_audio where request_key in('owned-revoked-audio','owned-expired-reserve');",'postgres'),'0');
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '30 minutes'"+grants+';','postgres');
    const feedback=JSON.parse(await sql('select '+call(ctx.actor,'reserve',payload,'owned-expired-commit')+';','postgres')).audio;
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds'"+grants+';','postgres');
    const commitBarrier=await hold('lock table public.academy_assignment_audio in share mode','qa_audio_commit_expiry_barrier');
    const commitExpired=sql("set application_name='qa_audio_commit_expiry_wait';"+denied(call(ctx.actor,'commit',{audio_id:feedback.id,object_key:feedback.object_key,bucket:'academy-assignment-audio-private-v1'},'owned-expired-commit')),'postgres');commitExpired.catch(()=>{});
    await waitForLock('qa_audio_commit_expiry_wait');await sql('select pg_sleep(3);','postgres');await commitBarrier.finish();await commitExpired;
    assert.equal(await sql('select state from public.academy_assignment_audio where id='+q(feedback.id)+'::uuid;','postgres'),'reserved');
    assert.equal(await sql("select count(*) from public.academy_audit_events where target_id="+q(feedback.id)+';','postgres'),'0');
  });
  if(handoverFixtureSource)await check('one receiver acquires cash custody; contended handover expiry and revocation roll back atomically',async()=>{
    await sql(handoverFixtureSource.replace('rollback;','commit;'),'postgres');
    const ctx=JSON.parse(await sql("select jsonb_build_object('academy',b.academy_id,'box',b.id,'owner',b.created_by,'receiver',g.user_id,'previous',s.id) from public.academy_cashboxes b join public.academy_cashier_shifts s on s.cashbox_id=b.id and s.shift_sequence=2 join public.academy_role_grants g on g.academy_id=b.academy_id and g.role='cashier' where b.name='A Owned handover box';",'postgres'));
    const grants=' where academy_id='+q(ctx.academy)+'::uuid and user_id='+q(ctx.receiver)+'::uuid';
    await sql("update public.academy_role_grants set status='active',expires_at=clock_timestamp()+interval '30 minutes'"+grants+';','postgres');
    const payload={cashbox_id:ctx.box,previous_shift_id:ctx.previous,opening_balance:'985',accept_handover:true,note:'Owned concurrent custody acknowledgment'};
    const call=(actor,key)=>'public.academy_finance_command('+q(ctx.academy)+'::uuid,'+q(actor)+"::uuid,'accept_cashier_handover',"+q(JSON.stringify(payload))+'::jsonb,'+q(key)+')';
    const denied=(expression,code)=>"do $$begin begin perform "+expression+";raise exception 'Expected cashier handover refusal';exception when "+code+" then null;end;end;$$;";
    const holder=await hold('select '+call(ctx.owner,'owned-custody-first'),'qa_cash_custody_first');
    const receiver=sql("set application_name='qa_cash_custody_wait';"+denied(call(ctx.receiver,'owned-custody-contender'),'unique_violation'),'postgres');receiver.catch(()=>{});
    await waitForLock('qa_cash_custody_wait');await holder.finish();await receiver;
    assert.equal(await sql('select count(*) from public.academy_cashier_shifts where academy_id='+q(ctx.academy)+'::uuid and previous_shift_id='+q(ctx.previous)+'::uuid;','postgres'),'1');
    const current=await sql('select id from public.academy_cashier_shifts where academy_id='+q(ctx.academy)+'::uuid and cashbox_id='+q(ctx.box)+"::uuid and status='open';",'postgres');
    await sql('select public.academy_finance_command('+q(ctx.academy)+'::uuid,'+q(ctx.owner)+"::uuid,'close_cashier_shift',"+q(JSON.stringify({shift_id:current,counted_closing_balance:'985'}))+"::jsonb,'owned-custody-close');",'postgres');
    payload.previous_shift_id=current;
    const before=await sql('select count(*) from public.academy_cashier_shifts where academy_id='+q(ctx.academy)+'::uuid;','postgres');
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds'"+grants+';','postgres');
    const barrier=await hold('lock table public.academy_finance_command_receipts in share mode','qa_cash_expiry_receipt_barrier');
    const expired=sql("set application_name='qa_cash_expiry_wait';"+denied(call(ctx.receiver,'owned-custody-expired'),'insufficient_privilege'),'postgres');expired.catch(()=>{});
    await waitForLock('qa_cash_expiry_wait');await sql('select pg_sleep(3);','postgres');await barrier.finish();await expired;
    assert.equal(await sql('select count(*) from public.academy_cashier_shifts where academy_id='+q(ctx.academy)+'::uuid;','postgres'),before);
    assert.equal(await sql('select count(*) from public.academy_finance_command_receipts where academy_id='+q(ctx.academy)+"::uuid and request_key='owned-custody-expired';",'postgres'),'0');
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '30 minutes'"+grants+';','postgres');
    const revoke=await hold("update public.academy_role_grants set status='revoked'"+grants,'qa_cash_revoke_first');
    const revoked=sql("set application_name='qa_cash_revoke_wait';"+denied(call(ctx.receiver,'owned-custody-revoked'),'insufficient_privilege'),'postgres');revoked.catch(()=>{});
    await waitForLock('qa_cash_revoke_wait');await revoke.finish();await revoked;
    assert.equal(await sql('select count(*) from public.academy_cashier_shifts where academy_id='+q(ctx.academy)+'::uuid;','postgres'),before);
  });

  if(migrations.includes('20261020235000_academy_wallet_learning_policy.sql'))await check('wallet learning checkpoints observe committed credit and debt after real account-lock contention',async()=>{
    const fixture=commandFixtures.find(row=>row.file==='scripts/fixtures/academy-wallet-policy.sql');assert(fixture);
    await sql(fixture.source.replace('rollback;','commit;'),'postgres');
    const ctx=JSON.parse(await sql("select jsonb_build_object('academy',p.academy_id,'actor',p.updated_by,'student',c.user_id,'contact',p.contact_id,'classroom',p.classroom_id) from public.academy_wallet_policies p join public.academy_contacts c on c.id=p.contact_id where p.reason='Owned prepaid agreement';",'postgres'));
    const command=(kind,payload,key)=>'public.academy_finance_command('+q(ctx.academy)+'::uuid,'+q(ctx.actor)+'::uuid,'+q(kind)+','+q(JSON.stringify(payload))+'::jsonb,'+q(key)+')';
    await sql('select '+command('set_wallet_policy',{contact_id:ctx.contact,classroom_id:ctx.classroom,mode:'freeze',currency:'UZS',warning_credit:'0',reason:'Owned concurrent wallet policy',account_credit_acknowledged:true},'owned-concurrent-wallet-policy')+';','postgres');
    const learning='public.academy_wallet_learning_context('+q(ctx.academy)+'::uuid,'+q(ctx.student)+'::uuid,'+q(ctx.contact)+'::uuid,'+q(ctx.classroom)+'::uuid)';
    const credit={contact_id:ctx.contact,entry_type:'account_credit',amount:'101',currency:'UZS',reason:'Owned concurrent credit'};
    const incoming=await hold('select '+command('post_account_adjustment',credit,'owned-concurrent-wallet-credit'),'qa_wallet_credit_first');
    const resumes=sql("set application_name='qa_wallet_credit_wait';select "+learning+';','postgres');resumes.catch(()=>{});await waitForLock('qa_wallet_credit_wait');await incoming.finish();const resumed=JSON.parse(await resumes);assert.equal(resumed.learning_allowed,true);
    const outgoing=await hold('select '+command('post_account_adjustment',{...credit,entry_type:'debit_adjustment'},'owned-concurrent-wallet-debit'),'qa_wallet_debit_first');
    const pauses=sql("set application_name='qa_wallet_debit_wait';do $$begin begin perform "+learning+";raise exception 'Concurrent zero-credit checkpoint passed';exception when insufficient_privilege then null;end;end;$$;",'postgres');pauses.catch(()=>{});await waitForLock('qa_wallet_debit_wait');await outgoing.finish();await pauses;
    assert.equal(await sql('select learning_paused from public.academy_wallet_policy_status where academy_id='+q(ctx.academy)+'::uuid;','postgres'),'t');
  });

  if(migrations.includes('20261021001000_academy_operational_read_authority.sql'))await check('operational snapshots revalidate grant expiry after a real blocked room read',async()=>{
    const fixture=commandFixtures.find(row=>row.file==='scripts/fixtures/academy-operational-read.sql');assert(fixture);
    await sql(fixture.source.replace('rollback;','commit;'),'postgres');
    const ctx=JSON.parse(await sql("select jsonb_build_object('academy',g.academy_id,'actor',g.user_id,'grant',g.id,'branch',g.scope_ids->>0) from public.academy_role_grants g where g.email like '%+admin-b@example.invalid' and g.scope_ids @> (select jsonb_build_array(id) from public.academy_branches where name='Owned scope branch B');",'postgres'));
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds' where id="+q(ctx.grant)+'::uuid;','postgres');
    const barrier=await hold('lock table public.academy_rooms in access exclusive mode','qa_operational_room_expiry_barrier');
    const payload={branch_id:ctx.branch,from:new Date().toISOString().slice(0,10),days:7};
    const call='public.academy_operational_read('+q(ctx.academy)+'::uuid,'+q(ctx.actor)+"::uuid,'room_timetable',"+q(JSON.stringify(payload))+'::jsonb)';
    const refused=sql("set application_name='qa_operational_room_expiry_wait';do $$begin begin perform "+call+";raise exception 'Expired room read returned data';exception when insufficient_privilege then null;end;end;$$;",'postgres');refused.catch(()=>{});
    await waitForLock('qa_operational_room_expiry_wait');await sql('select pg_sleep(3);','postgres');await barrier.finish();await refused;
  });
  if(migrations.includes('20261021002000_academy_operational_command_receipts.sql'))await check('operational writes serialize identical retries and roll back business rows after blocked expiry or staff revocation',async()=>{
    const fixture=commandFixtures.find(row=>row.file==='scripts/fixtures/academy-operational-commands.sql');assert(fixture);
    await sql(fixture.source.replace('rollback;','commit;'),'postgres');
    const ctx=JSON.parse(await sql("select jsonb_build_object('academy',t.id,'owner',t.created_by,'actor',s.user_id,'staff',s.id,'classroom',l.classroom_id,'branch',l.branch_id,'contact',m.contact_id) from public.tenants t join public.academy_staff s on s.academy_id=t.id join public.academy_lesson_sessions l on l.academy_id=t.id and l.primary_staff_id=s.id join public.academy_classroom_memberships m on m.academy_id=t.id and m.classroom_id=l.classroom_id where t.name='Owned operational Academy' and s.display_name='Owned teacher' limit 1;",'postgres'));
    ctx.session=randomUUID();ctx.grant=randomUUID();
    await sql('insert into public.academy_role_grants(id,academy_id,user_id,email,role,scope_type,scope_ids,status,starts_at,expires_at) values('+[q(ctx.grant)+'::uuid',q(ctx.academy)+'::uuid',q(ctx.actor)+'::uuid',q(ctx.actor+'+operational-grant@example.invalid'),"'teacher'","'classrooms'",q(JSON.stringify([ctx.classroom]))+'::jsonb',"'active'","clock_timestamp()-interval '1 minute'","clock_timestamp()+interval '30 minutes'"].join(',')+');update public.academy_staff set managed_grant_id='+q(ctx.grant)+'::uuid where id='+q(ctx.staff)+'::uuid;insert into public.academy_lesson_sessions(id,academy_id,branch_id,classroom_id,primary_staff_id,title,delivery_mode,starts_at,ends_at,status,created_by,idempotency_key) values('+[q(ctx.session)+'::uuid',q(ctx.academy)+'::uuid',q(ctx.branch)+'::uuid',q(ctx.classroom)+'::uuid',q(ctx.staff)+'::uuid',"'Owned contended lesson'","'online'",'now()',"now()+interval '1 hour'","'scheduled'",q(ctx.owner)+'::uuid',"'owned-contended-session'"].join(',')+');','postgres');
    const intent={session_id:ctx.session,records:[{contact_id:ctx.contact,status:'present',notes:'Owned contended attendance'}]};
    const payload={intent,server_args:{p_academy_id:ctx.academy,p_actor_id:ctx.actor,p_session_id:ctx.session,p_staff_id:ctx.staff,p_records:intent.records}};
    const command=key=>'public.academy_operational_command('+q(ctx.academy)+'::uuid,'+q(ctx.actor)+"::uuid,'teacher_lesson_attendance',"+q(JSON.stringify(payload))+'::jsonb,'+q(key)+')';
    const denied=expression=>"do $$begin begin perform "+expression+";raise exception 'Expected current operational refusal';exception when insufficient_privilege then null;end;end;$$;";
    const writer=await hold('select '+command('owned-concurrent-attendance'),'qa_operational_attendance_first');
    const retry=sql("set application_name='qa_operational_attendance_retry';select "+command('owned-concurrent-attendance')+';','postgres');retry.catch(()=>{});
    await waitForLock('qa_operational_attendance_retry');await writer.finish();assert.equal(JSON.parse(await retry).replayed,true);
    assert.equal(await sql('select count(*) from public.academy_attendance where academy_id='+q(ctx.academy)+'::uuid and session_id='+q(ctx.session)+'::uuid;','postgres'),'1');
    const before=await sql('select count(*) from public.academy_audit_events where academy_id='+q(ctx.academy)+'::uuid;','postgres');
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds' where id="+q(ctx.grant)+'::uuid;','postgres');
    const barrier=await hold('lock table public.academy_operational_command_receipts in share mode','qa_operational_receipt_barrier');
    const expired=sql("set application_name='qa_operational_attendance_expiry';"+denied(command('owned-expired-attendance')),'postgres');expired.catch(()=>{});
    await waitForLock('qa_operational_attendance_expiry');await sql('select pg_sleep(3);','postgres');await barrier.finish();await expired;
    assert.equal(await sql('select count(*) from public.academy_audit_events where academy_id='+q(ctx.academy)+'::uuid;','postgres'),before);
    assert.equal(await sql("select count(*) from public.academy_operational_command_receipts where request_key='owned-expired-attendance';",'postgres'),'0');
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '30 minutes' where id="+q(ctx.grant)+'::uuid;','postgres');
    const revoker=await hold('update public.academy_staff set is_active=false where id='+q(ctx.staff)+'::uuid','qa_operational_staff_revoke');
    const revoked=sql("set application_name='qa_operational_staff_revoked_wait';"+denied(command('owned-concurrent-attendance')),'postgres');revoked.catch(()=>{});
    await waitForLock('qa_operational_staff_revoked_wait');await revoker.finish();await revoked;
    assert.equal(await sql('select count(*) from public.academy_audit_events where academy_id='+q(ctx.academy)+'::uuid;','postgres'),before);
  });
  if(migrations.includes('20261021003000_academy_current_attempt_grading.sql'))await check('real student resubmission wins over stale grading; blocked grading expiry rolls back snapshots, audit and receipt',async()=>{
    const fixture=commandFixtures.find(row=>row.file==='scripts/fixtures/academy-current-grading.sql');assert(fixture);
    await sql(fixture.source.replace('rollback;','commit;'),'postgres');
    const ctx=JSON.parse(await sql("select jsonb_build_object('academy',a.academy_id,'assignment',a.id,'classroom',a.classroom_id,'actor',s.user_id,'staff',s.id,'submission',u.id,'contact',u.contact_id) from public.academy_assignments a join public.academy_staff s on s.academy_id=a.academy_id and s.display_name='Owned grading teacher' join public.academy_submissions u on u.assignment_id=a.id and u.attempt_number=3 where a.title='Owned graded assignment';",'postgres'));
    const student=randomUUID(),grant=randomUUID();
    await sql('insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values('+q(student)+'::uuid,'+q(student+'@example.invalid')+",'authenticated','authenticated',now(),'{\"provider\":\"email\",\"providers\":[\"email\"]}','{}');update public.academy_contacts set user_id="+q(student)+'::uuid,email='+q(student+'@example.invalid')+' where id='+q(ctx.contact)+'::uuid;update public.academy_assignments set attempts_allowed=4 where id='+q(ctx.assignment)+'::uuid;','postgres');
    const reviewed=async()=>JSON.parse(await sql("select jsonb_build_object('submission_id',s.id,'assignment_id',s.assignment_id,'contact_id',s.contact_id,'expected_attempt_number',s.attempt_number,'expected_updated_at',s.updated_at,'expected_assignment_updated_at',a.updated_at,'expected_rubric_criteria',r.criteria,'score',71,'max_score',100,'feedback',jsonb_build_object('rubric_id',r.id,'rubric_scores',jsonb_build_object('clarity',71))) from public.academy_submissions s join public.academy_assignments a on a.id=s.assignment_id join public.academy_rubrics r on r.id=a.rubric_id where s.id="+q(ctx.submission)+'::uuid;','postgres'));
    let payload=await reviewed();const command=key=>'public.academy_grading_command('+q(ctx.academy)+'::uuid,'+q(ctx.actor)+"::uuid,'grade_submission',"+q(JSON.stringify(payload))+'::jsonb,'+q(key)+')';
    const refuse=(call,kind)=>"do $$begin begin perform "+call+";raise exception 'Expected current grading refusal';exception when "+kind+" then null;end;end;$$;";
    const studentWrite='public.academy_assignment_written_command('+q(ctx.academy)+'::uuid,'+q(student)+'::uuid,'+q(ctx.assignment)+"::uuid,'{\"submission_content\":\"Owned fourth response\",\"metadata\":{\"response_kind\":\"text\"}}'::jsonb)";
    const writer=await hold('select '+studentWrite,'qa_grading_student_first');
    const stale=sql("set application_name='qa_grading_stale_wait';"+refuse(command('owned-contended-stale-grade'),'unique_violation'),'postgres');stale.catch(()=>{});await waitForLock('qa_grading_stale_wait');await writer.finish();await stale;
    assert.equal(await sql('select attempt_number from public.academy_submissions where id='+q(ctx.submission)+'::uuid;','postgres'),'4');assert.equal(await sql('select score is null from public.academy_submissions where id='+q(ctx.submission)+'::uuid;','postgres'),'t');
    await sql('insert into public.academy_role_grants(id,academy_id,user_id,email,role,scope_type,scope_ids,status,starts_at,expires_at) values('+[q(grant)+'::uuid',q(ctx.academy)+'::uuid',q(ctx.actor)+'::uuid',q(ctx.actor+'+grading-current@example.invalid'),"'teacher'","'classrooms'",q(JSON.stringify([ctx.classroom]))+'::jsonb',"'active'","clock_timestamp()-interval '1 minute'","clock_timestamp()+interval '2 seconds'"].join(',')+');update public.academy_staff set managed_grant_id='+q(grant)+'::uuid where id='+q(ctx.staff)+'::uuid;','postgres');
    payload=await reviewed();const before=await sql('select count(*) from public.academy_grading_events where academy_id='+q(ctx.academy)+'::uuid;','postgres');
    const barrier=await hold('lock table public.academy_operational_command_receipts in share mode','qa_grading_expiry_barrier');
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds' where id="+q(grant)+'::uuid;','postgres');
    const expired=sql("set application_name='qa_grading_expiry_wait';"+refuse(command('owned-expired-grade'),'insufficient_privilege'),'postgres');expired.catch(()=>{});await waitForLock('qa_grading_expiry_wait');await sql('select pg_sleep(3);','postgres');await barrier.finish();await expired;
    assert.equal(await sql('select count(*) from public.academy_grading_events where academy_id='+q(ctx.academy)+'::uuid;','postgres'),before);assert.equal(await sql("select count(*) from public.academy_operational_command_receipts where request_key='owned-expired-grade';",'postgres'),'0');assert.equal(await sql('select score is null from public.academy_submissions where id='+q(ctx.submission)+'::uuid;','postgres'),'t');
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '30 minutes' where id="+q(grant)+'::uuid;','postgres');
    const grader=await hold('select '+command('owned-concurrent-grade'),'qa_grading_first');const replay=sql("set application_name='qa_grading_retry_wait';select "+command('owned-concurrent-grade')+';','postgres');replay.catch(()=>{});await waitForLock('qa_grading_retry_wait');await grader.finish();assert.equal(JSON.parse(await replay).replayed,true);
    assert.equal(Number(await sql('select count(*) from public.academy_grading_events where academy_id='+q(ctx.academy)+'::uuid;','postgres')),Number(before)+1);
  });
  if(migrations.includes('20261021005000_academy_teacher_retention_cohorts.sql'))await check('retention read refuses expired scope after waiting on actual private history',async()=>{
    const fixture=commandFixtures.find(row=>row.file==='scripts/fixtures/academy-teacher-retention.sql');assert(fixture);
    await sql(fixture.source.replace('rollback;','commit;'),'postgres');
    const ctx=JSON.parse(await sql("select jsonb_build_object('academy',g.academy_id,'actor',g.user_id,'grant',g.id,'branch',g.scope_ids->>0,'from',c.covered_from+interval '1 microsecond') from public.academy_role_grants g join public.tenants t on t.id=g.academy_id join public.academy_retention_coverage c on c.academy_id=t.id where t.name='Owned retention Academy' and g.role='manager' and g.scope_type='branches' and g.status='active' limit 1;",'postgres'));
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds' where id="+q(ctx.grant)+'::uuid;','postgres');
    const barrier=await hold('lock table public.academy_retention_membership_events in access exclusive mode','qa_retention_expiry_barrier');
    const call='public.academy_teacher_retention_read('+q(ctx.academy)+'::uuid,'+q(ctx.actor)+'::uuid,'+q(ctx.from)+'::timestamptz,clock_timestamp(),'+q(ctx.branch)+'::uuid)';
    const refused=sql("set application_name='qa_retention_expiry_wait';do $$begin begin perform "+call+";raise exception 'Expired retention read returned data';exception when insufficient_privilege then null;end;end;$$;",'postgres');refused.catch(()=>{});
    await waitForLock('qa_retention_expiry_wait');await sql('select pg_sleep(3);','postgres');await barrier.finish();await refused;
  });
  if(migrations.includes('20261021007000_academy_linked_student_collection.sql'))await check('booking and collection roll back linked evidence after blocked expiry; identical bookings serialize',async()=>{
    const fixture=commandFixtures.find(row=>row.file==='scripts/fixtures/academy-booking-collection.sql');assert(fixture);await sql(fixture.source.replace('rollback;','commit;'),'postgres');
    const ctx=JSON.parse(await sql("select jsonb_build_object('academy',t.id,'owner',t.created_by,'actor',g.user_id,'cashier_grant',g.id,'branch',b.id,'classroom',c.id,'room',r.id,'teacher',s.id,'contact',p.id) from public.tenants t join public.academy_branches b on b.academy_id=t.id and b.branch_key='owned-a' join public.academy_classrooms c on c.academy_id=t.id and c.branch_id=b.id and c.name='Owned A' join public.academy_rooms r on r.academy_id=t.id and r.branch_id=b.id and r.room_key='owned-a' join public.academy_staff s on s.academy_id=t.id and s.classroom_ids@>jsonb_build_array(c.id) join public.academy_contacts p on p.academy_id=t.id and p.first_name='Owned learner A' join public.academy_role_grants g on g.academy_id=t.id and g.role='cashier' where t.name='Owned booking collection Academy' limit 1;",'postgres'));
    const grant=randomUUID();await sql("insert into public.academy_role_grants(id,academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by,expires_at) values("+q(grant)+'::uuid,'+q(ctx.academy)+'::uuid,'+q(ctx.actor)+"::uuid,'owned-contended-manager@example.invalid','manager','branches',jsonb_build_array("+q(ctx.branch)+'::uuid),\'active\','+q(ctx.owner)+"::uuid,clock_timestamp()+interval '2 seconds');",'postgres');
    const intent={branch_id:ctx.branch,classroom_id:ctx.classroom,room_id:ctx.room,primary_staff_id:ctx.teacher,title:'Owned blocked booking',delivery_mode:'physical',session_type:'regular',starts_at:new Date(Date.now()+12*86400000).toISOString(),ends_at:new Date(Date.now()+12*86400000+3600000).toISOString(),timezone:'Asia/Tashkent'};
    const booking=key=>'public.academy_booking_command('+q(ctx.academy)+'::uuid,'+q(ctx.actor)+'::uuid,'+q(JSON.stringify(intent))+'::jsonb,'+q(key)+')';
    const deny=call=>"do $$begin begin perform "+call+";raise exception 'Expired command returned';exception when insufficient_privilege then null;end;end;$$;";
    const before=await sql('select count(*) from public.academy_lesson_sessions where academy_id='+q(ctx.academy)+'::uuid;','postgres');
    const barrier=await hold('lock table public.academy_operational_command_receipts in share mode','qa_booking_expiry_barrier');const expired=sql("set application_name='qa_booking_expiry_wait';"+deny(booking('owned-expired-booking')),'postgres');expired.catch(()=>{});await waitForLock('qa_booking_expiry_wait');await sql('select pg_sleep(3);','postgres');await barrier.finish();await expired;assert.equal(await sql('select count(*) from public.academy_lesson_sessions where academy_id='+q(ctx.academy)+'::uuid;','postgres'),before);
    await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '30 minutes' where id="+q(grant)+'::uuid;','postgres');
    const first=await hold('select '+booking('owned-serialized-booking'),'qa_booking_first');const retry=sql("set application_name='qa_booking_retry_wait';select "+booking('owned-serialized-booking')+';','postgres');retry.catch(()=>{});await waitForLock('qa_booking_retry_wait');await first.finish();assert.equal(JSON.parse(await retry).replayed,true);await sql("update public.academy_role_grants set status='revoked' where id="+q(grant)+'::uuid;','postgres');await sql(deny(booking('owned-serialized-booking')),'postgres');
    const finance=(actor,command,payload,key)=>'public.academy_finance_command('+q(ctx.academy)+'::uuid,'+q(actor)+'::uuid,'+q(command)+','+q(JSON.stringify(payload))+'::jsonb,'+q(key)+')';
    const box=JSON.parse(await sql('select '+finance(ctx.owner,'create_cashbox',{branch_id:ctx.branch,name:'Owned expiry collection box',currency:'UZS'},'owned-expiry-box')+';','postgres')).cashbox.id;
    const shift=JSON.parse(await sql('select '+finance(ctx.actor,'open_cashier_shift',{cashbox_id:box,opening_balance:'0'},'owned-expiry-shift')+';','postgres')).cashier_shift.id;
    const payload={contact_id:ctx.contact,shift_id:shift,amount:'1',currency:'UZS',payment_method:'cash',reason:'Owned blocked collection'};const collect='public.academy_collect_student_payment('+q(ctx.academy)+'::uuid,'+q(ctx.actor)+'::uuid,'+q(JSON.stringify(payload))+"::jsonb,'owned-expired-collection')";
    const payments=await sql('select count(*) from public.academy_payments where academy_id='+q(ctx.academy)+'::uuid;','postgres');await sql("update public.academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds' where id="+q(ctx.cashier_grant)+'::uuid;','postgres');const cashBarrier=await hold('lock table public.academy_finance_command_receipts in share mode','qa_collection_expiry_barrier');const cashExpired=sql("set application_name='qa_collection_expiry_wait';"+deny(collect),'postgres');cashExpired.catch(()=>{});await waitForLock('qa_collection_expiry_wait');await sql('select pg_sleep(3);','postgres');await cashBarrier.finish();await cashExpired;assert.equal(await sql('select count(*) from public.academy_payments where academy_id='+q(ctx.academy)+'::uuid;','postgres'),payments);assert.equal(await sql("select count(*) from public.academy_finance_command_receipts where request_key='owned-expired-collection';",'postgres'),'0');
  });
  if(migrations.includes('20261021008000_academy_telegram_attendance_authority.sql'))await check('Telegram attendance rolls back old batch audit and marks after blocked grant expiry',async()=>{
    const fixture=commandFixtures.find(row=>row.file==='scripts/fixtures/academy-telegram-current-commands.sql');assert(fixture);await sql(fixture.source.replace('rollback;','commit;'),'postgres');
    const ctx=JSON.parse(await sql("select jsonb_build_object('academy',g.academy_id,'actor',g.user_id,'grant',g.id,'classroom',s.classroom_id,'session',s.id,'contact',m.contact_id) from public.academy_role_grants g join public.tenants t on t.id=g.academy_id join public.academy_lesson_sessions s on s.academy_id=g.academy_id and s.title='Owned Telegram B' join public.academy_classroom_memberships m on m.academy_id=s.academy_id and m.classroom_id=s.classroom_id where t.name='Owned Telegram command Academy' and g.role='receptionist' limit 1;",'postgres'));
    await sql("update public.academy_role_grants set status='active',expires_at=clock_timestamp()+interval '2 seconds' where id="+q(ctx.grant)+'::uuid;','postgres');
    const barrier=await hold('lock table public.academy_operational_command_receipts in share mode','qa_telegram_receipt_expiry_barrier'),records=JSON.stringify([{contact_id:ctx.contact,status:'absent'}]);
    const call='public.academy_telegram_attendance_command('+q(ctx.academy)+'::uuid,'+q(ctx.actor)+'::uuid,'+q(ctx.session)+'::uuid,'+q(ctx.classroom)+'::uuid,'+q(records)+"::jsonb,'owned-expired-telegram')";
    const expired=sql("set application_name='qa_telegram_receipt_expiry_wait';do $$begin begin perform "+call+";raise exception 'Expired Telegram attendance returned';exception when insufficient_privilege then null;end;end;$$;",'postgres');expired.catch(()=>{});await waitForLock('qa_telegram_receipt_expiry_wait');await sql('select pg_sleep(3);','postgres');await barrier.finish();await expired;
    assert.equal(await sql('select status from public.academy_attendance where academy_id='+q(ctx.academy)+'::uuid and session_id='+q(ctx.session)+'::uuid and contact_id='+q(ctx.contact)+'::uuid;','postgres'),'late');assert.equal(await sql("select count(*) from public.academy_audit_events where idempotency_key='telegram.attendance:owned-expired-telegram';",'postgres'),'0');assert.equal(await sql("select count(*) from public.academy_operational_command_receipts where request_key='owned-expired-telegram';",'postgres'),'0');
  });
  passed=true;
}finally{
  for(const handle of held)await handle.finish(false).catch(()=>{});
  if(owned){const marker=await run(['inspect',name,'--format','{{index .Config.Labels "schood.qa"}}']);assert.equal(marker,label);await run(['rm','--force','--volumes',name]);assert.equal(await run(['ps','--all','--filter','name=^/'+name+'$','--format','{{.ID}}']),'');cleanupVerified=true;}
  const proof={recordedAt:new Date().toISOString(),passed,cleanupVerified,stage,count:checks.length,fixtureChecks,checks,catalog,schema:{sha256,tableCount:runtime.tableCount,customerRowsIncluded:false},runtimeCatalog:{capturedAt:runtimeCapture.capturedAt,sha256:createHash('sha256').update(runtimeSource).digest('hex'),roles:runtime.roles,extensions:runtime.extensions},image,migrations:candidates.map(candidate=>({file:candidate.file,sha256LF:createHash('sha256').update(candidate.source.replaceAll('\r\n','\n')).digest('hex')})),canarySha256LF:createHash('sha256').update(canarySource.replaceAll('\r\n','\n')).digest('hex'),productionChanged:false,limits:['Local complete-schema compatibility only; no installed lifecycle/provider activation proof.','Schema captures contain definitions, not production seed/catalogue/customer records.','The local PostgreSQL exercises real captured Auth triggers, not the live Auth service.']};
  proof.commandFixtures=commandFixtures.map(fixture=>({file:fixture.file,sha256LF:createHash('sha256').update(fixture.source.replaceAll('\r\n','\n')).digest('hex')}));
  writeFileSync(root+'/installed-schema-native-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed,count:checks.length,cleanupVerified,stage}));
}
