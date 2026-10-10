// playwright-cli run-code --filename scripts/writing-tutor-browser-check.js
// Requires the Platform dev server on localhost:4291 with synthetic Supabase env.
async (page) => {
  const origin='http://127.0.0.1:4291';
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const actor='11111111-1111-4111-8111-111111111111';
  const session={access_token:'writing-qa',refresh_token:'writing-qa-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,aud:'authenticated',role:'authenticated',email:'qa@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};
  let legacy=false,historyFailure=false,quotaFailure=false,saveFailure=true;
  const calls=[];const results=[];
  const feedback={session_id:'saved-qa',exam_type:'itep',task_type:'task2',word_count:200,overall_band:6,criteria:{TR:6,CC:6,LR:6,GRA:6},strengths:['Clear argument'],improvements:['Add examples'],actionable_feedback:['Develop a paragraph'],feedback:'Keep developing your examples.',word_count_comment:'Enough words.',model:'synthetic',graded_at:'2026-10-03T12:00:00Z',quota:null};
  await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:session.user});
    if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    if(url.pathname.startsWith('/functions/v1/')) {
      if(url.pathname.endsWith('/writing-tutor')) {
        const action=url.searchParams.get('action');
        if(action==='quota')return route.fulfill({status:quotaFailure?503:200,json:quotaFailure?{error:'Allowance unavailable'}:{api_version:legacy?1:2,used:calls.length?1:0,limit:2,remaining:calls.length?1:2,has_paid_access:false,addon_available:false,enabled:true,attempts_remaining:5}});
        if(action==='history')return route.fulfill({status:historyFailure?503:200,json:historyFailure?{error:'History unavailable'}:{sessions:[]}});
        if(action==='grade'){calls.push(route.request().postDataJSON());return route.fulfill({status:saveFailure?503:200,json:saveFailure?{error:'Saved result could not be confirmed.',code:'save_unconfirmed'}:feedback});}
        if(action==='result')return route.fulfill({json:{status:'succeeded',result:feedback,request_id:url.searchParams.get('request_id')}});
      }
      return route.fulfill({json:{user:session.user,entitlements:[],effective_product_ids:[]}});
    }
    return url.origin===origin?route.continue():route.abort();
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/writing-tutor');
  await page.getByRole('heading',{name:'AI Writing Tutor'}).waitFor();
  assert(await page.getByRole('button',{name:'Open updates center'}).count()===0,'updates do not overlay focused grading recovery');
  const prompt=page.getByLabel('Writing task and source figures (required)');
  const essay=page.getByLabel('Your Essay *');
  await prompt.fill('Discuss the value of language learning.');
  const draft='Learning another language broadens communication and understanding. '.repeat(10);
  await essay.fill(draft);
  await page.getByLabel('Test Type').selectOption('itep');
  const grade=page.getByRole('button',{name:/Grade with AI/});
  await grade.click();
  await page.getByRole('button',{name:'Check saved result'}).waitFor();
  assert(calls.length===1,'one provider command');
  assert(/^[0-9a-f-]{36}$/.test(calls[0].request_id),'request identity');
  assert(await essay.inputValue()===draft,'draft preserved after failed save');
  assert(await grade.isDisabled(),'duplicate click blocked while unresolved');
  assert(!await page.getByText('View Plans',{exact:true}).count(),'no unrelated plan upgrade');
  for(const width of [320,390,768,1024,1440]) {
    await page.setViewportSize({width,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);
  }
  await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(async()=> (await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id));
  assert(violations.length===0,'accessibility violations: '+violations.join(','));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/writing-recovery-mobile.png',fullPage:true});
  results.push({case:'failed-save-draft-and-duplicate-protection',passed:true});
  await page.getByRole('button',{name:'Check saved result'}).click();
  await page.getByText('Keep developing your examples.',{exact:true}).waitFor();
  assert(calls.length===1,'status recovery must not regrade');
  const bars=await page.locator('.bg-emerald-500.h-2').evaluateAll(nodes=>nodes.map(node=>node.style.width));
  assert(bars.length===4&&bars.every(width=>width==='100%'),'iTEP criteria use six-point range');
  results.push({case:'saved-result-recovery-without-another-grade',passed:true});
  // Repeat the same payload: the page retains identity and the server can replay it.
  saveFailure=false;await grade.click();await page.getByText('Keep developing your examples.',{exact:true}).waitFor();
  assert(calls.length===2&&calls[0].request_id===calls[1].request_id,'same payload retains request identity');
  results.push({case:'same-payload-replay-identity',passed:true});
  // A pending reference survives reload without persisting private essay text.
  saveFailure=true;await essay.fill(draft+' More examples.');await grade.click();
  await page.getByRole('button',{name:'Check saved result'}).waitFor();
  const stored=await page.evaluate(key=>sessionStorage.getItem(key),'schood.writing-tutor.request.'+actor);
  assert(stored&&!stored.includes('Learning'),'receipt does not persist essay');
  await page.reload();await page.getByRole('button',{name:'Check saved result'}).waitFor();
  await page.getByRole('button',{name:'Check saved result'}).click();await page.getByText('Keep developing your examples.',{exact:true}).waitFor();
  assert(calls.length===3,'reload status recovery must not regrade');
  results.push({case:'reload-receipt-recovery',passed:true});
  historyFailure=true;await page.reload();await page.getByRole('button',{name:'Retry history'}).waitFor();
  assert(!await page.getByText('No saved feedback yet.',{exact:true}).count(),'failed history not false empty');
  results.push({case:'history-outage-is-explicit',passed:true});
  legacy=true;await page.reload();await page.getByText('Writing Tutor is being updated.',{exact:false}).waitFor();
  assert(await page.getByRole('button',{name:/Grade with AI/}).isDisabled(),'legacy backend must not accept unsafe request');
  results.push({case:'legacy-backend-grading-gate',passed:true});
  legacy=false;quotaFailure=true;await page.reload();await page.getByRole('button',{name:'Retry allowance'}).waitFor();
  assert(await page.getByRole('button',{name:/Grade with AI/}).isDisabled(),'quota outage disables grading');
  quotaFailure=false;historyFailure=false;await page.getByRole('button',{name:'Retry allowance'}).click();
  await page.getByRole('button',{name:'Retry history'}).click();
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'output/playwright/writing-desktop.png',fullPage:true});
  results.push({case:'quota-outage-and-recovery',passed:true});
  return {checkedAt:new Date().toISOString(),environment:'localhost synthetic APIs; no production/provider requests',results};
}
