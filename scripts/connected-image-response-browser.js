async(page)=>{
 const endpoint='http://localhost:5911',config=await(await page.request.get(endpoint+'/test/config')).json(),errors=[],manifests=[],responses=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().includes('/candidate/attempts/')&&response.ok())manifests.push(response.json());});page.on('request',request=>{if(request.url().includes('/commands?')&&request.postDataJSON()?.action==='response.append')responses.push(request.postDataJSON().data);});
 const wait=async(predicate,message)=>{for(let i=0;i<300;i++){if(await predicate())return;await page.waitForTimeout(100);}throw new Error(message);};
 await page.goto(config.institution);await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.goto(`${config.exam}/?tenant_id=${config.tenant}`);await page.getByRole('textbox',{name:'Email',exact:true}).fill('candidate@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Start or resume',exact:true}).click();
 await page.getByRole('heading',{name:'Select a point in the navy rectangle.',exact:true}).waitFor();
 const surface=page.getByRole('button',{name:'Select a point on the question image',exact:true});await surface.waitFor();await wait(async()=>!await surface.isDisabled(),'Image response did not get a canonical device lease');
 if(await page.locator('.image-private-targets').count())throw new Error('Candidate received private target overlay');
 await surface.focus();await page.keyboard.press('ArrowRight');await page.getByText('Selected point: 50.1% from the left, 50% from the top.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Clear selected point',exact:true}).click();await page.getByText('No point selected.',{exact:true}).waitFor();
 const box=await surface.boundingBox();await surface.click({position:{x:box.width*.25,y:box.height*.5}});
 await page.getByRole('spinbutton',{name:'Horizontal position (%)',exact:true}).fill('25');await page.getByRole('spinbutton',{name:'Vertical position (%)',exact:true}).fill('50');await page.getByRole('button',{name:'Apply coordinates',exact:true}).click();await page.getByText('Selected point: 25% from the left, 50% from the top.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Sync saved responses',exact:true}).click();await page.getByText('All saved responses synced',{exact:true}).waitFor();
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('Image response overflow at '+width);await page.screenshot({path:`output/playwright/assessment-cloud/connected-image-hotspot-${width}.png`,fullPage:true});}
 // Reload is a real encrypted-journal/lease recovery path; original form and
 // point survive without copying a target/score into the response envelope.
 await page.reload();await page.getByRole('button',{name:'Start or resume',exact:true}).click();await page.getByText('Selected point: 25% from the left, 50% from the top.',{exact:true}).waitFor();
 const source=await page.locator('.questions img').getAttribute('src');await page.getByRole('button',{name:'Finish section & continue',exact:true}).click();await page.getByRole('heading',{name:'Label the two pictured shapes.',exact:true}).waitFor();
 await page.getByRole('button',{name:'Focus answer Label 1',exact:true}).click();await page.getByRole('textbox',{name:'1. Label 1',exact:true}).fill('navy rectangle');await page.getByRole('button',{name:'Focus answer Label 2',exact:true}).click();await page.getByRole('textbox',{name:'2. Label 2',exact:true}).fill('blue circle');await page.getByRole('button',{name:'Sync saved responses',exact:true}).click();await page.getByText('All saved responses synced',{exact:true}).waitFor();
 await page.screenshot({path:'output/playwright/assessment-cloud/connected-image-diagram-320.png',fullPage:true});
 await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await page.getByRole('heading',{name:'Assessment submitted',exact:true}).waitFor();
 if((await page.request.get(source)).status()!==404)throw new Error('Submitted image remained authorized');
 for(const result of await Promise.all(manifests)){if(JSON.stringify(result.data.manifest).match(/"(correct|regions|hotspot|numeric)"\s*:/))throw new Error('Public manifest contains a private scoring field');}
 if(responses.some(response=>response.score!==undefined||response.regions!==undefined||response.response?.regions!==undefined))throw new Error('Client sent scoring authority');
 if(errors.length)throw new Error(errors.join('\n'));
 const finished=await page.request.post(endpoint+'/test/finish',{headers:{'x-fixture-control':config.control},data:{passed:true}});if(!finished.ok())throw new Error('Canonical image grading proof failed: '+await finished.text());const proof=await finished.json();
 return {...proof,image_responses:true,protected_native_image:true,pointer_keyboard_coordinates:true,reload_recovery:true,diagram_marker_focus:true,private_targets_excluded:true,actual_grading_handler:true};
}
