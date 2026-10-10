import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHash } from "node:crypto";
import { handleClickWebhook } from "./handler.ts";
import { fulfillPayment } from "./fulfillment.ts";
import { buildClickWebhookSignaturePayload, validateClickWebhookEnvelope } from "./webhook-security.ts";

const paymentId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const base=()=>({id:paymentId,provider:"click",provider_transaction_id:"123456",status:"pending",amount:1000,
  user_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",tenant_id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  product_id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",plan_id:null,granted_at:null,grant_completed_at:null,
  metadata:{click_trans_id:"123456",click_service_id:"104316",click_merchant_id:"1"}});

// Only the persistence/notification boundaries are doubles. Tests execute the
// actual callback parser, signature check, state branches and RPC adapter.
async function scenario(test:(ctx:any)=>Promise<void>) {
  const env={CLICK_SERVICE_ID:"104316",CLICK_MERCHANT_ID:"1",CLICK_MERCHANT_USER_ID:"1",CLICK_SECRET_KEY:"qa",
    TELEGRAM_PUBLIC_BOT_TOKEN:"qa",SUPABASE_URL:"https://qa.invalid",SUPABASE_SERVICE_ROLE_KEY:"qa"};
  const oldEnv=Object.fromEntries(Object.keys(env).map(k=>[k,Deno.env.get(k)]));
  const oldFetch=globalThis.fetch, runtime=(globalThis as any).EdgeRuntime;
  const ctx:any={row:base(),calls:[],notifications:[],audits:[],result:{ok:true,state:"fulfilled",deduped:false},paymentError:null,pending:[]};
  for(const [k,v] of Object.entries(env))Deno.env.set(k,v);
  (globalThis as any).EdgeRuntime={waitUntil:(p:Promise<unknown>)=>ctx.pending.push(p)};
  globalThis.fetch=async(_url,options)=>{ctx.notifications.push(JSON.parse(String(options?.body)));return new Response("{}");};
  ctx.sb={
    rpc:async(name:string,args:any)=>{ctx.calls.push({name,args});return {data:ctx.result,error:ctx.rpcError??null};},
    from:(table:string)=>{
      let update:any=null;let inserted:any=null;const filters:any[]=[];
      const finish=()=>{
        if(table==="users")return {data:[],error:null};
        if(table==="click_callback_events"){ctx.audits.push(inserted);return {data:null,error:null};}
        assertEquals(table,"payments");ctx.calls.push({table,update,filters});
        if(ctx.paymentError)return {data:null,error:ctx.paymentError};
        if(update)ctx.row={...ctx.row,...update};return {data:ctx.row,error:null};
      };
      const query:any={select:()=>query,eq:(...args:any[])=>{filters.push(args);return query;},
        not:()=>query,limit:()=>query,in:()=>query,update:(v:any)=>{update=v;return query;},
        insert:(v:any)=>{inserted=v;return query;},maybeSingle:async()=>finish(),
        then:(resolve:any,reject:any)=>Promise.resolve(finish()).then(resolve,reject)};return query;
    },
  };
  ctx.request=async(patch:Record<string,unknown>={},form=false)=>{
    const params:any={click_trans_id:"123456",service_id:"104316",click_paydoc_id:"654321",merchant_trans_id:paymentId,
      merchant_prepare_id:paymentId,amount:"1000.00",action:"1",error:"0",error_note:"Success",sign_time:"2026-10-09 16:00:00",
      sign_string:"00000000000000000000000000000000",...patch};
    const envelope=validateClickWebhookEnvelope(params,"104316");
    if(envelope.ok && !Object.hasOwn(patch,"sign_string")){
      params.sign_string=createHash("md5").update(buildClickWebhookSignaturePayload(envelope.value,"qa"),"utf8").digest("hex");
    }
    const req=new Request("https://qa.invalid/functions/v1/click/webhook",{method:"POST",
      headers:{"content-type":form?"application/x-www-form-urlencoded":"application/json"},
      body:form?new URLSearchParams(params).toString():JSON.stringify(params)});
    const response=await handleClickWebhook(req,ctx.sb);await Promise.all(ctx.pending);ctx.pending=[];
    return {status:response.status,body:await response.json()};
  };
  try {await test(ctx);} finally {
    await Promise.all(ctx.pending);globalThis.fetch=oldFetch;(globalThis as any).EdgeRuntime=runtime;
    for(const [k,v] of Object.entries(oldEnv))v===undefined?Deno.env.delete(k):Deno.env.set(k,v);
  }
}

