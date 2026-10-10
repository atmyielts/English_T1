import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkoutIntent, handleClickRequest } from "./handler.ts";
import { partnerCheckoutPayload } from "../partner-office/checkout.ts";

const actor="11111111-1111-4111-8111-111111111111", tenant="22222222-2222-4222-8222-222222222222";
const plan="33333333-3333-4333-8333-333333333333", id="44444444-4444-4444-8444-444444444444";
const input={plan_id:plan,description:"Synthetic plan",idempotency_key:"55555555-5555-4555-8555-555555555555",apply_credit:true};
const order=(patch={})=>({id,user_id:actor,tenant_id:tenant,provider:"platform_credit",provider_transaction_id:"credit-"+id,
  status:"paid",amount:0,original_amount:1000,credit_amount:1000,discount_amount:0,referral_discount_amount:0,
  currency:"UZS",plan_id:plan,product_id:plan,grant_completed_at:"2026-10-09T00:00:00Z",metadata:{},...patch});

async function scenario(test:(ctx:any)=>Promise<void>) {
  const env={SUPABASE_URL:"https://qa.invalid",SUPABASE_SERVICE_ROLE_KEY:"qa",CLICK_SERVICE_ID:"104316",
    CLICK_MERCHANT_ID:"1",CLICK_SECRET_KEY:"qa",CLICK_MERCHANT_USER_ID:"1"};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,Deno.env.get(k)]));
  for(const [k,v] of Object.entries(env))Deno.env.set(k,v);
  const ctx:any={calls:[],replay:{ok:true,state:"existing",payment:order()},fulfillment:{ok:false,state:"retry"}};
  const sb:any={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},
    rpc:async(name:string,args:any)=>{
      ctx.calls.push({name,args});
      if(name==="payment_checkout_replay")return {data:ctx.replay,error:ctx.error??null};
      if(name==="fulfill_paid_payment")return {data:ctx.fulfillment,error:null};
      if(name==="platform_credit_available")return {data:ctx.balance??1000,error:null};
      if(name==="create_payment_checkout")return {data:ctx.created,error:ctx.createError??null};
      if(name==="create_center_tier_checkout" || name==="create_academy_payment_checkout")return {data:ctx.created,error:ctx.createError??null};
      throw Error("Unexpected command: "+name);
    },from:(table:string)=>{
      if(!ctx.allowPricing)throw Error("Replay must not read mutable catalogue/balance: "+table);
      ctx.calls.push({table});
      const finish=()=>{
        if(table==="tenant_memberships")return {data:[{tenant_id:tenant}],error:null};
        if(table==="plans")return {data:{id:plan,product_id:plan,name:"Synthetic plan",amount:ctx.price??1000,currency:"UZS",duration_days:30,metadata:{}},error:null};
        if(table==="referral_programs")return {data:null,error:null};
        throw Error("No partial payment/reservation writes allowed: "+table);
      };
      const query:any={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>finish(),
        then:(resolve:any,reject:any)=>Promise.resolve(finish()).then(resolve,reject)};return query;
    }};
  ctx.request=async(patch={})=>{
    const response=await handleClickRequest(new Request("https://qa.invalid/functions/v1/click/create-transaction",{
      method:"POST",headers:{Authorization:"Bearer synthetic","content-type":"application/json"},body:JSON.stringify({...input,...patch}),
    }),sb);return {status:response.status,body:await response.json()};
  };
  try {await test(ctx);} finally {for(const [k,v] of Object.entries(previous))v===undefined?Deno.env.delete(k):Deno.env.set(k,v);}
}

