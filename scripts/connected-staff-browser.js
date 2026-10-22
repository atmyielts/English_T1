async(page)=>{
 const base=new URL(page.url()).origin,info=await(await page.request.get(base+'/test/info')).json(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const proof=async()=>await(await page.request.get(base+'/test/staff-proof',{headers:{'x-fixture-control':info.control}})).json();
 async function login(name){await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/assessment/');if(await page.getByRole('button',{name:'Sign out',exact:true}).count())await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill(name+'@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Question banks',exact:true}).waitFor();}
 async function staff(){await page.getByRole('button',{name:'Staff & permissions',exact:true}).click();await page.getByRole('heading',{name:'Staff & permissions',exact:true}).waitFor();}
 async function member(name){await page.getByRole('listitem').filter({has:page.getByText(name,{exact:true})}).getByRole('button',{name:'Review member permissions',exact:true}).click();await page.getByRole('heading',{name:'Permissions for '+name,exact:true}).waitFor();}
 async function change(action,reason){await page.getByLabel('Reason for Assessment access change',{exact:true}).fill(reason);await page.getByRole('checkbox',{name:"I reviewed this member's retained Assessment permissions and the scope of this change.",exact:true}).check();await page.getByRole('button',{name:action+' Assessment staff access',exact:true}).click();}
 await login('owner');await staff();await member('Assessment-only author');
 if(!await page.getByRole('button',{name:'Suspend Assessment staff access',exact:true}).isDisabled())throw new Error('Unreviewed membership change enabled');
 await change('Suspend','Temporarily pause Assessment-only author access, retaining roles.');
 await page.getByRole('heading',{name:'Saved permission request needs a receipt',exact:true}).waitFor();
 await page.reload();await staff();await page.getByRole('button',{name:'Retry saved permission request',exact:true}).click();await page.getByRole('heading',{name:'Saved permission request needs a receipt',exact:true}).waitFor({state:'detached'});
 await member('Assessment-only author');await page.getByText('Assessment staff access is suspended.',{exact:true}).waitFor();
 const held=await proof();if(held.local_can_write||held.local_workspaces!==0||held.suspensions!==1||held.local_organization_memberships!==0)throw new Error('Suspension/replay did not fence local staff exactly once');
 await change('Resume','Reviewed the retained role and explicitly restored Assessment access.');await page.getByRole('button',{name:'Suspend Assessment staff access',exact:true}).waitFor();
 await member('Shared institution examiner');await change('Suspend','Suspend Assessment marking only, not Academy or Proctor.');await page.getByText('Assessment staff access is suspended.',{exact:true}).waitFor();
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('Staff access overflow '+width);await page.getByRole('group',{name:'Assessment staff access',exact:true}).screenshot({path:'output/playwright/staff/access-'+width+'.png'});}
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('local');
 if(await page.getByRole('button',{name:'Staff & permissions',exact:true}).count())throw new Error('Assessment-only author inherited management');
 await page.getByLabel('Bank name',{exact:true}).fill('Assessment-only authored library');await page.getByRole('button',{name:'Create bank',exact:true}).click();await page.getByText('Question bank created.',{exact:true}).waitFor();
 const final=await proof();if(errors.length)throw new Error(errors.join('\n'));return{...final,connected_staff:true,receipt_recovery:true,service_only_workspace_discovery:true,actual_authoring_without_academy_membership:true,widths:5,fixture_enrollment_not_invitation_acceptance:true};
}
