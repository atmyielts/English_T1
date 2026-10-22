import {createBillingHandler,type BillingRepository} from './billing-handler.ts';
const actor='00000000-0000-4000-8000-000000000001',tenant='00000000-0000-4000-8000-000000000002',ledger='00000000-0000-4000-8000-000000000003';
const equal=(a:unknown,b:unknown)=>{if(a!==b)throw new Error(`Expected ${b}, received ${a}`);};
const calls:unknown[][]=[];
const repository:BillingRepository={user:token=>Promise.resolve(token==='valid'?actor:null),summary:(...args)=>{calls.push(['summary',...args]);return Promise.resolve({enforced:false});},adjust:(...args)=>{calls.push(['adjust',...args]);return Promise.resolve({state:'released'});},configure:(...args)=>{calls.push(['configure',...args]);return Promise.resolve({enforced:true});}};
const handle=createBillingHandler(repository,[]);
const req=(path:string,body?:unknown,token='valid',key='billing-key-0001')=>new Request(`https://test.invalid/assessment-cloud/billing/${path}${path.includes('?')?'&':'?'}tenant_id=${tenant}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{})});
Deno.test('billing reads require a signed-in actor and a bounded keyset page',async()=>{
 equal((await handle(req('summary',undefined,'invalid'))).status,401);
 equal((await handle(req('summary?limit=500'))).status,422);equal((await handle(req('summary?before=not-a-date'))).status,422);
 calls.length=0;equal((await handle(req('summary?limit=20&before=2026-10-22T10:00:00Z&before_id='+ledger))).status,200);
 equal(JSON.stringify(calls[0]),JSON.stringify(['summary',actor,tenant,'2026-10-22T10:00:00Z',ledger,20]));
});
Deno.test('support adjustments need a reason and an explicit action; only the strict fields are forwarded',async()=>{
 calls.length=0;
 equal((await handle(req('adjustments',{data:{action:'release',ledger_id:ledger,reason:'  '}}))).status,422);
 equal((await handle(req('adjustments',{data:{action:'delete',ledger_id:ledger,reason:'Device failure'}}))).status,422);
 equal((await handle(req('adjustments',{data:{action:'release',ledger_id:ledger,reason:'Device failure'}},'valid','short'))).status,422);
 equal(calls.length,0);
 equal((await handle(req('adjustments',{data:{action:'release',ledger_id:ledger,reason:'Device failure',quantity:-5,tenant_id:'x'}}))).status,200);
 equal(JSON.stringify(calls[0]),JSON.stringify(['adjust',actor,tenant,'billing-key-0001',{action:'release',ledger_id:ledger,reason:'Device failure'}]));
 equal((await handle(req('enforcement',{data:{enforced:'yes',reason:'Pilot'}}))).status,422);
 equal((await handle(req('enforcement',{data:{enforced:true,reason:'Pilot plans approved'}}))).status,200);
 equal(JSON.stringify(calls[1]),JSON.stringify(['configure',actor,'billing-key-0001',true,'Pilot plans approved']));
});
