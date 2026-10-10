import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../apps/platform/package.json', import.meta.url));
const {chromium} = require('playwright');
const deployment = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
const workspaces = [...deployment.matchAll(/^\s+workspace: (apps\/\S+)\s*$/gm)].map(m => m[1]);
assert.equal(workspaces.length, 13);
const policies = new Map(workspaces.map(workspace => {
  const source = readFileSync(new URL('../'+workspace+'/public/_headers', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const block = source.match(/^\/\*\n((?:[ \t]+[^\n]*\n?)+)/m)?.[1];
  assert(block, workspace+' has no universal browser policy');
  const headers = Object.fromEntries(block.trim().split('\n').map(line => {
    const colon = line.indexOf(':');
    assert(colon > 0, 'Invalid Pages header rule');
    return [line.slice(0, colon).trim(), line.slice(colon+1).trim()];
  }));
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Strict-Transport-Security'], 'max-age=86400');
  return [workspace, headers];
}));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:'+server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
let protectedOrigin, browser, checks=0;
const protectedServer = createServer((req,res) => {
  const query = new URL(req.url, protectedOrigin);
  const policy = policies.get(query.searchParams.get('app'));
  if(!policy){res.writeHead(404).end();return;}
  const headers = {...policy, 'Content-Type': 'text/html; charset=utf-8'};
  if(query.searchParams.has('legacy'))delete headers['Content-Security-Policy'];
  if(query.searchParams.has('csp_only'))delete headers['X-Frame-Options'];
  res.writeHead(200,headers).end('<!doctype html><title>Owned browser protection fixture</title><p data-protected>Protected fixture</p>');
});
const attackerServer = createServer((req,res) => {
  const query = new URL(req.url, 'http://127.0.0.1');
  if(query.pathname==='/lesson'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<p data-lesson>Owned lesson fixture</p>');return;}
  const target=protectedOrigin+'/?app='+encodeURIComponent(query.searchParams.get('app'))+(query.searchParams.has('legacy')?'&legacy=1':'')+(query.searchParams.has('csp_only')?'&csp_only=1':'');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><iframe src="'+target+'"></iframe>');
});
try{
  protectedOrigin=await listen(protectedServer);
  const attackerOrigin=await listen(attackerServer);
  browser=await chromium.launch({headless:true,...(!process.env.CI?{channel:'chrome'}:{})});
  const context=await browser.newContext();
  const page=await context.newPage();
  for(const workspace of workspaces){
    const target=protectedOrigin+'/?app='+encodeURIComponent(workspace);
    const response=await page.goto(target);
    assert.equal(response.status(),200);
    assert.equal(await page.locator('[data-protected]').count(),1,'Direct page must remain accessible');
    await page.goto(attackerOrigin+'/?app='+encodeURIComponent(workspace));
    const children=page.frames().filter(f=>f!==page.mainFrame());
    assert.equal(children.length,1);
    assert.equal(await children[0].locator('[data-protected]').count(),0,workspace+' was framed');
    checks++;
  }
  const workspace='apps/platform';
  await page.goto(attackerOrigin+'/?app='+encodeURIComponent(workspace)+'&legacy=1');
  assert.equal(await page.frames().find(f=>f!==page.mainFrame()).locator('[data-protected]').count(),0,'Legacy X-Frame-Options must independently reject framing');checks++;
  await page.goto(attackerOrigin+'/?app='+encodeURIComponent(workspace)+'&csp_only=1');
  assert.equal(await page.frames().find(f=>f!==page.mainFrame()).locator('[data-protected]').count(),0,'CSP frame ancestors must independently reject framing');checks++;
  await page.goto(protectedOrigin+'/deep/link?app='+encodeURIComponent(workspace));
  const features=await page.evaluate(()=>{
    const policy=document.permissionsPolicy??document.featurePolicy;
    return {camera:policy.allowsFeature('camera'),microphone:policy.allowsFeature('microphone'),geolocation:policy.allowsFeature('geolocation'),fullscreen:policy.allowsFeature('fullscreen')};
  });
  assert.deepEqual(features,{camera:true,microphone:true,geolocation:false,fullscreen:true});checks++;
  const lessonReady=page.waitForEvent('framenavigated',{predicate:frame=>frame.url().endsWith('/lesson')});
  await page.evaluate(origin=>{
    const iframe=document.createElement('iframe');iframe.src=origin+'/lesson';iframe.allowFullscreen=true;document.body.append(iframe);
  },attackerOrigin);
  const lesson=await lessonReady;
  assert.equal(await lesson.locator('[data-lesson]').count(),1,'External lesson embedding must remain usable');checks++;
  await page.evaluate(origin=>{
    globalThis.violations=[];
    document.addEventListener('securitypolicyviolation',e=>globalThis.violations.push(e.effectiveDirective));
    const base=document.createElement('base');base.href=origin+'/foreign/';document.head.append(base);
    const object=document.createElement('object');object.data=origin+'/plugin';document.body.append(object);
  },attackerOrigin);
  await page.waitForFunction(()=>globalThis.violations.includes('base-uri')&&globalThis.violations.includes('object-src'));
  assert((await page.evaluate(()=>document.baseURI)).startsWith(protectedOrigin+'/deep/link'));checks+=2;
  // No camera/microphone permission prompt or hardware request is made.
  console.log(JSON.stringify({passed:true,checks,workspaces:workspaces.length,scope:'actual Chromium policy behavior against owned local HTTP fixtures; static policy files for every Pages deployment',hardwareRequested:false,productionRequests:0,hostedQualification:'pending'}));
}finally{
  await browser?.close();
  await Promise.all([close(protectedServer),close(attackerServer)]);
}
