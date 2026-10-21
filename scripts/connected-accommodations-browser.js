async(page)=>{
 const base=new URL(page.url()).origin,info=await(await page.request.get(base+'/test/info')).json(),errors=[];if(!info.accommodations_enabled)throw Error('Accommodation fixture disabled');page.on('pageerror',error=>errors.push(error.message));
 const control={'x-fixture-control':info.control},ids=info.accommodationIds;
 const wait=async(predicate,message,tries=200)=>{for(let i=0;i<tries;i++){if(await predicate())return;await page.waitForTimeout(100);}throw Error(message);};
 async function login(name,app='assessment'){await page.setViewportSize({width:1440,height:1000});await page.goto(`${base}/${app}/?tenant_id=${info.tenant}`);if(await page.evaluate(()=>document.cookie.includes('schood-auth')))await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();if(await page.getByRole('button',{name:'Sign out',exact:true}).count())await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill(name+'@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic');await page.getByRole('button',{name:'Sign in',exact:true}).click();}
 async function screenshots(prefix,focus){for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Accommodation overflow '+prefix+' '+width);await page.screenshot({path:`output/playwright/accommodations/${prefix}-${width}.png`,fullPage:true});if(width===320&&focus)await focus.screenshot({path:`output/playwright/accommodations/${prefix}-detail-320.png`});}await page.setViewportSize({width:1440,height:1000});}
 const sittings=async()=>{await page.getByRole('button',{name:'Exam sittings',exact:true}).click();const panel=page.locator('section.accommodations');await panel.getByRole('heading',{name:'Accommodations',exact:true}).waitFor();await panel.getByRole('combobox',{name:'Sitting to review',exact:true}).selectOption({label:'Accommodated sitting'});return panel;};
 const row=panel=>panel.locator('.records > li').filter({has:page.getByText(ids.candidate,{exact:true})});

 // Institution approval: a committed approval whose reply is lost is recovered by its saved key.
 await login('owner');let panel=await sittings();
 await row(panel).getByText('Standard time · no breaks · approval revision 0',{exact:true}).waitFor();
 await row(panel).getByRole('button',{name:'Review accommodations',exact:true}).click();
 let form=panel.getByRole('form',{name:'Approve accommodations',exact:true});
 await form.getByLabel('Extra time (minutes)',{exact:true}).fill('5');await form.getByLabel('Allow timed breaks',{exact:true}).check();await form.getByLabel('Stop the exam clock during breaks',{exact:true}).check();
 await form.getByLabel('Number of breaks',{exact:true}).fill('2');await form.getByLabel('Minutes per break',{exact:true}).fill('1');await form.getByLabel('Total break minutes',{exact:true}).fill('2');
 await form.getByLabel('Approval basis (institution only)',{exact:true}).fill('Approved under access arrangements policy AA-2026-14');
 await screenshots('approval-form',form);
 await form.getByRole('button',{name:'Approve accommodations',exact:true}).click();
 await panel.getByRole('alert').filter({hasText:'reply was lost'}).waitFor();await panel.getByRole('button',{name:'Retry saved approval',exact:true}).waitFor();
 await page.reload();panel=await sittings();await panel.getByRole('button',{name:'Retry saved approval',exact:true}).click();await panel.getByText('Saved approval confirmed.',{exact:true}).waitFor();
 await row(panel).getByText('+5 min · 2 breaks, up to 1 min each, 2 min total, clock stopped · approval revision 1',{exact:true}).waitFor();
 // Another staff member approves first: the open form's revision is refused, not silently overwritten.
 await row(panel).getByRole('button',{name:'Review accommodations',exact:true}).click();form=panel.getByRole('form',{name:'Approve accommodations',exact:true});
 if(!(await page.request.post(base+'/test/accommodation-bump',{headers:control})).ok())throw Error('Concurrent approval fixture failed');
 await form.getByLabel('Approval basis (institution only)',{exact:true}).fill('Second review of the same arrangement');await form.getByRole('button',{name:'Approve accommodations',exact:true}).click();
 await panel.getByRole('alert').filter({hasText:'These accommodations changed since you opened them'}).waitFor();
 if(await panel.getByRole('button',{name:'Retry saved approval',exact:true}).count())throw Error('Refused stale approval stayed pending');
 await screenshots('approval-list',panel);
 // A second sitting uses a running-clock policy: breaks grant no exam time.
 await panel.getByRole('combobox',{name:'Sitting to review',exact:true}).selectOption({label:'Running-clock sitting'});
 await row(panel).getByRole('button',{name:'Review accommodations',exact:true}).click();form=panel.getByRole('form',{name:'Approve accommodations',exact:true});
 await form.getByLabel('Allow timed breaks',{exact:true}).check();await form.getByLabel('Keep the exam clock running',{exact:true}).check();
 await form.getByLabel('Number of breaks',{exact:true}).fill('1');await form.getByLabel('Minutes per break',{exact:true}).fill('1');await form.getByLabel('Total break minutes',{exact:true}).fill('1');
 await form.getByLabel('Approval basis (institution only)',{exact:true}).fill('Approved rest break, policy AA-2026-15');await form.getByRole('button',{name:'Approve accommodations',exact:true}).click();
 await panel.getByText('Accommodations approved. They will be fixed when the candidate starts.',{exact:true}).waitFor();
 await row(panel).getByText('Standard time · 1 break, up to 1 min each, 1 min total, clock running · approval revision 1',{exact:true}).waitFor();
 // The candidate projection never carries the institution-only approval basis.
 const token=(await(await page.request.post(base+'/auth/v1/token?grant_type=password',{data:{email:'candidate@example.test',password:'synthetic'}})).json()).access_token;
 const candidateRows=await(await page.request.get(base+'/functions/v1/assessment-cloud/candidate/registrations?tenant_id='+info.tenant,{headers:{authorization:'Bearer '+token}})).text();
 const reasonPrivate=!candidateRows.includes('AA-2026-14')&&!candidateRows.includes('Concurrent approval')&&candidateRows.includes('"max_breaks":2');

 // Candidate: answers sync before the break, questions are hidden during it and come back early.
 await login('candidate','exam');
 const start=async()=>{await page.getByRole('listitem').filter({has:page.getByText('Accommodated sitting',{exact:true})}).getByRole('button',{name:'Start or resume',exact:true}).click();};
 await start();await page.getByRole('heading',{name:'Timing check',exact:true}).waitFor();
 await wait(async()=>!(await page.locator('.questions fieldset').first().isDisabled()),'Answer controls unavailable');
 const card=page.locator('section.break-card');await card.getByText('2 of 2 breaks left',{exact:false}).waitFor();
 await page.getByRole('textbox',{name:'Your numeric answer',exact:true}).fill('15');
 await wait(async()=>await card.getByRole('button',{name:'Take a break',exact:true}).isEnabled(),'Break control unavailable');
 await card.getByRole('button',{name:'Take a break',exact:true}).click();
 await page.getByRole('heading',{name:'You are on a break',exact:true}).waitFor();
 const questionsHidden=await page.locator('.questions').count()===0&&await page.getByLabel('Break time remaining',{exact:true}).count()===1;
 await screenshots('candidate-break',page.locator('section.break-active'));
 await page.reload();await start();await page.getByRole('heading',{name:'You are on a break',exact:true}).waitFor();
 await page.getByRole('button',{name:'Return to the exam',exact:true}).click();await page.getByRole('heading',{name:'Timing check',exact:true}).waitFor();
 await card.getByText('1 of 2 breaks left',{exact:false}).waitFor();
 if(await page.getByRole('textbox',{name:'Your numeric answer',exact:true}).inputValue()!=='15')throw Error('Saved answer not restored after break');
 // A proctor pause ends the break; the candidate cannot resume it.
 await wait(async()=>await card.getByRole('button',{name:'Take a break',exact:true}).isEnabled(),'Second break unavailable');
 await card.getByRole('button',{name:'Take a break',exact:true}).click();await page.getByRole('heading',{name:'You are on a break',exact:true}).waitFor();
 if(!(await page.request.post(base+'/test/accommodation-pause',{headers:control})).ok())throw Error('Pause fixture failed');
 await page.getByRole('heading',{name:'Assessment paused',exact:true}).waitFor({timeout:20000});
 if(await page.getByRole('button',{name:'Return to the exam',exact:true}).count())throw Error('Candidate offered a control during a proctor pause');
 if(!(await page.request.post(base+'/test/accommodation-resume',{headers:control})).ok())throw Error('Resume fixture failed');
 await page.getByRole('heading',{name:'Timing check',exact:true}).waitFor({timeout:20000});await card.getByText('0 of 2 breaks left',{exact:false}).waitFor();
 if(await card.getByRole('button',{name:'Take a break',exact:true}).isEnabled())throw Error('Exhausted allowance still offered a break');
 await wait(async()=>await page.getByRole('button',{name:'Submit assessment',exact:true}).isEnabled(),'Submit unavailable');
 await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await page.getByRole('button',{name:'Submit now',exact:true}).click();await page.getByRole('heading',{name:'Assessment submitted',exact:true}).waitFor();
 // Running clock through the real apps: the clock keeps running and the deadline is unchanged.
 await page.reload();await page.getByRole('listitem').filter({has:page.getByText('Running-clock sitting',{exact:true})}).getByRole('button',{name:'Start or resume',exact:true}).click();
 await page.getByRole('heading',{name:'Timing check',exact:true}).waitFor();await card.getByText('1 of 1 breaks left',{exact:false}).waitFor();await card.getByText('The exam clock keeps running during a break.',{exact:false}).waitFor();
 await wait(async()=>await card.getByRole('button',{name:'Take a break',exact:true}).isEnabled(),'Running-clock break unavailable');
 await card.getByRole('button',{name:'Take a break',exact:true}).click();await page.getByRole('heading',{name:'You are on a break',exact:true}).waitFor();
 await page.getByText('Your exam clock keeps running during this break.',{exact:false}).waitFor();await screenshots('candidate-running-break',page.locator('section.break-active'));
 await page.getByRole('button',{name:'Return to the exam',exact:true}).click();await page.getByRole('heading',{name:'Timing check',exact:true}).waitFor();
 await page.getByRole('textbox',{name:'Your numeric answer',exact:true}).fill('15');
 await wait(async()=>await page.getByRole('button',{name:'Submit assessment',exact:true}).isEnabled(),'Running-clock submit unavailable',300);
 await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await page.getByRole('button',{name:'Submit now',exact:true}).click();await page.getByRole('heading',{name:'Assessment submitted',exact:true}).waitFor();
 const proof=await(await page.request.get(base+'/test/accommodation-proof',{headers:control})).json();
 if(errors.length)throw Error(errors.join('\n'));
 return {...proof,connected_accommodations:true,approval_receipt_recovered:proof.approval_reply_lost,stale_revision_refused:true,reason_private:reasonPrivate,questions_hidden_on_break:questionsHidden,break_receipt_recovered:proof.break_reply_lost&&proof.breaks===2,break_survived_reload:true,early_return_restored_questions:true,pause_closed_break:proof.break_reasons?.[1]==='proctor_pause'};
}