Deno.test("actual checkout replay returns original credit-covered financial terms before any repricing",()=>scenario(async ctx=>{
  const response=await ctx.request({amount:2500,description:"Renamed plan",metadata:{referral_context:{source:"changed"}}});
  assertEquals(response.status,200);assertEquals(response.body.transaction_id,"credit-"+id);
  assertEquals(response.body.amount,0);assertEquals(response.body.credit_amount,1000);assertEquals(response.body.payment_url,null);
  assertEquals(response.body.idempotent_replay,true);assertEquals(response.body.grant_completed,true);
  assertEquals(ctx.calls.length,1);assertEquals(ctx.calls[0].args.p_intent,checkoutIntent(input));
}));
Deno.test("actual paid replay keeps activation pending and never returns another payment link",()=>scenario(async ctx=>{
  ctx.replay.payment=order({provider:"click",provider_transaction_id:id,amount:1000,credit_amount:0,grant_completed_at:null});
  const response=await ctx.request();assertEquals(response.status,202);assertEquals(response.body.status,"paid");
  assertEquals(response.body.grant_completed,false);assertEquals(response.body.payment_url,null);assertEquals(response.body.card_widget,null);
  assertEquals(ctx.calls.map((c:any)=>c.name),["payment_checkout_replay","fulfill_paid_payment"]);
}));
Deno.test("actual pending replay reconstructs a trusted payment URL from original terms",()=>scenario(async ctx=>{
  ctx.replay.payment=order({provider:"click",provider_transaction_id:id,status:"pending",amount:1250,credit_amount:0,grant_completed_at:null});
  const response=await ctx.request();assertEquals(response.status,200);const url=new URL(response.body.payment_url);
  assertEquals(url.hostname,"my.click.uz");assertEquals(url.searchParams.get("amount"),"1250.00");assertEquals(response.body.transaction_id,id);
  assertEquals(ctx.calls.length,1);
}));
Deno.test("actual legacy reference and changed-intent conflicts stop without a second purchase",()=>scenario(async ctx=>{
  ctx.replay={ok:false,state:"legacy_review",transaction_id:id};const legacy=await ctx.request();
  assertEquals(legacy.status,409);assertEquals(legacy.body.transaction_id,id);assertEquals(legacy.body.error_code,"checkout_legacy_review");
  ctx.replay={ok:false,state:"conflict"};const conflict=await ctx.request({apply_credit:false});assertEquals(conflict.status,409);
  assert(ctx.calls.every((c:any)=>c.name==="payment_checkout_replay"));
}));
Deno.test("actual revoked-actor and database failures stop checkout without leaking private errors",()=>scenario(async ctx=>{
  for(const code of ["42501","PGRST002"]){ctx.error={code,message:"private operator details",details:"private"};
    const response=await ctx.request();assertEquals(response.status,code==="42501"?403:503);assert(!JSON.stringify(response).includes("private"));}
  assertEquals(ctx.calls.length,2);
}));
Deno.test("actual malformed replay response fails closed without pricing or order creation",()=>scenario(async ctx=>{
  for(const replay of [null,{}, {ok:"true",state:"absent"},{ok:true,state:"existing",payment:order({user_id:tenant})}]){
    ctx.replay=replay;assertEquals((await ctx.request()).status,503);
  }
  assert(ctx.calls.every((c:any)=>c.name==="payment_checkout_replay"));
}));
for(const price of [1000,2000])Deno.test(`actual fresh ${price===1000?"credit-covered":"partial-credit"} checkout uses one atomic command`,()=>scenario(async ctx=>{
  ctx.allowPricing=true;ctx.price=price;ctx.replay={ok:true,state:"absent"};
  const paid=price===1000;
  ctx.created={ok:true,state:"created",payment:order({provider:paid?"platform_credit":"click",provider_transaction_id:paid?"credit-"+id:id,
    status:paid?"paid":"pending",amount:price-1000,original_amount:price,grant_completed_at:paid?"2026-10-09T00:00:00Z":null})};
  const response=await ctx.request({amount:999999,metadata:{quantity:999}});assertEquals(response.status,200);
  const commands=ctx.calls.filter((c:any)=>c.name);assertEquals(commands.map((c:any)=>c.name),["payment_checkout_replay","platform_credit_available","create_payment_checkout"]);
  const request=commands[2].args;assertEquals(request.p_request_key,input.idempotency_key);
  assertEquals(request.p_order.amount,price-1000);assertEquals(request.p_order.original_amount,price);assertEquals(request.p_order.credit_amount,1000);
  assertEquals(request.p_order.provider,paid?"platform_credit":"click");assertEquals(request.p_order.entitlement_terms.duration_days,30);
  assertEquals(response.body.grant_completed,paid);assertEquals(response.body.idempotent_replay,false);
}));
Deno.test("actual atomic checkout transport failure stays retryable without fallback payment or credit writes",()=>scenario(async ctx=>{
  ctx.allowPricing=true;ctx.replay={ok:true,state:"absent"};ctx.createError={code:"08006",message:"private lost connection"};
  const response=await ctx.request();assertEquals(response.status,503);assertEquals(response.body.error_code,"checkout_unavailable");
  assert(!JSON.stringify(response).includes("private"));assertEquals(ctx.calls.filter((c:any)=>c.name==="create_payment_checkout").length,1);
  assert(!ctx.calls.some((c:any)=>c.table==="payments"||c.table==="platform_credit_ledger"));
}));
Deno.test("actual paid checkout remains recoverable during missing Click configuration",()=>scenario(async ctx=>{
  Deno.env.delete("CLICK_SECRET_KEY");
  assertEquals((await ctx.request()).status,200);assertEquals(ctx.calls.length,1);
  ctx.allowPricing=true;ctx.replay={ok:true,state:"absent"};ctx.created={ok:true,state:"created",payment:order()};
  assertEquals((await ctx.request()).status,200);
  ctx.replay={ok:true,state:"existing",payment:order({provider:"click",status:"pending",amount:1000,grant_completed_at:null})};
  const response=await ctx.request();assertEquals(response.status,503);assertEquals(response.body.transaction_id,id);
}));

