async (page) => {
  await page.context().clearCookies();
  await page.setViewportSize({width:1440,height:1000});
  const uid='00000000-0000-4000-8000-000000000003',tid='10000000-0000-4000-8000-000000000001',rid='70000000-0000-4000-8000-000000000001';
  const aid='80000000-0000-4000-8000-'+String(Date.now()).slice(-12).padStart(12,'0'),iid='20000000-0000-4000-8000-000000000001';
  let denySave=true,state='active',lastSequence=0,proctorCalls=0;const responses=[],runtimeCommands=[],receipts=new Map();
  let leaseDevice='',leaseToken='',epoch=0,leaseExpires=0,sectionIndex=0;
  const deadline=new Date(Date.now()+600000).toISOString();
  const handler=async route=>{
    const request=route.request(),url=new URL(request.url());let result;
    if(url.hostname==='coordinator-tests.invalid'){
      const snapshot=()=>({attempt_id:aid,state,deadline_at:deadline,section_deadline_at:deadline,closes_at:deadline,section_index:sectionIndex,last_sequence:lastSequence,lease_epoch:epoch||null,lease_expires_at:leaseExpires?new Date(leaseExpires).toISOString():null,server_time:new Date().toISOString(),next_deadline_at:state==='active'?deadline:null});
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
          if(body.action==='response.append'){
            if(denySave){await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic network failure; saved locally"}'});return;}
            if(!responses.some(row=>row.sequence===body.data.sequence))responses.push({item_version_id:body.data.item_version_id,response:body.data.response,sequence:body.data.sequence});lastSequence=Math.max(lastSequence,body.data.sequence);value={sequence:lastSequence};
          }
          if(body.action==='attempt.submit')state='submitted';
          if(body.action==='section.advance')sectionIndex++;
        }
        receipts.set(key,value);result={data:{result:value,snapshot:snapshot()}};
      }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});return;
    }
    if(url.pathname.includes('/functions/v1/proctor/')){proctorCalls++;await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Proctor is deliberately unavailable"}'});return;}
    if(url.pathname.includes('/auth/v1/token')){
      const exp=Math.floor(Date.now()/1000)+3600;
      result={access_token:'eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:uid,exp,role:'authenticated'}))+'.test-signature',refresh_token:'synthetic-refresh',expires_in:3600,expires_at:exp,token_type:'bearer',user:{id:uid,aud:'authenticated',email:'candidate@example.test',app_metadata:{},user_metadata:{}}};
    }else if(url.pathname.endsWith('/candidate/registrations'))result={data:[{id:rid,tenant_id:tid,candidate_id:uid}]};
    else if(url.pathname.endsWith('/candidate/preparation'))result={data:{schema_version:'assessment.delivery-requirements.v1',prompt_media:[],response_tools:[],prompt_media_enabled:false}};
    else if(url.pathname.endsWith('/candidate/preflight'))result={data:{required:false}};
    else if(url.pathname.endsWith('/candidate/session'))result={data:{session:null,attempt:{state,deadline_at:deadline,section_deadline_at:deadline},notices:[],server_time:new Date().toISOString()}};
    else if(url.pathname.includes('/candidate/attempts/'))result={data:{id:aid,candidate_id:uid,tenant_id:tid,state,last_sequence:lastSequence,section_index:sectionIndex,deadline_at:deadline,section_deadline_at:deadline,server_time:new Date().toISOString(),responses,manifest:{schema_version:'assessment.manifest.v1',assessment_version_id:rid,title:'Placement',locale:'en',duration_seconds:600,section_count:3,sections:[{id:rid,title:['Mathematics','Science','English'][sectionIndex],items:[{item_version_id:sectionIndex===0?iid:'20000000-0000-4000-8000-00000000000'+(sectionIndex+1),section_id:rid,item:{schema_version:'assessment.item.v1',type:'single_choice',prompt:sectionIndex===0?'Which number is prime?':'Choose the section-specific response.',locale:'en',max_score:1,tags:[],options:[{id:'a',text:'4'},{id:'b',text:'5'}]}}]}]}}};
    else if(url.pathname.endsWith('/commands')){
      const body=request.postDataJSON();
      if(['response.append','section.advance','attempt.submit'].includes(body.action))throw new Error('Candidate bypassed the coordinator');
      result={data:{id:aid,sequence:lastSequence}};
    }else result={data:[]};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  };
  await page.route(/^https:\/\/(assessment|coordinator)-tests\.invalid\//,handler);
  await page.goto(`http://localhost:5192/?tenant_id=${tid}`);
  await page.getByRole('textbox',{name:'Email',exact:true}).fill('candidate@example.test');
  await page.getByLabel('Password',{exact:true}).fill('synthetic-only-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Start or resume',exact:true}).click();
  await page.getByRole('heading',{name:'Mathematics',exact:true}).waitFor();
  await page.getByRole('radio',{name:'5',exact:true}).waitFor();
  const duplicate=await page.context().newPage();await duplicate.route(/^https:\/\/(assessment|coordinator)-tests\.invalid\//,handler);await duplicate.goto(page.url());await duplicate.getByRole('button',{name:'Start or resume',exact:true}).click();
  await duplicate.getByText('This assessment is already open in another tab. Close that tab before resuming here.',{exact:true}).waitFor();await duplicate.close();
  await page.getByRole('radio',{name:'5',exact:true}).check();
  await page.getByText('1 response awaiting sync',{exact:true}).waitFor();
  const encrypted=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('schood-assessment-journal');req.onerror=()=>reject(req.error);req.onsuccess=()=>{
      const db=req.result,entries=db.transaction('entries').objectStore('entries').getAll();
      entries.onsuccess=()=>{const valid=entries.result.every(row=>row.encrypted instanceof ArrayBuffer&&row.iv instanceof Uint8Array&&!('response' in row));db.close();resolve(valid);};
    };
  }));
  if(!encrypted)throw new Error('Response spool contains plaintext');
  await page.reload();
  await page.getByRole('button',{name:'Start or resume',exact:true}).click();
  await page.getByRole('heading',{name:'Mathematics',exact:true}).waitFor();
  if(!await page.getByRole('radio',{name:'5',exact:true}).isChecked())throw new Error('Encrypted response did not recover after reload');
  denySave=false;
  await page.getByRole('button',{name:'Sync saved responses',exact:true}).click();
  await page.getByText('All saved responses synced',{exact:true}).waitFor();
  if(responses.length!==1||responses[0].response!=='b')throw new Error('Response synchronization did not preserve the selected answer');
  for(const [width,height] of [[1440,1000],[390,844]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>document.fonts.ready.then(()=>null));
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Exam overflow at '+width);
    await page.screenshot({path:'output/playwright/assessment-cloud/candidate-'+width+'.png',fullPage:true});
  }
  await page.getByRole('button',{name:'Finish section & continue',exact:true}).click();await page.getByRole('button',{name:'Continue to next section',exact:true}).click();await page.getByRole('heading',{name:'Science',exact:true}).waitFor();
  if(await page.getByRole('radio',{name:'5',exact:true}).isChecked())throw new Error('The old answer leaked into the new section');
  // Simulate the canonical server alarm advancing to the third section; the browser must fetch its manifest.
  sectionIndex=2;await page.getByRole('heading',{name:'English',exact:true}).waitFor();
  if(await page.getByRole('heading',{name:'Science',exact:true}).count())throw new Error('Automatic section transition retained an old manifest');
  await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await page.getByRole('button',{name:'Submit now',exact:true}).click();
  await page.getByRole('heading',{name:'Assessment submitted',exact:true}).waitFor();
  if(proctorCalls!==0)throw new Error('Unmonitored exam depends on Proctor availability');
  if(!runtimeCommands.includes('lease.acquire')||!runtimeCommands.includes('response.append')||!runtimeCommands.includes('section.advance')||!runtimeCommands.includes('attempt.submit'))throw new Error('Runtime gateway was not exercised');
  return {coordinatorCommands:true,duplicateTabBlocked:true,encryptedSpool:true,recoveredAfterReload:true,synchronizedExactlyOnce:true,manualSection:true,automaticSection:true,submitted:true,proctorDependency:false,proof:'Mocked network browser flow; real server authorization is covered by separate SQL/API tests'};
}
