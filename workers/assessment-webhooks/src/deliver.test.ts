import {deliverBatch,type PreparedDelivery} from './deliver.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
const item=(n:number,url='https://hooks.example.org/in'):PreparedDelivery=>({delivery_id:`d${n}`,lease_token:`l${n}`,attempt:n,url,body:`{"n":${n}}`,headers:{'Schood-Signature':'t=1,v1=x'}});
Deno.test('statuses, redirects, timeouts and rejected URLs become reported outcomes with backoff',async()=>{
 const seen:RequestInit[]=[];
 const fetcher=((url:string,init:RequestInit)=>{seen.push(init);if(url.endsWith('/slow'))return new Promise((_r,reject)=>init.signal!.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));const status=url.endsWith('/moved')?302:url.endsWith('/fail')?500:204;return Promise.resolve(new Response(status===204?null:'body',{status}));}) as typeof fetch;
 const out=await deliverBatch([item(1),item(2,'https://hooks.example.org/fail'),item(3,'https://hooks.example.org/moved'),item(4,'https://hooks.example.org/slow'),item(5,'https://127.0.0.1/in')],fetcher,{timeoutMs:50,random:()=>0.5});
 equal(out.map(o=>[o.delivery_id,o.status,o.error]),[['d1',204,null],['d2',500,'http_500'],['d3',302,'redirect_refused'],['d4',0,'timeout'],['d5',0,'endpoint_url_rejected']]);
 equal(out.map(o=>o.retry_seconds),[60,120,240,480,960]);
 equal(seen.length,4);if(seen.some(init=>init.redirect!=='manual'||init.method!=='POST'))throw new Error('Delivery followed redirects or used the wrong method');
});
Deno.test('concurrency is bounded and every item is reported once',async()=>{
 let active=0,peak=0;
 const fetcher=(async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(null,{status:200});}) as typeof fetch;
 const out=await deliverBatch(Array.from({length:20},(_,i)=>item(i+1)),fetcher,{concurrency:3});
 equal(out.length,20);equal(new Set(out.map(o=>o.delivery_id)).size,20);if(peak>3)throw new Error('Concurrency bound exceeded: '+peak);
});
