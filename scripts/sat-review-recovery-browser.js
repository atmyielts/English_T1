// Real local screens, synthetic APIs and blocked external traffic. No production writes.
async(page)=>{
  const origin='http://127.0.0.1:4293',actor='11111111-1111-4111-8111-111111111111',questionId='77777777-7777-4777-8777-777777777777',reviewId='88888888-8888-4888-8888-888888888888';
  const session={access_token:'qa.'+btoa(JSON.stringify({sub:actor}))+'.signature',refresh_token:'sat-qa-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,aud:'authenticated',role:'authenticated',email:'qa@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};
  await page.context().clearCookies();await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  const question={id:questionId,type:'question_numeric',data:{prompt:'What is six plus six?'},metadata:{},section_type:'math',domain:'algebra',difficulty:'easy'};
  let item={id:reviewId,section_type:'math',domain:'algebra',difficulty:'easy',source:'practice_lab',question_id:questionId,reason_tag:'unknown',mistake_pattern:'Algebra practice',coach_note:'Review the equation',status:'active',review_count:0};
  const plan={id:reviewId,task_type:'drill',payload:{section_type:'math',domain:'algebra',difficulty:'easy'},status:'pending',estimated_minutes:12};
  let failLoad=true,failStart=true,failPatch=true,failPlan=true,attemptId;
  const checks=[],starts=[],pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  const assert=(v,message)=>{if(!v)throw Error(message);};
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
    if(path.startsWith('/auth/v1/'))return route.fulfill({json:session.user});
    if(path.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    if(path.startsWith('/functions/v1/')){
      if(path.endsWith('/sat-practice/srs/due')||path.endsWith('/sat-practice/notebook')||path.endsWith('/sat-practice/plans/today'))return route.fulfill({status:failLoad?503:200,json:failLoad?{error:'Saved practice temporarily unavailable'}:{items:path.endsWith('/plans/today')?[plan]:[{...item,question}]}});
      if(path.endsWith('/sat-practice/notebook/'+reviewId)&&method==='PATCH'){
        if(failPatch)return route.fulfill({status:503,json:{error:'Reason tag could not be saved'}});
        item={...item,...route.request().postDataJSON()};return route.fulfill({json:{item}});
      }
      if(path.endsWith('/plans/regenerate'))return route.fulfill({status:failPlan?503:200,json:failPlan?{error:'Plan update temporarily unavailable'}:{items:[plan]}});
      if(path.endsWith('/attempts/start')||path.endsWith('/notebook/'+reviewId+'/retry')){
        const body=route.request().postDataJSON();starts.push({path,body});attemptId=body.request_id;await new Promise(done=>setTimeout(done,120));
        return route.fulfill({status:failStart?503:200,json:failStart?{error:'Drill start could not be confirmed. Retry the same selection.'}:{attempt:{id:attemptId},questions:[question]}});
      }
      if(path.endsWith('/attempts/'+attemptId))return route.fulfill({json:{attempt:{id:attemptId,status:'in_progress',question_ids:[questionId],answers:{}},questions:[question]}});
      return route.fulfill({json:{user:session.user,entitlements:[],effective_product_ids:['2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010']}});
    }
    return url.origin===origin?route.continue():route.abort();
  });
  for(const scenario of [
    {route:'/reviews',retry:'Retry loading reviews',start:'Start reviews',empty:'You are caught up.'},
    {route:'/notebook',retry:'Retry loading notebook',start:'Retry similar',empty:'No notebook entries yet.'},
    {route:'/today',retry:'Retry loading plan',start:'Start task',empty:'No tasks yet.'},
  ]){
    failLoad=true;failStart=true;await page.goto(origin+scenario.route);
    await page.getByRole('alert').getByText('Saved practice temporarily unavailable',{exact:false}).waitFor();
    assert(await page.getByText(scenario.empty,{exact:false}).count()===0,'Outage cannot fabricate an empty '+scenario.route);
    failLoad=false;await page.getByRole('button',{name:scenario.retry,exact:true}).click();
    const button=page.getByRole('button',{name:scenario.start,exact:true});await button.waitFor();
    if(scenario.route==='/notebook'){
      await page.getByRole('combobox',{name:'Reason tag',exact:true}).selectOption('careless');
      await page.getByRole('alert').getByText('Reason tag could not be saved',{exact:false}).waitFor();
      assert(await page.getByRole('combobox',{name:'Reason tag',exact:true}).inputValue()==='unknown','Failed tag write must keep confirmed tag');
      failPatch=false;await page.getByRole('combobox',{name:'Reason tag',exact:true}).selectOption('careless');
      await page.waitForFunction(()=>document.querySelector('select[aria-label="Reason tag"]')?.value==='careless'&&!document.querySelector('select[aria-label="Reason tag"]')?.disabled);
      checks.push({case:'notebook-tag-outage-preserves-confirmed-value-and-retries',passed:true});
    }
    if(scenario.route==='/today'){
      await page.getByRole('button',{name:'Regenerate plan',exact:true}).click();
      await page.getByRole('alert').getByText('Plan update temporarily unavailable',{exact:false}).waitFor();
      failPlan=false;await page.getByRole('button',{name:'Regenerate plan',exact:true}).click();
      await page.getByText('Drill algebra',{exact:true}).waitFor();
      checks.push({case:'today-plan-update-error-recovers-and-keeps-confirmed-plan',passed:true});
    }
    const before=starts.length;await button.evaluate(b=>{b.click();b.click();});
    await page.getByRole('alert').getByText('Drill start could not be confirmed.',{exact:false}).waitFor();
    assert(starts.length===before+1,'One pending start per '+scenario.route);const original=starts.at(-1);
    await page.reload();await page.getByRole('button',{name:scenario.start,exact:true}).waitFor();
    failStart=false;await page.getByRole('button',{name:scenario.start,exact:true}).click();await page.waitForURL('**/lab/'+original.body.request_id);
    await page.getByRole('textbox',{name:'Your answer',exact:true}).waitFor();
    assert(JSON.stringify(starts.at(-1))===JSON.stringify(original),'Retry after reload must retain request and selection on '+scenario.route);
    checks.push({case:scenario.route.slice(1)+'-loading-error-single-flight-and-reload-start-recovery',passed:true});
  }
  assert(pageErrors.length===0,'Unhandled browser errors: '+pageErrors.join(','));
  return {checkedAt:new Date().toISOString(),productionContacted:false,checks,unhandledBrowserErrors:pageErrors.length};
}
