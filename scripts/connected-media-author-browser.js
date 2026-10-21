async(page)=>{
 const endpoint='http://localhost:5911',config=await(await page.request.get(endpoint+'/test/config')).json(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.context().clearCookies();await page.setViewportSize({width:1440,height:1000});await page.goto(config.institution);
 async function login(name){await page.getByLabel('Email',{exact:true}).fill(name+'@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Question banks',exact:true}).click();await page.getByRole('heading',{name:'Question banks',exact:true}).waitFor();}
 await login('owner');if(!config.ids?.banks?.some(row=>row.title==='Media placement library')){await page.getByLabel('Bank name',{exact:true}).fill('Media placement library');await page.getByRole('button',{name:'Create bank',exact:true}).click();await page.getByText('Question bank created.',{exact:true}).waitFor();}
 await page.getByRole('button',{name:'Media library',exact:true}).click();
 for(const fixture of config.fixtures){
  if(config.ids?.artifacts?.some(row=>row.kind===fixture.kind&&row.state==='ready'))continue;
  await page.getByLabel('File (required, up to 2 GiB)',{exact:true}).setInputFiles({name:fixture.filename,mimeType:fixture.mime,buffer:Buffer.from(fixture.base64,'base64')});
  await page.getByRole('button',{name:'Upload and scan',exact:true}).click();await page.getByText('Upload received. It remains quarantined until scanning finishes.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Upload and scan',exact:true}).waitFor();
 }
 if(!config.fixtures.every(fixture=>config.ids?.artifacts?.some(row=>row.kind===fixture.kind&&row.state==='ready'))){
   let scanned=config.ids?.artifacts?.filter(row=>row.state==='ready').length??0;
   while(scanned<config.fixtures.length){const response=await page.request.post(endpoint+'/test/scan',{headers:{'x-fixture-control':config.control},data:{key:crypto.randomUUID()}});if(!response.ok())throw new Error('Real scanner broker did not accept a job');let receipt=await response.json();while(receipt.state==='running'){await page.waitForTimeout(1000);const status=await page.request.post(endpoint+'/test/scan-status',{headers:{'x-fixture-control':config.control},data:{id:receipt.id}});if(!status.ok())throw new Error('Scanner job status unavailable');const current=await status.json();if(current.id!==receipt.id)throw new Error('Scanner observation changed job identity');receipt=current;}if(receipt.state!=='complete'||receipt.scanned!==scanned+1||receipt.remaining!==config.fixtures.length-receipt.scanned)throw new Error('Scanner job did not advance exactly one canonical ready artifact');scanned=receipt.scanned;}
 }
 await page.getByRole('button',{name:'Refresh scan status',exact:true}).click();await page.getByText('Ready — scan passed',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Questions & review',exact:true}).click();
 const firstPrompt=config.imageResponses?'Select a point in the navy rectangle.':'Inspect the protected media samples.',secondPrompt=config.imageResponses?'Label the two pictured shapes.':'Second section without prior media.';
 async function create(prompt,media,type='single_choice'){
  await page.getByRole('textbox',{name:'Question prompt',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.question-editor fieldset').disabled);
  if(await page.getByRole('button',{name:'Discard saved device draft',exact:true}).count()){await page.getByRole('button',{name:'Discard saved device draft',exact:true}).click();await page.getByRole('button',{name:'Confirm device draft deletion',exact:true}).click();}
  await page.getByRole('combobox',{name:'Question bank',exact:true}).selectOption({label:'Media placement library'});await page.getByRole('textbox',{name:'Question prompt',exact:true}).fill(prompt);
  await page.getByRole('combobox',{name:'Question type',exact:true}).selectOption(type);
  if(type==='single_choice'){await page.getByRole('textbox',{name:'Option 1',exact:true}).fill('First response');await page.getByRole('textbox',{name:'Option 2',exact:true}).fill('Second response');await page.getByRole('radio',{name:'Correct option 1: First response',exact:true}).check();}
  const attached=config.imageResponses?config.fixtures.filter(row=>row.kind==='image'):config.fixtures;
  if(media)for(const [index,fixture]of attached.entries()){
   await page.getByRole('combobox',{name:'Scanned institution media',exact:true}).selectOption({label:`${fixture.filename} · ${fixture.kind}`});await page.getByRole('button',{name:'Attach selected media',exact:true}).click();
   await page.getByRole('textbox',{name:`${fixture.kind} alternative or transcript ${index+1} (required)`,exact:true}).fill(fixture.kind==='image'?'A navy rectangle and a blue circle on a cream background.':fixture.kind==='audio'?'Four seconds of a synthetic test tone.':'A four-second synthetic moving test pattern.');
  }
  if(config.imageResponses){
   await page.getByRole('combobox',{name:'Interaction image',exact:true}).selectOption({label:'Image 1: A navy rectangle and a blue circle on a cream background.'});
   if(type==='hotspot'){for(const [name,value]of [['Left','12.5'],['Top','22.2222'],['Right','37.5'],['Bottom','77.7778']])await page.getByRole('spinbutton',{name:`${name} (%) for target 1`,exact:true}).fill(value);await page.locator('.image-interaction-editor .image-private-targets rect').waitFor();}
   else{await page.getByRole('textbox',{name:'Response label 1',exact:true}).fill('Label 1');await page.getByRole('textbox',{name:'Accepted answer for Label 1',exact:true}).fill('rectangle\nnavy rectangle');await page.getByRole('button',{name:'Add response field',exact:true}).click();await page.getByRole('textbox',{name:'Response label 2',exact:true}).fill('Label 2');await page.getByRole('textbox',{name:'Accepted answer for Label 2',exact:true}).fill('circle\nblue circle');for(const [index,x]of [[1,'25'],[2,'71.875']]){await page.getByRole('spinbutton',{name:`Marker ${index} horizontal (%)`,exact:true}).fill(x);await page.getByRole('spinbutton',{name:`Marker ${index} vertical (%)`,exact:true}).fill('50');}}
  }
  await page.getByRole('button',{name:'Preview candidate question',exact:true}).click();await page.getByRole('heading',{name:'Candidate preview',exact:true}).waitFor();
  if(media){
   const preview=page.locator('.candidate-preview');await preview.getByRole('img').waitFor();
   if(!config.imageResponses){await preview.locator('audio').evaluate(element=>new Promise((resolve,reject)=>{if(element.readyState>=1)return resolve();element.onloadedmetadata=()=>resolve();element.onerror=()=>reject(new Error('Actual author audio load failed'));}));
   await preview.locator('video').evaluate(element=>new Promise((resolve,reject)=>{if(element.readyState>=1)return resolve();element.onloadedmetadata=()=>resolve();element.onerror=()=>reject(new Error('Actual author video load failed'));}));}
   if(config.imageResponses&&await preview.locator('.image-private-targets').count())throw new Error('Candidate preview contains private targets');
  }
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Question draft or saved request recorded.',{exact:true}).waitFor();
  const row=page.locator('.records > li').filter({has:page.getByText(prompt,{exact:true})});await row.getByRole('button',{name:'Submit for review',exact:true}).click();await page.getByText('Question submitted for review.',{exact:true}).waitFor();
 }
 await create(firstPrompt,true,config.imageResponses?'hotspot':'single_choice');await create(secondPrompt,config.imageResponses,config.imageResponses?'diagram_labeling':'single_choice');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('reviewer');await page.getByRole('button',{name:'Questions & review',exact:true}).click();
 for(const prompt of [firstPrompt,secondPrompt]){
  const row=page.locator('.records > li').filter({has:page.getByText(prompt,{exact:true})});await row.getByRole('button',{name:'Review question & key',exact:true}).click();await row.getByLabel('I reviewed the question, private key and any marking rubric.',{exact:true}).check();await row.getByRole('button',{name:'Approve reviewed question',exact:true}).click();await page.getByText('Question approved.',{exact:true}).waitFor();
 }
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('owner');await page.getByRole('button',{name:'Assessments',exact:true}).click();await page.getByRole('button',{name:'Create assessment',exact:true}).click();
 await page.getByLabel('Assessment title',{exact:true}).fill('Connected media assessment');await page.getByLabel('Overall time in seconds',{exact:true}).fill('600');await page.getByLabel('Section title 1',{exact:true}).fill('Protected media');await page.getByLabel('Section time in seconds 1',{exact:true}).fill('300');
 await page.getByRole('button',{name:`Add ${firstPrompt} (version 1) to section 1`,exact:true}).click();await page.getByRole('button',{name:'Add section',exact:true}).click();await page.getByLabel('Section title 2',{exact:true}).fill('Next section');await page.getByLabel('Section time in seconds 2',{exact:true}).fill('300');await page.getByRole('button',{name:`Add ${secondPrompt} (version 1) to section 2`,exact:true}).click();
 await page.getByRole('button',{name:'Save assessment draft',exact:true}).click();await page.getByText('Assessment change recorded. Published snapshots remain immutable.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Review publication of Connected media assessment',exact:true}).click();await page.getByLabel('I reviewed this working revision and its section rules.',{exact:true}).check();await page.getByRole('button',{name:'Publish immutable version',exact:true}).click();await page.getByText('Assessment change recorded. Published snapshots remain immutable.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Exam sittings',exact:true}).click();await page.getByLabel('Sitting title',{exact:true}).fill('Connected media sitting');await page.getByRole('combobox',{name:'Published assessment',exact:true}).selectOption({label:'Connected media assessment · 1'});
 const local=milliseconds=>{const date=new Date(milliseconds);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};await page.getByLabel('Opens at',{exact:true}).fill(local(Date.now()-60000));await page.getByLabel('Closes at',{exact:true}).fill(local(Date.now()+3600000));await page.getByRole('button',{name:'Schedule exam',exact:true}).click();await page.getByText('Exam sitting scheduled.',{exact:true}).waitFor();
 await page.getByRole('combobox',{name:'Sitting',exact:true}).selectOption({label:'Connected media sitting'});await page.getByLabel('Schood candidate account ID',{exact:true}).fill(config.candidate);await page.getByRole('button',{name:'Register candidate',exact:true}).click();await page.getByText('Candidate registered.',{exact:true}).waitFor();
 if(errors.length)throw new Error(errors.join('; '));return {realInstitutionUI:true,actualEncryptedR2Uploads:3,realScannerBroker:true,independentApproval:true,immutablePublication:true,scheduledCandidate:true,proof:'Actual apps/SDK/handlers/repositories/PostgreSQL/R2/ClamAV; local identity and PostgREST HTTP adapters, no hosted proof.'};
}
