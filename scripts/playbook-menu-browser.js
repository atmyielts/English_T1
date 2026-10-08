// Actual local frontends; isolated synthetic API responses and no external traffic.
async(page)=>{
  const checks=[],errors=[],assert=(value,message)=>{if(!value)throw Error(message);};
  page.on('pageerror',error=>errors.push(error.message));
  for(const [service,port] of [['SAT',4294],['TOEFL',4395]]){
    const origin='http://127.0.0.1:'+port;
    await page.context().clearCookies();
    await page.unrouteAll({behavior:'wait'});
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('/catalog'))return route.fulfill({json:{modules:[],premium_guides:[]}});
      if(url.pathname.startsWith('/functions/v1/'))return route.fulfill({json:{page:{id:'menu-qa',title:'Navigation review',summary:'Local menu review',page_type:'guide'},sections:[],child_pages:[],sources:[]}});
      if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:{}});
      return url.origin===origin?route.continue():route.abort();
    });
    await page.setViewportSize({width:390,height:900});
    await page.goto(origin+'/navigation-review');
    const header=page.locator('header.top-nav'),nav=page.getByRole('navigation',{name:service+' Playbook',exact:true});
    const open=page.getByRole('button',{name:'Open menu',exact:true});
    await open.waitFor();
    assert(await nav.count()===0,'Closed mobile menu remains in accessibility tree: '+service);
    await open.focus();await page.keyboard.press('Enter');await nav.waitFor();
    await page.keyboard.press('Tab');
    assert(await nav.getByRole('link',{name:'Dashboard',exact:true}).evaluate(link=>link===document.activeElement),'Keyboard did not enter the menu: '+service);
    await page.keyboard.press('Escape');
    assert(await open.getAttribute('aria-expanded')==='false'&&await open.evaluate(button=>button===document.activeElement),'Escape failed to restore focus: '+service);
    checks.push({service,case:'closed-links-hidden-keyboard-open-and-escape-focus',passed:true});
    await open.click();await page.locator('main h1').click();
    assert(await open.getAttribute('aria-expanded')==='false','Outside pointer did not close: '+service);
    await open.click();await page.locator('main a').first().focus();
    assert(await open.getAttribute('aria-expanded')==='false','Focus exit did not close: '+service);
    checks.push({service,case:'outside-pointer-and-focus-exit-close',passed:true});
    await open.click();await nav.getByRole('link',{name:'Modules',exact:true}).click();
    await page.waitForURL('**/modules');
    assert(await open.getAttribute('aria-expanded')==='false','Navigation left menu open: '+service);
    await open.click();await page.setViewportSize({width:1280,height:900});await nav.waitFor();
    assert(await open.count()===0&&await nav.getByRole('link').count()===3,'Desktop navigation missing: '+service);
    await page.setViewportSize({width:390,height:900});
    assert(await open.getAttribute('aria-expanded')==='false','Resizing reopened stale menu: '+service);
    checks.push({service,case:'route-closes-and-desktop-to-mobile-resets',passed:true});
    const violations=[];
    for(const width of [320,390,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      if(width<=980)await page.getByRole('button',{name:'Open menu',exact:true}).click();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow at '+width+': '+service);
      assert(await header.evaluate(el=>el.scrollWidth<=el.clientWidth),'Header overflow at '+width+': '+service);
      if(width===390){
        await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
        const result=await page.evaluate(async()=>{const r=await window.axe.run('header.top-nav',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact}));});
        violations.push(...result);
        await page.screenshot({path:'docs/customer-readiness/2026-10-08-'+service.toLowerCase()+'-playbook-catalog-menu-390.png',fullPage:true});
      }
      if(width<=980)await page.keyboard.press('Escape');
    }
    assert(violations.length===0,'Menu accessibility violations: '+service);
    await page.setViewportSize({width:1440,height:900});
    await page.screenshot({path:'docs/customer-readiness/2026-10-08-'+service.toLowerCase()+'-playbook-catalog-menu-1440.png',fullPage:true});
    checks.push({service,case:'fits-320-390-768-1024-1440-and-header-axe-clean',passed:true,violations});
  }
  assert(errors.length===0,'Unhandled browser error: '+errors.join(';'));
  return {checkedAt:new Date().toISOString(),productionContacted:false,syntheticApi:true,checks,unhandledBrowserErrors:errors.length};
}
