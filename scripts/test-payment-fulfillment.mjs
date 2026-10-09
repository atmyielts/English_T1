// Runs the actual migration and command in an exclusively owned, network-isolated
// PostgreSQL server. No provider calls, credentials, customer data or production DB.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';

const name='schood-payment-'+randomUUID().slice(0,8);
const image='postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
const read=file=>readFileSync('supabase/migrations/'+file,'utf8');
const migration=read('20261009140000_payment_fulfillment_transaction.sql');
const checkoutMigration=read('20261009141000_payment_checkout_transaction.sql');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>q(JSON.stringify(value))+'::jsonb';
const checks=[];
let owned=false;
let report=null;
function run(args,input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>err+=data);
    const timer=setTimeout(()=>{child.kill();reject(Error('Owned PostgreSQL operation timed out'));},35_000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(Error(err.trim()||'Owned operation failed'));});child.stdin.end(input);
  });
}
const sql=text=>run(['exec','-i',name,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],text);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=async(label,test)=>{await test();checks.push({case:label,passed:true});console.log('PASS: '+label);};
const table=(file,name)=>{
  const source=read(file), start=source.indexOf('create table if not exists public.'+name+' (');
  assert.ok(start>=0,'Baseline DDL missing: '+name);
  return source.slice(start,source.indexOf('\n);',start)+4);
};
const user=randomUUID(),tenant=randomUUID(),product=randomUUID(),bundle=randomUUID(),plan=randomUUID(),experience=randomUUID(),coupon=randomUUID(),referrer=randomUUID();
const terms={source_plan_id:plan,duration_days:30,included_product_ids:[],limits:{attempts:10}};
async function payment(extra={}) {
  const row={id:randomUUID(),provider:'click',provider_transaction_id:randomUUID(),user_id:user,tenant_id:tenant,
    product_id:product,plan_id:plan,status:'paid',amount:1000,currency:'UZS',purchase_type:'plan',
    entitlement_terms:terms,metadata:{},...extra};
  const columns=Object.keys(row),values=columns.map(key=>row[key]===null?'null':typeof row[key]==='object'?json(row[key]):q(row[key]));
  await sql('insert into payments('+columns.join(',')+') values('+values.join(',')+');');return row.id;
}
const call=id=>`public.fulfill_paid_payment(${q(id)}::uuid)`;
const fulfill=async id=>JSON.parse(await sql('set role service_role;select '+call(id)+';'));
const count=(table,id)=>sql('select count(*) from '+table+' where payment_id='+q(id)+';');
const job=async id=>JSON.parse(await sql('select row_to_json(j) from payment_fulfillment_jobs j where payment_id='+q(id)+';'));
const cleanAccess=()=>sql('delete from entitlements;');
async function barrier(id) {
  for(let i=0;i<50;i++){
    if(await sql("select count(*) from pg_locks where locktype='advisory' and objid="+id+" and granted;")==='1')return;
    await pause(50);
  }throw Error('Owned independent-connection barrier unavailable');
}
try {
  await run(['run','--detach','--name',name,'--network','none','--label','schood.qa=payment-fulfillment','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);owned=true;
  let ready=false;for(let i=0;i<120;i++){try{if(await run(['exec',name,'cat','/proc/1/comm'])==='postgres'){await sql('select 1;');ready=true;break;}}catch{}await pause(100);}
  assert.ok(ready,'Native PostgreSQL final server unavailable');
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create table users(id uuid primary key,is_active boolean not null default true);create table tenants(id uuid primary key);
    create table tenant_memberships(id uuid primary key default gen_random_uuid(),user_id uuid references users(id),tenant_id uuid references tenants(id),status text not null default 'active',role text not null default 'owner');
    create table products(id uuid primary key);create table plans(id uuid primary key,product_id uuid references products(id),duration_days integer);
    create table experiences(id uuid primary key);create table coupons(id uuid primary key);
    ${table('20260202170000_platform_spine.sql','payments')}
    alter table payments add column tenant_id uuid references tenants(id),add column plan_id uuid references plans(id),
      add column granted_at timestamptz,add column grant_completed_at timestamptz,add column grant_error text,
      add column purchase_type text,add column plan_snapshot jsonb,add column entitlement_terms jsonb,
      add column coupon_id uuid references coupons(id),add column coupon_code text,add column original_amount integer,
      add column discount_amount integer,add column credit_amount integer,add column referral_discount_amount integer,
      add column referral_attribution_id uuid,add column provider_payload jsonb;
    ${table('20260202170000_platform_spine.sql','entitlements')}
    alter table entitlements add column tenant_id uuid references tenants(id),add column value jsonb;
    alter table entitlements add constraint entitlements_tenant_resource_unique unique(tenant_id,resource_type,resource_id);
    ${table('20260210193000_seats_and_experience_pricing.sql','seat_licenses')}
    ${table('20260210150000_exam_tokens_candidates.sql','exam_tokens')}
    ${table('20260507120000_partner_centers_vouchers.sql','partner_center_profiles')}
    ${table('20260507120000_partner_centers_vouchers.sql','partner_wallet_ledger')}
    ${table('20260507184000_partner_center_tier_billing.sql','partner_center_tier_subscriptions')}
    ${table('20260507184000_partner_center_tier_billing.sql','partner_center_tier_change_requests')}
    ${['referral_programs','referral_attributions','referral_rewards','platform_credit_ledger'].map(name=>table('20260501120000_partner_referrals_and_credits.sql',name)).join('\n')}
    create unique index reserve_once on platform_credit_ledger(payment_id) where entry_kind='reserve' and payment_id is not null;
    create unique index reward_once on platform_credit_ledger(reward_id) where entry_kind='grant' and reward_id is not null;
    alter table referral_programs add column referrer_cash_type text,add column referrer_cash_value integer,
      add column referrer_cash_cap integer,add column cash_payouts_enabled boolean not null default false;
    alter table referral_rewards add column cash_amount integer not null default 0,add column cash_status text not null default 'none';
    ${table('20260208020000_coupons_discounts.sql','coupon_redemptions')}
    alter table coupon_redemptions add column context_id text,add column status text not null default 'applied',
      add column redeemed_at timestamptz not null default now(),add column snapshot jsonb;
    create unique index coupon_redemptions_payment_id_unique on coupon_redemptions(payment_id) where payment_id is not null;
    create unique index coupon_redemptions_coupon_user_context_unique on coupon_redemptions(coupon_id,user_id,context_id) where context_id is not null;
    ${['academy_contacts','academy_offers','academy_offer_grants','academy_payments','academy_entitlements'].map(name=>table('20260212000000_teacher_studio_core.sql',name)).join('\n')}
    ${read('20260212010000_teacher_studio_payment_engine.sql')}
    insert into users(id) values(${q(user)}),(${q(referrer)});insert into tenants values(${q(tenant)});
    insert into products values(${q(product)}),(${q(bundle)});insert into plans values(${q(plan)},${q(product)},30);
    insert into experiences values(${q(experience)});insert into coupons values(${q(coupon)});`);
  await sql(read('20260812120000_click_payment_launch_guardrails.sql'));
  const legacy=await payment({granted_at:new Date().toISOString()}),legacyDone=await payment({granted_at:new Date().toISOString(),grant_completed_at:new Date().toISOString()});
  await check('migration lock contention rolls back the entire additive installation',async()=>{
    const holder=sql('begin;lock payments in access exclusive mode;select pg_advisory_xact_lock(434350);select pg_sleep(3);rollback;');await barrier(434350);
    await assert.rejects(sql(migration),/lock timeout/);await holder;
    assert.equal(await sql("select to_regclass('public.payment_fulfillment_receipts') is null;"),'t');
  });
  await sql(migration);
  const creditSource=read('20260501120000_partner_referrals_and_credits.sql');
  await sql(creditSource.slice(creditSource.indexOf('create or replace function public.platform_credit_available('),creditSource.indexOf('create or replace function public.consume_platform_credit(')));
  await sql(checkoutMigration);
  await sql(`insert into tenant_memberships(user_id,tenant_id) values(${q(user)},${q(tenant)});`);
  await check('legacy uncertainty never reissues access; old completion remains separate evidence',async()=>{
    assert.equal((await fulfill(legacy)).state,'reconciliation');assert.equal((await fulfill(legacyDone)).state,'legacy_completed');
    assert.equal(await count('payment_fulfillment_receipts',legacy),'0');assert.equal(await count('payment_fulfillment_receipts',legacyDone),'0');
    assert.equal(await sql('select count(*) from entitlements;'),'0');
  });
  for(const role of ['anon','authenticated']) await check(role+' cannot invoke commands or read/write financial receipts and jobs',async()=>{
    for(const t of ['payment_fulfillment_receipts','payment_fulfillment_jobs','payment_fulfillment_config'])for(const statement of ['select * from '+t,'insert into '+t+' default values','update '+t+' set '+(t==='payment_fulfillment_config'?'worker_enabled=true':'payment_id=payment_id'),'delete from '+t])
      await assert.rejects(sql('set role '+role+';'+statement+';'),/permission denied/);
    await assert.rejects(sql('set role '+role+';select '+call(legacy)+';'),/permission denied/);
    await assert.rejects(sql('set role '+role+';select retry_payment_fulfillment(5);'),/permission denied/);
  });
  await check('service receipts are append-only and worker flag requires a database owner',async()=>{
    await assert.rejects(sql('set role service_role;delete from payment_fulfillment_receipts;'),/permission denied/);
    await assert.rejects(sql('set role service_role;update payment_fulfillment_receipts set result=\'{}\';'),/permission denied/);
    await assert.rejects(sql('set role service_role;update payment_fulfillment_config set worker_enabled=true;'),/permission denied/);
    assert.equal(JSON.parse(await sql('set role service_role;select retry_payment_fulfillment(5);')).enabled,false);
  });
  await check('missing and unpaid payments cannot create receipts or access',async()=>{
    assert.equal((await fulfill(randomUUID())).state,'not_found');const id=await payment({status:'pending'});
    assert.equal((await fulfill(id)).state,'not_paid');assert.equal(await count('payment_fulfillment_jobs',id),'0');
  });
  await check('recorded purchase identity and terms cannot change during provider reconciliation',async()=>{
    const id=await payment();
    for(const change of ["entitlement_terms='{}'", "plan_snapshot='{}'", "credit_amount=1000", "amount=2000",
      "purchase_type='token_pack'", "user_id="+q(referrer), "metadata='{\"quantity\":500}'"]){
      await assert.rejects(sql('update payments set '+change+' where id='+q(id)+';'),/immutable/);
    }
    await sql('update payments set metadata=metadata||\'{"provider_stage":"complete"}\'::jsonb where id='+q(id)+';');
    assert.ok((await fulfill(id)).ok);await cleanAccess();
  });
  await check('16 simultaneous callbacks commit one grant, coupon and immutable receipt',async()=>{
    const id=await payment({coupon_id:coupon,entitlement_terms:{...terms,included_product_ids:[bundle,bundle]}});
    const replies=await Promise.all(Array.from({length:16},()=>fulfill(id)));
    assert.ok(replies.every(r=>r.ok));assert.equal(replies.filter(r=>r.deduped===false).length,1);
    assert.equal(await count('payment_fulfillment_receipts',id),'1');assert.equal(await count('coupon_redemptions',id),'1');
    assert.equal(await sql('select count(*) from entitlements;'),'2');assert.equal((await job(id)).state,'fulfilled');
    assert.equal(await sql('select granted_at=grant_completed_at from payments where id='+q(id)+';'),'t');
  });
  await cleanAccess();
  await check('two different early renewals serialize and add 60 days without lost time',async()=>{
    const ids=await Promise.all([payment(),payment()]);await Promise.all(ids.map(fulfill));
    assert.equal(await sql("select round(extract(epoch from ends_at-now())/86400) from entitlements where resource_id="+q(product)+';'),'60');
  });
  await cleanAccess();
  await check('finite renewal preserves existing active lifetime access',async()=>{
    await sql(`insert into entitlements(user_id,tenant_id,resource_type,resource_id,is_active,ends_at) values(${q(user)},${q(tenant)},'product',${q(product)},true,null);`);
    assert.ok((await fulfill(await payment())).ok);assert.equal(await sql('select ends_at is null from entitlements;'),'t');
  });
  await cleanAccess();
  await check('disabled lifetime record does not turn a finite purchase into lifetime access',async()=>{
    await sql(`insert into entitlements(user_id,tenant_id,resource_type,resource_id,is_active,ends_at) values(${q(user)},${q(tenant)},'product',${q(product)},false,null);`);
    assert.ok((await fulfill(await payment())).ok);assert.equal(await sql('select ends_at is not null and is_active from entitlements;'),'t');
  });
  await cleanAccess();
  await check('missing/invalid terms fail closed without lifetime access or raw database errors',async()=>{
    for(const bad of [null,{}, {...terms,duration_days:0},{...terms,duration_days:'invalid'}]){
      const id=await payment({entitlement_terms:bad});assert.deepEqual(await fulfill(id),{ok:false,state:'retry'});
      assert.equal(await count('payment_fulfillment_receipts',id),'0');assert.equal((await job(id)).attempts,1);
      assert.equal(await sql('select granted_at is null and grant_completed_at is null from payments where id='+q(id)+';'),'t');
    }assert.equal(await sql('select count(*) from entitlements;'),'0');
  });
  await check('credit reservation must match user, tenant, currency, amount and durable status',async()=>{
    const id=await payment({credit_amount:500});assert.equal((await fulfill(id)).state,'retry');assert.equal(await sql('select count(*) from entitlements;'),'0');
    await sql(`insert into platform_credit_ledger(user_id,tenant_id,entry_kind,status,amount,currency,payment_id) values(${q(user)},${q(tenant)},'reserve','reserved',500,'UZS',${q(id)});`);
    assert.ok((await fulfill(id)).ok);assert.equal(await sql('select status from platform_credit_ledger where payment_id='+q(id)+';'),'consumed');
    assert.ok((await fulfill(id)).deduped);
    for(const patch of ["amount=499","currency='USD'","user_id="+q(referrer),"tenant_id=null","status='released'"]){
      const other=await payment({credit_amount:500});await sql(`insert into platform_credit_ledger(user_id,tenant_id,entry_kind,status,amount,currency,payment_id) values(${q(user)},${q(tenant)},'reserve','reserved',500,'UZS',${q(other)});update platform_credit_ledger set ${patch} where payment_id=${q(other)};`);
      assert.equal((await fulfill(other)).state,'retry');assert.equal(await count('payment_fulfillment_receipts',other),'0');
    }
  });
  await cleanAccess();
  await check('late receipt failure rolls back access, coupons and credit; retry commits exactly once',async()=>{
    const id=await payment({coupon_id:coupon,credit_amount:500});
    await sql(`insert into platform_credit_ledger(user_id,tenant_id,entry_kind,status,amount,currency,payment_id) values(${q(user)},${q(tenant)},'reserve','reserved',500,'UZS',${q(id)});
      create function qa_receipt_fault() returns trigger language plpgsql as $$begin if new.payment_id=${q(id)}::uuid then raise exception 'owned injected failure';end if;return new;end$$;
      create trigger qa_receipt_fault before insert on payment_fulfillment_receipts for each row execute function qa_receipt_fault();`);
    assert.equal((await fulfill(id)).state,'retry');assert.equal(await count('coupon_redemptions',id),'0');
    assert.equal(await sql('select count(*) from entitlements;'),'0');assert.equal(await sql('select status from platform_credit_ledger where payment_id='+q(id)+';'),'reserved');
    await sql('drop trigger qa_receipt_fault on payment_fulfillment_receipts;drop function qa_receipt_fault();');
    assert.ok((await fulfill(id)).ok);assert.equal(await count('coupon_redemptions',id),'1');assert.equal((await job(id)).attempts,2);
  });
  await cleanAccess();
  await check('connection loss mid-grant rolls back effects; the durable paid job remains recoverable',async()=>{
    const id=await payment({coupon_id:coupon});
    await sql(`create function qa_abort_barrier() returns trigger language plpgsql as $$begin
      if new.payment_id=${q(id)}::uuid then perform pg_advisory_xact_lock(434351);perform pg_sleep(10);end if;return new;end$$;
      create trigger qa_abort_barrier before insert on payment_fulfillment_receipts for each row execute function qa_abort_barrier();`);
    const disconnected=assert.rejects(sql("set application_name='schood-owned-payment-abort';set role service_role;select "+call(id)+';'),/terminating|connection|server closed/i);
    await barrier(434351);await sql("select pg_terminate_backend(pid) from pg_stat_activity where application_name='schood-owned-payment-abort';");await disconnected;
    assert.equal(await sql('select count(*) from entitlements;'),'0');assert.equal(await count('coupon_redemptions',id),'0');assert.equal((await job(id)).state,'pending');
    await sql('drop trigger qa_abort_barrier on payment_fulfillment_receipts;drop function qa_abort_barrier();');
    assert.ok((await fulfill(id)).ok);assert.equal(await count('coupon_redemptions',id),'1');
  });
  await check('token pack retries generate the exact inventory once with cryptographic codes',async()=>{
    const id=await payment({purchase_type:'token_pack',metadata:{experience_id:experience,quantity:4,expires_in_days:7}});
    assert.ok((await fulfill(id)).ok);assert.ok((await fulfill(id)).deduped);
    assert.equal(await sql('select count(*) from exam_tokens where metadata->>\'payment_id\'='+q(id)+';'),'4');
    assert.equal(await sql("select bool_and(token_code ~ '^[A-F0-9]{32}$' and max_uses=1 and uses_count=0) from exam_tokens;"),'t');
  });
  await check('seat pack preserves the assignment window and captures the purchased access terms',async()=>{
    const id=await payment({purchase_type:'seat_pack',entitlement_terms:{...terms,duration_days:365},metadata:{seat_count:3,seat_plan_id:plan}});
    assert.ok((await fulfill(id)).ok);assert.ok((await fulfill(id)).deduped);assert.equal(await count('seat_licenses',id),'3');
    assert.equal(await sql('select bool_and(round(extract(epoch from expires_at-now())/86400)=30 and metadata#>>\'{entitlement_terms,duration_days}\'=\'365\') from seat_licenses where payment_id='+q(id)+';'),'t');
  });
  await check('wallet top-up is one exact ledger entry and ignores caller inflation metadata',async()=>{
    const id=await payment({purchase_type:'center_wallet_topup',product_id:null,plan_id:null,original_amount:1000,metadata:{wallet_topup_amount:1000000}});
    assert.ok((await fulfill(id)).ok);assert.ok((await fulfill(id)).deduped);assert.equal(await count('partner_wallet_ledger',id),'1');
    assert.equal(await sql('select amount from partner_wallet_ledger where payment_id='+q(id)+';'),'1000');
  });
  await check('center tiers derive from captured catalogue and concurrent renewals stack',async()=>{
    await sql(`insert into partner_center_profiles(tenant_id,display_name,slug,status,package_tier) values(${q(tenant)},'QA center','qa-center','active','starter');`);
    const tierMeta={requested_tier:'growth',billing_period:'monthly'};
    const snapshot={id:plan,duration_days:30,metadata:{is_center_tier_plan:true,center_tier:'growth',billing_period:'monthly'}};
    const ids=await Promise.all([payment({purchase_type:'center_tier_upgrade',plan_snapshot:snapshot,metadata:tierMeta}),payment({purchase_type:'center_tier_upgrade',plan_snapshot:snapshot,metadata:tierMeta})]);
    assert.ok((await Promise.all(ids.map(fulfill))).every(r=>r.ok));
    assert.equal(await sql('select round(extract(epoch from current_period_end-now())/86400) from partner_center_tier_subscriptions;'),'60');
    const forged=await payment({purchase_type:'center_tier_upgrade',plan_snapshot:snapshot,metadata:{...tierMeta,requested_tier:'exclusive'}});
    assert.equal((await fulfill(forged)).state,'retry');assert.equal(await sql('select package_tier from partner_center_profiles;'),'growth');
  });
  await check('Academy tuition commits grants and paid status together; tenant/amount mismatches do not apply',async()=>{
    const contact=randomUUID(),offer=randomUUID(),ap=randomUUID(),id=randomUUID();
    await sql(`insert into academy_contacts(id,academy_id,user_id) values(${q(contact)},${q(tenant)},${q(user)});
      insert into academy_offers(id,academy_id,name,type,price_amount,duration_days) values(${q(offer)},${q(tenant)},'QA offer','subscription',1000,30);
      insert into academy_offer_grants(academy_id,offer_id,grant_type,resource_type,resource_id,quantity) values(${q(tenant)},${q(offer)},'product_access','product',${q(product)},1);
      insert into academy_payments(id,academy_id,contact_id,offer_id,provider,provider_transaction_id,amount,metadata) values(${q(ap)},${q(tenant)},${q(contact)},${q(offer)},'click',${q(ap)},1000,${json({platform_payment_id:id})});`);
    await payment({id,purchase_type:'academy_tuition',metadata:{academy_payment_id:ap}});assert.ok((await fulfill(id)).ok);assert.ok((await fulfill(id)).deduped);
    assert.equal(await sql('select status from academy_payments where id='+q(ap)+';'),'paid');assert.equal(await count('academy_entitlements',ap),'1');
    const mismatch=await payment({purchase_type:'academy_tuition',amount:2000,metadata:{academy_payment_id:ap}});
    assert.equal((await fulfill(mismatch)).state,'retry');assert.equal(await count('academy_entitlements',ap),'1');
  });
  await check('referral cash and credit rewards are part of the same atomic receipt',async()=>{
    const pg=randomUUID(),at=randomUUID();await sql(`insert into referral_programs(id,program_key,name,status,first_purchase_only,referrer_credit_type,referrer_credit_value,cash_payouts_enabled,referrer_cash_type,referrer_cash_value)
      values(${q(pg)},'qa','QA program','active',false,'percent',10,true,'fixed',50);
      insert into referral_attributions(id,program_id,referrer_user_id,referred_user_id,referral_code) values(${q(at)},${q(pg)},${q(referrer)},${q(user)},'QA');`);
    const id=await payment({referral_attribution_id:at});assert.ok((await fulfill(id)).ok);assert.ok((await fulfill(id)).deduped);
    assert.equal(await count('referral_rewards',id),'1');assert.equal(await sql('select credit_amount||\':\'||cash_amount from referral_rewards where payment_id='+q(id)+';'),'100:50');
    assert.equal(await sql('select amount from platform_credit_ledger where payment_id='+q(id)+';'),'100');
  });
  await check('first-purchase referral reward stays singular across independent paid orders and concurrent retries',async()=>{
    const referred=randomUUID(),scope=randomUUID(),pg=randomUUID(),at=randomUUID();
    await sql(`insert into users(id) values(${q(referred)});insert into tenants values(${q(scope)});
      insert into referral_programs(id,program_key,name,status,first_purchase_only,referrer_credit_type,referrer_credit_value)
        values(${q(pg)},'qa-first','QA first purchase','active',true,'fixed',100);
      insert into referral_attributions(id,program_id,referrer_user_id,referred_user_id,referral_code)
        values(${q(at)},${q(pg)},${q(referrer)},${q(referred)},'QA-FIRST');`);
    const ids=[await payment({user_id:referred,tenant_id:scope,referral_attribution_id:at}),await payment({user_id:referred,tenant_id:scope,referral_attribution_id:at})];
    assert.ok((await Promise.all(ids.flatMap(id=>[fulfill(id),fulfill(id)]))).every(r=>r.ok));
    assert.equal(await sql('select count(*) from referral_rewards where attribution_id='+q(at)+';'),'1');
    assert.equal(await sql('select sum(credit_amount) from referral_rewards where attribution_id='+q(at)+';'),'100');
  });
  await check('malformed purchase recovery is bounded and escalates after 12 attempts',async()=>{
    const id=await payment({purchase_type:'unknown'});
    for(let i=0;i<11;i++)assert.equal((await fulfill(id)).state,'retry');
    assert.equal((await fulfill(id)).state,'reconciliation');assert.equal((await job(id)).attempts,12);
    assert.equal((await fulfill(id)).state,'reconciliation');assert.equal((await job(id)).attempts,12);
    assert.equal(await count('payment_fulfillment_receipts',id),'0');
  });
  const intent={purchase_type:'plan',plan_id:plan,apply_credit:true};
  async function checkoutActor(balance=1000) {
    const actor=randomUUID(),scope=randomUUID();
    await sql(`insert into users(id) values(${q(actor)});insert into tenants values(${q(scope)});
      insert into tenant_memberships(user_id,tenant_id) values(${q(actor)},${q(scope)});`);
    if(balance>0)await sql(`insert into platform_credit_ledger(user_id,tenant_id,entry_kind,status,amount,currency) values(${q(actor)},${q(scope)},'grant','posted',${balance},'UZS');`);
    return {actor,scope,key:randomUUID()};
  }
  const order=(ctx,extra={})=>({provider:'platform_credit',user_id:ctx.actor,tenant_id:ctx.scope,product_id:product,plan_id:plan,
    amount:0,original_amount:1000,discount_amount:0,credit_amount:1000,referral_discount_amount:0,currency:'UZS',
    purchase_type:'plan',entitlement_terms:terms,plan_snapshot:{id:plan,duration_days:30},metadata:{},...extra});
  const createCheckout=(ctx,extra={},choices=intent)=>sql(`set role service_role;select public.create_payment_checkout(${q(ctx.actor)},${q(ctx.key)},${json(choices)},${json(order(ctx,extra))});`).then(JSON.parse);
  const replayCheckout=(ctx,choices=intent)=>sql(`set role service_role;select public.payment_checkout_replay(${q(ctx.actor)},${q(ctx.key)},${json(choices)});`).then(JSON.parse);
  await check('concurrent checkout retries commit one cross-provider order, reservation and durable job',async()=>{
    const ctx=await checkoutActor();const replies=await Promise.all(Array.from({length:12},()=>createCheckout(ctx)));
    assert.equal(replies.filter(r=>r.state==='created').length,1);assert.equal(new Set(replies.map(r=>r.payment.id)).size,1);
    const id=replies[0].payment.id;assert.equal(await count('payment_checkout_requests',id),'1');
    assert.equal(await count('platform_credit_ledger',id),'1');assert.equal((await job(id)).state,'pending');
    assert.equal(await sql(`select platform_credit_available(${q(ctx.actor)},'UZS');`),'0');
    assert.equal((await replayCheckout(ctx)).payment.status,'paid');
    assert.ok((await fulfill(id)).ok);assert.equal(await count('payment_fulfillment_receipts',id),'1');
  });
  await check('replay survives consumed credit and changed catalogue and never converts to another provider',async()=>{
    const ctx=await checkoutActor();const original=await createCheckout(ctx);assert.ok((await fulfill(original.payment.id)).ok);
    await sql(`update plans set duration_days=1 where id=${q(plan)};`);
    const changed=await createCheckout(ctx,{provider:'click',amount:2500,original_amount:2500,credit_amount:0,entitlement_terms:{...terms,duration_days:1}});
    assert.equal(changed.state,'existing');assert.equal(changed.payment.id,original.payment.id);
    assert.equal(changed.payment.provider,'platform_credit');assert.equal(changed.payment.credit_amount,1000);
    assert.equal(changed.payment.entitlement_terms.duration_days,30);assert.equal((await replayCheckout(ctx)).payment.id,original.payment.id);
    assert.equal(await sql(`select count(*) from payments where user_id=${q(ctx.actor)};`),'1');
    await sql(`update plans set duration_days=30 where id=${q(plan)};`);
  });
  await check('same key with changed purchase choices conflicts without another order or reservation',async()=>{
    const ctx=await checkoutActor();const original=await createCheckout(ctx);
    assert.equal((await replayCheckout(ctx,{...intent,apply_credit:false})).state,'conflict');
    assert.equal((await createCheckout(ctx,{}, {...intent,plan_id:randomUUID()})).state,'conflict');
    assert.equal(await count('platform_credit_ledger',original.payment.id),'1');
    assert.equal(await sql(`select count(*) from payments where user_id=${q(ctx.actor)};`),'1');
  });
  await check('revoked account or membership cannot reopen a committed checkout or create another',async()=>{
    const ctx=await checkoutActor();await createCheckout(ctx);
    await sql(`update users set is_active=false where id=${q(ctx.actor)};`);
    await assert.rejects(replayCheckout(ctx),/Checkout account is unavailable/);
    await assert.rejects(createCheckout({...ctx,key:randomUUID()}),/Checkout account is unavailable/);
    await sql(`update users set is_active=true where id=${q(ctx.actor)};update tenant_memberships set status='disabled' where user_id=${q(ctx.actor)};`);
    await assert.rejects(replayCheckout(ctx),/Checkout membership is unavailable/);
    await assert.rejects(createCheckout({...ctx,key:randomUUID()}),/Checkout membership is unavailable/);
  });
  await check('insufficient credit and malformed finance leave no orphan order, request or reservation',async()=>{
    const ctx=await checkoutActor(500);
    await assert.rejects(createCheckout(ctx),/Insufficient credit balance/);
    await assert.rejects(createCheckout(ctx,{original_amount:999}),/Invalid checkout terms/);
    assert.equal(await sql(`select count(*) from payments where user_id=${q(ctx.actor)};`),'0');
    assert.equal(await sql(`select count(*) from payment_checkout_requests where user_id=${q(ctx.actor)};`),'0');
    assert.equal(await sql(`select count(*) from platform_credit_ledger where user_id=${q(ctx.actor)} and entry_kind='reserve';`),'0');
  });
  await check('two distinct checkouts cannot overspend the same balance; losing transaction leaves no payable orphan',async()=>{
    const ctx=await checkoutActor();const replies=await Promise.allSettled([createCheckout(ctx),createCheckout({...ctx,key:randomUUID()})]);
    assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal(replies.filter(r=>r.status==='rejected').length,1);
    assert.equal(await sql(`select count(*) from payments where user_id=${q(ctx.actor)};`),'1');
    assert.equal(await sql(`select platform_credit_available(${q(ctx.actor)},'UZS');`),'0');
  });
  await check('partial credit checkout is pending with one exact reservation and ignores injected completion markers',async()=>{
    const ctx=await checkoutActor();const result=await createCheckout(ctx,{provider:'click',amount:1000,original_amount:1500,credit_amount:500,
      status:'paid',grant_completed_at:new Date().toISOString(),granted_at:new Date().toISOString(),id:randomUUID(),provider_transaction_id:'attacker'});
    assert.equal(result.payment.status,'pending');assert.equal(result.payment.grant_completed_at,null);assert.equal(result.payment.granted_at,null);
    assert.equal(result.payment.provider_transaction_id,result.payment.id);assert.equal(await count('payment_fulfillment_jobs',result.payment.id),'0');
    assert.equal(await sql(`select status||':'||amount from platform_credit_ledger where payment_id=${q(result.payment.id)};`),'reserved:500');
  });
  await check('late checkout failure rolls back order, credit and queued fulfillment as a unit',async()=>{
    const ctx=await checkoutActor();
    await sql(`create function qa_checkout_fault() returns trigger language plpgsql as $$begin if new.user_id=${q(ctx.actor)}::uuid then raise exception 'owned checkout fault';end if;return new;end$$;
      create trigger qa_checkout_fault before insert on payment_checkout_requests for each row execute function qa_checkout_fault();`);
    await assert.rejects(createCheckout(ctx),/owned checkout fault/);
    assert.equal(await sql(`select count(*) from payments where user_id=${q(ctx.actor)};`),'0');
    assert.equal(await sql(`select count(*) from platform_credit_ledger where user_id=${q(ctx.actor)} and entry_kind='reserve';`),'0');
    await sql('drop trigger qa_checkout_fault on payment_checkout_requests;drop function qa_checkout_fault();');
    assert.equal((await createCheckout(ctx)).state,'created');
  });
  await check('connection loss during checkout rolls back all writes and safely resumes with the same key',async()=>{
    const ctx=await checkoutActor();
    await sql(`create function qa_checkout_abort() returns trigger language plpgsql as $$begin if new.user_id=${q(ctx.actor)}::uuid then perform pg_advisory_xact_lock(434352);perform pg_sleep(10);end if;return new;end$$;
      create trigger qa_checkout_abort before insert on payment_checkout_requests for each row execute function qa_checkout_abort();`);
    const aborted=assert.rejects(sql(`set application_name='schood-owned-checkout-abort';set role service_role;select public.create_payment_checkout(${q(ctx.actor)},${q(ctx.key)},${json(intent)},${json(order(ctx))});`),/terminating|connection|server closed/i);
    await barrier(434352);await sql("select pg_terminate_backend(pid) from pg_stat_activity where application_name='schood-owned-checkout-abort';");await aborted;
    assert.equal(await sql(`select count(*) from payments where user_id=${q(ctx.actor)};`),'0');
    assert.equal(await sql(`select platform_credit_available(${q(ctx.actor)},'UZS');`),'1000');
    await sql('drop trigger qa_checkout_abort on payment_checkout_requests;drop function qa_checkout_abort();');
    assert.equal((await createCheckout(ctx)).state,'created');
  });
  await check('legacy checkout references fail closed instead of generating a second charge',async()=>{
    const ctx=await checkoutActor();const id=await payment({user_id:ctx.actor,tenant_id:ctx.scope,status:'pending',checkout_idempotency_key:ctx.key});
    assert.deepEqual(await replayCheckout(ctx),{ok:false,state:'legacy_review',transaction_id:id});
    assert.equal((await createCheckout(ctx)).state,'legacy_review');
    assert.equal(await sql(`select count(*) from payments where user_id=${q(ctx.actor)};`),'1');assert.equal(await count('platform_credit_ledger',id),'0');
  });
  for(const role of ['anon','authenticated'])await check(role+' cannot access checkout records or invoke checkout commands',async()=>{
    await assert.rejects(sql('set role '+role+';select * from payment_checkout_requests;'),/permission denied/);
    await assert.rejects(sql(`set role ${role};select payment_checkout_replay(${q(user)},${q(randomUUID())},'{}');`),/permission denied/);
    await assert.rejects(sql(`set role ${role};select create_payment_checkout(${q(user)},${q(randomUUID())},'{}','{}');`),/permission denied/);
  });
  await check('service callers cannot rewrite or delete checkout identities directly',async()=>{
    for(const statement of ['delete from payment_checkout_requests',"update payment_checkout_requests set intent='{}'",'insert into payment_checkout_requests default values'])
      await assert.rejects(sql('set role service_role;'+statement+';'),/permission denied/);
  });
  await check('durable trigger enqueues paid transitions and worker recovers after no Edge retry',async()=>{
    const id=await payment({status:'pending'});await sql('update payments set status=\'paid\' where id='+q(id)+';');assert.equal((await job(id)).state,'pending');
    // Other deliberate invalid fixtures remain in retry with future backoff.
    await sql('update payment_fulfillment_config set worker_enabled=true;');
    let recovered=0;for(let batch=0;batch<10 && (await job(id)).state!=='fulfilled';batch++){
      const result=JSON.parse(await sql('set role service_role;select retry_payment_fulfillment(5);'));assert.ok(result.attempted<=5);recovered+=result.fulfilled;
    }assert.ok(recovered>=1);
    assert.equal((await job(id)).state,'fulfilled');assert.equal(await count('payment_fulfillment_receipts',id),'1');
  });
  report={status:'passed',engine:'native PostgreSQL 17.5',checks,productionChanged:false,cleanup:'owned container removed'};
  console.log(checks.length+' native payment cases passed.');
} finally {
  if(owned){assert.equal(await run(['inspect','--format','{{index .Config.Labels "schood.qa"}}',name]),'payment-fulfillment');await run(['rm','--force',name]);console.log('Owned network-isolated PostgreSQL container removed.');}
}

const reportPath=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
if(report && reportPath){mkdirSync(dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
