import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { cancelVoucherBatchRequest, hasProtectedCenterFinanceFields, issueVoucherBatch, voidVoucher } from './voucher-batches.ts';
const actor='11111111-1111-4111-8111-111111111111',tenant='22222222-2222-4222-8222-222222222222';
const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',plan='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const batch='33333333-3333-4333-8333-333333333333',voucher='44444444-4444-4444-8444-444444444444';
const input={access_kind:'subscription',quantity:1,plan_id:plan,idempotency_key:key};
const result=(kind='subscription')=>({ok:true,state:'issued',deduped:false,request_key:key,
  batch:{id:batch,tenant_id:tenant,created_by:actor,access_kind:kind,quantity:1},
  vouchers:[{id:voucher,tenant_id:tenant,batch_id:batch,access_kind:kind,code:'OWNED-VOUCHER'}]});
const voidResult=()=>({ok:true,state:'void',deduped:false,voucher:{id:voucher,tenant_id:tenant,status:'void',metadata:{purchased_terms:{duration_days:30}}}});
Deno.test('voucher void binds current actor and center and uses one atomic command without table writes',async()=>{
  const calls:unknown[]=[];
  const response=await voidVoucher({rpc:(name:string,args:unknown)=>{calls.push({name,args});return {data:voidResult(),error:null};}},actor,tenant,
    {voucher_id:voucher.toUpperCase(),reason:' Owned reason ',tenant_id:actor,actor_id:tenant,status:'redeemed',refund:999});
  assertEquals(response.status,200);assertEquals(response.body.voucher,voidResult().voucher);
  assertEquals(calls,[{name:'void_unused_voucher',args:{p_actor:actor,p_tenant:tenant,p_voucher:voucher,p_reason:'Owned reason'}}]);
});
Deno.test('voucher void rejects malformed reference and unbounded reason before persistence',async()=>{
  let calls=0;const client={rpc:()=>{calls++;throw Error('must not persist');}};
  for(const body of [null,{}, {voucher_id:7},{voucher_id:'bad'},{voucher_id:voucher,reason:{}},{voucher_id:voucher,reason:'x'.repeat(501)}])
    assertEquals((await voidVoucher(client,actor,tenant,body as any)).status,400);
  assertEquals(calls,0);
});
Deno.test('voucher void hides private errors and maps uncertain outcomes to same-voucher retry',async()=>{
  for(const [code,status] of [['42501',403],['23505',409],['P0002',409],['55P03',503]]){
    const response=await voidVoucher({rpc:()=>({data:null,error:{code,message:'private-secret-sql'}})},actor,tenant,{voucher_id:voucher});
    assertEquals(response.status,status);assertEquals(JSON.stringify(response).includes('private-secret-sql'),false);
  }
  assertEquals((await voidVoucher({rpc:()=>{throw Error('private transport');}},actor,tenant,{voucher_id:voucher})).status,503);
});
Deno.test('voucher void refuses foreign malformed or incomplete success and accepts immutable replay',async()=>{
  for(const data of [null,{...voidResult(),ok:false},{...voidResult(),deduped:null},{...voidResult(),state:'issued'},
    {...voidResult(),voucher:{...voidResult().voucher,tenant_id:actor}}, {...voidResult(),voucher:{...voidResult().voucher,id:actor}},
    {...voidResult(),voucher:{...voidResult().voucher,status:'unused'}}])
    assertEquals((await voidVoucher({rpc:()=>({data,error:null})},actor,tenant,{voucher_id:voucher})).status,503);
  const response=await voidVoucher({rpc:()=>({data:{...voidResult(),deduped:true},error:null})},actor,tenant,{voucher_id:voucher});
  assertEquals(response.status,200);assertEquals(response.body.deduped,true);
});
Deno.test('voucher batch adapter binds verified actor and resolved center while excluding caller prices and identities',async()=>{
  const calls:unknown[]=[];
  const response=await issueVoucherBatch({rpc:(name:string,args:unknown)=>{calls.push({name,args});return {data:result(),error:null};}},actor,tenant,
    {...input,idempotency_key:key.toUpperCase(),plan_id:plan.toUpperCase(),user_id:'forged',tenant_id:'forged',amount:0,unit_price:0,
      funding:{source_model:'manual'},purchased_terms:{duration_days:null},assigned_students:[{name:'Owned',email:' QA@EXAMPLE.INVALID ',user_id:'forged'}]});
  assertEquals(response.status,200);assertEquals(calls,[{name:'issue_purchased_vouchers',args:{p_actor:actor,p_tenant:tenant,p_key:key,
    p_request:{access_kind:'subscription',quantity:1,plan_id:plan,assigned_students:[{name:'Owned',email:'qa@example.invalid'}]}}}]);
  assertEquals(response.body.idempotency_key,key);
});
Deno.test('voucher batch adapter uses one command for every inventory kind and legacy unkeyed callers',async()=>{
  for(const kind of ['subscription','seat','mock_exam']) {
    let calls=0;
    const response=await issueVoucherBatch({rpc:(_name:string,args:any)=>{calls++;assertEquals(args.p_key,null);return {data:result(kind),error:null};}},actor,tenant,
      {access_kind:kind,quantity:1,...(kind==='mock_exam'?{experience_id:plan}:{plan_id:plan})});
    assertEquals(response.status,200);assertEquals(calls,1);
  }
});
Deno.test('voucher batch adapter rejects malformed choices before opening a financial command',async()=>{
  let calls=0;const client={rpc:()=>{calls++;throw Error('should not reach persistence');}};
  for(const bad of [{quantity:0},{quantity:1.5},{quantity:'1'},{quantity:1001},{access_kind:['seat']},
    {idempotency_key:'invalid'},{plan_id:7},{assigned_students:[{email:7}]},{assigned_students:[{},{}]},
    {expires_in_days:0},{expires_in_days:1.5},{prefix:{}},{assigned_students:[{phone:'x'.repeat(81)}]}]) {
    assertEquals((await issueVoucherBatch(client,actor,tenant,{...input,...bad})).status,400);
  }
  assertEquals((await issueVoucherBatch(client,actor,tenant,null as any)).status,400);
  assertEquals(calls,0);
});
Deno.test('voucher batch adapter protects committed original-key replay without introducing another mutation',async()=>{
  const calls:any[]=[];const receipt={...result(),deduped:true};
  const response=await issueVoucherBatch({rpc:(name:string,args:any)=>{calls.push({name,args});return {data:receipt,error:null};}},actor,tenant,input);
  assertEquals(response.status,200);assertEquals(response.body.deduped,true);assertEquals(calls.length,1);assertEquals(calls[0].args.p_key,key);
});
Deno.test('voucher batch adapter keeps SQL and transport errors private and preserves recoverable intent',async()=>{
  for(const [code,status] of [['42501',403],['23505',409],['22023',409],['22003',409],['55P03',503]]) {
    const response=await issueVoucherBatch({rpc:()=>({data:null,error:{code,message:'private provider SQL secret'}})},actor,tenant,input);
    assertEquals(response.status,status);assertEquals(JSON.stringify(response).includes('private provider SQL secret'),false);
  }
  const response=await issueVoucherBatch({rpc:()=>{throw Error('private network detail');}},actor,tenant,input);
  assertEquals(response.status,503);assertStringIncludes(String(response.body.error),'original purchase');
});
Deno.test('voucher batch adapter refuses foreign malformed or incomplete receipts as successful inventory',async()=>{
  const changes=[{ok:false},{request_key:plan},{deduped:undefined},{batch:{...result().batch,tenant_id:actor}},
    {batch:{...result().batch,created_by:tenant}},{batch:{...result().batch,quantity:2}},
    {vouchers:[]},{vouchers:[{...result().vouchers[0],batch_id:actor}]},
    {vouchers:[{...result().vouchers[0],tenant_id:actor}]},{vouchers:[{...result().vouchers[0],id:'invalid'}]}];
  for(const change of changes)assertEquals((await issueVoucherBatch({rpc:()=>({data:{...result(),...change},error:null})},actor,tenant,input)).status,503);
});

