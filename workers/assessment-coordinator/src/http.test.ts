import {boundedJson} from './http.ts';
import {RuntimeError} from './protocol.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);};
async function fails(work:()=>Promise<unknown>,code:string){try{await work();throw new Error('Expected failure');}catch(cause){equal((cause as RuntimeError).code,code);}}
Deno.test('bounded canonical JSON retains status and consumes the entire normal body',async()=>{equal(await boundedJson('https://test.invalid',{},()=>Promise.resolve(Response.json({data:1},{status:409}))),{ok:false,status:409,payload:{data:1}});});
Deno.test('slow response headers time out even if upstream ignores the abort signal',()=>fails(()=>boundedJson('https://test.invalid',{},()=>new Promise(()=>{}),5),'upstream_timeout'));
Deno.test('slow response bodies time out after headers and are cancelled',async()=>{let cancelled=false;await fails(()=>boundedJson('https://test.invalid',{},()=>Promise.resolve(new Response(new ReadableStream({cancel(){cancelled=true;}}))),5),'upstream_timeout');equal(cancelled,true);});
Deno.test('oversized or invalid upstream responses never become successful receipts',async()=>{await fails(()=>boundedJson('https://test.invalid',{},()=>Promise.resolve(Response.json({large:'x'.repeat(100)})),1000,10),'upstream_payload_limit');await fails(()=>boundedJson('https://test.invalid',{},()=>Promise.resolve(new Response('not json'))),'upstream_invalid_json');});
