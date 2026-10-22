import {signWebhook,verifyWebhook,webhookBackoff,webhookDelivered,webhookEvents,webhookUrl} from './webhooks.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
const rejects=(fn:()=>unknown,code:string)=>{try{fn();}catch(cause){if((cause as {code?:string}).code===code)return;throw cause;}throw new Error('Accepted invalid input for '+code);};

Deno.test('only public HTTPS domain endpoints are accepted',()=>{
 equal(webhookUrl('https://hooks.example.org/schood?x=1'),'https://hooks.example.org/schood?x=1');
 equal(webhookUrl('https://api.center.uz:443/in'),'https://api.center.uz/in');
 for(const bad of ['http://hooks.example.org/x','https://user:pw@hooks.example.org/','https://10.0.0.5/x','https://[::1]/x','https://localhost/x','https://printer.local/x','https://intranet/x','https://hooks.example.org:8443/x','https://svc.internal/x','https://a.example.org/#frag','ftp://a.example.org',42])
  rejects(()=>webhookUrl(bad),'invalid_webhook_url');
});
Deno.test('event subscriptions are a non-empty set of supported events',()=>{
 equal(webhookEvents(['result.released','attempt.submitted']),['attempt.submitted','result.released']);
 for(const bad of [[],['result.released','result.released'],['scores.exported'],'result.released'])rejects(()=>webhookEvents(bad),'invalid_webhook_events');
});
Deno.test('signatures verify, cover rotation and reject tampering, foreign secrets and stale timestamps',async()=>{
 const body='{"id":"evt","type":"result.released"}',t=1_790_000_000;
 const header=await signWebhook(['new-secret','old-secret'],t,body);
 equal(header.split(',').length,3);
 equal(await verifyWebhook('new-secret',header,body,t+10),true);equal(await verifyWebhook('old-secret',header,body,t+10),true);
 equal(await verifyWebhook('other-tenant-secret',header,body,t+10),false);
 equal(await verifyWebhook('new-secret',header,body.replace('released','withheld'),t+10),false);
 equal(await verifyWebhook('new-secret',header,body,t+301),false);
 equal(await verifyWebhook('new-secret','v1=deadbeef',body,t),false);
});
Deno.test('retry schedule grows, caps at six hours and stays within jitter bounds',()=>{
 equal([1,2,3].map(n=>webhookBackoff(n,0.5)),[60,120,240]);
 equal(webhookBackoff(20,0.5),21600);equal(webhookBackoff(1,0),48);equal(webhookBackoff(1,1),72);
 equal([200,204,299,300,400,500].map(webhookDelivered),[true,true,true,false,false,false]);
});
