import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assignPurchasedSeat } from "./assignment.ts";
const actor="11111111-1111-4111-8111-111111111111", buyer="22222222-2222-4222-8222-222222222222";
const seat="33333333-3333-4333-8333-333333333333", recipient="44444444-4444-4444-8444-444444444444";
const target="55555555-5555-4555-8555-555555555555";
const recorded={ok:true,state:"assigned",deduped:false,seat:{id:seat,tenant_id:buyer,status:"active",assigned_user_id:recipient,
  assigned_tenant_id:target,plan_id:seat,product_id:target,expires_at:"2026-11-09T00:00:00Z",starts_at:"2026-10-09T00:00:00Z",
  assigned_at:"2026-10-09T00:00:00Z",ends_at:"2026-11-09T00:00:00Z",metadata:{private_financial:"must not leak"}}};
Deno.test("actual seat adapter binds verified actor and resolved tenant and makes one atomic command",async()=>{
  const calls:unknown[]=[];const result=await assignPurchasedSeat({rpc:(name:string,args:unknown)=>{calls.push({name,args});return {data:recorded,error:null};}},actor,buyer,
    {seat_id:seat,email:"  LEARNER@EXAMPLE.INVALID  ",user_id:recipient,tenant_id:target,plan_id:actor,duration_days:999,metadata:{processed:true}});
  assertEquals(calls,[{name:"assign_purchased_seat",args:{p_actor:actor,p_buyer:buyer,p_seat:seat,p_email:"learner@example.invalid"}}]);
  assertEquals(result.status,200);assertEquals((result.body.seat as any).assigned_user_id,recipient);
  assert(!JSON.stringify(result.body).includes("private_financial"));assert(!JSON.stringify(result.body).includes("metadata"));
});
Deno.test("actual seat adapter returns a committed replay without inventing another grant",async()=>{
  let count=0;const result=await assignPurchasedSeat({rpc:()=>{count++;return {data:{...recorded,deduped:true},error:null};}},actor,buyer,{seat_id:seat,email:"learner@example.invalid"});
  assertEquals(count,1);assertEquals(result.status,200);assertEquals(result.body.deduped,true);
});
Deno.test("actual seat adapter refuses invalid IDs and recipient types before SQL",async()=>{
  let count=0;const client={rpc:()=>{count++;throw Error("should not execute");}};
  for(const body of [{seat_id:"bad",email:"a@example.invalid"},{seat_id:seat,email:[]},{seat_id:seat,email:" "},{seat_id:seat,email:"x".repeat(321)}]) {
    assertEquals((await assignPurchasedSeat(client,actor,buyer,body)).status,400);
  }
  assertEquals(count,0);
});
Deno.test("actual seat adapter hides database details and keeps failures distinct from committed assignment",async()=>{
  for(const [code,status] of [["42501",403],["P0002",404],["22023",409],["23505",409],["23514",409],["22P02",409],["08006",503],["PGRST002",503]] as const) {
    const result=await assignPurchasedSeat({rpc:()=>({data:null,error:{code,message:"private customer database detail"}})},actor,buyer,{seat_id:seat,email:"learner@example.invalid"});
    assertEquals(result.status,status);assertEquals(result.body.seat,undefined);assert(!JSON.stringify(result.body).includes("private customer"));
  }
});
Deno.test("actual seat adapter never accepts malformed receipt ownership or transport exceptions",async()=>{
  for(const data of [null,{...recorded,ok:false},{...recorded,state:"pending"},{...recorded,seat:{...recorded.seat,tenant_id:target}},{...recorded,seat:{...recorded.seat,assigned_user_id:null}}]) {
    assertEquals((await assignPurchasedSeat({rpc:()=>({data,error:null})},actor,buyer,{seat_id:seat,email:"learner@example.invalid"})).status,503);
  }
  assertEquals((await assignPurchasedSeat({rpc:()=>{throw Error("private socket failure");}},actor,buyer,{seat_id:seat,email:"learner@example.invalid"})).status,503);
});
