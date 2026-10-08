// Exclusively owned temporary actors/essays. Credentials remain in process memory.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
if(!process.argv.includes('--live'))throw Error('Explicit --live required');
const project='bbjawctnqrufvnesdsel',base='https://'+project+'.supabase.co',run=randomUUID();
const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9);
if(!output)throw Error('An evidence output path is required for safe QA cleanup tracking');
const lookup=spawnSync('supabase',['projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8',windowsHide:true,timeout:20000});
if(lookup.status!==0)throw Error('Key lookup failed; no credentials logged');
const keys=JSON.parse(lookup.stdout),anon=keys.find(k=>k.name==='anon')?.api_key,service=keys.find(k=>k.name==='service_role')?.api_key;
if(!anon||!service)throw Error('Production key lookup incomplete');
const admin={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},publicHeaders={apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'};
const actors=Array.from({length:4},(_,index)=>({id:randomUUID(),email:'peer-qa-'+run+'-'+index+'@example.invalid',password:randomBytes(36).toString('base64url')}));
writeFileSync(output,JSON.stringify({startedAt:new Date().toISOString(),phase:'prepared',runId:run,ownedActors:actors.map(a=>({id:a.id,email:a.email})),cleanupConfirmed:false},null,2)+'\n');
const checks=[],created=new Set(),sessions=new Map(),cleanupErrors=[];
let cleanupPromise,server,served=false;
const assert=(value,message)=>{if(!value)throw Error(message);};
async function request(path,headers=admin,method='GET',body){const r=await fetch(base+path,{headers,method,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json().catch(()=>null),version:r.headers.get('X-Peer-Review-Version')};}
const headers=actor=>({apikey:anon,Authorization:'Bearer '+sessions.get(actor.id).access_token,'Content-Type':'application/json','X-Peer-Review-Client-Version':'2'});
const command=(actor,action,payload={})=>request('/functions/v1/peer-review',headers(actor),'POST',{action,...payload});
const checked=(label,value)=>{assert(value,label);checks.push({case:label,passed:true});};
async function cleanup(){
  if(cleanupPromise)return cleanupPromise;
  cleanupPromise=(async()=>{
    // Independent cleanup: one failure must not skip logout or another actor.
    for(const actor of actors.filter(a=>created.has(a.id))){
      try{
        const user=await request('/auth/v1/admin/users/'+actor.id);
        assert(user.status===200&&user.data?.id===actor.id&&user.data.email===actor.email&&user.data.app_metadata?.qa_run_id===run,'Temporary actor ownership not confirmed');
        const removed=await request('/rest/v1/peer_review_submissions?user_id=eq.'+actor.id,admin,'DELETE');
        const absent=await request('/rest/v1/peer_review_submissions?user_id=eq.'+actor.id+'&select=id');
        const reviews=await request('/rest/v1/peer_reviews?reviewer_id=eq.'+actor.id+'&select=id');
        const assignments=await request('/rest/v1/peer_review_assignments?reviewer_id=eq.'+actor.id+'&select=submission_id');
        assert(removed.status===204&&absent.status===200&&absent.data?.length===0&&reviews.status===200&&reviews.data?.length===0&&assignments.status===200&&assignments.data?.length===0,'Peer fixture absence not confirmed');
      }catch{cleanupErrors.push('Peer fixture cleanup failed for owned temporary actor');}
      if(sessions.has(actor.id)){try{assert((await request('/auth/v1/logout?scope=local',headers(actor),'POST')).status===204,'Logout failed');}catch{cleanupErrors.push('Temporary QA logout not confirmed');}}
      try{
        // The public UI may bootstrap an exclusive personal tenant. Never remove any shared tenant.
        const tenants=await request('/rest/v1/tenants?created_by=eq.'+actor.id+'&select=id,type');
        assert(tenants.status===200&&Array.isArray(tenants.data),'QA tenant inventory failed');
        for(const tenant of tenants.data){
          const members=await request('/rest/v1/tenant_memberships?tenant_id=eq.'+tenant.id+'&select=user_id,role');
          assert(tenant.type==='personal'&&members.status===200&&members.data.every(m=>m.user_id===actor.id&&m.role==='owner'),'Refusing non-exclusive QA tenant cleanup');
          assert((await request('/rest/v1/tenants?id=eq.'+tenant.id+'&created_by=eq.'+actor.id+'&type=eq.personal',admin,'DELETE')).status===204,'QA tenant delete failed');
        }
        const remaining=await request('/rest/v1/tenants?created_by=eq.'+actor.id+'&select=id');
        assert(remaining.status===200&&remaining.data?.length===0,'QA tenant absence failed');
        assert((await request('/auth/v1/admin/users/'+actor.id,admin,'DELETE')).status===200,'QA account delete failed');
        const absent=await request('/auth/v1/admin/users/'+actor.id);
        const mirror=await request('/rest/v1/users?id=eq.'+actor.id+'&select=id');
        assert(absent.status===404&&mirror.status===200&&mirror.data?.length===0,'QA account/mirror absence not confirmed');
      }catch{cleanupErrors.push('Temporary QA account/tenant cleanup not confirmed');}
    }
    sessions.clear();actors.forEach(actor=>{actor.password='';});
    const result={cleaned:cleanupErrors.length===0,checks,temporaryActorsRemoved:cleanupErrors.length===0,fixturesRemoved:cleanupErrors.length===0,logoutConfirmed:cleanupErrors.length===0,cleanupErrors};
    const evidence={checkedAt:new Date().toISOString(),productionContacted:true,exclusiveQaFixturesOnly:true,customerEssaysRead:0,customerRecordsChanged:0,runId:run,ownedActors:actors.map(a=>({id:a.id,email:a.email})),...result};
    writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
    if(cleanupErrors.length)throw Error(cleanupErrors.join('; '));
    console.log(JSON.stringify(evidence));return result;
  })();return cleanupPromise;
}
try{
  // Do not create actors while the old permission boundary is still deployed.
  const denied=await request('/rest/v1/peer_review_submissions?select=id&limit=0',publicHeaders,'HEAD');
  assert([401,403].includes(denied.status),'Reviewed peer permissions are not yet deployed');
  for(const actor of actors){
    created.add(actor.id); // Also clean an ambiguous creation response by its controlled ID.
    const user=await request('/auth/v1/admin/users',admin,'POST',{id:actor.id,email:actor.email,password:actor.password,email_confirm:true,
      app_metadata:{qa_readiness_audit:true,qa_run_id:run},user_metadata:{first_name:'Schood',last_name:'Peer QA',qa_readiness_audit:true}});
    assert(user.status===200&&user.data?.id===actor.id&&user.data.app_metadata?.qa_run_id===run,'Owned actor creation failed');
    const auth=await request('/auth/v1/token?grant_type=password',{apikey:anon,'Content-Type':'application/json'},'POST',{email:actor.email,password:actor.password});
    assert(auth.status===200&&auth.data?.user?.id===actor.id,'Temporary actor sign-in failed');sessions.set(actor.id,auth.data);
    const version=await command(actor,'my_submissions');assert(version.status===200&&version.version==='2'&&version.data?.submissions?.length===0,'Private command API not ready');
  }
  const [author,...reviewers]=actors;
  const payload={request_id:randomUUID(),sharing_consent:true,essay_text:'QA_PEER_'+run+' synthetic English practice only. '.repeat(8),prompt_text:'QA_PEER_'+run,exam_type:'ielts',task_type:'task2'};
  const noConsent=await command(author,'submit',{...payload,sharing_consent:false});checked('explicit-consent-required',noConsent.status===400);
  const staleHeaders={...headers(author)};delete staleHeaders['X-Peer-Review-Client-Version'];
  checked('stale-client-mutation-refused',(await request('/functions/v1/peer-review',staleHeaders,'POST',{action:'submit',...payload})).status===409);
  const submitted=await Promise.all([command(author,'submit',payload),command(author,'submit',payload)]);
  const id=submitted[0].data?.submission?.id;
  checked('concurrent-submit-replay-one-identity',submitted.every(r=>r.status===200&&r.data?.submission?.id===id&&r.data.submission.request_id===payload.request_id));
  checked('changed-retry-content-conflicts',(await command(author,'submit',{...payload,essay_text:payload.essay_text+' changed'})).status===409);
  const queue=await command(reviewers[0],'queue');
  checked('queue-is-consented-metadata-without-essay-or-author',queue.status===200&&queue.data.submissions.some(s=>s.id===id)&&queue.data.submissions.every(s=>!('essay_text'in s)&&!('prompt_text'in s)&&!('user_id'in s)));
  checked('unassigned-essay-read-and-spoofed-actor-refused',(await command(reviewers[0],'get_submission',{submission_id:id,p_actor:author.id,user_id:author.id})).status===403);
  checked('unassigned-review-write-refused',(await command(reviewers[0],'submit_review',{submission_id:id,overall_comment:'Not assigned'})).status===403);
  checked('author-self-review-refused',(await command(author,'claim_submission',{submission_id:id})).status===409);
  const claims=await Promise.all(reviewers.map(async actor=>({actor,result:await command(actor,'claim_submission',{submission_id:id})})));
  const winners=claims.filter(c=>c.result.status===200),loser=claims.find(c=>c.result.status===409);
  checked('three-competing-reviewers-reserve-exactly-two',winners.length===2&&Boolean(loser)&&winners.every(c=>c.result.data.submission.essay_text===payload.essay_text.trim()&&!('user_id'in c.result.data.submission)));
  const review={submission_id:id,overall_comment:'Synthetic QA feedback on clear structure.',band_score:0};
  const receipts=await Promise.all([command(winners[0].actor,'submit_review',review),command(winners[0].actor,'submit_review',review)]);
  const reviewId=receipts[0].data?.review?.id;
  checked('concurrent-review-replay-one-receipt',receipts.every(r=>r.status===200&&r.data?.review?.id===reviewId));
  let history=await command(author,'my_submissions');
  checked('first-review-count-is-one-and-still-reviewing',history.status===200&&history.data.submissions.find(s=>s.id===id)?.reviews_count===1&&history.data.submissions.find(s=>s.id===id)?.status==='reviewing');
  checked('remaining-reservation-can-complete',(await command(winners[1].actor,'submit_review',{...review,overall_comment:'Second independent synthetic feedback.',band_score:6.5})).status===200);
  history=await command(author,'my_submissions');
  checked('completion-count-and-feedback-are-confirmed-together',history.status===200&&history.data.submissions.find(s=>s.id===id)?.reviews_count===2&&history.data.submissions.find(s=>s.id===id)?.status==='reviewed'&&history.data.reviews.filter(r=>r.submission_id===id).length===2);
  checked('only-author-can-rate-helpful',(await command(loser.actor,'rate_helpful',{review_id:reviewId,is_helpful:true})).status===404&&(await command(author,'rate_helpful',{review_id:reviewId,is_helpful:false})).status===200);
  const privatePayload={...payload,request_id:randomUUID()};
  const second=await command(author,'submit',privatePayload),privateId=second.data?.submission?.id;assert(second.status===200&&privateId,'Own withdrawal fixture failed');
  assert((await command(winners[0].actor,'claim_submission',{submission_id:privateId})).status===200,'Own withdrawal reservation failed');
  checked('author-can-stop-sharing',(await command(author,'set_sharing',{submission_id:privateId,sharing_consent:false})).status===200);
  checked('withdrawal-refuses-further-reads-and-writes',(await command(winners[0].actor,'get_submission',{submission_id:privateId})).status===409&&(await command(winners[0].actor,'submit_review',{...review,submission_id:privateId})).status===409);
  checked('author-retains-private-writing',(await command(author,'get_submission',{submission_id:privateId})).data?.submission?.essay_text===payload.essay_text.trim());
  for(const [role,h] of [['anon',publicHeaders],['authenticated-QA',headers(author)]]){
    for(const [table,filter,column,body] of [
      ['peer_review_submissions','id=eq.'+id,'essay_text',{id:randomUUID(),user_id:author.id,essay_text:'QA_DIRECT_'+run}],
      ['peer_reviews','id=eq.'+reviewId,'overall_comment',{id:randomUUID(),submission_id:id,reviewer_id:loser.actor.id,overall_comment:'QA_DIRECT_'+run}],
      ['peer_review_assignments','submission_id=eq.'+id,'expires_at',{submission_id:id,reviewer_id:loser.actor.id,expires_at:new Date(Date.now()+60000).toISOString()}],
    ]){
      for(const [operation,method,suffix,payload] of [
        ['select','GET','?'+filter+'&select=*'],['column-select','GET','?'+filter+'&select='+column],
        ['insert','POST','',body],['update','PATCH','?'+filter,{[column]:body[column]}],['delete','DELETE','?'+filter],
      ]){
        const result=await request('/rest/v1/'+table+suffix,h,method,payload);
        checked(role+'-direct-'+table+'-'+operation+'-denied',[401,403].includes(result.status)&&result.data?.code==='42501');
      }
    }
    const rpc=await request('/rest/v1/rpc/peer_review_command',h,'POST',{p_actor:author.id,p_action:'queue',p_payload:{}});
    checked(role+'-trusted-RPC-execution-denied',[401,403].includes(rpc.status)&&rpc.data?.code==='42501');
  }
  if(process.argv.includes('--browser')){
    // CLI receives only these actors' sessions, once, over a short-lived loopback bridge.
    const bootstrap={authorSession:sessions.get(author.id),reviewerSession:sessions.get(winners[0].actor.id),runId:run};
    server=createServer(async(req,res)=>{
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      if(req.headers.host!=='127.0.0.1:61987'){res.writeHead(403);return res.end('{}');}
      if(req.method==='GET'&&req.url==='/session'&&!served){served=true;return res.end(JSON.stringify(bootstrap));}
      if(req.method==='POST'&&req.url==='/cleanup'){try{const cleaned=await cleanup();res.end(JSON.stringify({cleaned:cleaned.cleaned}));}catch{res.writeHead(500);res.end('{"cleaned":false}');}finally{server.close();}return;}
      res.writeHead(404);res.end('{}');
    });
    await new Promise(resolve=>server.listen(61987,'127.0.0.1',resolve));
    console.log('Exclusive Peer QA bridge ready on loopback; no credentials logged.');
    const timer=setTimeout(()=>{void cleanup().finally(()=>server.close());},180000);server.on('close',()=>clearTimeout(timer));
  }else await cleanup();
}catch(error){try{await cleanup();}catch{throw Error('Owned QA cleanup requires attention');}throw error;}
