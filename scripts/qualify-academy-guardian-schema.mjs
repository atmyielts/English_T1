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
const commandFixtures=process.argv.includes('--release-commands')?[
  {file:'scripts/verify-academy-student-import-schema.sql',marker:'student-import-captured-schema-ok'},
  {file:'scripts/fixtures/academy-release-commands.sql',marker:'staff-and-learner-captured-schema-ok'},
].map(fixture=>({...fixture,source:readFileSync(fixture.file,'utf8')})):[];
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

  passed=true;
}finally{
  for(const handle of held)await handle.finish(false).catch(()=>{});
  if(owned){const marker=await run(['inspect',name,'--format','{{index .Config.Labels "schood.qa"}}']);assert.equal(marker,label);await run(['rm','--force','--volumes',name]);assert.equal(await run(['ps','--all','--filter','name=^/'+name+'$','--format','{{.ID}}']),'');cleanupVerified=true;}
  const proof={recordedAt:new Date().toISOString(),passed,cleanupVerified,stage,count:checks.length,fixtureChecks,checks,catalog,schema:{sha256,tableCount:runtime.tableCount,customerRowsIncluded:false},runtimeCatalog:{capturedAt:runtimeCapture.capturedAt,sha256:createHash('sha256').update(runtimeSource).digest('hex'),roles:runtime.roles,extensions:runtime.extensions},image,migrations:candidates.map(candidate=>({file:candidate.file,sha256LF:createHash('sha256').update(candidate.source.replaceAll('\r\n','\n')).digest('hex')})),canarySha256LF:createHash('sha256').update(canarySource.replaceAll('\r\n','\n')).digest('hex'),productionChanged:false,limits:['Local complete-schema compatibility only; no installed lifecycle/provider activation proof.','Schema captures contain definitions, not production seed/catalogue/customer records.','The local PostgreSQL exercises real captured Auth triggers, not the live Auth service.']};
  proof.commandFixtures=commandFixtures.map(fixture=>({file:fixture.file,sha256LF:createHash('sha256').update(fixture.source.replaceAll('\r\n','\n')).digest('hex')}));
  writeFileSync(root+'/installed-schema-native-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed,count:checks.length,cleanupVerified,stage}));
}
