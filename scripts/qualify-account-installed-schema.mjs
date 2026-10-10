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
const runtimeCapture=JSON.parse(readFileSync(runtimeFile,'utf8').replace(/^\uFEFF/,'')),runtime=runtimeCapture.catalog;
if(runtimeCapture.readOnly!==true||runtimeCapture.customerRowsRead!==false||!runtime.roles?.some(role=>role.name==='postgres'&&role.superuser===false)||runtime.postgresPrivileges?.authTrigger!==true)throw Error('Runtime privilege catalogue invalid');
const allowedSettings=new Set(['shared_preload_libraries','session_preload_libraries','local_preload_libraries','supautils.privileged_role','supautils.privileged_role_allowed_configs','supautils.superuser','supautils.reserved_roles','supautils.reserved_memberships']);
if(!runtime.runtimeSettings?.some(setting=>setting.name==='session_preload_libraries'&&setting.setting.includes('supautils'))||runtime.runtimeSettings.some(setting=>!allowedSettings.has(setting.name)||typeof setting.setting!=='string'))throw Error('Privileged runtime settings unavailable');
const postgresArgs=['postgres','-c','cron.database_name=postgres',...runtime.runtimeSettings.flatMap(setting=>['-c',setting.name+'='+setting.setting])];
const ident=name=>{if(!/^[a-z_][a-z0-9_-]*$/.test(name))throw Error('Invalid catalogue identifier');return '"'+name+'"';};
const image='public.ecr.aws/supabase/postgres@sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426';
const name='schood-account-schema-'+randomUUID().slice(0,8),label='account-installed-schema';
const root='supabase/.temp/account-retention';mkdirSync(root,{recursive:true});
writeFileSync(root+'/installed-schema-owned-container.json',JSON.stringify({name,label,image,createdAt:new Date().toISOString()},null,2)+'\n');
const migrations=['20261010154000_account_deletion_ownership_guard.sql','20261010155000_account_closed_principal_boundary.sql','20261010160000_account_personal_erasure_transaction.sql','20261010161000_account_api_request_guard.sql'];
const checks=[];let owned=false,cleanupVerified=false,passed=false,stage='start',catalog;
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
    assert.equal(catalog.tables,406);assert.ok(catalog.publicTriggers>50);assert.ok(catalog.authTriggers>0);
    assert.equal(await sql('select count(*) from auth.users;'),'0');assert.equal(await sql('select count(*) from public.users;'),'0');
  });
  await check('database role attributes and relevant memberships match installed metadata',async()=>{
    const existing=JSON.parse(await sql(`select coalesce(jsonb_agg(jsonb_build_object('member',member.rolname,'role',role.rolname)),'[]') from pg_auth_members m join pg_roles member on member.oid=m.member join pg_roles role on role.oid=m.roleid where member.rolname in('postgres','authenticator','supabase_auth_admin','supabase_storage_admin');`));
    await sql('begin;\n'+runtime.roles.map(role=>`alter role ${ident(role.name)} ${role.superuser?'superuser':'nosuperuser'} ${role.bypassRls?'bypassrls':'nobypassrls'} ${role.createRole?'createrole':'nocreaterole'} ${role.createDb?'createdb':'nocreatedb'} ${role.inherit?'inherit':'noinherit'};`).join('\n')+'\n'+existing.map(grant=>`revoke ${ident(grant.role)} from ${ident(grant.member)};`).join('\n')+'\n'+runtime.roleMemberships.map(grant=>`grant ${ident(grant.role)} to ${ident(grant.member)} with admin ${grant.admin?'true':'false'}, inherit ${grant.inherit?'true':'false'}, set ${grant.set?'true':'false'};`).join('\n')+'\ncommit;');
    const actual=JSON.parse(await sql(`select jsonb_build_object('authUsage',has_schema_privilege('postgres','auth','USAGE'),'authCreate',has_schema_privilege('postgres','auth','CREATE'),'authTrigger',has_table_privilege('postgres','auth.users','TRIGGER'),'authSelect',has_table_privilege('postgres','auth.users','SELECT'));`));
    assert.deepEqual(actual,runtime.postgresPrivileges);
  });
  await check('four candidate migrations install against actual table and trigger definitions',async()=>{
    for(const file of migrations)await sql(readFileSync('supabase/migrations/'+file,'utf8'),'postgres');
    assert.equal(await sql('select enabled from public.account_closure_config;'),'f');
    assert.equal(await sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity
      and (has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE'))
      and not exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname and p.policyname='account_open_required' and p.permissive='RESTRICTIVE' and 'authenticated'=any(p.roles) and p.cmd='ALL' and p.qual like '%account_is_open%' and p.with_check like '%account_is_open%');`),'0');
  });
  const actor=randomUUID(),email='schema-'+actor+'@example.invalid';
  await check('actual Auth mirror creates the local principal and personal scope',async()=>{
    await sql(`insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
      values(${q(actor)},${q(email)},'authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Private owned schema fixture"}');`,'supabase_auth_admin');
    assert.equal(await sql(`select email from public.users where id=${q(actor)};`),email);
    assert.equal(await sql(`select count(*) from public.tenants where created_by=${q(actor)} and type='personal';`),'1');
    await sql(`insert into public.user_profiles(user_id,first_name,last_name,phone) values(${q(actor)},'Private','Learner','private-local-phone');
      insert into public.writing_tutor_sessions(user_id,feedback) values(${q(actor)},'Private local feedback');`,'postgres');
  });
  await check('disabled closure rolls back actual Auth triggers and private data',async()=>{
    await assert.rejects(sql(`update auth.users set deleted_at=now(),email='closed-local@example.invalid',raw_user_meta_data='{}' where id=${q(actor)};`,'supabase_auth_admin'));
    assert.equal(await sql(`select deleted_at is null from auth.users where id=${q(actor)};`),'t');
    assert.equal(await sql(`select count(*) from public.user_profiles where user_id=${q(actor)};`),'1');
    assert.equal(await sql('select count(*) from public.account_closure_receipts;'),'0');
  });
  await check('qualified closure erases personal records through actual Auth trigger chain',async()=>{
    await sql(`insert into public.account_closure_qualifications(user_id,expires_at) values(${q(actor)},clock_timestamp()+interval '30 minutes');`,'postgres');
    await sql(`update auth.users set deleted_at=now(),email='closed-local@example.invalid',raw_user_meta_data='{}',raw_app_meta_data='{}' where id=${q(actor)};`,'supabase_auth_admin');
    assert.equal(await sql(`select deleted_at is not null from auth.users where id=${q(actor)};`),'t');
    assert.equal(await sql(`select email='deleted-'||id::text||'@deleted.invalid' and not is_active and full_name is null and avatar_url is null from public.users where id=${q(actor)};`),'t');
    assert.equal(await sql(`select count(*) from public.user_profiles where user_id=${q(actor)};`),'0');
    assert.equal(await sql(`select count(*) from public.writing_tutor_sessions where user_id=${q(actor)};`),'0');
    assert.equal(await sql(`select count(*) from public.account_closure_receipts where user_id=${q(actor)};`),'1');
    assert.equal(await sql(`select count(*) from public.tenant_memberships where user_id=${q(actor)};`),'0');
    assert.equal(await sql('select enabled from public.account_closure_config;'),'f');
  });
  await check('closed actor is denied by actual RLS and private API guard',async()=>{
    assert.equal(await sql(`set request.jwt.claims=${q(JSON.stringify({sub:actor,role:'authenticated'}))};set role authenticated;select count(*) from public.users where id=${q(actor)};`),'0');
    await assert.rejects(sql(`set request.jwt.claims=${q(JSON.stringify({sub:actor,role:'authenticated'}))};set role authenticated;select public.account_api_pre_request();`));
    await sql('set role anon;select public.account_api_pre_request();');
    await sql('set role service_role;select public.account_api_pre_request();');
  });
  await check('captured private Storage policies deny closed and anonymous actors while retaining trusted delivery',async()=>{
    assert.equal(await sql("select count(*) from pg_policies where schemaname='storage';"),'0');
    const bucket='owned-schema-'+randomUUID(),object=randomUUID();
    await sql(`set role service_role;insert into storage.buckets(id,name,public) values(${q(bucket)},${q(bucket)},false);
      insert into storage.objects(id,bucket_id,name,metadata) values(${q(object)},${q(bucket)},'owned-private.txt','{"fixture":true}');`);
    for(const role of ['anon','authenticated']){
      assert.equal(await sql(`set request.jwt.claims=${q(JSON.stringify({sub:actor,role}))};set role ${role};select count(*) from storage.objects where id=${q(object)};`),'0');
      assert.equal(await sql(`set request.jwt.claims=${q(JSON.stringify({sub:actor,role}))};set role ${role};select count(*) from storage.buckets where id=${q(bucket)};`),'0');
    }
    await assert.rejects(sql(`set request.jwt.claims=${q(JSON.stringify({sub:actor,role:'authenticated'}))};set role authenticated;
      insert into storage.objects(bucket_id,name,owner_id) values(${q(bucket)},'closed-write.txt',${q(actor)});`));
    assert.equal(await sql(`set role service_role;select count(*) from storage.objects where id=${q(object)};`),'1');
    assert.equal(await sql(`select count(*) from storage.objects where bucket_id=${q(bucket)};`),'1');
  });
  const issuer=randomUUID(),replacement=randomUUID(),academy=randomUUID(),branch=randomUUID(),contact=randomUUID(),classroom=randomUUID(),token=randomUUID(),payment=randomUUID(),staff=randomUUID(),foreignGrant=randomUUID();
  const issuerEmail='schema-'+issuer+'@example.invalid',foreignEmail='unlinked-config-'+randomUUID()+'@example.invalid';
  let paymentBefore,eventsBefore;
  await check('actual financial and immutable Academy fixture can coexist with personal learning data',async()=>{
    for(const id of [issuer,replacement])await sql(`insert into auth.users(id,email,aud,role,email_confirmed_at,raw_user_meta_data) values(${q(id)},${q('schema-'+id+'@example.invalid')},'authenticated','authenticated',now(),'{"full_name":"Owned institution fixture"}');`,'supabase_auth_admin');
    await sql(`insert into public.tenants(id,name,slug,type,created_by) values(${q(academy)},'Owned schema academy',${q(academy)},'team',${q(issuer)});
      insert into public.tenant_memberships(tenant_id,user_id,role,status) values(${q(academy)},${q(issuer)},'owner','active'),(${q(academy)},${q(replacement)},'member','active');
      insert into public.academy_branches(id,academy_id,branch_key,name,is_default) values(${q(branch)},${q(academy)},'owned-schema-default','Owned default branch',true);
      insert into public.academy_contacts(id,academy_id,user_id,first_name,last_name,notify_enabled) values(${q(contact)},${q(academy)},${q(issuer)},'Retained','Institution student',true);
      insert into public.academy_classrooms(id,academy_id,name,created_by) values(${q(classroom)},${q(academy)},'Retained institutional class',${q(issuer)});
      insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values(${q(academy)},${q(classroom)},${q(contact)},'student','active');
      insert into public.parent_report_tokens(id,academy_id,contact_id,created_by,label) values(${q(token)},${q(academy)},${q(contact)},${q(issuer)},'Owned institutional report');
      insert into public.payments(id,user_id,provider,provider_transaction_id,amount,currency,status,metadata) values(${q(payment)},${q(issuer)},'local_schema_fixture',${q(payment)},1000,'UZS','paid','{"fixture":"financial-evidence"}');
      insert into public.user_profiles(user_id,first_name,last_name,phone) values(${q(issuer)},'Private','Profile','private-local-phone');
      insert into public.academy_staff(id,academy_id,email,role,is_active) values(${q(staff)},${q(academy)},${q(issuerEmail)},'manager',true);
      insert into public.academy_role_grants(id,academy_id,user_id,email,role,status,accepted_at) values(${q(foreignGrant)},${q(academy)},${q(replacement)},${q(issuerEmail)},'teacher','active',now());
      insert into public.platform_admins(email) values(${q(foreignEmail)}),(${q(issuerEmail)});
      update public.users set email=${q(foreignEmail)} where id=${q(issuer)};
      insert into public.account_closure_qualifications(user_id,expires_at) values(${q(issuer)},clock_timestamp()+interval '30 minutes');`,'postgres');
    paymentBefore=await sql(`select to_jsonb(p)::text from public.payments p where id=${q(payment)};`);
    eventsBefore=await sql(`select jsonb_agg(to_jsonb(e) order by e.id)::text from public.academy_student_lifecycle_events e where academy_id=${q(academy)};`);
    assert.notEqual(eventsBefore,'');
  });
  await check('actual owner closure refuses before transfer with no partial erasure',async()=>{
    await assert.rejects(sql(`update auth.users set deleted_at=now(),email='closed-institution@example.invalid',raw_user_meta_data='{}' where id=${q(issuer)};`,'supabase_auth_admin'));
    assert.equal(await sql(`select deleted_at is null from auth.users where id=${q(issuer)};`),'t');
    assert.equal(await sql(`select count(*) from public.user_profiles where user_id=${q(issuer)};`),'1');
    assert.equal(await sql(`select count(*) from public.account_closure_receipts where user_id=${q(issuer)};`),'0');
  });
  await check('after ownership transfer actual closure retains Academy and byte-identical payment history',async()=>{
    await sql(`update public.tenant_memberships set role='owner' where tenant_id=${q(academy)} and user_id=${q(replacement)};
      update public.tenant_memberships set role='member' where tenant_id=${q(academy)} and user_id=${q(issuer)};`,'postgres');
    await sql(`update auth.users set deleted_at=now(),email='closed-institution@example.invalid',raw_user_meta_data='{}',raw_app_meta_data='{}' where id=${q(issuer)};`,'supabase_auth_admin');
    assert.equal(await sql(`select count(*) from public.user_profiles where user_id=${q(issuer)};`),'0');
    assert.equal(await sql(`select created_by=${q(issuer)} from public.tenants where id=${q(academy)};`),'t');
    assert.equal(await sql(`select count(*) from public.tenant_memberships where tenant_id=${q(academy)} and user_id=${q(replacement)} and role='owner' and status='active';`),'1');
    assert.equal(await sql(`select first_name='Retained' and not notify_enabled and user_id=${q(issuer)} from public.academy_contacts where id=${q(contact)};`),'t');
    assert.equal(await sql(`select jsonb_agg(to_jsonb(e) order by e.id)::text from public.academy_student_lifecycle_events e where academy_id=${q(academy)};`),eventsBefore);
    assert.equal(await sql(`select to_jsonb(p)::text from public.payments p where id=${q(payment)};`),paymentBefore);
  });
  await check('erasure follows verified Auth email without revoking another bound actor or configured admin',async()=>{
    assert.equal(await sql(`select count(*) from public.platform_admins where email=${q(foreignEmail)};`),'1');
    assert.equal(await sql(`select count(*) from public.platform_admins where email=${q(issuerEmail)};`),'0');
    assert.equal(await sql(`select status from public.academy_role_grants where id=${q(foreignGrant)};`),'active');
    assert.equal(await sql(`select is_active from public.academy_staff where id=${q(staff)};`),'f');
  });
  await check('replacement owner revokes retained report after historical issuer is closed',async()=>{
    const removed=JSON.parse(await sql(`set role service_role;select public.parent_report_revoke(${q(issuer)},${q(token)});`));
    assert.equal(removed.ok,false);assert.equal(removed.code,'report_session_required');
    const current=JSON.parse(await sql(`set role service_role;select public.parent_report_revoke(${q(replacement)},${q(token)});`));
    assert.deepEqual(current,{ok:true});assert.equal(await sql(`select is_active from public.parent_report_tokens where id=${q(token)};`),'f');
  });
  await check('revoking QA qualifications cannot reopen or hard-delete retained principals',async()=>{
    await sql(`delete from public.account_closure_qualifications where user_id in(${q(actor)},${q(issuer)});`,'postgres');
    await assert.rejects(sql(`delete from auth.users where id=${q(issuer)};`,'supabase_auth_admin'));
    await assert.rejects(sql(`update auth.users set deleted_at=null where id=${q(issuer)};`,'supabase_auth_admin'));
    assert.equal(await sql(`select to_jsonb(p)::text from public.payments p where id=${q(payment)};`),paymentBefore);
    assert.equal(await sql('select enabled from public.account_closure_config;'),'f');
  });
  passed=true;
}finally{
  if(owned){const marker=await run(['inspect',name,'--format','{{index .Config.Labels "schood.qa"}}']);assert.equal(marker,label);await run(['rm','--force',name]);assert.equal(await run(['ps','--all','--filter','name=^/'+name+'$','--format','{{.ID}}']),'');cleanupVerified=true;}
  const proof={recordedAt:new Date().toISOString(),passed,cleanupVerified,stage,count:checks.length,checks,catalog,schema:{sha256,tableCount:406,customerRowsIncluded:false},runtimeCatalog:{capturedAt:runtimeCapture.capturedAt,sha256:createHash('sha256').update(readFileSync(runtimeFile)).digest('hex'),roles:runtime.roles,extensions:runtime.extensions},image,migrations:migrations.map(file=>({file,sha256LF:createHash('sha256').update(readFileSync('supabase/migrations/'+file,'utf8').replaceAll('\r\n','\n')).digest('hex')})),productionChanged:false,limits:['Local complete-schema compatibility only; no installed lifecycle/provider activation proof.','Schema captures contain definitions, not production seed/catalogue/customer records.','The local PostgreSQL exercises real captured Auth triggers, not the live Auth service.']};
  writeFileSync(root+'/installed-schema-native-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed,count:checks.length,cleanupVerified,stage}));
}
