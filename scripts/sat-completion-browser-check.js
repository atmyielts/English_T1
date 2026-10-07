// Actual local Lab/Results screens; identity and API are synthetic, with no external traffic.
async(page)=>{
  const origin='http://127.0.0.1:4293',actor='11111111-1111-4111-8111-111111111111',id='66666666-6666-4666-8666-666666666666',q='77777777-7777-4777-8777-777777777777';
  const session={access_token:'sat-qa',refresh_token:'sat-qa-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,aud:'authenticated',role:'authenticated',email:'qa@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};
  await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  const questions=[{id:q,type:'question_numeric',data:{prompt:'What is six plus six?'},metadata:{},section_type:'math',domain:'algebra',difficulty:'easy'}];
  let attempt={id,user_id:actor,status:'in_progress',question_ids:[q],answers:{[q]:{text:'7'}},score_raw:null,score_accuracy:null};
  let getFailure=false,submitFailure=true,slowGet=false,releaseGet=null;const calls=[],checks=[];
  const assert=(v,message)=>{if(!v)throw Error(message);};
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:session.user});
    if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    if(url.pathname.startsWith('/functions/v1/')){
      if(url.pathname.endsWith('/sat-practice/attempts/submit')){
        const body=route.request().postDataJSON();calls.push(body);await new Promise(resolve=>setTimeout(resolve,200));
        if(submitFailure)return route.fulfill({status:503,json:{error:'Submission could not be confirmed. Retry with the same answers.'}});
        attempt={...attempt,status:'scored',answers:body.answers,score_raw:1,score_accuracy:1};return route.fulfill({json:{attempt,questions}});
      }
      if(url.pathname.endsWith('/sat-practice/attempts/'+id)){
        if(slowGet)await new Promise(resolve=>{releaseGet=resolve;});
        return route.fulfill({status:getFailure?503:200,json:getFailure?{error:'Results temporarily unavailable'}:{attempt,questions}});
      }
      return route.fulfill({json:{user:session.user,entitlements:[],effective_product_ids:['2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010']}});
    }
    return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/lab/'+id);await page.getByLabel('Your answer',{exact:true}).waitFor();
  await page.getByLabel('Your answer',{exact:true}).fill('12');
  await page.getByRole('button',{name:'Submit drill',exact:true}).evaluate(el=>{el.click();el.click();});
  await page.getByRole('button',{name:'Retry submission',exact:true}).waitFor();assert(calls.length===1,'double click must send once');
  assert(await page.getByLabel('Your answer',{exact:true}).count()===0,'pending answers cannot be edited');await page.getByText('Your answer: 12',{exact:true}).waitFor();
  checks.push({case:'single-flight-and-uncertain-reply-freezes-exact-answers',passed:true});
  await page.reload();await page.getByRole('button',{name:'Retry submission',exact:true}).waitFor();await page.getByText('Your answer: 12',{exact:true}).waitFor();
  submitFailure=false;await page.getByRole('button',{name:'Retry submission',exact:true}).click();await page.getByRole('heading',{name:'1/1 correct',exact:true}).waitFor();
  assert(calls.length===2&&JSON.stringify(calls[0])===JSON.stringify(calls[1]),'reload retry must carry identical answers and attempt identity');
  assert(await page.evaluate(()=>sessionStorage.length)===0,'completed pending payload removed');
  checks.push({case:'reload-retry-preserves-payload-and-clears-completed-local-copy',passed:true});
  getFailure=true;await page.reload();await page.getByRole('button',{name:'Retry loading results',exact:true}).waitFor();
  assert(await page.getByRole('heading',{name:'0/0 correct',exact:true}).count()===0,'failure cannot present fabricated score');
  getFailure=false;await page.getByRole('button',{name:'Retry loading results',exact:true}).click();await page.getByRole('heading',{name:'1/1 correct',exact:true}).waitFor();
  checks.push({case:'results-outage-retry-without-fake-zero-score',passed:true});
  slowGet=true;const navigation=page.reload();await navigation;
  await page.getByText('Loading saved results…',{exact:true}).waitFor();assert(await page.getByRole('heading',{name:'0/0 correct',exact:true}).count()===0,'loading cannot present fabricated score');
  slowGet=false;releaseGet();await page.getByRole('heading',{name:'1/1 correct',exact:true}).waitFor();
  checks.push({case:'loading-state-withholds-unconfirmed-score',passed:true});
  attempt={...attempt,status:'in_progress',score_raw:null,score_accuracy:null};await page.reload();await page.getByText('This drill has no confirmed score yet.',{exact:false}).waitFor();
  assert(await page.getByRole('heading',{name:'0/1 correct',exact:true}).count()===0,'unsubmitted drill cannot display scored result');
  checks.push({case:'unsubmitted-result-links-back-to-drill',passed:true});
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow at '+width);}
  checks.push({case:'results-responsive-320-390-1280',passed:true});
  await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(async()=>(await axe.run('main',{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id));
  assert(violations.length===0,'Results accessibility: '+violations.join(','));
  return {productionContacted:false,checks,accessibilityViolations:violations};
}
