// CLI browser checks against Platform on localhost:4291; all service/audio behavior is synthetic.
async(page)=>{
  const origin='http://127.0.0.1:4291',actor='11111111-1111-4111-8111-111111111111';
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const session={access_token:'speaking-qa',refresh_token:'speaking-qa-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,aud:'authenticated',role:'authenticated',email:'qa@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};
  await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  await page.addInitScript(()=>{
    window.speechQa={starts:0,aborts:0,current:null,timers:new Set()};
    const interval=window.setInterval.bind(window),clear=window.clearInterval.bind(window);
    window.setInterval=(fn,ms,...args)=>{const id=interval(fn,ms,...args);if(ms===1000)window.speechQa.timers.add(id);return id;};
    window.clearInterval=id=>{window.speechQa.timers.delete(id);return clear(id);};
    window.SpeechRecognition=class {
      constructor(){window.speechQa.current=this;}
      start(){window.speechQa.starts++;}
      stop(){this.onend?.();}
      abort(){window.speechQa.aborts++;this.onend?.();}
    };
  });
  let legacy=false,quotaFailure=false,historyFailure=false,failSave=true;
  const calls=[],results=[];
  const feedback={session_id:'saved',assessment_scope:'transcript_only',overall_band:null,criteria:null,observations:{coherence:'Ideas follow a clear order.',vocabulary:'Specific words support the topic.',grammar:'Use consistent verb tenses.'},strengths:['Clear example'],improvements:['Explain your reasons'],feedback:'Develop the final example.',word_count:20};
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:session.user});
    if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    if(url.pathname.startsWith('/functions/v1/')){
      if(url.pathname.endsWith('/speaking-coach')){
        const action=url.searchParams.get('action');
        if(action==='quota')return route.fulfill({status:quotaFailure?503:200,json:quotaFailure?{error:'Allowance unavailable'}:{api_version:legacy?1:2,limit:2,remaining:1,used:1,attempts_remaining:5,has_paid_access:false,addon_available:false,enabled:true}});
        if(action==='history')return route.fulfill({status:historyFailure?503:200,json:historyFailure?{error:'History unavailable'}:{sessions:[{id:'old',topic:'Earlier practice',task_type:'part1',overall_band:9,assessment_scope:'legacy_unverified',word_count:45,created_at:'2026-10-03T12:00:00Z'}]}});
        if(action==='score'){calls.push(route.request().postDataJSON());return route.fulfill({status:failSave?503:200,json:failSave?{error:'Saved feedback could not be confirmed.'}:feedback});}
        if(action==='result')return route.fulfill({json:{status:'succeeded',result:feedback}});
      }
      return route.fulfill({json:{user:session.user,entitlements:[],effective_product_ids:[]}});
    }
    return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/speaking-coach');
  await page.getByRole('heading',{name:'AI Speaking Coach'}).waitFor();
  assert(await page.getByRole('button',{name:'Open updates center'}).count()===0,'updates do not overlay focused transcript recovery');
  const draft='My hometown has a beautiful park and a welcoming community.';
  const transcript=page.getByLabel('Your transcript',{exact:false});
  await transcript.fill(draft);await page.getByLabel('Topic or question').fill('Describe your hometown.');
  await page.getByRole('button',{name:'Start dictation'}).click();
  await page.evaluate(()=>window.speechQa.current.onresult({results:[{isFinal:true,0:{transcript:'There is also a library.'}}]}));
  assert(await transcript.inputValue()===draft+' There is also a library.','dictation preserves pre-existing text');
  await page.evaluate(()=>window.speechQa.current.onresult({results:[{isFinal:true,0:{transcript:'There is also a library.'}},{isFinal:true,0:{transcript:'People meet there.'}}]}));
  assert(await transcript.inputValue()===draft+' There is also a library. People meet there.','final results not duplicated');
  await page.getByRole('button',{name:'Stop dictation'}).click();
  assert(await page.evaluate(()=>window.speechQa.timers.size)===0,'natural end clears timer');
  results.push({case:'dictation-appends-and-cleans-up-on-end',passed:true});
  const preserved=await transcript.inputValue();
  await page.getByRole('button',{name:'Start dictation'}).click();
  await page.evaluate(()=>window.speechQa.current.onerror({error:'not-allowed'}));
  await page.getByText('Microphone permission was denied.',{exact:false}).waitFor();
  assert(await transcript.inputValue()===preserved,'permission failure preserves transcript');
  assert(await page.evaluate(()=>window.speechQa.timers.size)===0,'error clears timer');
  results.push({case:'microphone-denial-preserves-text-and-clears-timer',passed:true});
  const submit=page.getByRole('button',{name:'Get transcript feedback',exact:true});
  await submit.click();await page.getByRole('button',{name:'Check saved result'}).waitFor();
  assert(calls.length===1&&/^[0-9a-f-]{36}$/.test(calls[0].request_id),'one identified request');
  assert(await submit.isDisabled(),'no duplicate request while pending');
  assert(await transcript.inputValue()===preserved,'save error preserves transcript');
  for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);}
  await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(async()=>(await axe.run('main',{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id));
  assert(violations.length===0,'accessibility violations '+violations.join(','));
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/speaking-recovery-mobile.png',fullPage:true});
  results.push({case:'failed-save-mobile-recovery-and-accessibility',passed:true});
  await page.getByRole('button',{name:'Check saved result'}).click();await page.getByRole('region',{name:'Transcript feedback',exact:true}).waitFor();
  assert(calls.length===1,'saved result recovery does not regrade');
  assert(!await page.getByText('9.0',{exact:true}).count(),'legacy bands not displayed');
  assert(!await page.getByText('Overall Band',{exact:true}).count(),'no fabricated overall band');
  results.push({case:'transcript-only-feedback-and-safe-history',passed:true});
  failSave=false;await submit.click();await page.getByRole('region',{name:'Transcript feedback',exact:true}).waitFor();
  assert(calls[0].request_id===calls[1].request_id,'same payload reuses identity');
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/speaking-feedback-desktop.png',fullPage:true});
  results.push({case:'same-payload-replay',passed:true});
  failSave=true;await transcript.fill(preserved+' More details.');await submit.click();await page.getByRole('button',{name:'Check saved result'}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Check saved result'}).waitFor();await page.getByRole('button',{name:'Check saved result'}).click();await page.getByRole('region',{name:'Transcript feedback',exact:true}).waitFor();assert(calls.length===3,'reload recovery does not regrade');
  results.push({case:'reload-recovery',passed:true});
  legacy=true;await page.reload();await page.getByText('Speaking Coach is being updated.',{exact:false}).waitFor();assert(await submit.isDisabled(),'legacy API gate');
  legacy=false;quotaFailure=true;historyFailure=true;await page.reload();await page.getByRole('button',{name:'Retry allowance'}).waitFor();await page.getByRole('button',{name:'Retry history'}).waitFor();assert(await submit.isDisabled(),'quota outage gate');
  assert(!await page.getByText('No saved feedback yet.',{exact:true}).count(),'history outage is not empty');
  quotaFailure=false;historyFailure=false;await page.getByRole('button',{name:'Retry allowance'}).click();await page.getByRole('button',{name:'Retry history'}).click();
  results.push({case:'legacy-and-outage-gates',passed:true});
  await page.getByRole('button',{name:'Start dictation'}).click();
  const before=await page.evaluate(()=>window.speechQa.aborts);
  await page.evaluate(()=>{history.pushState({},'', '/');dispatchEvent(new PopStateEvent('popstate'));});
  await page.getByRole('heading',{name:'AI Speaking Coach'}).waitFor({state:'detached'});
  assert(await page.evaluate(()=>window.speechQa.aborts)>before,'unmount aborts microphone');
  assert(await page.evaluate(()=>window.speechQa.timers.size)===0,'unmount clears timer');
  results.push({case:'route-exit-aborts-dictation',passed:true});
  return {checkedAt:new Date().toISOString(),environment:'localhost synthetic service and speech engine; no microphone/provider/production calls',results};
}
