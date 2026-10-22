async(page)=>{
 const endpoint='http://localhost:5911',config=await(await page.request.get(endpoint+'/test/config')).json(),errors=[];let sawPublicManifest=false,stateRequests=0;
 page.on('request',request=>{if(request.url().includes('/attempts/')&&request.url().includes('/state?'))stateRequests++;});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',async response=>{if(response.url().includes('/candidate/attempts/')&&response.ok()){const payload=await response.json();if(payload.data.manifest.sections.length!==1||JSON.stringify(payload.data.manifest).includes('correct'))errors.push('Candidate manifest leaked future content or keys');else sawPublicManifest=true;}});
 await page.setViewportSize({width:1440,height:1000});await page.goto(config.institution);await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('textbox',{name:'Email',exact:true}).waitFor();await page.goto(`${config.exam}/?tenant_id=${config.tenant}`);
 async function login(target,name){await target.getByRole('textbox',{name:'Email',exact:true}).fill(name+'@example.test');await target.getByLabel('Password',{exact:true}).fill('synthetic-only');await target.getByRole('button',{name:'Sign in',exact:true}).click();}
 await login(page,'candidate');await page.getByRole('button',{name:'Start or resume',exact:true}).click();await page.getByRole('heading',{name:'Protected media',exact:true}).waitFor();
 async function ready(){
  await page.waitForFunction(()=>document.querySelector('img.question-media-image')?.complete||document.querySelector('.question-media img')?.naturalWidth===320);
  await page.waitForFunction(()=>{const audio=document.querySelector('.question-media audio'),video=document.querySelector('.question-media video');return audio?.readyState>=1&&video?.readyState>=1;});
  const state=await page.locator('.question-media audio,.question-media video').evaluateAll(elements=>elements.map(element=>({duration:element.duration,credentials:element.crossOrigin,autoplay:element.autoplay})));
  if(state.length!==2||state.some(row=>row.duration<3.9||row.duration>4.1||row.credentials!=='use-credentials'||row.autoplay))throw new Error('Candidate media metadata/credential/no-autoplay contract failed');
 }
 async function play(){
  await ready();await page.locator('.question-media audio,.question-media video').evaluateAll(async elements=>{for(const element of elements){element.muted=true;element.loop=true;await element.play();}});
  await page.waitForFunction(()=>[...document.querySelectorAll('.question-media audio,.question-media video')].every(element=>!element.paused&&element.currentTime>0.1));
  const frames=await page.locator('.question-media video').evaluate(element=>element.getVideoPlaybackQuality().totalVideoFrames);if(frames<1)throw new Error('Video metadata loaded without decoding playback frames');
 }
 await play();
 const sources=await page.locator('.question-media img,.question-media audio,.question-media video').evaluateAll(elements=>elements.map(element=>element.src));
 if(sources.some(source=>new URL(source).searchParams.has('access_token')||!new URL(source).searchParams.get('attempt_id')))throw new Error('Candidate playback leaked bearer URLs or lacked attempt binding');
 await page.getByRole('radio',{name:'First response',exact:true}).check();await page.getByText('1 response awaiting sync',{exact:true}).waitFor();await page.getByRole('button',{name:'Sync saved responses',exact:true}).click();await page.getByText('All saved responses synced',{exact:true}).waitFor();
 for(const [width,height]of [[1440,1000],[1024,768],[768,1024],[390,844],[320,800]]){await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready.then(()=>{window.scrollTo(0,0);}));if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Connected media candidate overflow '+width);await page.screenshot({path:`output/playwright/assessment-cloud/connected-media-candidate-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
 async function retain(){await page.locator('.question-media audio,.question-media video').evaluateAll(elements=>{window.__retainedPlayers=elements;});}
 async function released(){await page.waitForFunction(()=>window.__retainedPlayers?.length===2&&window.__retainedPlayers.every(element=>element.paused&&!element.getAttribute('src')));}
 async function control(operation){const response=await page.request.post(endpoint+'/test/state',{headers:{'x-fixture-control':config.control},data:{operation}});if(!response.ok())throw new Error('Fixture state transition failed');}
 await retain();await control('pause');await page.getByRole('heading',{name:'Assessment paused',exact:true}).waitFor();await released();if((await page.request.get(sources[0])).status()!==404)throw new Error('Paused candidate retained media authorization');
 await control('resume');await page.getByRole('heading',{name:'Protected media',exact:true}).waitFor();await play();if(!await page.getByRole('radio',{name:'First response',exact:true}).isChecked())throw new Error('Pause discarded the saved answer');
 // A real canonical lease change, not a mocked ready flag, must stop players.
 await retain();await control('lease-loss');await page.getByText('Question media is unavailable while this sitting is paused or disconnected from its active lease.',{exact:true}).waitFor();await released();
 // Another device now holds the attempt: this device never takes it back without the candidate (TIME-02).
 await page.getByRole('heading',{name:'Continue on this device?',exact:true}).waitFor({timeout:90000});await page.getByRole('button',{name:'Continue on this device',exact:true}).click();
 await page.locator('.question-media video').waitFor({timeout:90000});await play();
 // Shared cookies change across different service origins (different ports),
 // where same-origin auth broadcasts alone cannot update the candidate view.
 await retain();const other=await page.context().newPage();await other.goto(config.institution);await other.getByRole('button',{name:'Sign out',exact:true}).click();await login(other,'foreign');
 await page.getByText('No assessments are assigned to this account.',{exact:true}).waitFor();await released();if(await page.locator('.question-media').count())throw new Error('Another account retained private media');
 await other.getByRole('button',{name:'Sign out',exact:true}).click();await login(other,'candidate');await page.getByRole('button',{name:'Start or resume',exact:true}).click();await page.getByRole('heading',{name:'Protected media',exact:true}).waitFor();await play();await other.close();
 await retain();await page.getByRole('button',{name:'Finish section & continue',exact:true}).click();await page.getByRole('button',{name:'Continue to next section',exact:true}).click();await page.getByRole('heading',{name:'Next section',exact:true}).waitFor();await released();if(await page.locator('.question-media').count())throw new Error('Previous-section media remained visible');
 for(const source of sources)if((await page.request.get(source)).status()!==404)throw new Error('Previous-section media remained authorized');
 await control('expire');await page.getByRole('heading',{name:'Assessment time ended',exact:true}).waitFor();for(const source of sources)if((await page.request.get(source)).status()!==404)throw new Error('Expired attempt retained media authorization');
 const finalizedRequests=stateRequests;await page.waitForTimeout(6100);if(stateRequests!==finalizedRequests)throw new Error('Finalized candidate kept polling the coordinator');
 if(errors.length||!sawPublicManifest)throw new Error(errors.join('; ')||'No canonical candidate manifest was observed');
 const result=await page.request.post(endpoint+'/test/finish',{headers:{'x-fixture-control':config.control},data:{passed:true}});if(!result.ok())throw new Error('Canonical acceptance assertions failed: '+await result.text());
 return {actualImageAudioVideoPlayback:true,decodedVideoFrames:true,credentialedNativeRangeReads:true,noAutoplayOrBearerURLs:true,actualCoordinatorAnswerSync:true,pauseResumePreservesAnswers:true,leaseLossStopsPlayback:true,sharedCookieAccountSwitchClearsMedia:true,sectionAndExpiryDenyOldMedia:true,layouts:'1440/1024/768/390/320',proof:'Actual browser/apps, handlers/repositories, coordinator, PostgreSQL, encrypted R2 and scanner broker. Identity/PostgREST HTTP are local adapters; pause/lease-loss/expiry use explicit canonical fixture controls, not hosted acceptance.'};
}
