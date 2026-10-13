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
const name='schood-student-import-schema-'+randomUUID().slice(0,8),label='student-import-installed-schema';
const root='.temp/student-import';mkdirSync(root,{recursive:true});
writeFileSync(root+'/installed-schema-owned-container.json',JSON.stringify({name,label,image,createdAt:new Date().toISOString()},null,2)+'\n');
const migrations=['20261012160000_academy_student_import_staging.sql','20261012170000_academy_student_import_normalization.sql','20261012180000_academy_student_import_preview.sql','20261012190000_academy_student_import_commit.sql','20261012200000_academy_student_import_lifecycle.sql','20261012210000_academy_legacy_import_boundary.sql','20261012220000_academy_student_import_recovery.sql'];
// Freeze tested sources before any asynchronous work. Evidence must describe the
// bytes installed/tested, even if another edit arrives while qualification runs.
const candidates=migrations.map(file=>({file,source:readFileSync('supabase/migrations/'+file,'utf8')}));
const canarySource=readFileSync('scripts/verify-academy-student-import-schema.sql','utf8');
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
  await check('student import candidates install under captured production role privileges',async()=>{
    for(const candidate of candidates)await sql(candidate.source,'postgres');
    for(const signature of ['academy_stage_student_import(uuid,uuid,text,jsonb,jsonb,integer,boolean,uuid[])','academy_validate_student_import(uuid,uuid,uuid,uuid[],boolean,boolean)','academy_commit_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,boolean)','academy_recover_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean)']){
      assert.equal(await sql("select has_function_privilege('anon',"+q('public.'+signature)+",'EXECUTE') or has_function_privilege('authenticated',"+q('public.'+signature)+",'EXECUTE');"),'f');
      assert.equal(await sql("select has_function_privilege('service_role',"+q('public.'+signature)+",'EXECUTE');"),'t');
    }
  });
  await check('actual Auth, business triggers and foreign keys qualify commit and retained recovery',async()=>{
    assert.equal(await sql(canarySource,'postgres'),'student-import-captured-schema-ok');
    assert.equal(await sql('select count(*) from auth.users;'),'0');
  });

  passed=true;
}finally{
  if(owned){const marker=await run(['inspect',name,'--format','{{index .Config.Labels "schood.qa"}}']);assert.equal(marker,label);await run(['rm','--force','--volumes',name]);assert.equal(await run(['ps','--all','--filter','name=^/'+name+'$','--format','{{.ID}}']),'');cleanupVerified=true;}
  const proof={recordedAt:new Date().toISOString(),passed,cleanupVerified,stage,count:checks.length,checks,catalog,schema:{sha256,tableCount:406,customerRowsIncluded:false},runtimeCatalog:{capturedAt:runtimeCapture.capturedAt,sha256:createHash('sha256').update(runtimeSource).digest('hex'),roles:runtime.roles,extensions:runtime.extensions},image,migrations:candidates.map(candidate=>({file:candidate.file,sha256LF:createHash('sha256').update(candidate.source.replaceAll('\r\n','\n')).digest('hex')})),canarySha256LF:createHash('sha256').update(canarySource.replaceAll('\r\n','\n')).digest('hex'),productionChanged:false,limits:['Local complete-schema compatibility only; no installed lifecycle/provider activation proof.','Schema captures contain definitions, not production seed/catalogue/customer records.','The local PostgreSQL exercises real captured Auth triggers, not the live Auth service.']};
  writeFileSync(root+'/installed-schema-native-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed,count:checks.length,cleanupVerified,stage}));
}
