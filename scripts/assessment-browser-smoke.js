async (page) => {
  await page.context().clearCookies();
  await page.setViewportSize({width:1440,height:1000});
  const uid='00000000-0000-4000-8000-000000000001',tid='10000000-0000-4000-8000-000000000001';
  const iid='20000000-0000-4000-8000-000000000001',bid='30000000-0000-4000-8000-000000000001',aid='40000000-0000-4000-8000-000000000001',vid='50000000-0000-4000-8000-000000000001',wid='60000000-0000-4000-8000-000000000001';
  const item={schema_version:'assessment.item.v1',type:'single_choice',locale:'en',prompt:'Which number is prime?',max_score:1,tags:['math'],options:[{id:'a',text:'4'},{id:'b',text:'5'}]};
  const rows={'item-banks':[],'item-versions':[],assessments:[],'assessment-versions':[],'exam-windows':[],registrations:[]};
  const commands=[];
  await page.route('https://assessment-tests.invalid/**',async route=>{
    const request=route.request(),url=new URL(request.url());let result;
    if(url.pathname.includes('/auth/v1/token')){
      const exp=Math.floor(Date.now()/1000)+3600;
      const access_token='eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:uid,exp,role:'authenticated'}))+'.test-signature';
      result={access_token,refresh_token:'synthetic-refresh',expires_in:3600,expires_at:exp,token_type:'bearer',user:{id:uid,aud:'authenticated',email:'author@example.test',app_metadata:{},user_metadata:{}}};
    }else if(url.pathname.endsWith('/grading/access'))result={data:{can_mark:true,can_moderate:true,can_release:true,can_read_banks:true,can_write_items:true,can_approve_items:true,can_publish:true,can_manage_exams:true}};
    else if(url.pathname.endsWith('/workspaces'))result={data:[{tenant_id:tid,role:'owner',tenants:{name:'Synthetic Academy'}}]};
    else if(url.pathname.endsWith('/artifacts/library'))result={data:{items:[],next_cursor:null}};
    else if(url.pathname.endsWith('/review'))result={data:{...rows['item-versions'][0],key:{correct:'b'},review_hash:'reviewed-hash'}};
    else if(url.pathname.endsWith('/commands')){
      const body=request.postDataJSON();commands.push(body.action);
      if(body.action==='bank.create')rows['item-banks'].push({id:bid,title:body.data.title});
      if(body.action==='item.create')rows['item-versions'].push({id:iid,item_id:iid,version:1,status:'draft',payload:body.data.item});
      if(body.action==='item.submit')rows['item-versions'][0].status='review';
      if(body.action==='item.approve')rows['item-versions'][0].status='approved';
      if(body.action==='assessment.create')rows.assessments.push({id:aid,title:body.data.definition.title,definition:body.data.definition,revision:1});
      if(body.action==='assessment.publish')rows['assessment-versions'].push({id:vid,version:1,definition:rows.assessments[0].definition});
      if(body.action==='window.create')rows['exam-windows'].push({id:wid,...body.data});
      if(body.action==='registration.create')rows.registrations.push({id:uid,...body.data});
      result={data:{id:uid}};
    }else result={data:rows[url.pathname.split('/').pop()]??[]};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto('http://localhost:5179/');
  await page.getByLabel('Email',{exact:true}).fill('author@example.test');
  await page.getByLabel('Password',{exact:true}).fill('synthetic-only-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Question banks',exact:true}).waitFor();
  await page.getByLabel('Bank name').fill('Mathematics placement');
  await page.getByRole('button',{name:'Create bank',exact:true}).click();
  await page.getByText('Question bank created.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Questions & review',exact:true}).click();
  await page.getByRole('combobox',{name:'Question bank',exact:true}).selectOption(bid);
  await page.getByRole('textbox',{name:'Question prompt',exact:true}).fill(item.prompt);
  await page.getByRole('textbox',{name:'Option 1',exact:true}).fill('4');
  await page.getByRole('textbox',{name:'Option 2',exact:true}).fill('5');
  await page.getByRole('radio',{name:'Correct option 2: 5',exact:true}).check();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await page.getByRole('button',{name:'Submit for review',exact:true}).click();
  await page.getByRole('button',{name:'Review question & key',exact:true}).click();
  await page.getByLabel('I reviewed the question, private key and any marking rubric.',{exact:true}).check();
  await page.getByRole('button',{name:'Approve reviewed question',exact:true}).click();
  await page.getByText('Question approved.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Assessments',exact:true}).click();
  await page.getByLabel('Assessment title',{exact:true}).fill('Entrance mathematics');
  await page.getByLabel('Which number is prime?',{exact:true}).check();
  await page.getByRole('button',{name:'Save assessment',exact:true}).click();
  await page.getByRole('button',{name:'Publish version',exact:true}).click();
  await page.getByText('Immutable assessment version published.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Exam sittings',exact:true}).click();
  await page.getByLabel('Sitting title',{exact:true}).fill('October sitting');
  await page.getByRole('combobox',{name:'Published assessment',exact:true}).selectOption(vid);
  await page.getByLabel('Opens at',{exact:true}).fill('2026-10-13T12:00');
  await page.getByLabel('Closes at',{exact:true}).fill('2026-10-13T18:00');
  await page.getByRole('button',{name:'Schedule exam',exact:true}).click();
  await page.getByText('Exam sitting scheduled.',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Sitting',exact:true}).selectOption(wid);
  await page.getByLabel('Schood candidate account ID',{exact:true}).fill(uid);
  await page.getByRole('button',{name:'Register candidate',exact:true}).click();
  await page.getByText('Candidate registered.',{exact:true}).waitFor();
  for(const [width,height] of [[1440,1000],[768,1024],[390,844]]){
    await page.setViewportSize({width,height});
    if(width<1024 && await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded')==='false')await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.evaluate(()=>document.fonts.ready.then(()=>null));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    if(overflow)throw new Error('Document overflow at '+width);
    await page.screenshot({path:'output/playwright/assessment-cloud/institution-'+width+'.png',fullPage:true});
  }
  return {commands,responsive:'1440 / 768 / 390: no document overflow',proof:'Mocked network UI workflow, not authenticated production proof'};
}
