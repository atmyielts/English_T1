async(page)=>{
 const base=new URL(page.url()).origin,info=await(await page.request.get(base+'/test/info')).json(),errors=[];
 const wait=async(predicate,message)=>{for(let i=0;i<150;i++){if(await predicate())return;await page.waitForTimeout(100);}throw Error(message);};
 async function login(tab){tab.on('pageerror',error=>errors.push(error.message));await tab.setViewportSize({width:1440,height:1000});await tab.goto(`${base}/exam/?tenant_id=${info.tenant}`);if(await tab.evaluate(()=>document.cookie.includes('schood-auth')))await tab.getByRole('button',{name:'Sign out',exact:true}).waitFor();if(await tab.getByRole('button',{name:'Sign out',exact:true}).count()){await tab.getByRole('button',{name:'Sign out',exact:true}).click();await tab.getByLabel('Email',{exact:true}).waitFor();}await tab.getByLabel('Email',{exact:true}).fill('candidate@example.test');await tab.getByLabel('Password',{exact:true}).fill('synthetic');await tab.getByRole('button',{name:'Sign in',exact:true}).click();}
 const start=async(tab)=>{await tab.getByRole('listitem').filter({has:tab.getByText('Two device sitting',{exact:true})}).getByRole('button',{name:'Start or resume',exact:true}).click();};
 const question=(tab,index)=>tab.locator('.questions > section').nth(index);
 const synced=async(tab,message)=>{await tab.getByRole('button',{name:'Sync saved responses',exact:true}).click();await wait(async()=>await tab.getByRole('button',{name:'Submit assessment',exact:true}).isEnabled(),message);};
 const shots=async(tab,name)=>{for(const width of [1440,768,390,320]){await tab.setViewportSize({width,height:1000});await tab.evaluate(()=>window.scrollTo(0,0));if(await tab.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(name+' overflow at '+width);await tab.screenshot({path:`output/playwright/takeover/${name}-${width}.png`,fullPage:true});}await tab.setViewportSize({width:1440,height:1000});};
 // 1. The laptop starts the exam and saves the first answer.
 await login(page);await start(page);await page.getByRole('heading',{name:'Planets',exact:true}).waitFor();
 await question(page,0).getByRole('radio',{name:'Mars',exact:true}).check();await synced(page,'First answer did not sync');
 // 2. The phone (a separate browser profile) asks before continuing, then takes over.
 const other=await page.context().browser().newContext(),phone=await other.newPage();
 await login(phone);await start(phone);await phone.getByRole('heading',{name:'Continue on this device?',exact:true}).waitFor();
 const second_device_asked=await phone.getByRole('radio',{name:'Venus',exact:true}).count()===0||!(await question(phone,1).getByRole('radio',{name:'Venus',exact:true}).isEnabled());
 await shots(phone,'phone-choice');
 await phone.getByRole('button',{name:'Continue on this device',exact:true}).click();
 await phone.getByText('You continued this exam on this device. 1 answer saved earlier is kept.',{exact:true}).waitFor();const took_over_notice=true;
 // 3. The laptop, not yet aware, answers again: that answer is refused and disclosed.
 await question(page,1).getByRole('radio',{name:'Mars',exact:true}).check();
 await page.getByRole('heading',{name:'This exam moved to another device',exact:true}).waitFor();const old_device_told=true;
 await page.getByText('1 answer on this device was not sent and was not accepted.',{exact:true}).waitFor();const late_answer_disclosed=true;
 await shots(page,'laptop-moved');
 // 4. The phone answers and submits; only its answer and the laptop's saved one count.
 await question(phone,1).getByRole('radio',{name:'Venus',exact:true}).check();await synced(phone,'Phone answer did not sync');
 await phone.getByRole('button',{name:'Submit assessment',exact:true}).click();await phone.getByRole('button',{name:'Submit now',exact:true}).click();await phone.getByRole('heading',{name:'Assessment submitted',exact:true}).waitFor();
 await other.close();
 const proof=await(await page.request.get(base+'/test/takeover-proof',{headers:{'x-fixture-control':info.control}})).json();if(errors.length)throw Error(errors.join('\n'));
 return {...proof,connected_takeover:true,second_device_asked,took_over_notice,old_device_told,late_answer_disclosed};
}
