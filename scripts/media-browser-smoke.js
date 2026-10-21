async(page)=>{
 const author='00000000-0000-4000-8000-'+String(Date.now()).slice(-12).padStart(12,'0'),reviewer='00000000-0000-4000-8000-000000000002',tenant='10000000-0000-4000-8000-000000000001',bank='20000000-0000-4000-8000-000000000001',artifact='30000000-0000-4000-8000-000000000001',version='40000000-0000-4000-8000-000000000001';
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAIklEQVR4nGP8/+ESAzUAE1VMGTVo1KBRg0YNGjVo1CCKAAB/uALxjJNMrgAAAABJRU5ErkJggg==','base64');
 const rows={'item-banks':[{id:bank,title:'Center placement library'}],'item-versions':[],rubrics:[],assessments:[],'assessment-versions':[]},assets=[],receipts=new Map(),keys=[],errors=[];
 let loseBegin=true,partCount=0,privateKey={},readDenied=false;
 const fulfill=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?{data}:data)});
 await page.unroute('https://assessment-tests.invalid/**');await page.unroute('https://media.schood.online/**');
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://assessment-tests.invalid/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname.includes('/auth/v1/token')){
   const name=request.postDataJSON().email.split('@')[0],uid=name==='reviewer'?reviewer:author,exp=Math.floor(Date.now()/1000)+3600;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:uid,exp,role:'authenticated'}))+'.synthetic',refresh_token:'synthetic',expires_in:3600,expires_at:exp,token_type:'bearer',user:{id:uid,aud:'authenticated',email:name+'@example.test',app_metadata:{},user_metadata:{}}})});return;
  }
  if(url.pathname.includes('/auth/v1/logout')){await route.fulfill({status:200,contentType:'application/json',body:'{}'});return;}
  const actor=JSON.parse(atob(request.headers().authorization.split('.')[1])).sub;
  if(url.pathname.endsWith('/workspaces'))return fulfill(route,[{tenant_id:tenant,role:'member',tenants:{name:'Media center'}}]);
  if(url.pathname.endsWith('/grading/access'))return fulfill(route,{can_read_banks:true,can_write_items:actor===author,can_approve_items:actor===reviewer,can_publish:false,can_manage_exams:false,can_mark:false,can_moderate:false,can_release:false});
  if(url.pathname.endsWith('/artifacts/library'))return fulfill(route,{items:assets,next_cursor:null});
  if(url.pathname.endsWith('/artifacts/commands')){
   const body=request.postDataJSON(),key=request.headers()['idempotency-key'];keys.push(key);
   if(body.action!=='upload.begin')throw new Error('Unexpected media command');
   if(!receipts.has(key)){
    if(body.data.parts.length!==1||body.data.parts[0].byte_length!==png.length||body.data.mime!=='image/png')throw new Error('Unpinned upload manifest');
    assets.push({id:artifact,created_by:actor,filename:body.data.filename,mime:body.data.mime,kind:'image',state:'uploading',byte_length:png.length});receipts.set(key,{id:artifact,state:'uploading'});
   }
   if(loseBegin){loseBegin=false;return fulfill(route,{code:'synthetic_lost_reply',error:'Upload reservation reply lost after commit.'},503);}
   return fulfill(route,receipts.get(key));
  }
  if(url.pathname.endsWith('/review'))return fulfill(route,{...rows['item-versions'][0],bank_id:bank,key:privateKey,review_hash:'reviewed-media-version'});
  if(url.pathname.endsWith('/commands')){
   const body=request.postDataJSON();
   if(body.action==='item.create'){
    if(actor!==author||assets[0].state!=='ready'||body.data.item.media[0].artifact_id!==artifact||!body.data.item.media[0].alt)throw new Error('Unready, unscoped or undescribed media attached');
    rows['item-versions'].push({id:version,item_id:version,version:1,status:'draft',created_by:actor,payload:body.data.item});privateKey=body.data.key;
   }else if(body.action==='item.submit')rows['item-versions'][0].status='review';
   else if(body.action==='item.approve'){
    if(actor!==reviewer||body.data.review_hash!=='reviewed-media-version')throw new Error('Independent media review missing');rows['item-versions'][0].status='approved';
   }else throw new Error('Unexpected question command '+body.action);
   return fulfill(route,{id:version});
  }
  return fulfill(route,rows[url.pathname.split('/').at(-1)]??[]);
 });
 await page.route('https://media.schood.online/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname.endsWith('/parts/0')){
   if(request.method()!=='PUT'||!request.headers().authorization||!request.postDataBuffer().equals(png))throw new Error('Part upload omitted exact bytes or bearer authority');partCount++;return fulfill(route,{artifact_id:artifact,index:0});
  }
  if(url.pathname.endsWith('/complete')){assets[0].state='quarantined';return fulfill(route,{id:artifact,state:'quarantined'});}
  if(request.method()!=='GET'||url.searchParams.get('tenant_id')!==tenant||url.searchParams.has('access_token'))throw new Error('Playback identity/scope leaked into URL');
  await route.fulfill({status:readDenied?403:200,contentType:readDenied?'application/json':'image/png',headers:{'access-control-allow-origin':'http://localhost:5193','access-control-allow-credentials':'true','cache-control':'no-store'},body:readDenied?'{"error":"Permission removed"}':png});
 });
 await page.context().clearCookies();await page.setViewportSize({width:1440,height:1000});await page.goto('http://localhost:5193/');
 async function login(name){await page.getByLabel('Email',{exact:true}).fill(name+'@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Question banks',exact:true}).click();await page.getByRole('heading',{name:'Question banks',exact:true}).waitFor();}
 await login('author');await page.getByRole('button',{name:'Media library',exact:true}).click();
 await page.getByLabel('File (required, up to 2 GiB)',{exact:true}).setInputFiles({name:'placement-diagram.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Upload and scan',exact:true}).click();await page.getByText('Upload reservation reply lost after commit.',{exact:true}).waitFor();
 const encrypted=await page.evaluate(scope=>new Promise((resolve,reject)=>{const req=indexedDB.open('schood-assessment-journal');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,read=db.transaction('entries').objectStore('entries').index('scope').getAll(scope);read.onsuccess=()=>{resolve(read.result.length===1&&read.result[0].encrypted instanceof ArrayBuffer&&!('response'in read.result[0]));db.close();};};}),`artifact-upload:${tenant}:${author}`);
 if(!encrypted)throw new Error('Saved upload metadata was not encrypted');
 await page.reload();await page.getByRole('button',{name:'Media library',exact:true}).click();await page.getByRole('heading',{name:'Resume your saved upload',exact:true}).waitFor();
 await page.getByLabel('File (required, up to 2 GiB)',{exact:true}).setInputFiles({name:'placement-diagram.png',mimeType:'image/png',buffer:Buffer.from([1,2,3])});await page.getByRole('button',{name:'Resume verified upload',exact:true}).click();await page.getByText('Reselect the original file and format to resume the saved upload, or cancel it first.',{exact:true}).waitFor();if(keys.length!==1||partCount)throw new Error('Changed file reached upload transport');
 await page.getByLabel('File (required, up to 2 GiB)',{exact:true}).setInputFiles({name:'placement-diagram.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Resume verified upload',exact:true}).click();await page.getByText('Upload received. It remains quarantined until scanning finishes.',{exact:true}).waitFor();if(keys.length!==2||keys[0]!==keys[1]||partCount!==1||assets.length!==1)throw new Error('Upload replay created a duplicate or changed identity');
 await page.getByRole('button',{name:'Questions & review',exact:true}).click();await page.getByRole('combobox',{name:'Scanned institution media',exact:true}).waitFor();if(await page.getByRole('option',{name:'placement-diagram.png · image',exact:true}).count())throw new Error('Quarantined artifact selectable');
 assets[0].state='ready';await page.getByRole('button',{name:'Refresh ready media',exact:true}).click();await page.getByRole('option',{name:'placement-diagram.png · image',exact:true}).waitFor({state:'attached'});
 await page.getByRole('combobox',{name:'Question bank',exact:true}).selectOption(bank);await page.getByLabel('Question prompt',{exact:true}).fill('Which color is shown in the diagram?');await page.getByLabel('Option 1',{exact:true}).fill('Cream');await page.getByLabel('Option 2',{exact:true}).fill('Blue');await page.getByRole('radio',{name:'Correct option 1: Cream',exact:true}).check();
 await page.getByRole('combobox',{name:'Scanned institution media',exact:true}).selectOption(artifact);await page.getByRole('button',{name:'Attach selected media',exact:true}).click();await page.getByLabel('image alternative or transcript 1 (required)',{exact:true}).fill('A square filled with pale cream color.');
 await page.getByRole('button',{name:'Preview candidate question',exact:true}).click();const image=page.getByRole('img',{name:'A square filled with pale cream color.',exact:true});await image.waitFor();await image.evaluate(element=>new Promise((resolve,reject)=>{if(element.complete){element.naturalWidth===24?resolve(true):reject(new Error('Image did not decode'));return;}element.addEventListener('load',()=>resolve(true),{once:true});element.addEventListener('error',()=>reject(new Error('Image playback failed')),{once:true});}));
 for(const [width,height] of [[1440,1000],[1024,768],[768,1024],[390,844],[320,800]]){await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready.then(()=>null));if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Media authoring overflow '+width);await page.screenshot({path:`output/playwright/assessment-cloud/media-authoring-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Question draft or saved request recorded.',{exact:true}).waitFor();await page.getByRole('button',{name:'Submit for review',exact:true}).click();await page.getByText('Question submitted for review.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();await login('reviewer');await page.getByRole('button',{name:'Questions & review',exact:true}).click();await page.getByRole('button',{name:'Review question & key',exact:true}).click();await page.getByRole('img',{name:'A square filled with pale cream color.',exact:true}).waitFor();
 await page.getByLabel('I reviewed the question, private key and any marking rubric.',{exact:true}).check();await page.getByRole('button',{name:'Approve reviewed question',exact:true}).click();await page.getByText('Question approved.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Media library',exact:true}).click();if(await page.getByRole('heading',{name:'Upload media',exact:true}).count())throw new Error('Read-only reviewer offered upload mutation');
 for(const [width,height] of [[1440,1000],[1024,768],[768,1024],[390,844],[320,800]]){await page.setViewportSize({width,height});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Media library overflow '+width);await page.screenshot({path:`output/playwright/assessment-cloud/media-library-${width}.png`,fullPage:true});}
 if(errors.length)throw new Error(errors.join('; '));return {encryptedUploadIdentity:true,sameKeyReloadRetry:true,changedFileBlocked:true,quarantineNotSelectable:true,scannedMediaAttachment:true,nativeImageDecode:true,independentQuestionReview:true,readOnlyMediaRole:true,layouts:'1440/1024/768/390/320',proof:'Actual browser/IndexedDB/Web Locks/SDK/image decoder; intercepted Auth/API/storage/scanner status, not hosted proof.'};
}
