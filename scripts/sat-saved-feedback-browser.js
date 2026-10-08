// Actual local Results screen, synthetic original records, external traffic blocked.
async(page)=>{
  const origin='http://127.0.0.1:4295',actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',qId='33333333-3333-4333-8333-333333333333';
  const session={access_token:'qa.'+btoa(JSON.stringify({sub:actor}))+'.signature',refresh_token:'local-qa',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,aud:'authenticated',role:'authenticated',email:'qa@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};
  await page.context().clearCookies();await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  const explanation='The theater kept the backdrop instead of discarding it. The other choices do not match the supplied context.';
  const question={id:qId,type:'question_single_choice',data:{prompt:'The theater discarded broken scenery but retained the painted backdrop. What does retained most nearly mean?',options:[{id:'A',label:'repaired'},{id:'B',label:'described'},{id:'C',label:'borrowed'},{id:'D',label:'kept'}]},correct:{option_id:'A',feedback:{explanation:'CHANGED CURRENT EXPLANATION'}},metadata:{},section_type:'reading_writing',domain:'vocabulary_in_context',difficulty:'easy'};
  const attempt={id,status:'scored',question_ids:[qId],answers:{[qId]:{selected_option:'A'}},scored_items:[{question_id:qId,correct:false,expected:{option_id:'D',feedback:{explanation}},answer:{selected_option:'A'}}],score_raw:0,score_accuracy:0,filters_used:{}};
  let mode='original',failed=false,providerCalls=0;const checks=[],errors=[],assert=(v,message)=>{if(!v)throw Error(message);};page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:session.user});
    if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    if(url.pathname.startsWith('/functions/v1/')){
      if(url.pathname.endsWith('/sat-practice/dashboard'))return route.fulfill({json:{goals:{target_score:1400,hours_per_week:4},activity:{streak_days:2,xp_total:40,weekly_minutes:20,weekly_goal_minutes:60,xp_week:40},mastery:[],plan_items:[],notebook:[],mastery_percent:0,score_impact:{conservative:0,optimistic:0,label:'Synthetic layout fixture'},plan_stale:false}});
      if(url.pathname.includes('/tutor/')){providerCalls++;return route.abort();}
      if(url.pathname.endsWith('/sat-practice/attempts/'+id))return route.fulfill({status:failed?503:200,json:failed?{error:'Saved results temporarily unavailable'}:{attempt:mode==='legacy'?{...attempt,score_raw:1,score_accuracy:1,answers:{[qId]:{selected_option:'D'}}}:mode==='malformed'?{...attempt,scored_items:[{question_id:qId,correct:'true'}]}:attempt,questions:[question],...(mode==='unknown'?{}:{legacy_result:mode==='legacy'})}});
      return route.fulfill({json:{user:session.user,entitlements:[],effective_product_ids:['2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010']}});
    }
    return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/results/'+id);await page.getByText(explanation,{exact:true}).waitFor();
  await page.getByRole('heading',{name:'0/1 correct',exact:true}).waitFor();
  assert(await page.getByText('D: kept',{exact:false}).count()===1,'Expected answer must come from original scored items');
  assert(await page.getByText('CHANGED CURRENT EXPLANATION',{exact:true}).count()===0,'Current edited keys must never replace saved explanations');
  await page.getByText('Your answer — incorrect',{exact:true}).waitFor();
  assert(await page.locator('.option-row.answer-incorrect').count()===1,'Incorrect saved choice must not keep the correct-answer green style');
  checks.push({case:'original-saved-outcome-and-explanation-without-current-key-or-ai',passed:true});
  question.correct={option_id:'C',feedback:{explanation:'SECOND CURRENT EDIT'}};
  await page.reload();await page.getByText(explanation,{exact:true}).waitFor();
  assert(await page.getByText('SECOND CURRENT EDIT',{exact:true}).count()===0,'Saved explanation must survive another bank revision');
  checks.push({case:'reload-after-content-revision-keeps-original-feedback',passed:true});
  mode='legacy';await page.reload();await page.getByRole('heading',{name:'1/1 correct',exact:true}).waitFor();
  await page.getByText('Your saved score is preserved.',{exact:false}).waitFor();
  assert(await page.getByRole('region',{name:'Saved answers',exact:true}).getByText('D',{exact:true}).count()===1,'Legacy recorded answer must remain readable');
  assert(await page.getByText(question.data.prompt,{exact:true}).count()===0&&await page.getByText(explanation,{exact:true}).count()===0,'Legacy result must not present current prompts or explanations as original');
  checks.push({case:'legacy-score-and-saved-answer-retained-without-fabricated-original-questions',passed:true});
  mode='unknown';await page.reload();await page.getByText('Your saved score is preserved.',{exact:false}).waitFor();
  assert(await page.getByText(explanation,{exact:true}).count()===0,'Missing source confirmation must fail closed');
  checks.push({case:'unconfirmed-source-uses-explicit-limited-history-view',passed:true});
  mode='malformed';await page.reload();await page.getByText('Your saved answer — outcome unavailable',{exact:true}).waitFor();
  assert(await page.locator('.option-row.selected.answer-unconfirmed').count()===1&&await page.getByText(explanation,{exact:true}).count()===0,'Malformed outcomes must not show correctness or current-key feedback');
  checks.push({case:'malformed-outcome-preserves-selected-answer-with-explicit-unconfirmed-status',passed:true});
  mode='original';failed=true;await page.reload();await page.getByRole('alert').getByText('Saved results temporarily unavailable',{exact:false}).waitFor();
  assert(await page.getByText(explanation,{exact:true}).count()===0,'Outage must clear stale feedback');
  failed=false;await page.getByRole('button',{name:'Retry loading results',exact:true}).click();await page.getByText(explanation,{exact:true}).waitFor();
  checks.push({case:'result-outage-clears-old-feedback-and-recovers-through-retry',passed:true});
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Results overflow at '+width);}
  await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(async()=>(await axe.run('main',{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id));assert(violations.length===0,'Results accessibility: '+violations.join(','));
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-08-sat-saved-feedback-390.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-08-sat-saved-feedback-1280.png',fullPage:true});
  assert(providerCalls===0&&errors.length===0,'Feedback must not call a provider or cause unhandled errors');
  checks.push({case:'accessible-responsive-saved-feedback-with-zero-provider-calls-or-page-errors',passed:true});
  await page.goto(origin+'/dashboard');await page.getByRole('heading',{name:'What should I do today to improve?',exact:true}).waitFor();
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    for(const selector of ['.kpi-grid','.two-col'])assert(await page.locator(selector).evaluate(el=>getComputedStyle(el).display==='grid'),'Card grid rule is broken: '+selector);
    const columns=await page.locator('.kpi-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert(columns===(width>980?3:1),'Dashboard grid did not respond to viewport');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Dashboard overflow at '+width);
  }
  await page.screenshot({path:'docs/customer-readiness/2026-10-08-sat-card-grid-1280.png',fullPage:true});
  assert(providerCalls===0&&errors.length===0,'Grid review caused provider calls or page errors');
  checks.push({case:'published-selector-collision-repair-restores-dashboard-grids-and-mobile-columns',passed:true});
  return {checkedAt:new Date().toISOString(),productionContacted:false,checks,accessibilityViolations:violations,providerCalls,unhandledPageErrors:errors.length};
}
