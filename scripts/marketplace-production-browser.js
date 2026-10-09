async (page) => {
  const bridge='http://127.0.0.1:61988',origin='https://schood.online';
  const assert=(value,message)=>{if(!value)throw Error(message);};
  let consumed=false,teacherContext,ownedListing,ownedApplication;
  const checks=[],errors=[],blockedWrites=[];
  try{
    const reply=await page.request.get(bridge+'/session');assert(reply.status()===200,'Exclusive QA bridge unavailable');
    const bootstrap=await reply.json();consumed=true;
    assert(bootstrap.ownerSession.user.app_metadata.qa_run_id===bootstrap.runId&&bootstrap.teacherSession.user.app_metadata.qa_run_id===bootstrap.runId,'Refusing non-owned sessions');
    const title='QA browser vacancy '+bootstrap.runId,teacherName='QA browser teacher '+bootstrap.runId;
    async function guard(context){
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url()),method=req.method();
        if(!['POST','PATCH','PUT','DELETE'].includes(method))return route.continue();
        if(url.origin===origin&&url.pathname==='/cdn-cgi/rum')return route.continue();
        if(url.pathname==='/functions/v1/platform-events')return route.continue();
        if(url.pathname==='/functions/v1/teacher-marketplace'){
          const body=req.postDataJSON();
          if(['teachers','jobs','get_my_profile','my_applications','manageable_tenants'].includes(body.action))return route.continue();
          if(body.action==='my_jobs'&&body.tenant_id===bootstrap.tenantId)return route.continue();
          if(body.action==='list_applications'&&[bootstrap.jobId,ownedListing].includes(body.job_id))return route.continue();
          if(body.action==='upsert_profile'&&body.full_name===teacherName)return route.continue();
          if(body.action==='post_job'&&body.tenant_id===bootstrap.tenantId&&body.title===title)return route.continue();
          if(ownedListing&&body.action==='apply'&&body.listing_id===ownedListing)return route.continue();
          if(ownedApplication&&body.action==='update_application_status'&&body.application_id===ownedApplication)return route.continue();
          if(ownedListing&&body.action==='close_job'&&body.job_id===ownedListing)return route.continue();
        }
        blockedWrites.push({path:url.pathname,method});return route.abort('blockedbyclient');
      });
    }
    const cookie=session=>({name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'.schood.online',path:'/',secure:true,sameSite:'Lax'});
    await guard(page.context());page.on('pageerror',error=>errors.push(error.name));
    await page.context().addCookies([cookie(bootstrap.ownerSession)]);
    await page.goto(origin+'/marketplace?tab=post');
    await page.getByRole('combobox',{name:'Academy',exact:true}).waitFor();
    assert(await page.getByRole('combobox',{name:'Academy',exact:true}).inputValue()===bootstrap.tenantId,'Exclusive academy not selected');
    await page.getByLabel('Job title',{exact:true}).fill(title);
    await page.getByLabel('Job description',{exact:true}).fill('Synthetic QA vacancy for the controlled teacher/employer journey.');
    await page.getByLabel('Minimum salary (UZS)',{exact:true}).fill('0');await page.getByLabel('Maximum salary (UZS)',{exact:true}).fill('0');
    const posting=page.waitForResponse(r=>r.url().endsWith('/teacher-marketplace')&&r.request().postDataJSON()?.action==='post_job');
    await page.getByRole('button',{name:'Publish job',exact:true}).click();
    const postReply=await posting,postData=await postReply.json();ownedListing=postData.job?.id;
    assert(postReply.status()===200&&typeof ownedListing==='string'&&postData.job.request_id===postReply.request().postDataJSON().request_id,'Published posting receipt not confirmed');
    await page.getByText('Job posting confirmed.',{exact:false}).waitFor();
    checks.push({case:'published-owner-posting-confirmed-in-exclusive-academy',passed:true});
    teacherContext=await page.context().browser().newContext();await guard(teacherContext);
    await teacherContext.addCookies([cookie(bootstrap.teacherSession)]);
    const teacher=await teacherContext.newPage();teacher.on('pageerror',error=>errors.push(error.name));
    await teacher.goto(origin+'/marketplace?tab=profile');
    await teacher.getByLabel('Full name',{exact:true}).waitFor();
    await teacher.getByRole('button',{name:'Save profile',exact:true}).waitFor();
    await teacher.getByLabel('Full name',{exact:true}).fill(teacherName);
    await teacher.getByRole('checkbox',{name:/Show my profile/}).uncheck();
    await teacher.getByRole('button',{name:'Save profile',exact:true}).click();
    await teacher.getByText('Profile save confirmed.',{exact:true}).waitFor();
    await teacher.getByText('Saved visibility: excluded from the public directory.',{exact:false}).waitFor();
    assert(await teacher.getByLabel('Hourly rate (UZS)',{exact:true}).inputValue()==='0','Zero hourly rate lost');
    checks.push({case:'published-teacher-profile-save-private-visibility-and-zero-retained',passed:true});
    await teacher.getByRole('button',{name:'Find jobs',exact:true}).click();
    const vacancy=teacher.getByRole('article',{name:title,exact:true});await vacancy.waitFor();
    await vacancy.getByLabel('Cover note for '+title,{exact:true}).fill('Synthetic original QA application note.');
    const applying=teacher.waitForResponse(r=>r.url().endsWith('/teacher-marketplace')&&r.request().postDataJSON()?.action==='apply');
    await vacancy.getByRole('button',{name:'Apply for this position',exact:true}).click();
    const applyReply=await applying,applyData=await applyReply.json();ownedApplication=applyData.application?.id;
    assert(applyReply.status()===200&&applyData.application?.listing_id===ownedListing&&applyData.application.status==='pending'&&typeof ownedApplication==='string','Published application receipt not confirmed');
    await teacher.getByText('Application confirmed.',{exact:false}).waitFor();
    checks.push({case:'published-teacher-owned-application-starts-pending',passed:true});
    await page.reload();
    await page.getByRole('button',{name:'Review applicants for '+title,exact:true}).click();
    await page.getByRole('region',{name:'Applicant review',exact:true}).waitFor();
    const applicant=page.getByRole('region',{name:'Applicant review',exact:true}).getByRole('article').filter({has:page.getByRole('heading',{name:teacherName,exact:true})});
    await applicant.getByText('Synthetic original QA application note.',{exact:true}).waitFor();
    const deciding=page.waitForResponse(r=>r.url().endsWith('/teacher-marketplace')&&r.request().postDataJSON()?.action==='update_application_status');
    await applicant.getByRole('button',{name:'Mark hired',exact:true}).click();
    const decisionReply=await deciding,decisionData=await decisionReply.json();
    assert(decisionReply.status()===200&&decisionData.application?.id===ownedApplication&&decisionData.application.status==='hired'&&decisionData.decision.request_id===decisionReply.request().postDataJSON().request_id,'Published hiring receipt not confirmed');
    await applicant.getByText('Status: hired',{exact:true}).waitFor();
    checks.push({case:'published-owner-reviews-original-note-and-confirms-hire',passed:true});
    await teacher.reload();await teacher.getByRole('article',{name:title,exact:true}).getByText('Application status: hired',{exact:true}).waitFor();
    await teacher.getByText('Synthetic original QA application note.',{exact:true}).waitFor();
    checks.push({case:'published-teacher-hiring-status-and-original-note-retained-after-reload',passed:true});
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});await teacher.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await teacher.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Published Marketplace overflow');}
    await page.setViewportSize({width:390,height:900});await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Support',exact:true}).waitFor();await page.keyboard.press('Escape');assert(await page.getByRole('button',{name:'Open menu',exact:true}).evaluate(button=>button===document.activeElement),'Burger focus not restored');
    await page.screenshot({path:'docs/customer-readiness/2026-10-09-marketplace-live-390.png',fullPage:true});
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'docs/customer-readiness/2026-10-09-marketplace-live-1280.png',fullPage:true});
    checks.push({case:'published-owner-and-teacher-fit-four-widths-and-burger-keyboard',passed:true});
    const closing=page.waitForResponse(r=>r.url().endsWith('/teacher-marketplace')&&r.request().postDataJSON()?.action==='close_job');
    await page.getByRole('button',{name:'Close listing: '+title,exact:true}).click();const closeReply=await closing,closeData=await closeReply.json();
    assert(closeReply.status()===200&&closeData.job?.id===ownedListing&&closeData.job.status==='closed','Published close receipt not confirmed');
    await page.getByText('Listing closed.',{exact:false}).waitFor();await teacher.reload();await teacher.getByRole('heading',{name:'My applications',exact:true}).waitFor();
    assert(await teacher.getByRole('article',{name:title,exact:true}).count()===0,'Closed listing remains on public board');
    await teacher.getByRole('heading',{name:title,exact:true}).waitFor();await teacher.getByText('Status: hired',{exact:true}).waitFor();
    checks.push({case:'published-closure-removes-public-listing-and-retains-owned-hiring-history',passed:true});
    assert(errors.length===0&&blockedWrites.length===0,'Unexpected browser error or application write');
    return {checkedAt:new Date().toISOString(),productionContacted:true,actualQaBrowserJourney:true,customerPrivateRecordsRead:0,customerRecordsChanged:0,checks,pageErrors:errors,blockedWrites};
  }finally{
    try{if(consumed){const response=await page.request.post(bridge+'/cleanup');assert(response.status()===200&&(await response.json()).cleaned===true,'Exclusive QA cleanup not confirmed');}}
    finally{await page.context().clearCookies();if(teacherContext){await teacherContext.clearCookies();await teacherContext.close();}}
  }
}