Deno.test('center profile guard rejects self-service financial agreement and pricing changes before any persistence',()=>{
  for(const field of ['commercial_model','wholesale_pricing','wallet_settings','commission_rules','package_tier','status'])
    assertEquals(hasProtectedCenterFinanceFields({[field]:null}),true);
  assertEquals(hasProtectedCenterFinanceFields({display_name:'Owned center',slug:'owned',branding:{},public_instructions:'Welcome'}),false);
});

Deno.test('voucher cancellation adapter closes only the exact key through one authenticated command',async()=>{
  const calls:any[]=[];
  const response=await cancelVoucherBatchRequest({rpc:(name:string,args:any)=>{calls.push({name,args});return {data:{ok:true,state:'canceled',request_key:key},error:null};}},actor,tenant,input);
  assertEquals(response.status,200);assertEquals(response.body,{state:'canceled',idempotency_key:key});
  assertEquals(calls,[{name:'cancel_uncreated_voucher_issue',args:{p_actor:actor,p_tenant:tenant,p_key:key,p_request:{access_kind:'subscription',quantity:1,plan_id:plan}}}]);
});
Deno.test('voucher cancellation adapter returns a committed batch and refuses unkeyed or uncertain closures',async()=>{
  const committed=await cancelVoucherBatchRequest({rpc:()=>({data:result(),error:null})},actor,tenant,input);
  assertEquals(committed.status,200);assertEquals(committed.body.state,'issued');
  let calls=0;assertEquals((await cancelVoucherBatchRequest({rpc:()=>{calls++;throw Error('not called');}},actor,tenant,{access_kind:'subscription',quantity:1})).status,400);assertEquals(calls,0);
  for(const data of [{ok:false,state:'canceled',request_key:key},{ok:true,state:'canceled',request_key:plan},null])
    assertEquals((await cancelVoucherBatchRequest({rpc:()=>({data,error:null})},actor,tenant,input)).status,503);
});
