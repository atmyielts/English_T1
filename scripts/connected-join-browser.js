async(page)=>{
 const base=new URL(page.url()).origin,info=await(await page.request.get(base+'/test/info')).json(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const ensure=async(predicate,message)=>{for(let count=0;count<100;count++){if(await predicate())return;await page.waitForTimeout(100);}throw new Error(message+': '+(await page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,1500));};
 const shots=async(tab,name)=>{for(const width of [1440,1024,768,390,320]){await tab.setViewportSize({width,height:900});await tab.evaluate(()=>window.scrollTo(0,0));if(await tab.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error(name+' overflow at '+width);await tab.screenshot({path:`output/playwright/join/${name}-${width}.png`,fullPage:true});}await tab.setViewportSize({width:1440,height:900});};
 async function signIn(tab,name){await tab.getByRole('textbox',{name:'Email',exact:true}).fill(name+'@example.test');await tab.getByLabel('Password',{exact:true}).fill('synthetic');await tab.getByRole('button',{name:'Sign in',exact:true}).click();}
 // 1. The owner names the institution, so candidates do not see the account email.
 await page.goto(`${base}/assessment/?tenant_id=${info.tenant}`);
 if(await page.evaluate(()=>document.cookie.includes('schood-auth'))){await page.getByRole('button',{name:'Sign out',exact:true}).click();}
 await page.getByRole('link',{name:'Create a Schood account',exact:true}).waitFor();const staff_signup_link=(await page.getByRole('link',{name:'Create a Schood account',exact:true}).getAttribute('href')).includes('/platform/auth?mode=signup&returnTo=');
 await signIn(page,'owner');
 await page.getByRole('button',{name:'Staff & permissions',exact:true}).click();
 const name=page.getByRole('textbox',{name:'Name',exact:true});await name.waitFor();await ensure(async()=>await page.getByRole('button',{name:'Save name',exact:true}).isEnabled(),'Institution name did not load');
 await name.fill('Atlas Learning Centre');await page.getByRole('button',{name:'Save name',exact:true}).click();await page.getByText('Institution name saved.',{exact:true}).waitFor();
 await ensure(async()=>(await page.locator('header').innerText()).includes('Atlas Learning Centre'),'Header does not show the new institution name');
 // 2. The owner creates a join link for the sitting and copies it.
 await page.getByRole('button',{name:'Exam sittings',exact:true}).click();
 const sitting=page.getByRole('listitem').filter({hasText:'Open placement sitting'});await sitting.waitFor();
 await sitting.getByRole('button',{name:'Create join link',exact:true}).click();await page.getByText('Join link created. Copy it and send it to your candidates.',{exact:true}).waitFor();
 const link=await sitting.getByRole('textbox',{name:'Join link for candidates',exact:true}).inputValue();
 if(!/\/exam\/#join=[0-9a-f-]{36}\.[a-f0-9]{64}$/.test(link))throw new Error('Unexpected join link '+link);
 await sitting.getByText('Joined: 0',{exact:true}).waitFor();await shots(page,'staff-link');
 // 3. A brand-new person opens the link: they are asked to sign in or create an account first.
 const other=await page.context().browser().newContext(),candidate=await other.newPage();candidate.on('pageerror',error=>errors.push(error.message));await candidate.setViewportSize({width:1440,height:900});
 await candidate.goto(link);await candidate.getByRole('heading',{name:'Sign in to join your test',exact:true}).waitFor();
 const signup=await candidate.getByRole('link',{name:'Create a Schood account',exact:true}).getAttribute('href');
 const signup_returns_to_link=new URL(signup).searchParams.get('mode')==='signup'&&new URL(signup).searchParams.get('returnTo')===link;
 const code_hidden_from_address=!candidate.url().includes('join=');
 await shots(candidate,'candidate-signin');
 await signIn(candidate,'newcomer');
 // 4. They see who is inviting them to what, and join with one confirmation.
 await candidate.getByRole('heading',{name:'Join a test',exact:true}).waitFor();await candidate.getByRole('button',{name:'Join this test',exact:true}).waitFor();
 const preview_named=(await candidate.locator('.join-sitting').innerText()).includes('Atlas Learning Centre')&&(await candidate.locator('.join-sitting').innerText()).includes('Open placement sitting');
 await shots(candidate,'candidate-join');
 await candidate.getByRole('button',{name:'Join this test',exact:true}).click();
 const row=candidate.getByRole('listitem').filter({hasText:'Open placement sitting'});await row.waitFor();
 // 5. Exam opens without an institution link next time.
 await candidate.goto(base+'/exam/');await row.waitFor();const institution_found=new URL(candidate.url()).searchParams.get('tenant_id')===info.tenant;
 // 6. Opening the same link again does not register twice; then the test starts.
 await candidate.goto(link);await candidate.getByText('You have already joined this test.',{exact:true}).waitFor();await candidate.getByRole('button',{name:'Go to my tests',exact:true}).click();
 await row.getByRole('button',{name:'Start or resume',exact:true}).click();await candidate.getByRole('heading',{name:'Planets',exact:true}).waitFor();
 await candidate.getByRole('radio',{name:'Mars',exact:true}).waitFor();const started=true;
 await other.close();
 // 7. The owner sees the join and turns the link off.
 await page.reload();await page.getByRole('button',{name:'Exam sittings',exact:true}).click();await sitting.getByText('Joined: 1',{exact:true}).waitFor();
 await sitting.getByRole('button',{name:'Turn off link',exact:true}).click();await page.getByText('Join link turned off. Candidates who already joined keep their place.',{exact:true}).waitFor();
 const revoked_check=await(await page.request.get(base+'/test/join-proof',{headers:{'x-fixture-control':info.control}})).json();
 const late=await page.context().browser().newContext(),stranger=await late.newPage();await stranger.goto(link);await signIn(stranger,'observer');
 await stranger.getByText('This join link was turned off. Ask your institution for a new link.',{exact:true}).waitFor();const revoked_refused=true;await late.close();
 if(errors.length)throw new Error(errors.join('\n'));
 return {...revoked_check,staff_signup_link,signup_returns_to_link,code_hidden_from_address,preview_named,institution_found,started,revoked_refused};
}
