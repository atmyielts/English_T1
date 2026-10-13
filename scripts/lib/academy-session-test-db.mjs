import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const label = 'academy-session-integrity';
const quote = value => value === null ? 'null' : Array.isArray(value)
  ? 'ARRAY['+value.map(quote).join(',')+']::text[]'
  : "'" + String(value).replaceAll("'", "''") + "'";
export const bindSql = (source, params=[]) => source.replace(/\$(\d+)/g, (_, i) => {
  assert.ok(Number(i) <= params.length, 'Missing fixture query parameter');
  return quote(params[Number(i)-1]);
});

// A new network-isolated local container. No ports, host mounts, hosted connection,
// credentials, or access to any pre-existing database/container.
export async function createNativeSessionDb({profile=false}={}) {
  const name = 'schood-session-' + randomUUID().slice(0,8);
  let owned=false, role=null,restName=null;
  const active = new Set();
  function process(args,includeStderr=false) {
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    active.add(child);
    let out='',err='';
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill();},60000);
    const done=new Promise((resolve,reject)=>{
      child.stdout.on('data',chunk=>out+=chunk);
      child.stderr.on('data',chunk=>err+=chunk);
      child.on('error',error=>{clearTimeout(timer);active.delete(child);reject(error);});
      child.on('close',code=>{
        clearTimeout(timer);active.delete(child);
        if(code===0)resolve((out+(includeStderr?err:'')).trim());else reject(new Error(timedOut?'Owned database command exceeded its 60-second observation budget':err.trim()||'Owned database command failed'));
      });
    });
    child.stdin.on('error',()=>{});
    return {child,done};
  }
  async function run(args,input='') {
    const p=process(args);p.child.stdin.end(input);return p.done;
  }
  const psql=()=>['exec','-i',name,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'];
  const exec=async source=>{
    // Preserve the explicit role checks across this adapter's short connections.
    if(/^set role (anon|authenticated);?$/i.test(source.trim())){role=source.trim().match(/^set role (\w+)/i)[1];return;}
    if(/^reset role;?$/i.test(source.trim())){role=null;return;}
    return run(psql(),(role?'set role '+role+';\n':'')+source);
  };
  const query=async(source,params=[])=>{
    const sql=bindSql(source,params);
    if(!/^select\b/i.test(sql.trim())){await exec(sql+';');return {rows:[]};}
    const result=await exec("select coalesce(json_agg(row_to_json(t)),'[]') from ("+sql+") t;");
    return {rows:JSON.parse(result)};
  };
  async function close() {
    for(const child of active)child.kill();
    if(restName){
      assert.equal(await run(['inspect',restName,'--format','{{index .Config.Labels "schood.qa"}}']),label+'-rest');
      await run(['rm','--force','--volumes',restName]);restName=null;
    }
    if(!owned)return;
    assert.equal(await run(['inspect',name,'--format','{{index .Config.Labels "schood.qa"}}']),label);
    // The pinned image creates its own anonymous database volume. Remove that
    // owned volume with the verified container so repeated suites do not leak disk.
    await run(['rm','--force','--volumes',name]);owned=false;
    console.log('Removed the verified owned local scheduling database.');
  }
  // Resolve only after SQL has completed inside a still-open transaction. Tests
  // observe the competing backend waiting on a lock before releasing this one.
  async function holdTransaction(source,applicationName) {
    const p=process(psql());p.done.catch(()=>{});
    const marker='owned-transaction-ready';
    let output='';
    await new Promise((resolve,reject)=>{
      p.child.stdout.on('data',chunk=>{output+=chunk;if(output.includes(marker))resolve();});
      p.done.then(()=>reject(new Error('Fixture transaction exited before its barrier')),reject);
      p.child.stdin.write('begin;set local statement_timeout=\'30s\';set application_name='+quote(applicationName)+';\n'+source+';\n\\echo '+marker+'\n');
    });
    return {commit:async()=>{p.child.stdin.end('commit;\n\\q\n');await p.done;},rollback:async()=>{p.child.stdin.end('rollback;\n\\q\n');await p.done;}};
  }
  const independent = (source,applicationName) => run(psql(),'set statement_timeout=\'30s\';set application_name='+quote(applicationName)+';\n'+source+';');
  async function startRestGateway(){
    if(!owned||restName)throw new Error('REST fixture requires one owned running database');
    const candidateRestName='schood-session-rest-'+randomUUID().slice(0,8);
    // Shares only the owned database's isolated network namespace. No host
    // ports, external network, JWT/customer credentials or mounted host files.
    await run(['run','--detach','--name',candidateRestName,'--network','container:'+name,'--label','schood.qa='+label+'-rest',
      '-e','PGRST_DB_URI=postgresql://postgres@127.0.0.1:5432/postgres','-e','PGRST_DB_ANON_ROLE=service_role',
      '-e','PGRST_DB_SCHEMAS=public','postgrest/postgrest@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2']);
    restName=candidateRestName;
    assert.equal(await run(['inspect',restName,'--format','{{index .Config.Labels "schood.qa"}}']),label+'-rest');
    let ready=false;
    for(let attempt=0;attempt<50;attempt++){
      try{await run(['exec',name,'wget','-q','-O','-','-T','1','http://127.0.0.1:3000/']);ready=true;break;}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!ready)throw new Error('Owned REST fixture did not start');
    const rpc=async(functionName,body)=>{
      assert.match(functionName,/^academy_[a-z_]+$/);
      const result=await run(['exec',name,'wget','-q','-O','-','-T','55','--header=Content-Type: application/json',
        '--post-data='+JSON.stringify(body),'http://127.0.0.1:3000/rpc/'+functionName]);
      return JSON.parse(result);
    };
    rpc.select=async(table,params)=>{
      assert.match(table,/^academy_[a-z_]+$/);
      const result=await run(['exec',name,'wget','-q','-O','-','-T','55','http://127.0.0.1:3000/'+table+'?'+new URLSearchParams(params)]);
      return JSON.parse(result);
    };
    return rpc;
  }
  async function waitForLock(applicationName) {
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){
      const {rows}=await query("select count(*)::int as n from pg_stat_activity where application_name=$1 and wait_event_type='Lock'",[applicationName]);
      if(rows[0].n>0)return;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw new Error('Competing database connection did not reach the lock barrier');
  }
  async function diagnostics(){
    if(!owned)throw new Error('Diagnostics require the owned fixture');
    assert.equal(await run(['inspect',name,'--format','{{index .Config.Labels "schood.qa"}}']),label);
    const p=process(['logs','--tail','80',name],true);p.child.stdin.end();
    let result=await p.done;
    if(restName){
      assert.equal(await run(['inspect',restName,'--format','{{index .Config.Labels "schood.qa"}}']),label+'-rest');
      const restLogs=process(['logs','--tail','30',restName],true);restLogs.child.stdin.end();result+='\nREST gateway:\n'+await restLogs.done;
    }
    return result;
  }
  try {
    await run(['run','--detach','--name',name,'--network','none','--label','schood.qa='+label,'-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);owned=true;
    assert.equal(await run(['inspect',name,'--format','{{index .Config.Labels "schood.qa"}}']),label);
    let ready=false;
    for(let attempt=0;attempt<100;attempt++){
      try{await exec('select 1;');ready=true;break;}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!ready)throw new Error('Owned scheduling database did not start');
    if(profile)await exec("alter database postgres set session_preload_libraries='auto_explain';alter database postgres set auto_explain.log_min_duration='500ms';alter database postgres set auto_explain.log_nested_statements=true;");
    return {exec,query,close,holdTransaction,independent,waitForLock,startRestGateway,diagnostics};
  } catch(error){await close();throw error;}
}
