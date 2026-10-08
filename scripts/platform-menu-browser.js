// Real local shared platform header; anonymous synthetic API, no external traffic.
async(page)=>{
  const origin='http://127.0.0.1:4296',checks=[],errors=[];
  const assert=(v,m)=>{if(!v)throw Error(m);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.context().clearCookies();
  await page.addInitScript(()=>localStorage.setItem('schood.locale','en'));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    if(url.pathname.startsWith('/functions/v1/')||url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:{}});
    return url.origin===origin?route.continue():route.abort();
  });
  await page.setViewportSize({width:390,height:900});await page.goto(origin);
  const header=page.locator('header'),open=page.getByRole('button',{name:'Open menu',exact:true});
  await open.waitFor();
  assert(await header.getByRole('button',{name:'About',exact:true}).count()===0,'Closed links remain accessible');
  await open.focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
  assert(await header.getByRole('button',{name:'About',exact:true}).evaluate(el=>el===document.activeElement),'Tab did not enter mobile navigation');
  await page.keyboard.press('Escape');assert(await open.evaluate(el=>el===document.activeElement)&&await open.getAttribute('aria-expanded')==='false','Escape/focus failed');
  checks.push({case:'keyboard-open-hidden-links-and-escape-focus',passed:true});
  await open.click();await page.getByRole('heading',{level:1}).click();assert(await open.getAttribute('aria-expanded')==='false','Outside pointer failed');
  await open.click();await page.getByRole('button',{name:'Choose my path',exact:true}).focus();assert(await open.getAttribute('aria-expanded')==='false','Focus exit failed');
  await open.click();await header.getByRole('button',{name:'Services',exact:true}).click();assert(await open.getAttribute('aria-expanded')==='false','Same-page selection failed to close');
  await page.evaluate(()=>window.scrollTo(0,0));
  await open.click();await header.getByRole('button',{name:'About',exact:true}).click();await page.waitForURL('**/about');
  await page.getByRole('heading',{level:1,name:'Learn anything, prepare for any exam, and grow in one place.',exact:true}).waitFor();
  assert(await open.getAttribute('aria-expanded')==='false','Route change failed to close');
  checks.push({case:'outside-focus-same-page-and-route-close',passed:true});
  await open.click();
  for(const [locale,language,closeLabel] of [['uz','Language','Menyuni yopish'],['ru','Til','Закрыть меню'],['en','Язык','Close menu']]){
    await header.getByRole('combobox',{name:language,exact:true}).selectOption(locale);
    await page.getByRole('button',{name:closeLabel,exact:true}).waitFor();
  }
  await page.keyboard.press('Escape');
  checks.push({case:'english-uzbek-russian-menu-labels',passed:true});
  const violations=[];
  for(const width of [320,390,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    if(width<768)await open.click();
    assert(await header.evaluate(el=>el.scrollWidth<=el.clientWidth),'Header overflow at '+width);
    if(width===390){await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const r=await page.evaluate(async()=>{const scan=await window.axe.run('header',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return scan.violations.map(v=>({id:v.id,impact:v.impact}));});violations.push(...r);await page.screenshot({path:'docs/customer-readiness/2026-10-08-platform-menu-390.png'});}
    if(width<768)await page.keyboard.press('Escape');
  }
  assert(violations.length===0,'Header accessibility violations');
  assert(await open.count()===0,'Mobile toggle visible on desktop');
  await page.screenshot({path:'docs/customer-readiness/2026-10-08-platform-menu-1440.png'});
  await page.setViewportSize({width:390,height:900});assert(await open.getAttribute('aria-expanded')==='false','Viewport retained stale open state');
  assert(errors.length===0,'Unhandled browser errors');
  checks.push({case:'header-fits-320-390-768-1024-1440-axe-clean-resize-reset',passed:true,violations});
  return {checkedAt:new Date().toISOString(),productionContacted:false,syntheticApi:true,checks,unhandledBrowserErrors:errors.length};
}
