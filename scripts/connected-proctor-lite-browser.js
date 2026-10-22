async(page)=>{
 const base=new URL(page.url()).origin,info=await(await page.request.get(base+'/test/info')).json(),errors=[];
 const control={headers:{'x-fixture-control':info.control}};
 const wait=async(predicate,message,limit=200)=>{for(let i=0;i<limit;i++){if(await predicate())return;await page.waitForTimeout(100);}throw new Error(message+': '+(await page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,1500));};
 const shots=async(tab,name)=>{for(const width of [1440,768,390,320]){await tab.setViewportSize({width,height:900});await tab.evaluate(()=>window.scrollTo(0,0));if(await tab.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error(name+' overflow at '+width);await tab.screenshot({path:`output/playwright/proctor-lite/${name}-${width}.png`,fullPage:true});}await tab.setViewportSize({width:1440,height:900});};
 async function signIn(tab,url,name){tab.on('pageerror',error=>errors.push(error.message));await tab.setViewportSize({width:1440,height:900});await tab.goto(url);await tab.getByRole('textbox',{name:'Email',exact:true}).fill(name+'@example.test');await tab.getByLabel('Password',{exact:true}).fill('synthetic');await tab.getByRole('button',{name:'Sign in',exact:true}).click();}
 // 1. The owner opens Proctor from Assessment Cloud's link and creates a snapshot policy for the sitting.
 const staffContext=await page.context().browser().newContext(),staff=await staffContext.newPage();
 await signIn(staff,`${base}/proctor/?tenant_id=${info.tenant}&tab=policies`,'owner');
 await staff.getByRole('heading',{name:'Create monitoring policy',exact:true}).waitFor();
 const modes=await staff.getByRole('combobox',{name:'Monitoring mode',exact:true}).locator('option').allTextContents();
 // Browser monitoring is always offered; live, secure-desktop and center modes need services this stack does not configure.
 const only_launchable_modes=modes[0]==='Browser monitoring'&&!modes.some(mode=>/live|desktop|center/i.test(mode));
 await staff.getByRole('textbox',{name:'Policy name',exact:true}).fill('Proctor Lite');
 await staff.getByRole('combobox',{name:'Webcam snapshots',exact:true}).selectOption({label:'Every 30 seconds'});
 await staff.getByRole('combobox',{name:'Independent reviewers required',exact:true}).selectOption({label:'Two agreeing human reviewers'});
 await staff.getByRole('button',{name:'Create policy',exact:true}).click();await staff.getByText('Monitoring policy created.',{exact:true}).waitFor();
 await staff.getByText('snapshots every 30 s',{exact:false}).first().waitFor();
 await staff.getByRole('combobox',{name:'Exam sitting',exact:true}).selectOption({label:'Monitored placement'});
 await staff.getByRole('combobox',{name:'Monitoring policy',exact:true}).selectOption({label:'Proctor Lite'});
 await staff.getByRole('button',{name:'Attach policy',exact:true}).click();await staff.getByText('Monitoring policy attached.',{exact:true}).waitFor();
 await shots(staff,'staff-policy');
 // 2. The candidate sees what is monitored, turns on the camera and takes the identity photo before starting.
 await page.addInitScript(()=>{
  // Generated frames only; never real hardware.
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{if(!constraints.video)throw new DOMException('Not allowed','NotAllowedError');const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');let frame=0;setInterval(()=>{ctx.fillStyle='#17304c';ctx.fillRect(0,0,320,240);ctx.fillStyle='#d79442';ctx.fillRect((frame++*5)%260,60,60,80);ctx.fillStyle='white';ctx.font='18px sans-serif';ctx.fillText('SYNTHETIC CAMERA',60,200);},60);return canvas.captureStream(15);}});
 });
 await signIn(page,`${base}/exam/?tenant_id=${info.tenant}`,'candidate');
 const row=page.getByRole('listitem').filter({hasText:'Monitored placement'});await row.getByRole('button',{name:'Start or resume',exact:true}).click();
 await page.getByRole('heading',{name:'Exam monitoring policy',exact:true}).waitFor();
 const preflight_disclosed=(await page.locator('.policy-summary').innerText()).includes('An identity photo, then a picture every 30 seconds');
 const start=page.getByRole('button',{name:'Accept policy & start or resume',exact:true});
 await page.getByLabel('I have read and accept this institution’s exam monitoring policy.',{exact:true}).check();
 const blocked_without_photo=await start.isDisabled();
 await page.getByRole('button',{name:'Turn on camera',exact:true}).click();
 await wait(async()=>await page.locator('.snapshot-preview video').evaluate(video=>video.videoWidth>0),'Camera preview did not start');
 await page.getByRole('button',{name:'Take identity photo',exact:true}).click();await page.getByText('Identity photo taken. You can start when ready.',{exact:true}).waitFor();
 await shots(page,'candidate-camera');
 await start.click();await page.getByRole('heading',{name:'Planets',exact:true}).waitFor();
 await page.getByText('Camera on: pictures are being taken',{exact:true}).waitFor({timeout:20000});
 let proof;await wait(async()=>{proof=await(await page.request.get(base+'/test/proctor-lite-proof',control)).json();return proof.identity===1&&proof.periodic>=1;},'Snapshots were not stored',300);
 await page.getByRole('radio',{name:'Mars',exact:true}).check();
 await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await page.getByRole('button',{name:'Submit now',exact:true}).click();
 await page.getByRole('heading',{name:'Assessment submitted',exact:true}).waitFor();
 // 3. Two reviewers disagree; the owner, who did not review, sees the pictures and decides.
 const review=await(await page.request.post(base+'/test/proctor-lite-review',control)).json();if(!review.case_id)throw new Error('Review case not opened');
 await staff.goto(`${base}/proctor/?tenant_id=${info.tenant}&tab=sessions`);
 // The newest session (the one with a heartbeat) is this candidate's monitored test.
 await staff.getByRole('listitem').filter({hasText:/Last candidate heartbeat: (?!Not received)/}).last().getByRole('button',{name:'Open session',exact:true}).click();
 await staff.getByRole('heading',{name:'Webcam snapshots',exact:true}).waitFor().catch(async()=>{await staff.screenshot({path:'output/playwright/proctor-lite/debug-session.png',fullPage:true});throw new Error('Page errors: '+errors.join(' | ')+' Session screen: '+(await staff.locator('body').innerText()).replace(/s+/g,' ').slice(0,2500));});
 const identityImage=staff.getByRole('img',{name:/^Identity photo taken /});await identityImage.waitFor();
 await wait(async()=>await identityImage.evaluate(image=>image.complete&&image.naturalWidth>0),'Identity photo did not load');const pictures_visible=true;
 await staff.getByText('Reviewers disagree. A proctor manager who did not review this case makes the final decision.',{exact:true}).waitFor();
 await staff.getByRole('combobox',{name:'Final outcome',exact:true}).selectOption('clear');
 await staff.getByRole('textbox',{name:'Reason for the decision',exact:true}).fill('The pictures show the candidate reading the question, not using another source.');
 await staff.getByRole('button',{name:'Record senior decision',exact:true}).click();await staff.getByText('Senior decision recorded.',{exact:true}).waitFor();
 await staff.getByRole('textbox',{name:'Explanation for the candidate',exact:true}).fill('Your test was reviewed by our staff. No concern was recorded about your exam.');
 await staff.getByRole('button',{name:'Send explanation to candidate',exact:true}).click();await staff.getByText('Explanation sent to the candidate.',{exact:true}).waitFor();
 await shots(staff,'staff-decision');await staffContext.close();
 // 4. The candidate reads the explanation in Exam.
 await page.goto(`${base}/exam/?tenant_id=${info.tenant}`);
 await page.getByRole('heading',{name:'Integrity review',exact:true}).waitFor();
 const outcome=await page.locator('.integrity-outcomes').innerText();
 const candidate_told=outcome.includes('No concern')&&outcome.includes('No concern was recorded about your exam.')&&!outcome.includes('reading the question');
 await shots(page,'candidate-outcome');
 proof=await(await page.request.get(base+'/test/proctor-lite-proof',control)).json();
 if(errors.length)throw new Error(errors.join('\n'));
 return {...proof,only_launchable_modes,preflight_disclosed,blocked_without_photo,pictures_visible,candidate_told};
}
