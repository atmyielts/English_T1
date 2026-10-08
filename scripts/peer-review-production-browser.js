async (page) => {
  const bridge='http://127.0.0.1:61987',origin='https://schood.online';
  const assert=(value,message)=>{if(!value)throw Error(message);};
  let consumed=false,reviewerContext,ownedId;
  const checks=[],errors=[],blockedWrites=[];
  try{
    const reply=await page.request.get(bridge+'/session');assert(reply.status()===200,'Exclusive QA bridge unavailable');
    const bootstrap=await reply.json();consumed=true;
    assert(bootstrap.authorSession.user.app_metadata.qa_run_id===bootstrap.runId&&bootstrap.reviewerSession.user.app_metadata.qa_run_id===bootstrap.runId,'Refusing non-owned QA sessions');
    const marker='QA_PEER_UI_'+bootstrap.runId;
    async function guard(context){
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url()),method=req.method();
        if(!['POST','PATCH','PUT','DELETE'].includes(method))return route.continue();
        if(url.origin===origin&&url.pathname==='/cdn-cgi/rum')return route.continue();
        if(url.pathname==='/functions/v1/platform-events')return route.continue();
        if(url.pathname==='/functions/v1/peer-review'){
          const body=req.postDataJSON();
          if(['my_submissions','my_reviews','queue','get_submission'].includes(body.action))return route.continue();
          if(body.action==='submit'&&body.prompt_text===marker&&body.essay_text.startsWith('Synthetic QA English practice.'))return route.continue();
          if(ownedId&&body.submission_id===ownedId&&['claim_submission','submit_review','set_sharing','release_submission'].includes(body.action))return route.continue();
        }
        blockedWrites.push({path:url.pathname,method});return route.abort('blockedbyclient');
      });
    }
    await guard(page.context());
    page.on('pageerror',error=>errors.push(error.name));
    await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(bootstrap.authorSession)),domain:'.schood.online',path:'/',secure:true,sameSite:'Lax'}]);
    await page.goto(origin+'/peer-review');
    await page.getByRole('button',{name:'Submit essay',exact:true}).waitFor();
    await page.getByRole('button',{name:'Submit essay',exact:true}).click();
    await page.getByRole('textbox',{name:'Question (optional)',exact:true}).fill(marker);
    await page.getByRole('textbox',{name:'Your essay',exact:true}).fill('Synthetic QA English practice. '.repeat(12));
    assert(await page.getByRole('button',{name:'Submit for peer review',exact:true}).isDisabled(),'Consent not required');
    await page.getByRole('checkbox').check();
    const responsePromise=page.waitForResponse(r=>r.url().endsWith('/peer-review')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='submit');
    await page.getByRole('button',{name:'Submit for peer review',exact:true}).click();
    const response=await responsePromise,result=await response.json();
    const sent=response.request().postDataJSON();ownedId=result.submission?.id;
    assert(response.status()===200&&result.submission?.request_id===sent.request_id&&typeof ownedId==='string','Owned UI submission receipt not confirmed');
    await page.getByText('Your essay is shared with the review pool.',{exact:false}).waitFor();
    checks.push({case:'published-author-explicit-consent-and-owned-save-receipt',passed:true});
    reviewerContext=await page.context().browser().newContext();await guard(reviewerContext);
    await reviewerContext.addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(bootstrap.reviewerSession)),domain:'.schood.online',path:'/',secure:true,sameSite:'Lax'}]);
    const reviewer=await reviewerContext.newPage();reviewer.on('pageerror',error=>errors.push(error.name));
    await reviewer.goto(origin+'/peer-review');
    await reviewer.getByRole('button',{name:'Review queue',exact:true}).click();
    const row=reviewer.locator('article[data-submission-id="'+ownedId+'"]');
    await row.getByRole('button',{name:'Reserve review',exact:true}).click();
    await reviewer.getByRole('region',{name:'Review editor',exact:true}).waitFor();
    await reviewer.getByText('Synthetic QA English practice.',{exact:false}).waitFor();
    checks.push({case:'published-reviewer-reserves-only-controlled-owned-essay',passed:true});
    await reviewer.getByRole('textbox',{name:'Overall feedback',exact:true}).fill('Synthetic QA feedback: clear practice structure.');
    await reviewer.getByLabel('Practice score').fill('6.5');
    await reviewer.getByRole('button',{name:'Submit review',exact:true}).click();
    await reviewer.getByText('Your feedback has been saved.',{exact:false}).waitFor();
    checks.push({case:'published-assigned-reviewer-feedback-save-confirmed',passed:true});
    await page.reload();
    const own=page.locator('article[data-submission-id="'+ownedId+'"]');
    await own.getByText('Synthetic QA feedback: clear practice structure.',{exact:true}).waitFor();
    await own.getByText('Peer practice score: 6.5',{exact:true}).waitFor();
    await own.getByText('1/2 reviews',{exact:false}).waitFor();
    checks.push({case:'published-author-original-feedback-and-count-retained',passed:true});
    await own.getByRole('button',{name:'Stop sharing',exact:true}).click();
    await page.getByText('Sharing stopped.',{exact:false}).waitFor();
    await page.locator('article[data-submission-id="'+ownedId+'"]').getByText('Private',{exact:false}).waitFor();
    checks.push({case:'published-author-can-withdraw-and-see-private-state',passed:true});
    for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Published peer page overflow');}
    await page.setViewportSize({width:390,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-08-peer-review-live-390.png',fullPage:true});
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-08-peer-review-live-1280.png',fullPage:true});
    checks.push({case:'published-peer-page-fits-320-390-1280',passed:true});
    assert(errors.length===0&&blockedWrites.length===0,'Unexpected browser error or application write');
    return {checkedAt:new Date().toISOString(),productionContacted:true,actualQaBrowserJourney:true,customerEssaysRead:0,customerRecordsChanged:0,checks,pageErrors:errors,blockedWrites};
  }finally{
    // Clear both cookie stores even if cleanup fails; cleanup independently covers all actors.
    try{if(consumed){const response=await page.request.post(bridge+'/cleanup');assert(response.status()===200&&(await response.json()).cleaned===true,'Owned QA cleanup not confirmed');}}
    finally{await page.context().clearCookies();if(reviewerContext){await reviewerContext.clearCookies();await reviewerContext.close();}}
  }
}
