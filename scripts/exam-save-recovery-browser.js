// Actual simulator routes with synthetic owned state. External traffic is blocked.
async(page)=>{
  const current=new URL(page.url()),origin=current.origin,app=current.searchParams.get('app')??({'60991':'sat','60992':'ielts','60993':'toefl','60994':'itep'})[current.port];
  if(!['sat','ielts','toefl','itep'].includes(app)||!origin.startsWith('http://127.0.0.1:'))throw Error('Local simulator QA origin required.');
  const actor='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',section='33333333-3333-4333-8333-333333333333',next='44444444-4444-4444-8444-444444444444',q='55555555-5555-4555-8555-555555555555',choice='66666666-6666-4666-8666-666666666666';
  const session={access_token:'qa.'+btoa(JSON.stringify({sub:actor}))+'.signature',refresh_token:'local-only',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,aud:'authenticated',role:'authenticated',email:'qa@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};
  await page.context().clearCookies();await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  const products={sat:'5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef',ielts:'ead05eae-aa97-4bda-a07c-51e5dbb062c0',toefl:'b262ffa8-9912-4eba-93d7-58af3164d1cc',itep:'a6c7887c-633c-4d88-8b70-397ed04dbbb1'};
  const initialPath='/session/'+sid+'/'+section;
  let serverAnswers={[choice]:{selected_option:'A'}}, failWrites=true, failCompletion=true, final=false, expired=false, writes=0, completions=0, external=0, slowRelease=null, delayNextWrite=false;
  const checks=[],errors=[],assert=(v,m)=>{if(!v)throw Error(m);};page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:session.user});
    if(url.pathname.startsWith('/functions/v1/')){
      if(url.pathname.endsWith('/exam-state')){
        const active=url.searchParams.get('section_id');
        const meta={type:'writing',duration_minutes:30};
        return route.fulfill({json:{session:{id:sid,status:'active',metadata:{strict_mode:false,instructions_acknowledged_at:new Date().toISOString(),identity_acknowledged_at:new Date().toISOString()},created_at:new Date().toISOString()},experience:{id:sid,name:'Synthetic recovery exam',product_id:products[app],metadata:{strict_mode:false}},sections:[{id:section,name:'Writing',display_order:1,metadata:meta},{id:next,name:'Next section',display_order:2,metadata:meta}],current_section:{id:active,name:active===section?'Writing':'Next section',display_order:active===section?1:2,metadata:meta},next_section_id:final||active===next?null:next,deadline_iso:new Date(Date.now()+(expired&&active===section?-1000:3600000)).toISOString(),units:[{id:q,part_id:section,part_name:'Task',part_order:1,type:'question_text',data:{prompt:'Write a short paragraph for this synthetic recovery test.',rows:5},display_order:1,metadata:{}},{id:choice,part_id:section,part_name:'Task',part_order:1,type:'question_single_choice',data:{prompt:'Choose the synthetic answer.',options:[{id:'A',label:'Saved A'},{id:'B',label:'New B'}]},display_order:2,metadata:{}}],answers:serverAnswers,server_time_iso:new Date().toISOString()}});
      }
      return route.fulfill({json:{user:session.user,entitlements:[{id:actor,resource_type:'product',resource_id:products[app]}],memberships:[],current_tenant:null,effective_product_ids:[products[app]],personal_product_ids:[products[app]],sponsored_product_ids:[],ok:true}});
    }
    if(url.pathname==='/rest/v1/responses'&&request.method()==='POST'){
      writes++;
      if(delayNextWrite){delayNextWrite=false;await new Promise(resolve=>{slowRelease=resolve;});}
      if(failWrites)return route.fulfill({status:503,json:{message:'Synthetic unavailable save'}});
      const payload=request.postDataJSON();for(const row of Array.isArray(payload)?payload:[payload])serverAnswers[row.content_unit_id]=row.data;
      return route.fulfill({status:201,json:[]});
    }
    if(url.pathname==='/rest/v1/sessions'&&request.method()==='PATCH'){
      completions++;
      return route.fulfill({status:failCompletion?503:204,...(failCompletion?{json:{message:'Synthetic unavailable completion'}}:{body:''})});
    }
    if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    if(url.origin===origin)return route.continue();external++;return route.abort();
  });
  const load=async()=>{await page.goto(origin+initialPath);await page.getByRole('textbox').first().waitFor();};
  const submit=async()=>{
    await page.getByRole('button',{name:final?'Finish':'Submit',exact:true}).click();
    if(app==='ielts'){
      const confirmation=page.getByPlaceholder('FINISH',{exact:true});
      if(await confirmation.count())await confirmation.fill('FINISH');
      await page.getByRole('button',{name:final?'Yes, finish exam':'Yes, submit section',exact:true}).click();
    }
  };
  await load();await page.getByRole('textbox').first().fill('Unsaved essay survives the reload.');
  await submit();await page.getByRole('alert').getByText('Your answers could not be saved.',{exact:false}).waitFor();
  assert(new URL(page.url()).pathname===initialPath&&completions===0,'Failed answer save advanced or completed the exam');
  checks.push({case:'failed-final-flush-keeps-section-open-with-explicit-retry',passed:true});
  await page.reload();await page.getByRole('button',{name:'Restore tab draft',exact:true}).waitFor();
  assert(await page.getByText('Some saved answers changed.',{exact:false}).count()===0,'A previously unanswered question was falsely labelled a server conflict');
  await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const recoveryViolations=await page.evaluate(async()=>(await axe.run(document.querySelector('[role="alert"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id));
  assert(recoveryViolations.length===0,'Recovery dialog accessibility: '+recoveryViolations.join(','));
  assert(await page.getByRole('textbox').first().getAttribute('readonly')!==null,'Unresolved recovery must prevent replacing either answer');
  await page.getByRole('button',{name:'Restore tab draft',exact:true}).click();
  assert(await page.getByRole('textbox').first().inputValue()==='Unsaved essay survives the reload.','Reload lost the unconfirmed draft');
  failWrites=false;await page.getByRole('button',{name:'Retry saving',exact:true}).click();
  await page.getByRole('alert').waitFor({state:'hidden'});
  assert(serverAnswers[q]?.text==='Unsaved essay survives the reload.','Recovered essay was not acknowledged by the server fixture');
  assert(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('schood:exam-draft:')).length)===0,'Acknowledged draft was not removed');
  checks.push({case:'reload-restores-private-tab-draft-and-removes-it-only-after-server-acknowledgement',passed:true});
  // Save B slowly, change back to the previously saved A, then submit. The old
  // fast path returned early on A and let delayed B become the final answer.
  delayNextWrite=true;await page.getByLabel('New B',{exact:true}).check();
  await page.waitForRequest(r=>r.url().includes('/rest/v1/responses')&&r.method()==='POST');
  await page.getByLabel('Saved A',{exact:true}).check();
  const submitted=submit();
  assert(new URL(page.url()).pathname===initialPath,'Slow write advanced before confirmation');
  assert(slowRelease,'Slow write control unavailable');slowRelease();await submitted;
  await page.waitForURL('**/'+next);
  assert(serverAnswers[choice]?.selected_option==='A','Earlier B overwrote the newer final A');
  checks.push({case:'slow-earlier-answer-cannot-overwrite-newer-final-answer-or-advance-prematurely',passed:true});
  await load();await page.getByRole('textbox').first().fill('Local conflict draft');
  serverAnswers[q]={text:'Server changed in another tab'};
  await page.reload();await page.getByText('Some saved answers changed.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Use server answers',exact:true}).click();
  assert(await page.getByRole('textbox').first().inputValue()==='Server changed in another tab','Discarding draft replaced the server answer');
  checks.push({case:'changed-server-answer-requires-explicit-recovery-choice',passed:true});
  final=true;await page.reload();await page.getByRole('textbox').first().waitFor();
  await submit();await page.getByRole('alert').getByText('Your answers are saved, but this attempt could not be completed.',{exact:false}).waitFor();
  assert(new URL(page.url()).pathname===initialPath&&completions===1,'Completion failure reported a successful result');
  checks.push({case:'failed-completion-keeps-original-section-and-offers-retry',passed:true});
  failCompletion=false;
  await page.getByRole('button',{name:'Retry submission',exact:true}).click();
  await page.getByRole('alert').getByText('Your answers are saved, but this attempt could not be completed.',{exact:false}).waitFor();
  assert(new URL(page.url()).pathname===initialPath&&completions===2,'An empty completion reply was accepted as confirmation');
  checks.push({case:'empty-session-update-reply-cannot-falsely-confirm-completion',passed:true});
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-08-'+app+'-save-failure-390.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-08-'+app+'-save-failure-1280.png',fullPage:true});
  final=false;await load();await page.getByRole('textbox').first().fill('Draft written before the timer ended.');
  failWrites=true;expired=true;await page.reload();await page.getByRole('button',{name:'Restore tab draft',exact:true}).waitFor();
  await page.getByRole('button',{name:'Restore tab draft',exact:true}).click();
  await page.getByRole('alert').getByText('Your answers could not be saved.',{exact:false}).waitFor();
  assert(new URL(page.url()).pathname===initialPath&&await page.getByRole('textbox').first().getAttribute('readonly')!==null,'Failed timed submission advanced or allowed post-deadline edits');
  assert(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('schood:exam-draft:')).length)===1,'Timed failure removed the unacknowledged draft');
  checks.push({case:'timed-submission-failure-retains-draft-and-respects-expired-edit-lock',passed:true});
  const beforeContinuation=writes;
  await page.getByRole('button',{name:'Continue with saved answers',exact:true}).click();
  await page.waitForURL('**/'+next);
  await page.getByText('Section 2 of 2',{exact:false}).waitFor();
  assert(writes===beforeContinuation&&completions===2&&serverAnswers[q]?.text!=='Draft written before the timer ended.','Timed continuation submitted an unconfirmed late answer');
  checks.push({case:'explicit-timed-continuation-verifies-saved-state-without-post-deadline-writes',passed:true});
  checks.push({case:'fresh-next-section-does-not-inherit-expired-timer-or-auto-submit',passed:true});
  expired=false;failWrites=false;
  await page.addInitScript(()=>{
    const value=sessionStorage;
    Object.defineProperty(window,'__qaDraftStorage',{value,configurable:true});
    Object.defineProperty(window,'sessionStorage',{get(){throw Error('Synthetic denied tab storage');},configurable:true});
  });
  await load();await page.getByRole('textbox').first().fill('Memory-only draft remains editable.');
  await page.getByRole('status').getByText('This browser cannot keep a reload recovery draft.',{exact:false}).waitFor();
  assert(await page.getByRole('textbox').first().inputValue()==='Memory-only draft remains editable.','Storage denial lost in-memory edits');
  checks.push({case:'denied-tab-storage-preserves-editing-with-explicit-reload-limit',passed:true});
  await page.evaluate(()=>{Object.defineProperty(window,'sessionStorage',{value:window.__qaDraftStorage,configurable:true});delete window.__qaDraftStorage;});
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Recovery viewport overflow at '+width);}
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-08-'+app+'-save-recovery-390.png',fullPage:true});
  assert(errors.length===0,'Unexpected player error: '+errors.join('; '));
  checks.push({case:'responsive-recovery-and-no-unhandled-page-errors',passed:true});
  return {checkedAt:new Date().toISOString(),app,productionContacted:false,checks,scopedRecoveryAxeViolations:recoveryViolations,syntheticWrites:writes,unhandledPageErrors:errors.length,blockedExternalRequests:external};
}