Deno.test("actual callback rejects a forged signature before payment reads or RPCs",()=>scenario(async ctx=>{
  const response=await ctx.request({sign_string:"00000000000000000000000000000000"});
  assertEquals(response.status,401);assertEquals(response.body.error,-1);assertEquals(ctx.calls.length,0);assertEquals(ctx.notifications.length,0);
}));
Deno.test("actual callback rejects a signed wrong amount without mutation or fulfillment",()=>scenario(async ctx=>{
  const response=await ctx.request({amount:"2000.00"});assertEquals(response.body.error,-2);
  assert(ctx.calls.every((c:any)=>!c.update&&!c.name));assertEquals(ctx.notifications.length,0);
}));
Deno.test("actual completion uses the atomic RPC and notifies only after committed access",()=>scenario(async ctx=>{
  const response=await ctx.request();assertEquals(response.status,200);assertEquals(response.body.error,0);
  assertEquals(ctx.calls.filter((c:any)=>c.name),[{name:"fulfill_paid_payment",args:{p_payment_id:paymentId}}]);
  assertEquals(ctx.notifications.length,1);assert(ctx.notifications[0].text.includes("access has been activated"));
  assert(!JSON.stringify(ctx.audits).includes("sign_string"));
}));
Deno.test("actual completion accepts a recorded payment but never claims activation on RPC failure",()=>scenario(async ctx=>{
  ctx.result={ok:false,state:"retry"};const response=await ctx.request();assertEquals(response.body.error,0);
  assertEquals(ctx.row.status,"paid");assertEquals(ctx.notifications.length,0);
  assertEquals(ctx.calls.filter((c:any)=>c.name).length,1);
}));
Deno.test("actual legacy incomplete claim reaches reconciliation instead of a false-success shortcut",()=>scenario(async ctx=>{
  ctx.row.status="paid";ctx.row.granted_at="2026-10-08T00:00:00Z";ctx.result={ok:false,state:"reconciliation"};
  assertEquals((await ctx.request()).body.error,0);assertEquals(ctx.calls.filter((c:any)=>c.name).length,1);assertEquals(ctx.notifications.length,0);
}));
Deno.test("actual duplicate committed callback does not fulfill or notify again",()=>scenario(async ctx=>{
  ctx.row.status="paid";ctx.row.grant_completed_at="2026-10-09T00:00:00Z";
  assertEquals((await ctx.request({},true)).body.error,0);assertEquals(ctx.calls.filter((c:any)=>c.name).length,0);assertEquals(ctx.notifications.length,0);
}));
Deno.test("actual cancellation of an unpaid order never grants access",()=>scenario(async ctx=>{
  assertEquals((await ctx.request({error:"-9"})).body.error,0);assertEquals(ctx.row.status,"canceled");
  assertEquals(ctx.calls.filter((c:any)=>c.name).length,0);assertEquals(ctx.notifications.length,0);
}));
Deno.test("actual canceled order cannot become paid on a delayed successful callback",()=>scenario(async ctx=>{
  ctx.row.status="canceled";assertEquals((await ctx.request()).body.error,-9);
  assertEquals(ctx.row.status,"canceled");assertEquals(ctx.calls.filter((c:any)=>c.name).length,0);
}));
Deno.test("actual order update failure does not acknowledge settlement, grant or notify",()=>scenario(async ctx=>{
  // The lookup is allowed; inject the storage error specifically at the update.
  const original=ctx.sb.from;ctx.sb.from=(table:string)=>{const query=original(table);if(table==="payments"){
    const update=query.update;query.update=(v:any)=>{ctx.paymentError={message:"owned private failure"};return update(v);};}return query;};
  const response=await ctx.request();assertEquals(response.status,500);assertEquals(response.body.error,-9);
  assertEquals(ctx.calls.filter((c:any)=>c.name).length,0);assertEquals(ctx.notifications.length,0);assert(!JSON.stringify(response).includes("private failure"));
}));
Deno.test("RPC adapter never falls back to partial writes or trusts malformed completion evidence",async()=>{
  for(const data of [null,{}, {ok:true,state:"pending"},{ok:true,state:"retry"},{ok:"true",state:"fulfilled"}]){
    assertEquals(await fulfillPayment({rpc:async()=>({data,error:null})},paymentId),{ok:false,state:"unavailable"});
  }
  assertEquals(await fulfillPayment({rpc:async()=>{throw Error("private transport failure");}},paymentId),{ok:false,state:"unavailable"});
});
