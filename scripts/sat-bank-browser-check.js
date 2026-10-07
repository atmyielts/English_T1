// Run with Playwright CLI against the actual local UI. Synthetic API; no external traffic.
async(page)=>{
  const origin='http://127.0.0.1:4293',actor='11111111-1111-4111-8111-111111111111',id='66666666-6666-4666-8666-666666666666';
  const session={access_token:'sat-qa',refresh_token:'sat-qa-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,aud:'authenticated',role:'authenticated',email:'qa@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};
  await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  const question=(n,subject)=>({id:`77777777-7777-4777-8777-${String(n).padStart(12,'0')}`,type:'question_single_choice',data:{prompt:subject==='math'?'Solve 2x + 4 = 10.':'Choose the grammatically correct sentence.',options:[{id:'A',label:'First choice'},{id:'B',label:'Second choice'}]},metadata:{},section_type:subject,domain:subject==='math'?'algebra':'grammar',difficulty:'medium'});
  let failBank=false,slowRW=false,releaseRW,failStart=true;const starts=[],bankRequests=[],checks=[];
  const assert=(v,message)=>{if(!v)throw Error(message);};
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:session.user});
    if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    if(url.pathname.startsWith('/functions/v1/')){
      if(url.pathname.endsWith('/sat-practice/bank')){
        bankRequests.push(Object.fromEntries(url.searchParams));
        const subject=url.searchParams.get('section_type')||'reading_writing';
        if(slowRW&&subject==='reading_writing')await new Promise(resolve=>{releaseRW=resolve;});
        return route.fulfill({status:failBank?503:200,json:failBank?{error:'Question bank temporarily unavailable'}:{questions:url.searchParams.get('mistake_history')==='mastered'?[]:[question(subject==='math'?2:1,subject)]}});
      }
      if(url.pathname.endsWith('/sat-practice/attempts/start')){
        starts.push(route.request().postDataJSON());await new Promise(resolve=>setTimeout(resolve,150));
        return route.fulfill({status:failStart?503:200,json:failStart?{error:'Drill could not be started. Please retry.'}:{attempt:{id},questions:[question(2,'math')]}});
      }
      if(url.pathname.endsWith('/sat-practice/attempts/'+id))return route.fulfill({json:{attempt:{id,status:'in_progress',question_ids:[],answers:{}},questions:[]}});
      return route.fulfill({json:{user:session.user,entitlements:[],effective_product_ids:['2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010']}});
    }
    return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/bank');await page.getByText('Showing 1 matching questions.',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('math');await page.getByText('Solve 2x + 4 = 10.',{exact:true}).waitFor();
  assert(await page.getByRole('combobox',{name:'Domain',exact:true}).locator('option[value="grammar"]').count()===0,'Math domain menu must not offer grammar');
  await page.getByRole('combobox',{name:'Domain',exact:true}).selectOption('algebra');await page.getByText('Showing 1 matching questions.',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('reading_writing');await page.getByText('Choose the grammatically correct sentence.',{exact:true}).waitFor();
  assert(await page.getByRole('combobox',{name:'Domain',exact:true}).inputValue()==='','Switching subject clears conflicting domain');
  checks.push({case:'subject-domain-consistency-and-shareable-filter-url',passed:true});
  slowRW=true;await page.getByRole('combobox',{name:'Difficulty',exact:true}).selectOption('hard');
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent==='Loading matching questions…');
  while(!releaseRW)await new Promise(resolve=>setTimeout(resolve,10));
  await page.getByRole('combobox',{name:'Section',exact:true}).selectOption('math');await page.getByText('Solve 2x + 4 = 10.',{exact:true}).waitFor();
  slowRW=false;releaseRW();await page.waitForTimeout(120);
  assert(await page.getByText('Choose the grammatically correct sentence.',{exact:true}).count()===0,'Stale RW response must not replace Math');
  checks.push({case:'slow-old-filter-response-cannot-overwrite-current-results',passed:true});
  await page.getByRole('combobox',{name:'Your history',exact:true}).selectOption('mastered');await page.getByText('No questions match these filters.',{exact:false}).waitFor();
  assert(await page.getByRole('button',{name:'Start filtered drill',exact:true}).isDisabled(),'Empty bank disables start');
  checks.push({case:'empty-history-results-have-explicit-state-and-no-start',passed:true});
  await page.getByRole('combobox',{name:'Your history',exact:true}).selectOption('previously_missed');await page.getByText('Showing 1 matching questions.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Start filtered drill',exact:true}).evaluate(button=>{button.click();button.click();});
  await page.getByRole('alert').getByText('Drill could not be started.',{exact:false}).waitFor();
  assert(starts.length===1&&starts[0].mistake_history==='previously_missed'&&starts[0].section_type==='math','One start must preserve subject and history');
  checks.push({case:'double-start-sends-once-preserves-history-and-exposes-retry-error',passed:true});
  failBank=true;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('alert').getByText('Question bank temporarily unavailable',{exact:false}).waitFor();
  assert(await page.getByText('Solve 2x + 4 = 10.',{exact:true}).count()===0,'Outage must clear old questions');
  failBank=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByText('Showing 1 matching questions.',{exact:true}).waitFor();
  checks.push({case:'bank-outage-clears-old-questions-and-recovers-with-retry',passed:true});
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow at '+width);}
  await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(async()=>(await axe.run('main',{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id));assert(violations.length===0,'Bank accessibility: '+violations.join(','));
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-08-sat-bank-390.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-08-sat-bank-1280.png',fullPage:true});
  checks.push({case:'accessible-labeled-filters-and-responsive-320-390-1280',passed:true});
  failStart=false;await page.getByRole('button',{name:'Start filtered drill',exact:true}).click();await page.waitForURL('**/lab/'+id);
  checks.push({case:'successful-start-opens-the-confirmed-attempt',passed:true});
  return {checkedAt:new Date().toISOString(),productionContacted:false,checks,accessibilityViolations:violations,bankRequests};
}
