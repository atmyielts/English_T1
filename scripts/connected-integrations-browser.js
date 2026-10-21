async(page)=>{
 const base=new URL(page.url()).origin,info=await(await page.request.get(base+'/test/info')).json(),errors=[];if(!info.integrations_enabled)throw Error('Integration fixture disabled');page.on('pageerror',error=>errors.push(error.message));
 const control={'x-fixture-control':info.control},ids=info.integrationIds,api=base+'/functions/v1/assessment-cloud/';
 async function login(name){await page.setViewportSize({width:1440,height:1000});await page.goto(`${base}/assessment/?tenant_id=${info.tenant}`);if(await page.evaluate(()=>document.cookie.includes('schood-auth')))await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();if(await page.getByRole('button',{name:'Sign out',exact:true}).count())await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill(name+'@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic');await page.getByRole('button',{name:'Sign in',exact:true}).click();}
 async function screenshots(prefix,focus){for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Integration overflow '+prefix+' '+width);await page.screenshot({path:`output/playwright/integrations/${prefix}-${width}.png`,fullPage:true});if(width===320&&focus)await focus.screenshot({path:`output/playwright/integrations/${prefix}-detail-320.png`});}await page.setViewportSize({width:1440,height:1000});}
 const secretFrom=async()=>{const region=page.getByRole('region',{name:'New secret',exact:true});await region.waitFor();const secret=(await region.locator('code').textContent()).trim(),id=(await region.getByText(/^Identifier: /).textContent()).replace('Identifier: ','').trim();return {secret,id};};

 // Plan & usage: the seeded plan and its monthly limit are explained.
 await login('owner');
 await page.getByRole('button',{name:'Plan & usage',exact:true}).click();
 await page.getByRole('heading',{name:'Assessment Cloud plan and usage',exact:true}).waitFor();
 await page.getByText(/of 10 attempts used$/).waitFor();
 await page.getByText('Plan limits are not enforced yet. Usage is still recorded so you can see it.',{exact:true}).waitFor();
 const planUsage=true;await screenshots('plan-usage',page.locator('section.billing'));

 // Webhook endpoint: secret shown once, never stored in plaintext.
 await page.getByRole('button',{name:'Integrations',exact:true}).click();
 await page.getByRole('heading',{name:'Webhook endpoints',exact:true}).waitFor();
 const hookForm=page.getByRole('form',{name:'Add webhook endpoint',exact:true});
 await hookForm.getByLabel('HTTPS address',{exact:true}).fill('http://hooks.example.org/schood');
 await hookForm.getByRole('button',{name:'Add webhook endpoint',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'HTTPS'}).waitFor();
 await hookForm.getByLabel('HTTPS address',{exact:true}).fill('https://hooks.example.org/schood');
 await hookForm.getByRole('button',{name:'Add webhook endpoint',exact:true}).click();
 const hook=await secretFrom();const webhookSecretOnce=/^whsec_[A-Za-z0-9_-]{43}$/.test(hook.secret);
 await page.getByRole('button',{name:'I have stored it',exact:true}).click();

 // API client: secret shown once; client credentials give a scoped token.
 const clientForm=page.getByRole('form',{name:'Create API client',exact:true});
 await clientForm.getByLabel('Client name',{exact:true}).fill('Student information system');
 await clientForm.getByLabel('Read registrations',{exact:true}).check();await clientForm.getByLabel('Register candidates',{exact:true}).check();
 await clientForm.getByRole('button',{name:'Create API client',exact:true}).click();
 const client=await secretFrom();const clientSecretOnce=/^sk_[A-Za-z0-9_-]{43}$/.test(client.secret);
 await screenshots('integrations',page.locator('section.integrations'));
 await page.getByRole('button',{name:'I have stored it',exact:true}).click();
 const issued=await page.request.post(api+'oauth/token',{form:{grant_type:'client_credentials',client_id:client.id,client_secret:client.secret}});
 const token=(await issued.json()).access_token,tokenIssued=issued.ok()&&/^at_/.test(token);
 const auth={authorization:'Bearer '+token};
 const created=await page.request.post(api+'v1/registrations',{headers:{...auth,'idempotency-key':'sis-browser-0001'},data:{window_id:ids.window,candidate_id:ids.candidate}});
 const apiRegistrationCreated=created.status()===201;
 const listed=await(await page.request.get(api+'v1/registrations?window_id='+ids.window,{headers:auth})).json();
 const apiReadScoped=listed.data?.length===1&&(await page.request.get(api+'v1/results',{headers:auth})).status()===200;
 const feed=await(await page.request.get(api+'v1/events?limit=500',{headers:auth})).json();
 const eventFeedReconciles=feed.data.some(event=>event.type==='registration.created'&&event.data.window_id===ids.window);

 // Delivery history shows the registration event queued for the endpoint.
 await page.reload();await page.getByRole('button',{name:'Integrations',exact:true}).click();
 const endpoint=page.locator('section.integrations .records > li').filter({has:page.getByText('https://hooks.example.org/schood',{exact:true})});
 await endpoint.getByRole('button',{name:'Delivery history',exact:true}).click();
 await endpoint.getByText(/^Candidate registered #\d+ · waiting/).waitFor();
 const deliveryHistoryShown=true;

 // Revocation stops the token immediately.
 const clientRow=page.locator('section.integrations .records > li').filter({has:page.getByText('Student information system',{exact:true})});
 await clientRow.getByRole('button',{name:'Revoke',exact:true}).click();
 await page.getByText('API client revoked. Its tokens stopped working immediately.',{exact:true}).waitFor();
 const revokedTokenRefused=(await page.request.get(api+'v1/registrations',{headers:auth})).status()===401;

 const proof=await(await page.request.get(base+'/test/integration-proof',{headers:control})).json();
 if(errors.length)throw Error(errors.join('\n'));
 return {...proof,connected_integrations:true,plan_usage_shown:planUsage,webhook_secret_once:webhookSecretOnce,client_secret_once:clientSecretOnce,token_issued:tokenIssued,api_registration_created:apiRegistrationCreated,api_read_scoped:apiReadScoped,event_feed_reconciles:eventFeedReconciles,delivery_history_shown:deliveryHistoryShown,revoked_token_refused:revokedTokenRefused};
}
