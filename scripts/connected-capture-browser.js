async(page)=>{
 const base=new URL(page.url()).origin,info=await(await page.request.get(base+'/test/info')).json(),errors=[],opens=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('/capture/commands')&&request.postDataJSON()?.action==='capture.open')opens.push([request.headers()['idempotency-key'],request.postDataJSON()]);});
 const wait=async(predicate,message,limit=450)=>{for(let i=0;i<limit;i++){if(await predicate())return;await page.waitForTimeout(100);}throw new Error(message);};
 const proof=async()=>{const response=await page.request.get(base+'/test/capture-proof',{headers:{'x-fixture-control':info.control}});if(!response.ok())throw new Error('Canonical capture proof unavailable');return response.json();};
 await page.addInitScript(()=>{
  // Generated sources only. Never fall through to real browser hardware APIs.
  const fixture={calls:[],tracks:[],contexts:[],canvases:[]};window.__schoodSyntheticCapture=fixture;
  function video(source){const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');let frame=0;const timer=setInterval(()=>{ctx.fillStyle=source==='camera'?'#17304c':'#eee9db';ctx.fillRect(0,0,320,180);ctx.fillStyle='#d79442';ctx.fillRect((frame++*5)%260,30,60,80);ctx.fillStyle=source==='camera'?'white':'#17304c';ctx.font='20px sans-serif';ctx.fillText('SYNTHETIC '+source,14,150);},60);fixture.canvases.push(canvas);const stream=canvas.captureStream(15),track=stream.getVideoTracks()[0];if(source==='screen'){const settings=track.getSettings.bind(track);track.getSettings=()=>({...settings(),displaySurface:'monitor'});}track.addEventListener('ended',()=>clearInterval(timer));fixture.tracks.push({source,track});return stream;}
  Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>{fixture.calls.push('screen');return video('screen');}});
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{if(constraints.video){fixture.calls.push('camera');return video('camera');}fixture.calls.push('microphone');const context=new AudioContext(),osc=context.createOscillator(),destination=context.createMediaStreamDestination();osc.frequency.value=330;osc.connect(destination);osc.start();await context.resume();fixture.contexts.push(context);for(const track of destination.stream.getTracks())fixture.tracks.push({source:'microphone',track});return destination.stream;}});
 });
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/exam/?tenant_id=${info.tenant}`);
 await page.getByRole('textbox',{name:'Email',exact:true}).fill('candidate@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 const sitting=page.getByRole('listitem').filter({has:page.getByText('Native required capture',{exact:true})});await sitting.getByRole('button',{name:'Start or resume',exact:true}).click();await page.getByRole('heading',{name:'Exam monitoring policy',exact:true}).waitFor();
 if((await proof()).attempts!==0||await page.evaluate(()=>window.__schoodSyntheticCapture.calls.length)!==0)throw new Error('Preflight started a clock or requested hardware');
 const ack=page.getByRole('checkbox',{name:/I have read and accept this institution/});await ack.focus();await page.keyboard.press('Space');await page.getByRole('button',{name:'Accept policy & prepare capture',exact:true}).click();
 await page.getByText('Committed capture preparation reply lost',{exact:false}).first().waitFor();
 if((await proof()).attempts!==0)throw new Error('Lost preparation reply started an exam');
 await page.getByRole('button',{name:'Prepare required capture',exact:true}).click();await page.getByRole('button',{name:'Allow camera & record',exact:true}).waitFor();
 if(opens.length!==2||JSON.stringify(opens[0])!==JSON.stringify(opens[1]))throw new Error('Preparation retry changed the stable device/command identity');
 await page.getByRole('button',{name:'Allow camera & record',exact:true}).click();
 if(await page.getByRole('button',{name:'Start assessment with recording',exact:true}).count()||(await proof()).attempts!==0)throw new Error('Partial capture enabled academic start');
 await page.getByRole('button',{name:'Allow microphone & record',exact:true}).click();await page.getByRole('button',{name:'Allow entire screen & record',exact:true}).click();
 await wait(async()=>await page.getByRole('button',{name:'Start assessment with recording',exact:true}).count()===1,'All native capture sources never became ready');
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:900});await page.getByRole('heading',{name:'Required recording',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/capture/preparation-${width}.png`,fullPage:false});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('Capture preparation overflow at '+width);}
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'Start assessment with recording',exact:true}).click();await page.locator('.questions').waitFor();
 await wait(async()=>!await page.locator('.questions fieldset').first().isDisabled(),'Captured exam answer controls did not open');
 const radios=page.locator('.questions input[type=radio]');if(await radios.count())await radios.first().check();else{const textarea=page.locator('.questions textarea').first();await textarea.fill('Synthetic native capture response.');}
 await wait(async()=>(await proof()).responses>=1,'Actual answer did not reach PostgreSQL');
 // End only the generated camera. The app must immediately stop accepting new
 // answers and the independent server watchdog must eventually pause the clock.
 await page.evaluate(()=>{const row=window.__schoodSyntheticCapture.tracks.find(row=>row.source==='camera'&&row.track.readyState==='live');row.track.stop();row.track.dispatchEvent(new Event('ended'));});
 await wait(async()=>await page.locator('.questions fieldset:not([disabled])').count()===0,'Source loss did not disable answers');
 await page.getByRole('heading',{name:'Assessment paused',exact:true}).waitFor({timeout:45000});
 if((await proof()).attempt_state!=='paused')throw new Error('Capture pause was only local');
 const control=page.getByRole('button',{name:'Recover stopped recording',exact:true});await control.click();
 await page.getByText('Committed recording closure reply lost',{exact:false}).first().waitFor();await control.click();
 await wait(async()=>!await page.getByRole('button',{name:'Allow camera & record',exact:true}).isDisabled(),'Stopped camera container did not seal/recover');
 await page.getByRole('button',{name:'Allow camera & record',exact:true}).click();await wait(async()=>await page.getByText('All required sources are recording and recent saved media is confirmed.',{exact:false}).count()===1,'Paused native capture did not regain readiness');
 if((await proof()).attempt_state!=='paused')throw new Error('Media recovery automatically resumed the exam');
 const auth=await(await page.request.post(base+'/auth/v1/token?grant_type=password',{data:{email:'owner@example.test',password:'synthetic'}})).json(),current=await proof();
 const resumed=await page.request.post(base+'/functions/v1/proctor/commands?tenant_id='+info.tenant,{headers:{authorization:'Bearer '+auth.access_token,origin:base,'Idempotency-Key':'native-human-capture-resume'},data:{action:'session.resume',data:{session_id:current.session_id,reason:'Institution proctor confirms restored native recording'}}});
 if(!resumed.ok())throw new Error('Actual institution resume failed: '+await resumed.text());
 await page.locator('.questions').waitFor();await wait(async()=>!await page.locator('.questions fieldset').first().isDisabled(),'Human resume did not reopen answers');
 await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await page.getByRole('button',{name:'Submit now',exact:true}).click();await page.getByRole('heading',{name:'Assessment submitted',exact:true}).waitFor();
 await wait(()=>page.evaluate(()=>window.__schoodSyntheticCapture.tracks.every(row=>row.track.readyState==='ended')),'Terminal state left physical capture running');
 // All remaining final chunks and closure receipts must reach the canonical
 // manifest, not only disappear from the UI. Completed recovery uses no devices.
 await wait(async()=>(await proof()).recordings.every(row=>row.state==='sealed'),'Terminal recording closure did not finish');
 await page.screenshot({path:'output/playwright/capture/submitted-1440.png',fullPage:false});
 const final=await proof(),calls=await page.evaluate(()=>window.__schoodSyntheticCapture.calls);
 if(calls.join(',')!=='camera,microphone,screen,camera')throw new Error('Capture accessed unrequested sources or auto-requested permission: '+calls);
 if(errors.length)throw new Error(errors.join('\n'));
 return {...final,connected_capture:true,continuous_loss_pause:true,explicit_human_resume:true,lost_receipt_recovery:true,all_physical_tracks_stopped:true,synthetic_sources_only:true};
}