const academyInput={plan_id:null,purchase_type:"academy_tuition",metadata:{academy_id:tenant,offer_id:plan,contact_id:actor}};
const academyOrder=(patch={})=>order({provider:"click",provider_transaction_id:id,purchase_type:"academy_tuition",status:"pending",
  amount:1000,credit_amount:0,grant_completed_at:null,metadata:{academy_payment_id:actor},...patch});
Deno.test("actual Academy checkout delegates pricing, contact admission and linked records to one database command",()=>scenario(async ctx=>{
  ctx.replay={ok:true,state:"absent"};ctx.created={ok:true,state:"created",payment:academyOrder()};
  const response=await ctx.request({...academyInput,amount:1,metadata:{...academyInput.metadata,quantity:999,duration_days:999,source:"forged"}});
  assertEquals(response.status,200);assertEquals(response.body.amount,1000);assertEquals(response.body.academy_payment_id,actor);
  assertEquals(ctx.calls.map((c:any)=>c.name),["payment_checkout_replay","create_academy_payment_checkout"]);
  const command=ctx.calls[1].args;assertEquals(command.p_academy_id,tenant);assertEquals(command.p_offer_id,plan);assertEquals(command.p_contact_id,actor);
  assertEquals(command.p_provider_metadata,{click_service_id:"104316",click_merchant_id:"1"});assert(!Object.hasOwn(command,"p_order"));
}));
Deno.test("actual Academy paid replay retains its linked payment and offers no second payment during activation",()=>scenario(async ctx=>{
  ctx.replay={ok:true,state:"existing",payment:academyOrder({status:"paid"})};
  const response=await ctx.request(academyInput);assertEquals(response.status,202);assertEquals(response.body.academy_payment_id,actor);
  assertEquals(response.body.payment_url,null);assertEquals(response.body.grant_completed,false);
  assertEquals(ctx.calls.map((c:any)=>c.name),["payment_checkout_replay","fulfill_paid_payment"]);
}));
Deno.test("actual Academy invalid identity/configuration and private admission errors never leave fallback writes",()=>scenario(async ctx=>{
  ctx.replay={ok:true,state:"absent"};assertEquals((await ctx.request({...academyInput,metadata:{...academyInput.metadata,contact_id:"invalid"}})).status,400);
  for(const code of ["42501","22023","08006"]){ctx.createError={code,message:"private finance failure"};
    const response=await ctx.request(academyInput);assertEquals(response.status,code==="42501"?403:code==="22023"?400:503);
    assert(!JSON.stringify(response).includes("private"));}
  Deno.env.delete("CLICK_SECRET_KEY");assertEquals((await ctx.request(academyInput)).status,503);
  assert(ctx.calls.every((c:any)=>["payment_checkout_replay","create_academy_payment_checkout"].includes(c.name)));
}));
Deno.test("actual Academy self-payment can resolve the contact in the database without tenant membership",()=>scenario(async ctx=>{
  ctx.replay={ok:true,state:"absent"};ctx.created={ok:true,state:"created",payment:academyOrder()};
  assertEquals((await ctx.request({...academyInput,metadata:{academy_id:tenant,offer_id:plan}})).status,200);
  assertEquals(ctx.calls[1].args.p_contact_id,null);
}));

