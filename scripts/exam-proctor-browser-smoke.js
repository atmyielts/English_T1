async (page) => {
  await page.context().clearCookies();await page.setViewportSize({width:1440,height:1000});
  const uid='00000000-0000-4000-8000-000000000003',tid='10000000-0000-4000-8000-000000000001',rid='70000000-0000-4000-8000-000000000001';
  const suffix=String(Date.now()).slice(-12).padStart(12,'0'),aid='80000000-0000-4000-8000-'+suffix,sid='90000000-0000-4000-8000-'+suffix;
  const iid='20000000-0000-4000-8000-000000000001',policyId='30000000-0000-4000-8000-000000000001',noticeId='40000000-0000-4000-8000-000000000001';
  let state='active',consented=false,identityVerified=false,captureReady=false,denyEvents=true,starts=0,sequence=0,acknowledged=false;
  let deadline=new Date(Date.now()+600000).toISOString();const responses=[],received=new Map(),commands=[],errors=[];
  let leaseDevice='',leaseToken='',epoch=0,leaseExpires=0;const runtimeCommands=[],receipts=new Map();
  const policy={schema_version:'proctor.policy.v1',mode:'browser',identity_level:1,camera:false,microphone:false,screen:false,second_camera:false,identity_retention_days:30,recording_retention_days:90,recovery_seconds:10,auto_pause:false,reviewer_quorum:2};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/^https:\/\/(assessment|coordinator)-tests\.invalid\//,async route=>{
    const request=route.request(),url=new URL(request.url());let result;
    if(url.hostname==='coordinator-tests.invalid'){
      const snapshot=()=>({attempt_id:aid,state,deadline_at:deadline,section_deadline_at:deadline,closes_at:deadline,section_index:0,last_sequence:sequence,lease_epoch:epoch||null,lease_expires_at:leaseExpires?new Date(leaseExpires).toISOString():null,server_time:new Date().toISOString(),next_deadline_at:['active','paused'].includes(state)?deadline:null});
      if(url.pathname.endsWith('/state'))result={data:{snapshot:snapshot()}};
      else{
        const body=request.postDataJSON(),key=request.headers()['idempotency-key'];runtimeCommands.push(body.action);let value={};
        if(receipts.has(key))value=receipts.get(key);
        else if(body.action==='lease.acquire'){
          if(leaseExpires>Date.now()&&(body.data.device_id!==leaseDevice||body.data.token!==leaseToken)){await route.fulfill({status:409,contentType:'application/json',body:'{"error":"device_lease_active"}'});return;}
          if(leaseExpires<=Date.now())epoch++;leaseDevice=body.data.device_id;leaseToken=body.data.token;leaseExpires=Date.now()+60000;value={epoch};
        }else{
          if(body.data.lease?.device_id!==leaseDevice||body.data.lease?.token!==leaseToken||body.data.lease?.epoch!==epoch)throw new Error('Browser command omitted the active lease');
          if(body.action==='lease.renew')leaseExpires=Date.now()+60000;
          if(body.action==='response.append'){sequence=Math.max(sequence,body.data.sequence);if(!responses.some(row=>row.sequence===body.data.sequence))responses.push({...body.data});}
          if(body.action==='attempt.submit')state='submitted';
        }
        receipts.set(key,value);result={data:{result:value,snapshot:snapshot()}};
      }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});return;
    }
    if(url.pathname.includes('/auth/v1/token')){
      const exp=Math.floor(Date.now()/1000)+3600;
      result={access_token:'eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:uid,exp,role:'authenticated'}))+'.test-signature',refresh_token:'synthetic-refresh',expires_in:3600,expires_at:exp,token_type:'bearer',user:{id:uid,aud:'authenticated',email:'candidate@example.test',app_metadata:{},user_metadata:{}}};
    }else if(url.pathname.endsWith('/candidate/registrations'))result={data:[{id:rid,tenant_id:tid,candidate_id:uid,required_services:['proctor']}]};
    else if(url.pathname.endsWith('/candidate/preparation'))result={data:{schema_version:'assessment.delivery-requirements.v1',prompt_media:[],response_tools:[],prompt_media_enabled:false}};
    else if(url.pathname.endsWith('/candidate/preflight'))result={data:{required:true,policy_id:policyId,title:'Institution browser monitoring',policy,consented,identity_verified:identityVerified,runtime_ready:captureReady,consent_version:'proctor.consent.v1'}};
    else if(url.pathname.endsWith('/candidate/session'))result={data:{session:{id:sid,state:state==='submitted'?'completed':state,policy_snapshot:policy},attempt:{state,deadline_at:deadline,section_deadline_at:deadline},notices:starts?[{id:noticeId,kind:'warning',reason:'Please remain on the assessment page.',issued_at:new Date().toISOString(),acknowledged}]:[],server_time:new Date().toISOString()}};
    else if(url.pathname.includes('/candidate/attempts/'))result={data:{id:aid,candidate_id:uid,required_services:['proctor'],state,last_sequence:sequence,section_index:0,deadline_at:deadline,section_deadline_at:deadline,server_time:new Date().toISOString(),responses,manifest:{schema_version:'assessment.manifest.v1',assessment_version_id:rid,title:'Placement',locale:'en',duration_seconds:600,section_count:1,sections:[{id:rid,title:'Mathematics',items:[{item_version_id:iid,section_id:rid,item:{schema_version:'assessment.item.v1',type:'single_choice',prompt:'Which number is prime?',locale:'en',max_score:1,tags:[],options:[{id:'a',text:'4'},{id:'b',text:'5'}]}}]}]}}};
    else if(url.pathname.endsWith('/commands')){
      const body=request.postDataJSON();commands.push(body.action);
      if(['response.append','section.advance','attempt.submit'].includes(body.action))throw new Error('Candidate bypassed the coordinator');
      if(body.action==='preparation.accept')consented=true;
      if(body.action==='attempt.start'){
        if(!consented||!identityVerified||!captureReady)throw new Error('Candidate bypassed required preparation');starts++;
      }
      if(body.action==='events.append'){
        if(denyEvents){await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic monitoring network failure"}'});return;}
        for(const event of body.data.events){
          if(Object.keys(event).sort().join(',')!=='kind,occurred_at,sequence')throw new Error('Browser included private data or elevated provenance');
          const key=body.data.stream_id+':'+event.sequence,serialized=JSON.stringify(event);
          if(received.has(key)&&received.get(key)!==serialized)throw new Error('Replay changed event contents');received.set(key,serialized);
        }
      }
      if(body.action==='notice.acknowledge')acknowledged=true;
      result={data:{id:aid}};
    }else result={data:[]};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto(`http://localhost:5192/?tenant_id=${tid}`);await page.getByLabel('Email',{exact:true}).fill('candidate@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-only-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Start or resume',exact:true}).click();await page.getByRole('heading',{name:'Exam monitoring policy',exact:true}).waitFor();
  if(await page.getByRole('button',{name:'Accept policy & refresh preparation',exact:true}).isEnabled())throw new Error('Unavailable capture runtime was not launch-blocked');
  await page.getByText(/This exam cannot start with weaker monitoring/).waitFor();if(starts!==0)throw new Error('Exam started before requirements were ready');
  await page.getByRole('button',{name:'Back to exam sittings',exact:true}).click();captureReady=true;
  await page.getByRole('button',{name:'Start or resume',exact:true}).click();
  if(await page.getByRole('button',{name:'Accept policy & refresh preparation',exact:true}).isEnabled())throw new Error('Consent not required');
  for(const [width,height] of [[1440,1000],[390,844]]){await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready.then(()=>null));if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Preparation overflow');await page.screenshot({path:'output/playwright/assessment-cloud/candidate-preflight-'+width+'.png',fullPage:true});}
  await page.setViewportSize({width:1440,height:1000});
  await page.getByLabel('I have read and accept this institution’s exam monitoring policy.',{exact:true}).check();
  await page.getByRole('button',{name:'Accept policy & refresh preparation',exact:true}).click();await page.getByText('Your acceptance of this policy has already been recorded.',{exact:true}).waitFor();if(starts!==0)throw new Error('Missing attended identity allowed launch');
  identityVerified=true;await page.getByRole('button',{name:'Refresh preparation',exact:true}).click();
  await page.getByRole('heading',{name:'Mathematics',exact:true}).waitFor();await page.getByText(/Browser monitoring · [1-9]/).waitFor();
  await page.evaluate(()=>document.dispatchEvent(new Event('copy')));await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();
  const scope=tid+':'+uid+':'+sid;
  const spool=await page.evaluate(scope=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('schood-proctor-journal');req.onerror=()=>reject(req.error);req.onsuccess=()=>{
      const db=req.result,entries=db.transaction('events').objectStore('events').index('scope').getAll(scope),key=db.transaction('keys').objectStore('keys').get(scope);let records,cryptoKey;
      const finish=()=>{if(records&&cryptoKey){db.close();resolve({ids:records.map(row=>row.id),encrypted:records.length>0&&records.every(row=>row.encrypted instanceof ArrayBuffer&&row.iv instanceof Uint8Array&&!('kind'in row)&&!('occurred_at'in row)),nonextractable:!cryptoKey.extractable});}};
      entries.onsuccess=()=>{records=entries.result;finish();};key.onsuccess=()=>{cryptoKey=key.result;finish();};
    };
  }),scope);
  if(!spool.encrypted||!spool.nonextractable)throw new Error('Monitoring spool/key protection failed');
  await page.reload();await page.getByRole('button',{name:'Start or resume',exact:true}).click();await page.getByRole('button',{name:'Start or resume assessment',exact:true}).click();
  await page.getByRole('heading',{name:'Mathematics',exact:true}).waitFor();denyEvents=false;await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();await page.getByText('Browser monitoring · Saved events synced',{exact:true}).waitFor();
  const oldStreams=spool.ids.map(id=>id.slice(scope.length+1));for(const key of oldStreams)if(!received.has(key))throw new Error('Old encrypted stream did not recover after reload');
  await page.getByRole('button',{name:'Acknowledge message',exact:true}).click();await page.getByText('Please remain on the assessment page.',{exact:true}).waitFor({state:'hidden'});if(!acknowledged)throw new Error('Warning acknowledgement missing');
  await page.getByRole('radio',{name:'5',exact:true}).check();await page.getByRole('button',{name:'Sync saved responses',exact:true}).click();await page.getByText('All saved responses synced',{exact:true}).waitFor();
  state='paused';await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();await page.getByRole('heading',{name:'Assessment paused',exact:true}).waitFor();if(await page.getByRole('radio',{name:'5',exact:true}).count())throw new Error('Paused attempt still accepts input');
  state='active';deadline=new Date(Date.now()+660000).toISOString();await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();await page.getByRole('heading',{name:'Mathematics',exact:true}).waitFor();if(!await page.getByRole('radio',{name:'5',exact:true}).isChecked())throw new Error('Pause/resume lost answer');
  for(const [width,height] of [[1440,1000],[768,1024],[390,844],[320,800]]){await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready.then(()=>null));if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Monitoring layout overflow at '+width);await page.screenshot({path:'output/playwright/assessment-cloud/candidate-monitored-'+width+'.png',fullPage:true});}
  await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await page.getByRole('button',{name:'Submit now',exact:true}).click();await page.getByRole('heading',{name:'Assessment submitted',exact:true}).waitFor();
  if(commands.filter(action=>action==='preparation.accept').length!==1)throw new Error('Consent was duplicated');if(errors.length)throw new Error(errors.join('; '));
  if(!runtimeCommands.includes('lease.acquire')||!runtimeCommands.includes('response.append')||!runtimeCommands.includes('attempt.submit'))throw new Error('Runtime gateway was not exercised');
  return {coordinatorCommands:true,consent:true,identityGate:true,captureGate:true,encryptedEvents:true,nonextractableKey:true,reloadedStreamsRecovered:true,warningAcknowledged:true,authoritativePauseResume:true,answerPreserved:true,submitted:true,layouts:'1440 / 768 / 390 / 320',proof:'Intercepted provider browser workflow; separate SQL/API tests cover authorization and transactions'};
}
