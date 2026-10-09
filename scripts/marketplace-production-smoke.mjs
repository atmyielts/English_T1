// Run only after the separately reviewed Marketplace backend is published.
// All accounts, workspaces and mutations belong exclusively to this QA run.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
if (!process.argv.includes('--live')) throw Error('Explicit --live required');
const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9);
if (!output) throw Error('An evidence output path is required for cleanup tracking');
const project='bbjawctnqrufvnesdsel',base='https://'+project+'.supabase.co',run=randomUUID();
const lookup=spawnSync('supabase',['projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8',windowsHide:true,timeout:20_000});
if(lookup.status!==0)throw Error('Key lookup failed; no credentials logged');
const keys=JSON.parse(lookup.stdout),anon=keys.find(k=>k.name==='anon')?.api_key,service=keys.find(k=>k.name==='service_role')?.api_key;
if(!anon||!service)throw Error('Key lookup incomplete');
const admin={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},publicHeaders={apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'};
const actors=Array.from({length:6},(_,index)=>({id:randomUUID(),email:'marketplace-qa-'+run+'-'+index+'@example.invalid',password:randomBytes(36).toString('base64url')}));
const [owner,teacher,manager,member,disabled,outsider]=actors;
const tenantId=randomUUID(),otherTenant=randomUUID(),tenantIds=[tenantId,otherTenant];
const checks=[],created=new Set(),sessions=new Map(),cleanupErrors=[];
let cleanupPromise,server,served=false,cleanupFinished=false,cleanupSucceeded=false;
const assert=(value,message)=>{if(!value)throw Error(message);};
async function request(path,headers=admin,method='GET',body){const response=await fetch(base+path,{headers,method,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20_000)});return{status:response.status,data:await response.json().catch(()=>null),version:response.headers.get('X-Marketplace-Version')};}
const headers=actor=>({...publicHeaders,Authorization:'Bearer '+sessions.get(actor.id).access_token,'X-Marketplace-Client-Version':'2'});
const command=(actor,action,payload={})=>request('/functions/v1/teacher-marketplace',actor?headers(actor):publicHeaders,'POST',{action,...payload});
const checked=(label,value)=>{assert(value,label);checks.push({case:label,passed:true});};
writeFileSync(output,JSON.stringify({startedAt:new Date().toISOString(),phase:'prepared',runId:run,ownedActors:actors.map(a=>({id:a.id,email:a.email})),ownedTenants:tenantIds,cleanupConfirmed:false},null,2)+'\n');
async function cleanup(){
  if(cleanupPromise)return cleanupPromise;
  cleanupPromise=(async()=>{
    for(const actor of actors.filter(a=>created.has(a.id))){
      try{
        const user=await request('/auth/v1/admin/users/'+actor.id);
        assert(user.status===200&&user.data.id===actor.id&&user.data.email===actor.email&&user.data.app_metadata?.qa_run_id===run,'Actor ownership not confirmed');
        assert((await request('/rest/v1/job_listings?created_by=eq.'+actor.id,admin,'DELETE')).status===204,'Owned listing cleanup failed');
        assert((await request('/rest/v1/teacher_profiles?user_id=eq.'+actor.id,admin,'DELETE')).status===204,'Owned profile cleanup failed');
        const jobs=await request('/rest/v1/job_listings?created_by=eq.'+actor.id+'&select=id'),profiles=await request('/rest/v1/teacher_profiles?user_id=eq.'+actor.id+'&select=id');
        assert(jobs.status===200&&jobs.data.length===0&&profiles.status===200&&profiles.data.length===0,'Owned fixture absence not confirmed');
      }catch{cleanupErrors.push('Owned Marketplace fixture cleanup not confirmed');}
      if(sessions.has(actor.id)){try{assert((await request('/auth/v1/logout?scope=local',headers(actor),'POST')).status===204,'Logout failed');}catch{cleanupErrors.push('Owned actor logout not confirmed');}}
      try{
        const user=await request('/auth/v1/admin/users/'+actor.id);
        assert(user.status===200&&user.data.app_metadata?.qa_run_id===run&&user.data.email===actor.email,'Account ownership not confirmed');
        const owned=await request('/rest/v1/tenants?created_by=eq.'+actor.id+'&select=id,type,metadata');assert(owned.status===200&&Array.isArray(owned.data),'Owned tenant inventory failed');
        for(const tenant of owned.data){
          const memberships=await request('/rest/v1/tenant_memberships?tenant_id=eq.'+tenant.id+'&select=user_id,role');
          const exclusivePersonal=tenant.type==='personal'&&memberships.data?.every(m=>m.user_id===actor.id&&m.role==='owner');
          const exclusiveFixture=tenantIds.includes(tenant.id)&&tenant.metadata?.qa_run_id===run&&memberships.data?.every(m=>actors.some(a=>a.id===m.user_id));
          assert(memberships.status===200&&(exclusivePersonal||exclusiveFixture),'Refusing shared tenant cleanup');
          assert((await request('/rest/v1/tenants?id=eq.'+tenant.id+'&created_by=eq.'+actor.id,admin,'DELETE')).status===204,'Owned tenant delete failed');
        }
        assert((await request('/auth/v1/admin/users/'+actor.id,admin,'DELETE')).status===200,'Owned account delete failed');
        const absent=await request('/auth/v1/admin/users/'+actor.id),mirror=await request('/rest/v1/users?id=eq.'+actor.id+'&select=id'),remaining=await request('/rest/v1/tenants?created_by=eq.'+actor.id+'&select=id');
        const receipts=await request('/rest/v1/marketplace_profile_requests?actor_id=eq.'+actor.id+'&select=request_id'),decisions=await request('/rest/v1/marketplace_application_decisions?actor_id=eq.'+actor.id+'&select=id'),memberships=await request('/rest/v1/tenant_memberships?user_id=eq.'+actor.id+'&select=id');
        assert(absent.status===404&&mirror.status===200&&mirror.data.length===0&&remaining.status===200&&remaining.data.length===0&&receipts.status===200&&receipts.data.length===0&&decisions.status===200&&decisions.data.length===0&&memberships.status===200&&memberships.data.length===0,'Account/mirror/tenant/receipt/membership absence failed');
      }catch{cleanupErrors.push('Owned Marketplace account/tenant cleanup not confirmed');}
    }
    sessions.clear();actors.forEach(a=>{a.password='';});
    const evidence={checkedAt:new Date().toISOString(),productionContacted:true,exclusiveQaFixturesOnly:true,customerPrivateRecordsRead:0,customerRecordsChanged:0,runId:run,checks,ownedActors:actors.map(a=>({id:a.id,email:a.email})),ownedTenants:tenantIds,cleanupConfirmed:cleanupErrors.length===0,fixturesRemoved:cleanupErrors.length===0,temporaryActorsRemoved:cleanupErrors.length===0,logoutConfirmed:cleanupErrors.length===0,cleanupErrors};
    writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');if(cleanupErrors.length)throw Error(cleanupErrors.join('; '));cleanupSucceeded=true;console.log(JSON.stringify(evidence));return evidence;
  })().finally(()=>{cleanupFinished=true;});return cleanupPromise;
}
try{
  // Refuse fixture creation until both permission and v2 command boundaries exist.
  assert([401,403].includes((await request('/rest/v1/teacher_profiles?select=id&limit=0',publicHeaders,'HEAD')).status),'Reviewed browser grants are not deployed');
  const readiness=await command(null,'teachers',{subject:'qa-'+run});assert(readiness.status===200&&readiness.version==='2','Reviewed Marketplace API is not deployed');
  for(const actor of actors){
    created.add(actor.id);
    const made=await request('/auth/v1/admin/users',admin,'POST',{id:actor.id,email:actor.email,password:actor.password,email_confirm:true,app_metadata:{qa_readiness_audit:true,qa_run_id:run},user_metadata:{first_name:'Schood',last_name:'Marketplace QA',qa_readiness_audit:true}});
    assert(made.status===200&&made.data.id===actor.id&&made.data.app_metadata?.qa_run_id===run,'Exclusive actor creation failed');
    const signed=await request('/auth/v1/token?grant_type=password',{apikey:anon,'Content-Type':'application/json'},'POST',{email:actor.email,password:actor.password});assert(signed.status===200&&signed.data.user.id===actor.id,'Exclusive sign-in failed');sessions.set(actor.id,signed.data);
  }
  for(const [id,creator,name] of [[tenantId,owner,'QA Marketplace '+run],[otherTenant,outsider,'QA Other '+run]])assert((await request('/rest/v1/tenants',admin,'POST',{id,name,slug:'marketplace-qa-'+id,type:'team',created_by:creator.id,metadata:{qa_run_id:run}})).status===201,'Exclusive academy creation failed');
  assert((await request('/rest/v1/tenant_memberships',admin,'POST',[[owner,'owner','active'],[manager,'admin','active'],[member,'member','active'],[disabled,'admin','disabled']].map(([actor,role,status])=>({tenant_id:tenantId,user_id:actor.id,role,status})).concat([{tenant_id:otherTenant,user_id:outsider.id,role:'owner',status:'active'}]))).status===201,'Exclusive memberships failed');
  const originalRole=await request('/rest/v1/users?id=eq.'+teacher.id+'&select=role');assert(originalRole.status===200&&originalRole.data.length===1,'Own QA role baseline unavailable');
  await request('/rest/v1/users?id=eq.'+teacher.id,headers(teacher),'PATCH',{role:'admin'});
  const retainedRole=await request('/rest/v1/users?id=eq.'+teacher.id+'&select=role');
  checked('browser-cannot-self-promote-global-role',retainedRole.status===200&&retainedRole.data.length===1&&retainedRole.data[0].role===originalRole.data[0].role);
  await request('/rest/v1/tenant_memberships?tenant_id=eq.'+tenantId+'&user_id=eq.'+member.id,headers(member),'PATCH',{role:'owner'});
  const retainedMembership=await request('/rest/v1/tenant_memberships?tenant_id=eq.'+tenantId+'&user_id=eq.'+member.id+'&select=role');
  checked('browser-cannot-self-promote-academy-role',retainedMembership.status===200&&retainedMembership.data.length===1&&retainedMembership.data[0].role==='member');
  checked('manager-discovery-excludes-personal-workspaces',(await command(owner,'manageable_tenants')).data.tenants.length===1&&(await command(teacher,'manageable_tenants')).data.tenants.length===0);
  const profilePayload={full_name:'QA teacher '+run,bio:'Exclusively synthetic teaching profile.',subjects:['qa-'+run],languages:['English'],certifications:[],location:'QA location',hourly_rate:0,experience_years:0,is_public:true,available:true,expected_revision:0,request_id:randomUUID(),verified:true,user_id:owner.id,metadata:{forged:true}};
  const profiles=await Promise.all([command(teacher,'upsert_profile',profilePayload),command(teacher,'upsert_profile',profilePayload)]),profileId=profiles[0].data?.profile?.id;
  checked('concurrent-profile-retries-have-one-matching-private-safe-receipt',Boolean(profileId)&&profiles.every(r=>r.status===200&&r.data.profile.id===profileId&&r.data.request_id===profilePayload.request_id&&r.data.profile.verified===false&&r.data.profile.hourly_rate===0));
  checked('changed-profile-request-content-conflicts',(await command(teacher,'upsert_profile',{...profilePayload,full_name:'Changed request'})).status===409);
  const publicTeacher=await command(null,'teachers',{subject:'qa-'+run});checked('public-profile-DTO-never-exposes-account-or-metadata',publicTeacher.status===200&&publicTeacher.data.teachers.length===1&&!('user_id'in publicTeacher.data.teachers[0])&&!('metadata'in publicTeacher.data.teachers[0]));
  const jobPayload={tenant_id:tenantId,title:'QA teaching position '+run,description:'Exclusive synthetic vacancy.',subjects:['qa-'+run],salary_min:0,salary_max:0,expires_in_days:30,request_id:randomUUID()};
  const posted=await Promise.all([command(owner,'post_job',jobPayload),command(owner,'post_job',jobPayload)]),jobId=posted[0].data?.job?.id;
  checked('concurrent-job-posts-retain-one-listing-identity',Boolean(jobId)&&posted.every(r=>r.status===200&&r.data.job.id===jobId&&r.data.job.request_id===jobPayload.request_id));
  checked('changed-posting-request-content-conflicts',(await command(owner,'post_job',{...jobPayload,title:'Changed retry'})).status===409);
  for(const actor of [teacher,member,disabled,outsider])for(const action of ['my_jobs','post_job','list_applications','close_job'])checked('forbidden-'+actor.id.slice(0,8)+'-'+action,(await command(actor,action,{tenant_id:tenantId,title:jobPayload.title,request_id:randomUUID(),job_id:jobId})).status===403);
  const applied=await Promise.all([command(teacher,'apply',{listing_id:jobId,cover_note:'Original synthetic cover note.',status:'hired',teacher_id:owner.id}),command(teacher,'apply',{listing_id:jobId,cover_note:'Original synthetic cover note.'})]),applicationId=applied[0].data?.application?.id;
  checked('concurrent-applications-start-pending-and-share-one-identity',Boolean(applicationId)&&applied.every(r=>r.status===200&&r.data.application.id===applicationId&&r.data.application.status==='pending'));
  const decision={application_id:applicationId,expected_status:'pending',status:'shortlisted',request_id:randomUUID()};const decisions=await Promise.all([command(owner,'update_application_status',decision),command(owner,'update_application_status',decision)]);
  checked('concurrent-hiring-decisions-retain-one-audit-receipt',decisions.every(r=>r.status===200&&r.data.decision.request_id===decision.request_id&&r.data.application.status==='shortlisted'));
  checked('stale-hiring-decisions-conflict',(await command(manager,'update_application_status',{...decision,status:'rejected',request_id:randomUUID()})).status===409);
  checked('reapplying-retains-employer-status-and-original-note',(await command(teacher,'apply',{listing_id:jobId,cover_note:'Changed duplicate'})).data.application.status==='shortlisted'&&(await command(owner,'list_applications',{job_id:jobId})).data.applications[0].cover_note==='Original synthetic cover note.');
  assert((await request('/rest/v1/tenant_memberships?tenant_id=eq.'+tenantId+'&user_id=eq.'+manager.id,admin,'PATCH',{status:'disabled'})).status===204,'Owned revocation fixture failed');
  checked('revoked-manager-cannot-read-or-decide',(await command(manager,'list_applications',{job_id:jobId})).status===403&&(await command(manager,'update_application_status',{...decision,request_id:randomUUID(),expected_status:'shortlisted',status:'hired'})).status===403);
  const stale={...headers(teacher)};delete stale['X-Marketplace-Client-Version'];checked('stale-client-write-refused',(await request('/functions/v1/teacher-marketplace',stale,'POST',{action:'apply',listing_id:jobId})).status===409);
  for(const [role,h] of [['anon',publicHeaders],['authenticated-QA',headers(teacher)]]){
    for(const [table,filter,column,body] of [
      ['teacher_profiles','id=eq.'+profileId,'verified',{user_id:teacher.id,full_name:'QA direct write '+run,verified:true}],
      ['job_listings','id=eq.'+jobId,'status',{tenant_id:tenantId,title:'QA direct write '+run,created_by:owner.id}],
      ['job_applications','id=eq.'+applicationId,'status',{listing_id:jobId,teacher_id:profileId,status:'hired'}],
      ['marketplace_profile_requests','actor_id=eq.'+teacher.id,'receipt',{actor_id:teacher.id,request_id:randomUUID(),request_payload:{},receipt:{}}],
      ['marketplace_application_decisions','application_id=eq.'+applicationId,'to_status',{application_id:applicationId,actor_id:owner.id,request_id:randomUUID(),from_status:'pending',to_status:'hired'}],
    ])for(const [label,method,suffix,payload] of [['select','GET','?'+filter+'&select=*'],['column-select','GET','?'+filter+'&select='+column],['insert','POST','',body],['update','PATCH','?'+filter,{[column]:body[column]}],['delete','DELETE','?'+filter]]){
      const r=await request('/rest/v1/'+table+suffix,h,method,payload);checked(role+'-'+table+'-'+label+'-denied',[401,403].includes(r.status)&&r.data?.code==='42501');
    }
    const r=await request('/rest/v1/rpc/marketplace_command',h,'POST',{p_actor:owner.id,p_action:'my_jobs',p_payload:{tenant_id:tenantId}});checked(role+'-trusted-RPC-denied',[401,403].includes(r.status)&&r.data?.code==='42501');
  }
  if(process.argv.includes('--browser')){
    const bootstrap={teacherSession:sessions.get(teacher.id),ownerSession:sessions.get(owner.id),tenantId,jobId,runId:run};
    server=createServer(async(req,res)=>{
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      if(req.headers.host!=='127.0.0.1:61988'){res.writeHead(403);return res.end('{}');}
      if(req.method==='GET'&&req.url==='/session'&&!served){served=true;return res.end(JSON.stringify(bootstrap));}
      if(req.method==='POST'&&req.url==='/cleanup'){void cleanup().catch(()=>{process.exitCode=1;});res.writeHead(202);return res.end('{"started":true}');}
      if(req.method==='GET'&&req.url==='/cleanup-status'){res.writeHead(cleanupFinished&&!cleanupSucceeded?500:200);res.end(JSON.stringify({finished:cleanupFinished,cleaned:cleanupSucceeded}));if(cleanupFinished)server.close();return;}
      res.writeHead(404);res.end('{}');
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(61988,'127.0.0.1',resolve);});
    console.log('Exclusive Marketplace QA bridge ready on loopback; no credentials logged.');
    const timer=setTimeout(()=>{void cleanup().catch(()=>{process.exitCode=1;}).finally(()=>server.close());},300_000);server.on('close',()=>clearTimeout(timer));
  }else await cleanup();
}catch(error){try{await cleanup();}catch{throw Error('Owned Marketplace QA cleanup requires attention');}throw error;}