Deno.test("actual center tier checkout captures pricing and links the request through one command",()=>scenario(async ctx=>{
  ctx.replay={ok:true,state:"absent"};ctx.created={ok:true,state:"created",payment:order({provider:"click",status:"pending",amount:1000,credit_amount:0,grant_completed_at:null,purchase_type:"center_tier_upgrade"})};
  const response=await ctx.request({plan_id:null,purchase_type:"center_tier_upgrade",tenant_id:tenant,apply_credit:false,metadata:{requested_tier:"growth",billing_period:"monthly",amount:999,processed:true}});
  assertEquals(response.status,200);assertEquals(ctx.calls.map((c:any)=>c.name),["payment_checkout_replay","create_center_tier_checkout"]);
  const args=ctx.calls[1].args;assertEquals(args.p_tier,"growth");assertEquals(args.p_billing,"monthly");assertEquals(args.p_tenant_id,tenant);
  assertEquals(Object.keys(args.p_provider_metadata).sort(),["click_merchant_id","click_service_id"]);
}));
Deno.test("actual center paid replay works without provider configuration and never opens a second payment",()=>scenario(async ctx=>{
  ctx.replay.payment=order({purchase_type:"center_tier_upgrade",provider:"click",amount:1000,credit_amount:0,grant_completed_at:null});
  Deno.env.delete("CLICK_SECRET_KEY");const response=await ctx.request({purchase_type:"center_tier_upgrade"});
  assertEquals(response.status,202);assertEquals(response.body.payment_url,null);assertEquals(ctx.calls.map((c:any)=>c.name),["payment_checkout_replay","fulfill_paid_payment"]);
}));
Deno.test("actual center invalid choices and private admission errors have no fallback writes",()=>scenario(async ctx=>{
  ctx.replay={ok:true,state:"absent"};
  const input={plan_id:null,purchase_type:"center_tier_upgrade",tenant_id:tenant,apply_credit:false,metadata:{requested_tier:"growth",billing_period:"monthly"}};
  const invalid=await ctx.request({...input,metadata:{requested_tier:"starter",billing_period:"monthly"}});
  assertEquals(invalid.status,400);assertEquals(invalid.body.checkout_not_created,true);
  for(const code of ["42501","22023","P0003","PGRST002"]){ctx.createError={code,message:"private database details"};
    const response=await ctx.request(input);assertEquals(response.status,code==="42501"?403:["22023","P0003"].includes(code)?400:503);
    assert(!JSON.stringify(response.body).includes("private"));
    // A mutable SQL failure cannot retire a key another request may have used.
    assertEquals(response.body.checkout_not_created,undefined);}
}));
for(const action of ["create_wallet_topup","create_ticket_purchase","create_seat_purchase","create_tier_upgrade_payment"])Deno.test(`partner ${action} retains the purchase key and authoritative tenant without repricing`,()=>{
  const payload=partnerCheckoutPayload(action,tenant,{idempotency_key:input.idempotency_key,tenant_id:actor,amount:1000,quantity:2,seat_count:3,
    experience_id:plan,plan_id:plan,center_office:true,apply_credit:true,credit_amount:500,requested_tier:"GROWTH",metadata:{grant_completed:true,tier_change_request_id:actor}});
  assertEquals(payload.idempotency_key,input.idempotency_key);assertEquals(payload.tenant_id,tenant);
  assertEquals((payload.metadata as any).grant_completed,undefined);assertEquals((payload.metadata as any).tier_change_request_id,undefined);
  if(action==="create_wallet_topup")assertEquals(payload.credit_amount,undefined);
  if(action==="create_tier_upgrade_payment"){assertEquals(payload.plan_id,undefined);assertEquals((payload.metadata as any).requested_tier,"growth");}
});
