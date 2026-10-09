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
const academyMigration=read('20261009142000_academy_purchase_transaction.sql');
const centerMigration=read('20261009143000_center_tier_checkout_transaction.sql');
const seatMigration=read('20261009144000_seat_assignment_transaction.sql');
const voucherIssueMigration=read('20261009145000_voucher_issue_transaction.sql');
const voucherRedemptionMigration=read('20261009146000_voucher_redemption_transaction.sql');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>q(JSON.stringify(value))+'::jsonb';
const checks=[];
const filterArgument=process.argv.find(arg=>arg.startsWith("--grep="))?.slice(7);
const caseFilter=filterArgument ? new RegExp(filterArgument) : null;
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
const check=async(label,test)=>{if(caseFilter && !caseFilter.test(label))return;await test();checks.push({case:label,passed:true});console.log('PASS: '+label);};
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
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table users(id uuid primary key,is_active boolean not null default true,email text);create table tenants(id uuid primary key,metadata jsonb not null default '{}'::jsonb,type text not null default 'business');
    create table tenant_memberships(id uuid primary key default gen_random_uuid(),user_id uuid references users(id),tenant_id uuid references tenants(id),status text not null default 'active',role text not null default 'owner');
    create table products(id uuid primary key);create table plans(id uuid primary key,product_id uuid references products(id),duration_days integer,amount integer,currency text,metadata jsonb,is_active boolean,name text);
    create table experiences(id uuid primary key);create table coupons(id uuid primary key);
    ${table('20260202170000_platform_spine.sql','payments')}
    alter table payments add column tenant_id uuid references tenants(id),add column plan_id uuid references plans(id) on delete set null,
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
    ${table('20260507120000_partner_centers_vouchers.sql','partner_voucher_batches')}
    ${table('20260507120000_partner_centers_vouchers.sql','partner_vouchers')}
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
    ${['academy_contacts','academy_classrooms','academy_classroom_memberships','academy_offers','academy_offer_grants','academy_payments','academy_entitlements'].map(name=>table('20260212000000_teacher_studio_core.sql',name)).join('\n')}
    create unique index academy_contacts_academy_email_unique on academy_contacts(academy_id,lower(email)) where email is not null;
    create unique index academy_contacts_academy_phone_unique on academy_contacts(academy_id,phone) where phone is not null;
    alter table academy_offers add column classroom_id uuid references academy_classrooms(id);
    ${read('20260212010000_teacher_studio_payment_engine.sql')}
    create role academy_legacy_owner;
    grant usage on schema public to academy_legacy_owner;
    grant select,insert,update on academy_contacts,academy_offers,academy_offer_grants,academy_payments,academy_entitlements to academy_legacy_owner;
    alter function public.apply_academy_payment(uuid,uuid) owner to academy_legacy_owner;
    insert into users(id) values(${q(user)}),(${q(referrer)});insert into tenants(id) values(${q(tenant)});
    insert into products values(${q(product)}),(${q(bundle)});insert into plans(id,product_id,duration_days) values(${q(plan)},${q(product)},30);
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
  await sql(academyMigration);
  await sql(centerMigration);
  await sql(seatMigration);
  await sql(`alter table products add column status text not null default 'active',add column metadata jsonb not null default '{}';
    alter table experiences add column is_active boolean not null default true,add column product_id uuid references products(id),
      add column price_amount integer default 1000,add column price_currency text default 'UZS',add column name text default 'Owned mock',add column metadata jsonb default '{}';
    ${table('20260507170000_rich_partner_centers.sql','partner_center_students')}
    create unique index partner_center_students_user_unique on partner_center_students(tenant_id,user_id) where user_id is not null;
    create unique index partner_center_students_email_unique on partner_center_students(tenant_id,lower(email)) where email is not null and length(email)>0;`);
  await sql(read('20260606130000_partner_voucher_classroom_binding.sql'));
  await sql(voucherIssueMigration);
  await sql(voucherRedemptionMigration);
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
  await check('legacy uncaptured Academy tuition requires reconciliation instead of reading the live grant catalogue',async()=>{
    const contact=randomUUID(),offer=randomUUID(),ap=randomUUID(),id=randomUUID();
    await sql(`insert into academy_contacts(id,academy_id,user_id) values(${q(contact)},${q(tenant)},${q(user)});
      insert into academy_offers(id,academy_id,name,type,price_amount,duration_days) values(${q(offer)},${q(tenant)},'QA offer','subscription',1000,30);
      insert into academy_offer_grants(academy_id,offer_id,grant_type,resource_type,resource_id,quantity) values(${q(tenant)},${q(offer)},'product_access','product',${q(product)},1);
      insert into academy_payments(id,academy_id,contact_id,offer_id,provider,provider_transaction_id,amount,metadata) values(${q(ap)},${q(tenant)},${q(contact)},${q(offer)},'click',${q(ap)},1000,${json({platform_payment_id:id})});`);
    await payment({id,purchase_type:'academy_tuition',metadata:{academy_payment_id:ap}});
    assert.equal((await fulfill(id)).state,'reconciliation');assert.equal(await count('academy_entitlements',ap),'0');
    assert.equal(await sql('select status from academy_payments where id='+q(ap)+';'),'pending');
    await assert.rejects(sql(`set role service_role;select apply_academy_payment(${q(ap)},${q(user)});`),/atomic fulfillment command/);
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
    await sql(`insert into users(id) values(${q(referred)});insert into tenants(id) values(${q(scope)});
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
    await sql(`insert into users(id) values(${q(actor)});insert into tenants(id) values(${q(scope)});
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
  async function academyFixture() {
    const actor=randomUUID(),scope=randomUUID(),contact=randomUUID(),offer=randomUUID(),grant=randomUUID(),credits=randomUUID();
    await sql(`insert into users(id) values(${q(actor)});insert into tenants(id) values(${q(scope)});
      insert into academy_contacts(id,academy_id,user_id) values(${q(contact)},${q(scope)},${q(actor)});
      insert into academy_offers(id,academy_id,name,type,price_amount,duration_days) values(${q(offer)},${q(scope)},'Captured QA offer','subscription',1000,30);
      insert into academy_offer_grants(id,academy_id,offer_id,grant_type,resource_type,resource_id,quantity) values(${q(grant)},${q(scope)},${q(offer)},'product_access','product',${q(product)},1);
      insert into academy_offer_grants(id,academy_id,offer_id,grant_type,quantity,duration_days) values(${q(credits)},${q(scope)},${q(offer)},'writing_credits',3,7);`);
    return {actor,scope,contact,offer,grant,credits,key:randomUUID()};
  }
  const academyIntent=ctx=>({purchase_type:'academy_tuition',academy_id:ctx.scope,offer_id:ctx.offer,contact_id:ctx.contact});
  const academyCheckout=(ctx,choices=academyIntent(ctx))=>sql(`set role service_role;select create_academy_payment_checkout(${q(ctx.actor)},${q(ctx.key)},${json(choices)},${q(ctx.scope)},${q(ctx.offer)},${ctx.contact?q(ctx.contact):'null'},'{"click_service_id":"104316","click_merchant_id":"1"}');`).then(JSON.parse);
  const settleAcademy=async id=>{await sql("update payments set status='paid' where id="+q(id)+';');return fulfill(id);};
  await check('Academy contact self-payment requires no tenant membership and creates a linked contract atomically',async()=>{
    const ctx=await academyFixture(),result=await academyCheckout({...ctx,contact:null}),id=result.payment.id,ap=result.payment.metadata.academy_payment_id;
    assert.equal(result.state,'created');assert.equal(result.payment.amount,1000);assert.equal(result.payment.status,'pending');
    assert.equal(await count('payment_checkout_requests',id),'1');
    assert.equal(await sql(`select count(*) from academy_payment_purchase_terms where academy_payment_id=${q(ap)} and platform_payment_id=${q(id)};`),'1');
    assert.equal(await sql(`select metadata->>'platform_payment_id' from academy_payments where id=${q(ap)};`),id);
    assert.equal(await sql(`select count(*) from tenant_memberships where user_id=${q(ctx.actor)};`),'0');
    assert.equal(await count('academy_entitlements',ap),'0');
    assert.ok((await settleAcademy(id)).ok);assert.equal(await count('academy_entitlements',ap),'2');
    assert.ok((await fulfill(id)).deduped);assert.equal(await count('academy_entitlements',ap),'2');
  });
  await check('eight concurrent Academy checkout retries create one order, payment, snapshot and key',async()=>{
    const ctx=await academyFixture();const results=await Promise.all(Array.from({length:8},()=>academyCheckout(ctx)));
    assert.equal(results.filter(r=>r.state==='created').length,1);assert.equal(new Set(results.map(r=>r.payment.id)).size,1);
    assert.equal(await sql(`select count(*) from academy_payments where academy_id=${q(ctx.scope)};`),'1');
    assert.equal(await sql(`select count(*) from academy_payment_purchase_terms where academy_id=${q(ctx.scope)};`),'1');
    assert.equal((await academyCheckout(ctx,{...academyIntent(ctx),offer_id:randomUUID()})).state,'conflict');
  });
  await check('Academy replay and settlement retain purchased price, duration, resource and credits after live edits',async()=>{
    const ctx=await academyFixture(),original=await academyCheckout(ctx),id=original.payment.id,ap=original.payment.metadata.academy_payment_id;
    await sql(`update academy_offers set price_amount=3000,duration_days=1,is_active=false where id=${q(ctx.offer)};
      update academy_offer_grants set quantity=999,duration_days=2,resource_id=${q(bundle)} where id=${q(ctx.grant)};
      update academy_offer_grants set quantity=1000,duration_days=1 where id=${q(ctx.credits)};`);
    const replay=await academyCheckout(ctx);assert.equal(replay.state,'existing');assert.equal(replay.payment.amount,1000);assert.equal(replay.payment.id,id);
    assert.ok((await settleAcademy(id)).ok);
    assert.equal(await sql(`select resource_id||':'||quantity||':'||round(extract(epoch from expires_at-now())/86400) from academy_entitlements where payment_id=${q(ap)} and grant_type='product_access';`),product+':1:30');
    assert.equal(await sql(`select remaining||':'||round(extract(epoch from expires_at-now())/86400) from academy_entitlements where payment_id=${q(ap)} and grant_type='writing_credits';`),'3:7');
  });
  await check('deleting the catalogue offer and grants cannot erase purchased Academy access',async()=>{
    const ctx=await academyFixture(),result=await academyCheckout(ctx),ap=result.payment.metadata.academy_payment_id;
    await sql(`delete from academy_offers where id=${q(ctx.offer)};`);assert.ok((await settleAcademy(result.payment.id)).ok);
    assert.equal(await count('academy_entitlements',ap),'2');
    assert.equal(await sql(`select bool_and(offer_id is null and metadata->>'purchased_offer_id'=${q(ctx.offer)}) from academy_entitlements where payment_id=${q(ap)};`),'t');
  });
  await check('Academy finance authorization is tenant-bound and a regular member cannot buy for another contact',async()=>{
    const ctx=await academyFixture(),staff=randomUUID(),foreign=await academyFixture();
    await sql(`insert into users(id) values(${q(staff)});insert into tenant_memberships(user_id,tenant_id,role) values(${q(staff)},${q(ctx.scope)},'teacher');`);
    await assert.rejects(academyCheckout({...ctx,actor:staff}),/finance access is unavailable/);
    await assert.rejects(academyCheckout({...ctx,contact:foreign.contact}),/contact is unavailable/);
    await assert.rejects(academyCheckout({...ctx,offer:foreign.offer}),/offer is unavailable/);
    await sql(`update tenant_memberships set role='owner' where user_id=${q(staff)};`);
    const financed=await academyCheckout({...ctx,actor:staff});assert.equal(financed.payment.user_id,staff);
    assert.ok((await settleAcademy(financed.payment.id)).ok);
    assert.equal(await sql(`select bool_and(user_id=${q(ctx.actor)}::uuid) from academy_entitlements where payment_id=${q(financed.payment.metadata.academy_payment_id)};`),'t');
  });
  await check('parent-center finance authority is revalidated on Academy checkout and replay',async()=>{
    const ctx=await academyFixture(),center=randomUUID(),staff=randomUUID();
    await sql(`insert into tenants(id) values(${q(center)});insert into users(id) values(${q(staff)});
      update tenants set metadata=${json({parent_center_id:center})} where id=${q(ctx.scope)};
      insert into tenant_memberships(user_id,tenant_id,role) values(${q(staff)},${q(center)},'center_admin');`);
    const delegated={...ctx,actor:staff};assert.equal((await academyCheckout(delegated)).state,'created');
    await sql(`update tenant_memberships set status='disabled' where user_id=${q(staff)};`);
    await assert.rejects(academyCheckout(delegated),/finance access is unavailable/);
  });
  await check('ambiguous linked contacts, empty grants and invalid finite terms fail before any payable order',async()=>{
    const ctx=await academyFixture();await sql(`insert into academy_contacts(academy_id,user_id) values(${q(ctx.scope)},${q(ctx.actor)});`);
    await assert.rejects(academyCheckout({...ctx,contact:null}),/more than one row/);
    await sql(`update academy_offer_grants set duration_days=0 where id=${q(ctx.grant)};`);
    await assert.rejects(academyCheckout(ctx),/grant configuration is invalid/);
    await sql(`delete from academy_offer_grants where offer_id=${q(ctx.offer)};`);
    await assert.rejects(academyCheckout(ctx),/offer is not purchasable/);
    assert.equal(await sql(`select count(*) from academy_payments where academy_id=${q(ctx.scope)};`),'0');
    assert.equal(await sql(`select count(*) from payments where tenant_id=${q(ctx.scope)};`),'0');
  });
  await check('captured Academy payment and platform link cannot be repriced or reassigned',async()=>{
    const ctx=await academyFixture(),result=await academyCheckout(ctx),ap=result.payment.metadata.academy_payment_id;
    for(const change of ["amount=2000","currency='USD'","contact_id=null","metadata='{}'::jsonb"])
      await assert.rejects(sql(`update academy_payments set ${change} where id=${q(ap)};`),/purchased identity is immutable/);
    await assert.rejects(sql(`update payments set metadata=metadata||'{"contact_id":"${randomUUID()}"}'::jsonb where id=${q(result.payment.id)};`),/fulfillment terms are immutable/);
  });
  await check('direct Click grant application cannot bypass the atomic financial receipt boundary',async()=>{
    const ctx=await academyFixture(),result=await academyCheckout(ctx),ap=result.payment.metadata.academy_payment_id;
    await assert.rejects(sql(`set role service_role;select apply_academy_payment(${q(ap)},${q(ctx.actor)});`),/atomic fulfillment command/);
    await assert.rejects(sql(`set role service_role;select apply_academy_payment_purchase(${q(ap)},${q(ctx.actor)});`),/permission denied/);
    await assert.rejects(sql(`set role service_role;select apply_academy_payment_legacy(${q(ap)},${q(ctx.actor)});`),/permission denied/);
    assert.equal(await count('academy_entitlements',ap),'0');assert.equal(await count('payment_fulfillment_receipts',result.payment.id),'0');
    assert.ok((await settleAcademy(result.payment.id)).ok);
  });
  await check('Academy late receipt failure rolls back grants and paid status together; retry commits once',async()=>{
    const ctx=await academyFixture(),result=await academyCheckout(ctx),id=result.payment.id,ap=result.payment.metadata.academy_payment_id;
    await sql(`create function qa_academy_receipt_fault() returns trigger language plpgsql as $$begin if new.payment_id=${q(id)}::uuid then raise exception 'owned Academy late fault';end if;return new;end$$;
      create trigger qa_academy_receipt_fault before insert on payment_fulfillment_receipts for each row execute function qa_academy_receipt_fault();`);
    assert.equal((await settleAcademy(id)).state,'retry');assert.equal(await count('academy_entitlements',ap),'0');
    assert.equal(await sql(`select status from academy_payments where id=${q(ap)};`),'pending');
    assert.equal(await sql(`select metadata->>'platform_payment_status' from academy_payments where id=${q(ap)};`),'paid');
    await sql('drop trigger qa_academy_receipt_fault on payment_fulfillment_receipts;drop function qa_academy_receipt_fault();');
    assert.ok((await fulfill(id)).ok);assert.equal(await count('academy_entitlements',ap),'2');
    assert.equal(await sql(`select metadata->>'platform_grant_error' is null from academy_payments where id=${q(ap)};`),'t');
  });
  await check('Academy checkout linkage failure leaves neither an Academy invoice nor a payable platform orphan',async()=>{
    const ctx=await academyFixture();
    await sql(`create function qa_academy_checkout_fault() returns trigger language plpgsql as $$begin if new.academy_id=${q(ctx.scope)}::uuid then raise exception 'owned Academy checkout fault';end if;return new;end$$;
      create trigger qa_academy_checkout_fault before insert on academy_payment_purchase_terms for each row execute function qa_academy_checkout_fault();`);
    await assert.rejects(academyCheckout(ctx),/owned Academy checkout fault/);
    assert.equal(await sql(`select count(*) from academy_payments where academy_id=${q(ctx.scope)};`),'0');
    assert.equal(await sql(`select count(*) from payments where tenant_id=${q(ctx.scope)};`),'0');
    await sql('drop trigger qa_academy_checkout_fault on academy_payment_purchase_terms;drop function qa_academy_checkout_fault();');
    assert.equal((await academyCheckout(ctx)).state,'created');
  });
  await check('contact reassignment after checkout cannot deliver purchased Academy access to another user',async()=>{
    const ctx=await academyFixture(),result=await academyCheckout(ctx),ap=result.payment.metadata.academy_payment_id;
    await sql(`update academy_contacts set user_id=${q(referrer)} where id=${q(ctx.contact)};`);
    assert.equal((await settleAcademy(result.payment.id)).state,'retry');assert.equal(await count('academy_entitlements',ap),'0');
    assert.equal(await count('payment_fulfillment_receipts',result.payment.id),'0');
    await sql(`update academy_contacts set user_id=${q(ctx.actor)} where id=${q(ctx.contact)};`);
    assert.ok((await fulfill(result.payment.id)).ok);assert.equal(await count('academy_entitlements',ap),'2');
  });
  await check('a separately marked-paid Academy record cannot manufacture a fulfillment receipt',async()=>{
    const ctx=await academyFixture(),result=await academyCheckout(ctx),ap=result.payment.metadata.academy_payment_id;
    await sql(`update academy_payments set status='paid' where id=${q(ap)};`);
    assert.equal((await settleAcademy(result.payment.id)).state,'retry');assert.equal(await count('academy_entitlements',ap),'0');
    assert.equal(await count('payment_fulfillment_receipts',result.payment.id),'0');
  });
  await check('connection loss during Academy grants rolls back access and invoice status; the paid job recovers',async()=>{
    const ctx=await academyFixture(),result=await academyCheckout(ctx),id=result.payment.id,ap=result.payment.metadata.academy_payment_id;
    await sql(`update payments set status='paid' where id=${q(id)};
      create function qa_academy_abort() returns trigger language plpgsql as $$begin if new.payment_id=${q(id)}::uuid then perform pg_advisory_xact_lock(434353);perform pg_sleep(10);end if;return new;end$$;
      create trigger qa_academy_abort before insert on payment_fulfillment_receipts for each row execute function qa_academy_abort();`);
    const aborted=assert.rejects(sql(`set application_name='schood-owned-academy-abort';set role service_role;select fulfill_paid_payment(${q(id)});`),/terminating|connection|server closed/i);
    await barrier(434353);await sql("select pg_terminate_backend(pid) from pg_stat_activity where application_name='schood-owned-academy-abort';");await aborted;
    assert.equal(await count('academy_entitlements',ap),'0');assert.equal(await sql(`select status from academy_payments where id=${q(ap)};`),'pending');
    await sql('drop trigger qa_academy_abort on payment_fulfillment_receipts;drop function qa_academy_abort();');
    assert.ok((await fulfill(id)).ok);assert.equal(await count('academy_entitlements',ap),'2');
  });
  await check('installed non-Click Academy settlement remains available through the private preserved implementation',async()=>{
    const ctx=await academyFixture(),ap=randomUUID();
    await sql(`insert into academy_payments(id,academy_id,contact_id,offer_id,provider,provider_transaction_id,amount,currency) values(${q(ap)},${q(ctx.scope)},${q(ctx.contact)},${q(ctx.offer)},'offline',${q(ap)},1000,'UZS');`);
    const result=JSON.parse(await sql(`set role service_role;select apply_academy_payment(${q(ap)},${q(ctx.actor)});`));assert.ok(result.ok);
    assert.equal(await count('academy_entitlements',ap),'2');
  });
  for(const role of ['anon','authenticated'])await check(role+' cannot read snapshots or invoke Academy checkout/settlement helpers',async()=>{
    await assert.rejects(sql(`set role ${role};select * from academy_payment_purchase_terms;`),/permission denied/);
    await assert.rejects(sql(`set role ${role};select create_academy_payment_checkout(${q(user)},${q(randomUUID())},'{}',${q(tenant)},${q(plan)},null,'{}');`),/permission denied/);
    await assert.rejects(sql(`set role ${role};select apply_academy_payment_purchase(${q(plan)},${q(user)});`),/permission denied/);
  });
  await check('service application role cannot rewrite or remove purchased Academy snapshots',async()=>{
    for(const statement of ["update academy_payment_purchase_terms set grants='[]'","delete from academy_payment_purchase_terms","insert into academy_payment_purchase_terms default values"])
      await assert.rejects(sql('set role service_role;'+statement+';'),/permission denied/);
  });
  const centerProduct='00000000-0000-4000-8000-000000000701';
  await sql(`insert into products(id) values(${q(centerProduct)});`);
  async function centerFixture() {
    const ctx={actor:randomUUID(),scope:randomUUID(),plan:randomUUID(),key:randomUUID()};
    await sql(`insert into users(id) values(${q(ctx.actor)});insert into tenants(id) values(${q(ctx.scope)});
      insert into tenant_memberships(user_id,tenant_id,role) values(${q(ctx.actor)},${q(ctx.scope)},'owner');
      insert into partner_center_profiles(tenant_id,display_name,slug,status) values(${q(ctx.scope)},'Owned center',${q(ctx.scope)},'active');
      insert into plans(id,product_id,duration_days,amount,currency,is_active,name,metadata) values(${q(ctx.plan)},${q(centerProduct)},30,1000,'UZS',true,'Owned growth plan',
        '{"is_center_tier_plan":true,"center_tier":"growth","billing_period":"monthly"}');`);return ctx;
  }
  const centerIntent=ctx=>({purchase_type:'center_tier_upgrade',tenant_id:ctx.scope,plan_id:ctx.plan,
    requested_tier:'growth',billing_period:'monthly',apply_credit:false,credit_amount:null,coupon_code:null,referral_code:null,referral_attribution_id:null});
  const centerSql=(ctx,intent=centerIntent(ctx))=>`set role service_role;select create_center_tier_checkout(${q(ctx.actor)},${q(ctx.key)},${json(intent)},${q(ctx.scope)},'growth','monthly','{}');`;
  const centerCheckout=async(ctx,intent)=>JSON.parse(await sql(centerSql(ctx,intent)));
  await check('eight concurrent center tier retries commit one linked request, order and captured catalogue',async()=>{
    const ctx=await centerFixture(),results=await Promise.all(Array.from({length:8},()=>centerCheckout(ctx)));
    assert.equal(new Set(results.map(r=>r.payment.id)).size,1);
    const id=results[0].payment.id,request=results[0].payment.metadata.tier_change_request_id;
    assert.equal(await sql(`select count(*) from partner_center_tier_change_requests where tenant_id=${q(ctx.scope)} and payment_id=${q(id)} and id=${q(request)};`),'1');
    assert.equal(await sql(`select count(*) from payments where tenant_id=${q(ctx.scope)};`),'1');
  });
  await check('different center tier purchases serialize without shared-lock upgrade deadlocks',async()=>{
    const ctx=await centerFixture(),other={...ctx,key:randomUUID()};
    const results=await Promise.all([centerCheckout(ctx),centerCheckout(other)]);assert.ok(results.every(r=>r.ok));
    assert.notEqual(results[0].payment.id,results[1].payment.id);
  });
  await check('center tier replay and paid settlement preserve price and duration after catalogue edits',async()=>{
    const ctx=await centerFixture(),result=await centerCheckout(ctx),id=result.payment.id;
    await sql(`update plans set amount=2000,duration_days=365,is_active=false,metadata='{}' where id=${q(ctx.plan)};`);
    const replay=await centerCheckout(ctx);assert.equal(replay.payment.id,id);assert.equal(replay.payment.amount,1000);
    await sql(`update payments set status='paid' where id=${q(id)};`);assert.ok((await fulfill(id)).ok);
    assert.equal(await sql(`select round(extract(epoch from current_period_end-now())/86400) from partner_center_tier_subscriptions where tenant_id=${q(ctx.scope)};`),'30');
    assert.equal(await sql(`select status from partner_center_tier_change_requests where payment_id=${q(id)};`),'applied');
  });
  await check('center billing admission rejects regular members, paused centers and revoked replay authority',async()=>{
    const ctx=await centerFixture();await sql(`update tenant_memberships set role='teacher' where tenant_id=${q(ctx.scope)};`);
    await assert.rejects(centerCheckout(ctx),/billing authority/);
    await sql(`update tenant_memberships set role='admin' where tenant_id=${q(ctx.scope)};update partner_center_profiles set status='paused' where tenant_id=${q(ctx.scope)};`);
    await assert.rejects(centerCheckout(ctx),/Center is unavailable/);
    await sql(`update partner_center_profiles set status='active' where tenant_id=${q(ctx.scope)};`);await centerCheckout(ctx);
    await sql(`update tenant_memberships set role='teacher' where tenant_id=${q(ctx.scope)};`);await assert.rejects(centerCheckout(ctx),/billing authority/);
    assert.equal(await sql(`select count(*) from payments where tenant_id=${q(ctx.scope)};`),'1');
  });
  await check('center tier invalid pricing, ambiguous catalogue and downgrades leave no payable orphan',async()=>{
    const ctx=await centerFixture();await sql(`update plans set duration_days=0 where id=${q(ctx.plan)};`);
    await assert.rejects(centerCheckout(ctx),/catalogue terms/);
    await sql(`update plans set duration_days=30 where id=${q(ctx.plan)};
      insert into plans(id,product_id,duration_days,amount,currency,is_active,metadata) select gen_random_uuid(),product_id,30,1000,currency,true,metadata from plans where id=${q(ctx.plan)};`);
    await assert.rejects(centerCheckout(ctx,{...centerIntent(ctx),plan_id:null}),/more than one row/);
    await sql(`update partner_center_profiles set package_tier='premium' where tenant_id=${q(ctx.scope)};`);
    await assert.rejects(centerCheckout(ctx),/tier change requires review/);
    assert.equal(await sql(`select count(*) from payments where tenant_id=${q(ctx.scope)};`),'0');
    assert.equal(await sql(`select count(*) from partner_center_tier_change_requests where tenant_id=${q(ctx.scope)};`),'0');
  });
  await check('center tier late checkout failure rolls back request, payment and replay identity together',async()=>{
    const ctx=await centerFixture();await sql(`create function qa_center_link_failure() returns trigger language plpgsql as $$begin if new.user_id=${q(ctx.actor)}::uuid then raise exception 'owned center late fault';end if;return new;end$$;
      create trigger qa_center_link_failure before insert on payment_checkout_requests for each row execute function qa_center_link_failure();`);
    await assert.rejects(centerCheckout(ctx),/owned center late fault/);
    assert.equal(await sql(`select count(*) from payments where tenant_id=${q(ctx.scope)};`),'0');
    assert.equal(await sql(`select count(*) from partner_center_tier_change_requests where tenant_id=${q(ctx.scope)};`),'0');
    await sql('drop trigger qa_center_link_failure on payment_checkout_requests;drop function qa_center_link_failure();');
    assert.ok((await centerCheckout(ctx)).ok);
  });
  await check('connection loss during center checkout rolls back both financial records and resumes one key',async()=>{
    const ctx=await centerFixture();await sql(`create function qa_center_checkout_abort() returns trigger language plpgsql as $$begin if new.user_id=${q(ctx.actor)}::uuid then perform pg_advisory_xact_lock(434354);perform pg_sleep(10);end if;return new;end$$;
      create trigger qa_center_checkout_abort before insert on payment_checkout_requests for each row execute function qa_center_checkout_abort();`);
    const aborted=assert.rejects(sql(`set application_name='schood-owned-center-abort';${centerSql(ctx)}`),/terminating|connection|server closed/i);
    await barrier(434354);await sql("select pg_terminate_backend(pid) from pg_stat_activity where application_name='schood-owned-center-abort';");await aborted;
    assert.equal(await sql(`select count(*) from payments where tenant_id=${q(ctx.scope)};`),'0');
    assert.equal(await sql(`select count(*) from partner_center_tier_change_requests where tenant_id=${q(ctx.scope)};`),'0');
    await sql('drop trigger qa_center_checkout_abort on payment_checkout_requests;drop function qa_center_checkout_abort();');assert.ok((await centerCheckout(ctx)).ok);
  });
  await check('legacy center tier request links only the matching tenant, payer and captured price',async()=>{
    const ctx=await centerFixture(),request=randomUUID();
    await sql(`insert into partner_center_tier_change_requests(id,tenant_id,requested_tier,billing_period,amount,requested_by) values(${q(request)},${q(ctx.scope)},'growth','monthly',1000,${q(ctx.actor)});`);
    const intent={...centerIntent(ctx),credit_amount:0,tier_change_request_id:request},result=await centerCheckout(ctx,intent);
    assert.equal(result.payment.metadata.tier_change_request_id,request);
    await assert.rejects(centerCheckout({...ctx,key:randomUUID()},intent),/Legacy center tier request requires review/);
    await assert.rejects(sql(`update partner_center_tier_change_requests set amount=2000 where id=${q(request)};`),/immutable/);
    assert.equal(await sql(`select count(*) from payments where tenant_id=${q(ctx.scope)};`),'1');
  });
  await check('center wallet and inventory purchases require database finance authority even without a center-office flag',async()=>{
    const ctx=await centerFixture();await sql(`update tenant_memberships set role='teacher' where tenant_id=${q(ctx.scope)};`);
    for(const kind of ['center_wallet_topup','token_pack','seat_pack']) {
      const row={user_id:ctx.actor,tenant_id:ctx.scope,provider:'click',purchase_type:kind,amount:1000,original_amount:1000,
        discount_amount:0,credit_amount:0,referral_discount_amount:0,currency:'UZS',metadata:{center_office:false}};
      await assert.rejects(sql(`set role service_role;select create_payment_checkout(${q(ctx.actor)},${q(randomUUID())},${json({purchase_type:kind})},${json(row)});`),/billing authority/);
    }
    assert.equal(await sql(`select count(*) from payments where tenant_id=${q(ctx.scope)};`),'0');
  });
  await check('pre-applied center request cannot manufacture a receipt or tier change',async()=>{
    const ctx=await centerFixture(),result=await centerCheckout(ctx),id=result.payment.id;
    await sql(`update partner_center_tier_change_requests set status='applied' where payment_id=${q(id)};update payments set status='paid' where id=${q(id)};`);
    assert.equal((await fulfill(id)).state,'retry');assert.equal(await count('payment_fulfillment_receipts',id),'0');
    assert.equal(await sql(`select package_tier from partner_center_profiles where tenant_id=${q(ctx.scope)};`),'starter');
  });
  for(const role of ['anon','authenticated'])await check(role+' cannot invoke center tier checkout or billing admission helpers',async()=>{
    await assert.rejects(sql(`set role ${role};select create_center_tier_checkout(${q(user)},${q(randomUUID())},'{}',${q(tenant)},'growth','monthly','{}');`),/permission denied/);
    await assert.rejects(sql(`set role ${role};select assert_center_checkout_actor(${q(user)},${q(tenant)});`),/permission denied/);
  });
  async function seatFixture(quantity=1,overrides={}) {
    const actor=randomUUID(),scope=randomUUID(),recipient=randomUUID(),target=randomUUID(),seatPlan=randomUUID();
    const email='seat-'+recipient+'@example.invalid';
    await sql(`insert into users(id,email) values(${q(actor)},${q('manager-'+actor+'@example.invalid')}),(${q(recipient)},${q(email)});
      insert into tenants(id,type) values(${q(scope)},'business'),(${q(target)},'personal');
      insert into tenant_memberships(user_id,tenant_id) values(${q(actor)},${q(scope)}),(${q(recipient)},${q(target)});
      insert into plans(id,product_id,duration_days,amount,currency,metadata,is_active,name)
        values(${q(seatPlan)},${q(product)},30,1000,'UZS','{}',true,'Owned seat plan');`);
    const captured={source_plan_id:seatPlan,duration_days:30,included_product_ids:[bundle],limits:{attempts:10},...overrides};
    const order=await payment({user_id:actor,tenant_id:scope,plan_id:seatPlan,purchase_type:'seat_pack',entitlement_terms:captured,
      metadata:{seat_count:quantity,seat_plan_id:seatPlan}});
    assert.equal((await fulfill(order)).state,'fulfilled');
    const seats=JSON.parse(await sql(`select json_agg(id order by id) from seat_licenses where payment_id=${q(order)};`));
    return {actor,scope,recipient,target,email,seatPlan,order,seats};
  }
  const assignSeat=(ctx,seat=ctx.seats[0],email=ctx.email)=>sql(`set role service_role;select assign_purchased_seat(${q(ctx.actor)},${q(ctx.scope)},${q(seat)},${q(email)});`).then(JSON.parse);
  const seatGrants=ctx=>sql(`select count(*) from entitlements where tenant_id=${q(ctx.target)};`);
  const seatReceipts=seat=>sql(`select count(*) from seat_assignment_receipts where seat_id=${q(seat)};`);
  await check('sixteen same-seat assignment retries commit one captured grant and immutable claim',async()=>{
    const ctx=await seatFixture();const results=await Promise.all(Array.from({length:16},()=>assignSeat(ctx)));
    assert.equal(results.filter(r=>!r.deduped).length,1);assert.equal(await seatReceipts(ctx.seats[0]),'1');assert.equal(await seatGrants(ctx),'2');
    assert.equal(await sql(`select bool_and(round(extract(epoch from ends_at-now())/86400)=30) from entitlements where tenant_id=${q(ctx.target)};`),'t');
  });
  await check('competing recipients cannot both claim one seat or keep losing access',async()=>{
    const ctx=await seatFixture(),other=randomUUID(),target=randomUUID(),email='other-'+other+'@example.invalid';
    await sql(`insert into users(id,email) values(${q(other)},${q(email)});insert into tenants(id,type) values(${q(target)},'personal');insert into tenant_memberships(user_id,tenant_id) values(${q(other)},${q(target)});`);
    const results=await Promise.allSettled([assignSeat(ctx),assignSeat(ctx,ctx.seats[0],email)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await seatReceipts(ctx.seats[0]),'1');
    assert.equal(await sql(`select count(distinct tenant_id) from entitlements where tenant_id in (${q(target)},${q(ctx.target)});`),'1');
  });
  await check('different seats renewing one learner serialize and retain sixty days',async()=>{
    const ctx=await seatFixture(2);await Promise.all(ctx.seats.map(seat=>assignSeat(ctx,seat)));
    assert.equal(await sql(`select bool_and(round(extract(epoch from ends_at-now())/86400)=60) from entitlements where tenant_id=${q(ctx.target)};`),'t');
    assert.equal(await sql(`select count(*) from seat_assignment_receipts where buyer_tenant_id=${q(ctx.scope)};`),'2');
    assert.equal(await sql(`select max(round(extract(epoch from ends_at-now())/86400)) from seat_licenses where tenant_id=${q(ctx.scope)};`),'60');
  });
  await check('seat grants and replay use purchased products duration and limits after catalogue edits',async()=>{
    const ctx=await seatFixture();await sql(`update plans set duration_days=999,amount=999999,is_active=false,metadata='{"included_product_ids":[],"limits":{"attempts":999}}' where id=${q(ctx.seatPlan)};`);
    await assignSeat(ctx);const before=await sql(`select json_agg(row_to_json(e) order by resource_id) from entitlements e where tenant_id=${q(ctx.target)};`);
    assert.equal((await assignSeat(ctx)).deduped,true);assert.equal(await seatGrants(ctx),'2');
    assert.equal(await sql(`select bool_and(value#>>'{limits,attempts}'='10' and round(extract(epoch from ends_at-now())/86400)=30) from entitlements where tenant_id=${q(ctx.target)};`),'t');
    assert.equal(await sql(`select json_agg(row_to_json(e) order by resource_id) from entitlements e where tenant_id=${q(ctx.target)};`),before);
  });
  await check('seat replay preserves its original beneficiary after email changes',async()=>{
    const ctx=await seatFixture();await assignSeat(ctx);await sql(`update users set email=${q('changed-'+ctx.email)} where id=${q(ctx.recipient)};`);
    assert.equal((await assignSeat(ctx)).seat.assigned_user_id,ctx.recipient);assert.equal(await seatGrants(ctx),'2');
  });
  await check('seat assignment requires exactly one owned personal tenant and never grants a shared business tenant',async()=>{
    for(const kind of ['none','member','ambiguous']) {
      const ctx=await seatFixture();
      if(kind==='none')await sql(`update tenants set type='business' where id=${q(ctx.target)};`);
      if(kind==='member')await sql(`update tenant_memberships set role='member' where user_id=${q(ctx.recipient)};`);
      if(kind==='ambiguous'){const extra=randomUUID();await sql(`insert into tenants(id,type) values(${q(extra)},'personal');insert into tenant_memberships(user_id,tenant_id) values(${q(ctx.recipient)},${q(extra)});`);}
      await assert.rejects(assignSeat(ctx),/personal account/);assert.equal(await seatReceipts(ctx.seats[0]),'0');assert.equal(await seatGrants(ctx),'0');
    }
  });
  await check('seat admission rejects teachers suspended users revoked memberships and paused centers',async()=>{
    for(const kind of ['teacher','actor-suspended','recipient-suspended','actor-revoked','center-paused']) {
      const ctx=await seatFixture();
      if(kind==='teacher')await sql(`update tenant_memberships set role='teacher' where user_id=${q(ctx.actor)};`);
      if(kind==='actor-suspended')await sql(`update users set is_active=false where id=${q(ctx.actor)};`);
      if(kind==='recipient-suspended')await sql(`update users set is_active=false where id=${q(ctx.recipient)};`);
      if(kind==='actor-revoked')await sql(`update tenant_memberships set status='inactive' where user_id=${q(ctx.actor)};`);
      if(kind==='center-paused')await sql(`insert into partner_center_profiles(tenant_id,display_name,slug,status) values(${q(ctx.scope)},'Owned paused center',${q('seat-'+ctx.scope)},'paused');`);
      await assert.rejects(assignSeat(ctx));assert.equal(await seatReceipts(ctx.seats[0]),'0');assert.equal(await seatGrants(ctx),'0');
    }
  });
  await check('finite seat renewals preserve active lifetime access and do not revive inactive lifetime records',async()=>{
    for(const active of [true,false]) {
      const ctx=await seatFixture();await sql(`insert into entitlements(user_id,tenant_id,resource_type,resource_id,is_active,starts_at,ends_at,source) values(${q(ctx.recipient)},${q(ctx.target)},'product',${q(product)},${active},now(),null,'owned_fixture');`);
      await assignSeat(ctx);assert.equal(await sql(`select ends_at is null from entitlements where tenant_id=${q(ctx.target)} and resource_id=${q(product)};`),active?'t':'f');
    }
  });
  await check('legacy assigned seats and missing financial evidence cannot manufacture new claims',async()=>{
    const ctx=await seatFixture();await sql(`update seat_licenses set status='active',assigned_user_id=${q(ctx.recipient)} where id=${q(ctx.seats[0])};`);
    await assert.rejects(assignSeat(ctx),/Legacy seat assignment/);assert.equal(await seatReceipts(ctx.seats[0]),'0');assert.equal(await seatGrants(ctx),'0');
    const legacy=randomUUID();await sql(`insert into seat_licenses(id,tenant_id,plan_id,product_id,purchaser_id,status,expires_at) values(${q(legacy)},${q(ctx.scope)},${q(ctx.seatPlan)},${q(product)},${q(ctx.actor)},'unassigned',now()+interval '1 day');`);
    await assert.rejects(assignSeat(ctx,legacy),/purchase evidence/);assert.equal(await seatGrants(ctx),'0');
  });
  await check('invalid captured seat products limits and missing duration fail before access or claim',async()=>{
    for(const invalid of [{included_product_ids:[randomUUID()]},{included_product_ids:[null]},{limits:{attempts:true}},{duration_days:undefined}]) {
      const ctx=await seatFixture(1,invalid);await assert.rejects(assignSeat(ctx));assert.equal(await seatReceipts(ctx.seats[0]),'0');assert.equal(await seatGrants(ctx),'0');
    }
  });
  await check('late assignment receipt failure rolls back seat and every product grant together',async()=>{
    const ctx=await seatFixture();await sql(`create function reject_seat_claim() returns trigger language plpgsql as $$begin raise exception 'owned late seat receipt failure';end;$$;create trigger reject_seat_claim before insert on seat_assignment_receipts for each row execute function reject_seat_claim();`);
    try {await assert.rejects(assignSeat(ctx),/owned late seat/);assert.equal(await seatGrants(ctx),'0');assert.equal(await sql(`select status from seat_licenses where id=${q(ctx.seats[0])};`),'unassigned');}
    finally {await sql('drop trigger reject_seat_claim on seat_assignment_receipts;drop function reject_seat_claim();');}
    assert.equal((await assignSeat(ctx)).state,'assigned');assert.equal(await seatGrants(ctx),'2');
  });
  await check('lost connection during seat assignment rolls back and safely resumes the original claim',async()=>{
    const ctx=await seatFixture();await sql(`create function delay_seat_claim() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(434370);perform pg_sleep(10);return new;end;$$;create trigger delay_seat_claim before insert on seat_assignment_receipts for each row execute function delay_seat_claim();`);
    const pending=sql(`set application_name='owned-seat-loss';set role service_role;select assign_purchased_seat(${q(ctx.actor)},${q(ctx.scope)},${q(ctx.seats[0])},${q(ctx.email)});`).then(()=>({ok:true}),()=>({ok:false}));
    try {await barrier(434370);await sql("select pg_terminate_backend(pid) from pg_stat_activity where application_name='owned-seat-loss';");assert.equal((await pending).ok,false);assert.equal(await seatGrants(ctx),'0');assert.equal(await seatReceipts(ctx.seats[0]),'0');assert.equal(await sql(`select status from seat_licenses where id=${q(ctx.seats[0])};`),'unassigned');}
    finally {await pending;await sql('drop trigger delay_seat_claim on seat_assignment_receipts;drop function delay_seat_claim();');}
    assert.equal((await assignSeat(ctx)).state,'assigned');assert.equal((await assignSeat(ctx)).deduped,true);
  });
  await check('purchased seat identity and completed assignment cannot be rewritten or removed',async()=>{
    const ctx=await seatFixture();await assignSeat(ctx);
    for(const mutation of [`delete from seat_licenses where id=${q(ctx.seats[0])}`,`update seat_licenses set expires_at=now()+interval '999 days' where id=${q(ctx.seats[0])}`,`update seat_licenses set assigned_user_id=${q(ctx.actor)} where id=${q(ctx.seats[0])}`,`update seat_licenses set metadata='{}' where id=${q(ctx.seats[0])}`])await assert.rejects(sql(mutation),/immutable|retained/);
    await assert.rejects(sql(`delete from plans where id=${q(ctx.seatPlan)};`),/immutable|retained/);
    assert.equal(await sql(`select count(*) from plans where id=${q(ctx.seatPlan)};`),'1');
    const unpurchased=randomUUID();
    await sql(`insert into seat_licenses(id,tenant_id,plan_id,product_id,purchaser_id,status,expires_at) values(${q(unpurchased)},${q(ctx.scope)},${q(ctx.seatPlan)},${q(product)},${q(ctx.actor)},'unassigned',now()+interval '1 day');delete from seat_licenses where id=${q(unpurchased)};`);
    assert.equal(await sql(`select count(*) from seat_licenses where id=${q(unpurchased)};`),'0');
  });
  await check('seats reserved for unused vouchers cannot be assigned through the direct manager command',async()=>{
    const ctx=await seatFixture();await sql(`insert into partner_vouchers(tenant_id,code,access_kind,product_id,plan_id,seat_license_id,expires_at) values(${q(ctx.scope)},${q('OWNED-'+randomUUID())},'seat',${q(product)},${q(ctx.seatPlan)},${q(ctx.seats[0])},now()+interval '1 day');`);
    await assert.rejects(assignSeat(ctx),/reserved for a voucher/);assert.equal(await seatGrants(ctx),'0');assert.equal(await seatReceipts(ctx.seats[0]),'0');
  });
  for(const role of ['anon','authenticated','service_role'])await check(role+' cannot mutate assignment receipts or invoke private seat grant helpers',async()=>{
    await assert.rejects(sql(`set role ${role};update seat_assignment_receipts set result='{}';`),/permission denied/);
    await assert.rejects(sql(`set role ${role};select commit_seat_assignment(${q(user)},${q(tenant)},${q(randomUUID())},${q(user)},${q(tenant)},'owned@example.invalid');`),/permission denied/);
    if(role!=='service_role') {
      await assert.rejects(sql(`set role ${role};update seat_licenses set status='unassigned';`),/permission denied/);
      await assert.rejects(sql(`set role ${role};select assign_purchased_seat(${q(user)},${q(tenant)},${q(randomUUID())},'owned@example.invalid');`),/permission denied/);
    }
  });

  async function voucherFixture(quantity=2,balance=10000) {
    const ctx=await seatFixture(quantity);
    const mock=randomUUID();
    await sql(`insert into partner_center_profiles(tenant_id,display_name,slug,status,package_tier) values(${q(ctx.scope)},'Owned voucher center',${q('voucher-'+ctx.scope)},'active','starter');
      update plans set metadata=${json({included_product_ids:[bundle],limits:{attempts:10}})} where id=${q(ctx.seatPlan)};
      insert into experiences(id,product_id,price_amount,metadata) values(${q(mock)},${q(product)},1000,'{"ticketing":{"eligible":true,"mode":"single_sitting"}}');`);
    if(balance>0)await sql(`insert into partner_wallet_ledger(tenant_id,entry_kind,amount) values(${q(ctx.scope)},'credit',${balance});`);
    return {...ctx,mock,key:randomUUID()};
  }
  const voucherRequest=(ctx,kind='subscription',extra={})=>({access_kind:kind,quantity:2,expires_in_days:30,prefix:'OWNED',
    ...(kind==='mock_exam'?{experience_id:ctx.mock}:{plan_id:ctx.seatPlan}),...extra});
  const issueVouchers=(ctx,key=ctx.key,request=voucherRequest(ctx))=>sql(`set role service_role;select issue_purchased_vouchers(${q(ctx.actor)},${q(ctx.scope)},${key===null?'null':q(key)},${json(request)});`).then(JSON.parse);
  const voucherCount=ctx=>sql(`select count(*) from partner_vouchers where tenant_id=${q(ctx.scope)};`);
  const voucherDebits=ctx=>sql(`select count(*) from partner_wallet_ledger where tenant_id=${q(ctx.scope)} and entry_kind='debit';`);
  await check('voucher issue sixteen concurrent retries commit one batch roster inventory and wallet debit',async()=>{
    const ctx=await voucherFixture(),request=voucherRequest(ctx,'subscription',{assigned_students:[{name:'Owned learner',email:ctx.email}]});
    const replies=await Promise.all(Array.from({length:16},()=>issueVouchers(ctx,ctx.key,request)));
    assert.equal(replies.filter(r=>!r.deduped).length,1);assert.equal(new Set(replies.map(r=>r.batch.id)).size,1);
    assert.equal(await voucherCount(ctx),'2');assert.equal(await voucherDebits(ctx),'1');
    assert.equal(await sql(`select count(*) from voucher_issue_receipts where tenant_id=${q(ctx.scope)};`),'1');
    assert.equal(await sql(`select count(*) from partner_center_students where tenant_id=${q(ctx.scope)};`),'1');
    assert.equal(await sql(`select amount from partner_wallet_ledger where tenant_id=${q(ctx.scope)} and entry_kind='debit';`),'2000');
  });
  await check('voucher issue original key retains funded terms and inventory after catalogue and pricing changes',async()=>{
    const ctx=await voucherFixture();const original=await issueVouchers(ctx);
    await sql(`update plans set amount=9999,duration_days=999,is_active=false,metadata='{}' where id=${q(ctx.seatPlan)};
      update partner_center_profiles set wholesale_pricing='{"subscription":9999}' where tenant_id=${q(ctx.scope)};`);
    const replay=await issueVouchers(ctx);assert.equal(replay.deduped,true);assert.equal(replay.batch.id,original.batch.id);
    assert.deepEqual(replay.vouchers,original.vouchers);assert.equal(replay.batch.metadata.purchased_terms.duration_days,30);
    assert.equal(replay.batch.metadata.purchased_terms.limits.attempts,10);assert.equal(await voucherDebits(ctx),'1');
    await assert.rejects(issueVouchers(ctx,ctx.key,voucherRequest(ctx,'subscription',{quantity:1})),/another intent/);
  });
  await check('voucher issue different keys cannot overspend a wallet or leave an unfunded losing batch',async()=>{
    const ctx=await voucherFixture(2,2000);const replies=await Promise.allSettled([issueVouchers(ctx),issueVouchers(ctx,randomUUID())]);
    assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal(await voucherCount(ctx),'2');assert.equal(await voucherDebits(ctx),'1');
    assert.equal(await sql(`select count(*) from partner_voucher_batches where tenant_id=${q(ctx.scope)};`),'1');
  });
  await check('voucher issue late receipt failure rolls back roster batch tokens and debit together',async()=>{
    const ctx=await voucherFixture(),request=voucherRequest(ctx,'mock_exam',{assigned_students:[{email:ctx.email}]});
    await sql(`create function reject_voucher_issue() returns trigger language plpgsql as $$begin raise exception 'owned late voucher receipt failure';end;$$;create trigger reject_voucher_issue before insert on voucher_issue_receipts for each row execute function reject_voucher_issue();`);
    try {await assert.rejects(issueVouchers(ctx,ctx.key,request),/owned late/);}finally{await sql('drop trigger reject_voucher_issue on voucher_issue_receipts;drop function reject_voucher_issue();');}
    assert.equal(await voucherCount(ctx),'0');assert.equal(await voucherDebits(ctx),'0');
    assert.equal(await sql(`select count(*) from exam_tokens where tenant_id=${q(ctx.scope)};`),'0');assert.equal(await sql(`select count(*) from partner_center_students where tenant_id=${q(ctx.scope)};`),'0');
    assert.equal((await issueVouchers(ctx,ctx.key,request)).vouchers.length,2);
  });
  await check('voucher issue connection loss rolls back funded inventory and same key resumes once',async()=>{
    const ctx=await voucherFixture();await sql(`create function delay_voucher_issue() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(434380);perform pg_sleep(10);return new;end;$$;create trigger delay_voucher_issue before insert on voucher_issue_receipts for each row execute function delay_voucher_issue();`);
    const pending=issueVouchers(ctx).then(()=>null,error=>error);
    try {await barrier(434380);await sql("select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and query like '%select issue_purchased_vouchers(%' and state='active';");}
    finally{await pending;await sql('drop trigger delay_voucher_issue on voucher_issue_receipts;drop function delay_voucher_issue();');}
    assert.equal(await voucherCount(ctx),'0');assert.equal(await voucherDebits(ctx),'0');
    assert.equal((await issueVouchers(ctx)).deduped,false);assert.equal((await issueVouchers(ctx)).deduped,true);assert.equal(await voucherDebits(ctx),'1');
  });
  await check('voucher issue rejects caller manual funding and scoped commercial overrides before inventory',async()=>{
    const ctx=await voucherFixture();
    for(const source_model of ['manual','wholesale','revenue_share','hybrid'])await assert.rejects(issueVouchers(ctx,randomUUID(),voucherRequest(ctx,'subscription',{source_model})),/funding cannot override/);
    assert.equal(await voucherCount(ctx),'0');assert.equal(await voucherDebits(ctx),'0');
    await sql(`update partner_center_profiles set commercial_model='hybrid' where tenant_id=${q(ctx.scope)};`);
    await assert.rejects(issueVouchers(ctx),/agreement requires review/);assert.equal(await voucherCount(ctx),'0');
  });
  await check('voucher issue configured wholesale and revenue share preserve agreements without fabricated wallet debits',async()=>{
    for(const model of ['wholesale','revenue_share']) {
      const ctx=await voucherFixture(2,0);await sql(`update partner_center_profiles set commercial_model=${q(model)},wholesale_pricing=${json({['subscription:'+ctx.seatPlan]:500})} where tenant_id=${q(ctx.scope)};`);
      const result=await issueVouchers(ctx);assert.equal(result.batch.source_model,model);assert.equal(result.batch.metadata.total_amount,1000);assert.equal(await voucherDebits(ctx),'0');
      assert.equal(await sql(`select funding->>'commercial_model' from voucher_issue_receipts where batch_id=${q(result.batch.id)};`),model);
    }
  });
  await check('voucher issue current finance authority applies to new inventory and committed replay',async()=>{
    for(const change of ['teacher','revoked','suspended','paused']) {
      const ctx=await voucherFixture();await issueVouchers(ctx);
      if(change==='teacher')await sql(`update tenant_memberships set role='teacher' where user_id=${q(ctx.actor)};`);
      if(change==='revoked')await sql(`update tenant_memberships set status='inactive' where user_id=${q(ctx.actor)};`);
      if(change==='suspended')await sql(`update users set is_active=false where id=${q(ctx.actor)};`);
      if(change==='paused')await sql(`update partner_center_profiles set status='paused' where tenant_id=${q(ctx.scope)};`);
      await assert.rejects(issueVouchers(ctx));await assert.rejects(issueVouchers(ctx,randomUUID()));assert.equal(await voucherCount(ctx),'2');
    }
  });
  await check('voucher issue validates quantity roster pricing access terms and currency before funding',async()=>{
    for(const invalid of ['quantity','roster','price','limits','duration','currency','product','overflow','expiry']) {
      const ctx=await voucherFixture();let request=voucherRequest(ctx);
      if(invalid==='quantity')request.quantity=51;
      if(invalid==='roster')request.assigned_students=[{email:42}];
      if(invalid==='price')await sql(`update partner_center_profiles set wholesale_pricing='{"subscription":null}' where tenant_id=${q(ctx.scope)};`);
      if(invalid==='limits')await sql(`update plans set metadata='{"limits":{"attempts":true}}' where id=${q(ctx.seatPlan)};`);
      if(invalid==='duration')await sql(`update plans set duration_days=0 where id=${q(ctx.seatPlan)};`);
      if(invalid==='currency')await sql(`update plans set currency='ZZZZ' where id=${q(ctx.seatPlan)};`);
      if(invalid==='product')await sql(`update products set status='disabled' where id=${q(product)};`);
      if(invalid==='overflow')await sql(`update plans set amount=2000000000 where id=${q(ctx.seatPlan)};`);
      if(invalid==='expiry')request.expires_at='infinity';
      await assert.rejects(issueVouchers(ctx,ctx.key,request));assert.equal(await voucherCount(ctx),'0');assert.equal(await voucherDebits(ctx),'0');
      if(invalid==='product')await sql(`update products set status='active' where id=${q(product)};`);
    }
  });
  await check('voucher issue mock inventory binds one-use tokens and captured experience without partial batches',async()=>{
    const ctx=await voucherFixture();const issued=await issueVouchers(ctx,ctx.key,voucherRequest(ctx,'mock_exam'));
    assert.equal(issued.vouchers.length,2);assert.equal(new Set(issued.vouchers.map(v=>v.code)).size,2);
    assert.equal(await sql(`select count(*) from partner_vouchers v join exam_tokens t on t.id=v.exam_token_id where v.tenant_id=${q(ctx.scope)} and t.token_code=v.code and t.tenant_id=v.tenant_id and t.experience_id=v.experience_id and t.max_uses=1 and t.uses_count=0;`),'2');
    await sql(`update experiences set metadata='{}' where id=${q(ctx.mock)};`);await assert.rejects(issueVouchers(ctx,randomUUID(),voucherRequest(ctx,'mock_exam')),/ticket eligible/);
  });
  await check('voucher issue competing batches reserve a purchased seat exactly once and block direct assignment',async()=>{
    const ctx=await voucherFixture(1),request=voucherRequest(ctx,'seat',{quantity:1});
    const results=await Promise.allSettled([issueVouchers(ctx,ctx.key,request),issueVouchers(ctx,randomUUID(),request)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await voucherCount(ctx),'1');assert.equal(await voucherDebits(ctx),'0');
    assert.equal(await sql(`select count(*) from voucher_seat_reservations where tenant_id=${q(ctx.scope)};`),'1');
    await assert.rejects(assignSeat(ctx),/reserved for a voucher/);assert.equal(await seatGrants(ctx),'0');
    const winner=results.find(r=>r.status==='fulfilled').value;assert.deepEqual(winner.vouchers[0].metadata.purchased_terms.included_product_ids,[bundle]);
  });
  await check('voucher issue insufficient inventory and foreign classrooms leave no reservation or batch',async()=>{
    const ctx=await voucherFixture(1);await assert.rejects(issueVouchers(ctx,ctx.key,voucherRequest(ctx,'seat')),/inventory is unavailable/);
    await assert.rejects(issueVouchers(ctx,ctx.key,voucherRequest(ctx,'subscription',{classroom_id:randomUUID()})),/Classroom is outside/);
    assert.equal(await voucherCount(ctx),'0');assert.equal(await sql(`select count(*) from voucher_seat_reservations where tenant_id=${q(ctx.scope)};`),'0');
  });

  await check('voucher issue financial inventory and debit identities stay immutable while unpurchased legacy rows can be removed',async()=>{
    const ctx=await voucherFixture();const issued=await issueVouchers(ctx);
    for(const mutation of [`delete from partner_voucher_batches where id=${q(issued.batch.id)}`,
      `update partner_voucher_batches set metadata='{}' where id=${q(issued.batch.id)}`,
      `update partner_vouchers set expires_at=now()+interval '999 days' where batch_id=${q(issued.batch.id)}`,
      `update partner_vouchers set plan_id=null where batch_id=${q(issued.batch.id)}`,
      `delete from partner_vouchers where batch_id=${q(issued.batch.id)}`,
      `update partner_wallet_ledger set amount=1 where voucher_batch_id=${q(issued.batch.id)}`,
      `delete from partner_wallet_ledger where voucher_batch_id=${q(issued.batch.id)}`])await assert.rejects(sql(mutation),/immutable|retained/);
    await assert.rejects(sql(`delete from plans where id=${q(ctx.seatPlan)};`),/immutable|retained/);
    const legacy=randomUUID();await sql(`insert into partner_voucher_batches(id,tenant_id,batch_code,access_kind,quantity,expires_at) values(${q(legacy)},${q(ctx.scope)},${q('LEGACY-'+legacy)},'subscription',1,now()+interval '1 day');delete from partner_voucher_batches where id=${q(legacy)};`);
    assert.equal(await sql(`select count(*) from partner_voucher_batches where id=${q(legacy)};`),'0');
  });
  await check('voucher wallet guard serializes direct ledger writers and rejects unfunded losing debits',async()=>{
    const ctx=await voucherFixture(2,2000);
    const outcomes=await Promise.allSettled(Array.from({length:8},()=>sql(`set role service_role;insert into partner_wallet_ledger(tenant_id,entry_kind,amount) values(${q(ctx.scope)},'debit',1000);`)));
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,2);assert.equal(await voucherDebits(ctx),'2');
    assert.equal(await sql(`select sum(case when entry_kind='credit' then amount else -amount end) from partner_wallet_ledger where tenant_id=${q(ctx.scope)};`),'0');
  });
  await check('voucher wallet guard coordinates new batches with legacy direct debits on one balance',async()=>{
    const ctx=await voucherFixture(2,2000);
    const results=await Promise.allSettled([issueVouchers(ctx),sql(`set role service_role;insert into partner_wallet_ledger(tenant_id,entry_kind,amount) values(${q(ctx.scope)},'debit',1500);`)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await voucherDebits(ctx),'1');
    assert.equal(await voucherCount(ctx),results[0].status==='fulfilled'?'2':'0');
  });
  await check('voucher wallet guard accounts for reservation status currency scope and credit reversals',async()=>{
    const ctx=await voucherFixture(2,2000),debit=randomUUID();
    await sql(`insert into partner_wallet_ledger(id,tenant_id,entry_kind,status,amount,currency) values(${q(debit)},${q(ctx.scope)},'debit','reserved',1500,'uzs');update partner_wallet_ledger set status='posted' where id=${q(debit)};`);
    await assert.rejects(sql(`update partner_wallet_ledger set status='void' where tenant_id=${q(ctx.scope)} and entry_kind='credit';`),/exceeds available/);
    await assert.rejects(sql(`delete from partner_wallet_ledger where tenant_id=${q(ctx.scope)} and entry_kind='credit';`),/exceeds available/);
    await assert.rejects(sql(`update partner_wallet_ledger set currency='USD' where id=${q(debit)};`),/exceeds available/);
    const target=randomUUID();await sql(`insert into tenants(id) values(${q(target)});`);
    await assert.rejects(sql(`update partner_wallet_ledger set tenant_id=${q(target)} where id=${q(debit)};`),/exceeds available/);
    await sql(`insert into partner_wallet_ledger(tenant_id,entry_kind,amount,currency) values(${q(target)},'credit',2000,'UZS');update partner_wallet_ledger set tenant_id=${q(target)} where id=${q(debit)};`);
    assert.equal(await sql(`select tenant_id from partner_wallet_ledger where id=${q(debit)};`),target);
  });
  await check('voucher wallet guard permits debt recovery credits but refuses making historical debt worse',async()=>{
    const ctx=await voucherFixture(2,0),debit=randomUUID();
    await sql(`alter table partner_wallet_ledger disable trigger partner_wallet_balance_guard;insert into partner_wallet_ledger(id,tenant_id,entry_kind,amount) values(${q(debit)},${q(ctx.scope)},'debit',1000);alter table partner_wallet_ledger enable trigger partner_wallet_balance_guard;`);
    await sql(`insert into partner_wallet_ledger(tenant_id,entry_kind,amount) values(${q(ctx.scope)},'credit',500);`);
    await assert.rejects(sql(`insert into partner_wallet_ledger(tenant_id,entry_kind,amount) values(${q(ctx.scope)},'debit',1);`),/exceeds available/);
    await sql(`insert into partner_wallet_ledger(tenant_id,entry_kind,amount) values(${q(ctx.scope)},'credit',2500);`);
    assert.equal((await issueVouchers(ctx)).ok,true);
  });
  await check('voucher issue expired or void inventory never silently releases an immutable seat reservation',async()=>{
    for(const status of ['expired','void']) {
      const ctx=await voucherFixture(1);const issued=await issueVouchers(ctx,ctx.key,voucherRequest(ctx,'seat',{quantity:1}));
      await sql(`update partner_vouchers set status=${q(status)} where id=${q(issued.vouchers[0].id)};`);
      await assert.rejects(assignSeat(ctx),/reserved for a voucher/);
      await assert.rejects(issueVouchers(ctx,randomUUID(),voucherRequest(ctx,'seat',{quantity:1})),/inventory is unavailable/);
      assert.equal(await sql(`select count(*) from voucher_seat_reservations where tenant_id=${q(ctx.scope)};`),'1');
    }
  });

  for(const role of ['anon','authenticated','service_role'])await check(role+' cannot rewrite voucher issue receipts reservations or invoke private term validation',async()=>{
    await assert.rejects(sql(`set role ${role};update voucher_issue_receipts set funding='{}';`),/permission denied/);
    await assert.rejects(sql(`set role ${role};delete from voucher_seat_reservations;`),/permission denied/);
    await assert.rejects(sql(`set role ${role};select validate_voucher_access_terms('{}',${q(product)},${q(plan)});`),/permission denied/);
    if(role!=='service_role') {
      for(const table of ['partner_center_profiles','partner_wallet_ledger','partner_voucher_batches','partner_vouchers'])await assert.rejects(sql(`set role ${role};delete from ${table};`),/permission denied/);
      await assert.rejects(sql(`set role ${role};select issue_purchased_vouchers(${q(user)},${q(tenant)},${q(randomUUID())},'{}');`),/permission denied/);
    }
  });


  const cancelVouchers=(ctx,request=voucherRequest(ctx),key=ctx.key)=>sql(`set role service_role;select cancel_uncreated_voucher_issue(${q(ctx.actor)},${q(ctx.scope)},${q(key)},${json(request)});`).then(JSON.parse);
  await check('voucher cancel sixteen retries durably close one unused key without stock or debit',async()=>{
    const ctx=await voucherFixture();const replies=await Promise.all(Array.from({length:16},()=>cancelVouchers(ctx)));
    assert.ok(replies.every(r=>r.state==='canceled'));assert.equal(await sql(`select count(*) from voucher_issue_cancellations where actor_id=${q(ctx.actor)};`),'1');
    await assert.rejects(issueVouchers(ctx),/reference is closed/);assert.equal(await voucherCount(ctx),'0');assert.equal(await voucherDebits(ctx),'0');
    assert.equal((await issueVouchers(ctx,randomUUID())).state,'issued');
  });
  await check('voucher cancel returns a committed original receipt instead of claiming its paid inventory never existed',async()=>{
    const ctx=await voucherFixture();const issued=await issueVouchers(ctx),recovered=await cancelVouchers(ctx);
    assert.equal(recovered.state,'issued');assert.equal(recovered.deduped,true);assert.equal(recovered.batch.id,issued.batch.id);
    assert.equal(await voucherCount(ctx),'2');assert.equal(await voucherDebits(ctx),'1');assert.equal(await sql(`select count(*) from voucher_issue_cancellations where actor_id=${q(ctx.actor)};`),'0');
  });
  await check('voucher cancel racing issue cannot close a key then let a late purchase create funded stock',async()=>{
    for(let attempt=0;attempt<4;attempt++) {
      const ctx=await voucherFixture();const outcomes=await Promise.allSettled([issueVouchers(ctx),cancelVouchers(ctx)]);
      const canceled=outcomes[1];assert.equal(canceled.status,'fulfilled');
      if(canceled.value.state==='canceled') {
        assert.equal(outcomes[0].status,'rejected');assert.equal(await voucherCount(ctx),'0');assert.equal(await voucherDebits(ctx),'0');await assert.rejects(issueVouchers(ctx),/reference is closed/);
      } else {
        assert.equal(outcomes[0].status,'fulfilled');assert.equal(canceled.value.batch.id,outcomes[0].value.batch.id);assert.equal(await voucherCount(ctx),'2');assert.equal(await voucherDebits(ctx),'1');
      }
    }
  });
  await check('voucher cancel revoked finance authority and different original choices cannot retire a purchase',async()=>{
    const ctx=await voucherFixture();await issueVouchers(ctx);
    await assert.rejects(cancelVouchers(ctx,voucherRequest(ctx,'subscription',{quantity:1})),/another intent/);
    await sql(`update tenant_memberships set role='teacher' where user_id=${q(ctx.actor)};`);await assert.rejects(cancelVouchers(ctx),/billing authority/);
    assert.equal(await sql(`select count(*) from voucher_issue_cancellations where actor_id=${q(ctx.actor)};`),'0');
    const other=await voucherFixture();await cancelVouchers(other);await assert.rejects(cancelVouchers(other,voucherRequest(other,'subscription',{quantity:1})),/another intent/);
  });
  await check('voucher cancel late failure rolls back its closure and leaves the original request admissible',async()=>{
    const ctx=await voucherFixture();await sql(`create function reject_voucher_cancel() returns trigger language plpgsql as $$begin raise exception 'owned late cancellation failure';end;$$;create trigger reject_voucher_cancel before insert on voucher_issue_cancellations for each row execute function reject_voucher_cancel();`);
    try {await assert.rejects(cancelVouchers(ctx),/owned late cancellation/);}finally{await sql('drop trigger reject_voucher_cancel on voucher_issue_cancellations;drop function reject_voucher_cancel();');}
    assert.equal(await sql(`select count(*) from voucher_issue_cancellations where actor_id=${q(ctx.actor)};`),'0');assert.equal((await issueVouchers(ctx)).state,'issued');
  });
  await check('voucher cancel lost connection never reports closure before the cancellation transaction commits',async()=>{
    const ctx=await voucherFixture();await sql(`create function delay_voucher_cancel() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(434390);perform pg_sleep(10);return new;end;$$;create trigger delay_voucher_cancel before insert on voucher_issue_cancellations for each row execute function delay_voucher_cancel();`);
    const pending=cancelVouchers(ctx).then(()=>null,error=>error);
    try{await barrier(434390);await sql("select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and query like '%select cancel_uncreated_voucher_issue(%' and state='active';");}
    finally{await pending;await sql('drop trigger delay_voucher_cancel on voucher_issue_cancellations;drop function delay_voucher_cancel();');}
    assert.equal(await sql(`select count(*) from voucher_issue_cancellations where actor_id=${q(ctx.actor)};`),'0');
    assert.equal((await cancelVouchers(ctx)).state,'canceled');await assert.rejects(issueVouchers(ctx),/reference is closed/);
  });
  for(const role of ['anon','authenticated','service_role'])await check(role+' cannot rewrite or delete voucher cancellations to reopen closed purchase keys',async()=>{
    await assert.rejects(sql(`set role ${role};update voucher_issue_cancellations set request='{}';`),/permission denied/);
    await assert.rejects(sql(`set role ${role};delete from voucher_issue_cancellations;`),/permission denied/);
    if(role!=='service_role')await assert.rejects(sql(`set role ${role};select cancel_uncreated_voucher_issue(${q(user)},${q(tenant)},${q(randomUUID())},'{}');`),/permission denied/);
  });

  async function redemptionFixture(kind='subscription',extra={}) {
    const ctx=await voucherFixture();
    await sql(`insert into auth.users(id,email,email_confirmed_at) values(${q(ctx.recipient)},${q(ctx.email)},now());`);
    const issued=await issueVouchers(ctx,ctx.key,voucherRequest(ctx,kind,extra));
    return {...ctx,vouchers:issued.vouchers};
  }
  const redeemVoucher=(ctx,index=0,actor=ctx.recipient)=>sql(`set role service_role;select redeem_purchased_voucher(${q(actor)},${q(ctx.vouchers[index].code)});`).then(JSON.parse);
  const redemptionCount=ctx=>sql(`select count(*) from voucher_redemption_receipts where center_tenant_id=${q(ctx.scope)};`);
  await check('voucher redemption sixteen simultaneous retries commit one captured renewal and student record',async()=>{
    const ctx=await redemptionFixture();const results=await Promise.all(Array.from({length:16},()=>redeemVoucher(ctx)));
    assert.equal(results.filter(r=>!r.deduped).length,1);assert.equal(await redemptionCount(ctx),'1');assert.equal(await seatGrants(ctx),'2');
    assert.equal(await sql(`select bool_and(round(extract(epoch from ends_at-now())/86400)=30) from entitlements where tenant_id=${q(ctx.target)};`),'t');
    assert.equal(await sql(`select count(*) from partner_center_students where tenant_id=${q(ctx.scope)} and user_id=${q(ctx.recipient)};`),'1');
  });
  await check('voucher redemption competing beneficiaries cannot keep losing access',async()=>{
    const ctx=await redemptionFixture(),other=randomUUID(),target=randomUUID(),email='other-'+other+'@example.invalid';
    await sql(`insert into users(id,email) values(${q(other)},${q(email)});insert into auth.users(id,email,email_confirmed_at) values(${q(other)},${q(email)},now());insert into tenants(id,type) values(${q(target)},'personal');insert into tenant_memberships(user_id,tenant_id) values(${q(other)},${q(target)});`);
    const results=await Promise.allSettled([redeemVoucher(ctx),redeemVoucher(ctx,0,other)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await redemptionCount(ctx),'1');
    assert.equal(await sql(`select count(distinct tenant_id) from entitlements where tenant_id in (${q(target)},${q(ctx.target)});`),'1');
  });
  await check('voucher redemption different vouchers serialize sixty days without lost renewals',async()=>{
    const ctx=await redemptionFixture();await Promise.all([redeemVoucher(ctx,0),redeemVoucher(ctx,1)]);
    assert.equal(await redemptionCount(ctx),'2');assert.equal(await sql(`select bool_and(round(extract(epoch from ends_at-now())/86400)=60) from entitlements where tenant_id=${q(ctx.target)};`),'t');
  });
  await check('voucher redemption seat inventory assignment grant and voucher claim commit together',async()=>{
    const ctx=await redemptionFixture('seat');const first=await redeemVoucher(ctx);assert.equal(first.state,'redeemed');
    assert.equal((await redeemVoucher(ctx)).deduped,true);assert.equal(await redemptionCount(ctx),'1');assert.equal(await seatGrants(ctx),'2');
    assert.equal(await seatReceipts(ctx.vouchers[0].seat_license_id),'1');
    assert.equal(await sql(`select assigned_user_id=${q(ctx.recipient)}::uuid and status='active' from seat_licenses where id=${q(ctx.vouchers[0].seat_license_id)};`),'t');
  });
  await check('voucher redemption uses sold terms after catalogue edits and preserves lifetime access',async()=>{
    const ctx=await redemptionFixture();await sql(`update plans set duration_days=999,is_active=false,metadata='{}' where id=${q(ctx.seatPlan)};
      insert into entitlements(user_id,tenant_id,resource_type,resource_id,is_active,ends_at) values(${q(ctx.recipient)},${q(ctx.target)},'product',${q(product)},true,null);`);
    await redeemVoucher(ctx);const before=await sql(`select json_agg(row_to_json(e) order by resource_id) from entitlements e where tenant_id=${q(ctx.target)};`);
    assert.equal(await sql(`select ends_at is null and value#>>'{limits,attempts}'='10' from entitlements where tenant_id=${q(ctx.target)} and resource_id=${q(product)};`),'t');
    assert.equal(await sql(`select round(extract(epoch from ends_at-now())/86400) from entitlements where tenant_id=${q(ctx.target)} and resource_id=${q(bundle)};`),'30');
    await sql(`update auth.users set email=${q('changed-'+ctx.email)} where id=${q(ctx.recipient)};`);assert.equal((await redeemVoucher(ctx)).deduped,true);
    assert.equal(await sql(`select json_agg(row_to_json(e) order by resource_id) from entitlements e where tenant_id=${q(ctx.target)};`),before);
  });
  await check('voucher redemption refuses business fallback ambiguous personal scopes and revoked accounts',async()=>{
    for(const kind of ['business','member','ambiguous','revoked','suspended']) {
      const ctx=await redemptionFixture();
      if(kind==='business')await sql(`update tenants set type='business' where id=${q(ctx.target)};`);
      if(kind==='member')await sql(`update tenant_memberships set role='member' where user_id=${q(ctx.recipient)};`);
      if(kind==='ambiguous'){const extra=randomUUID();await sql(`insert into tenants(id,type) values(${q(extra)},'personal');insert into tenant_memberships(user_id,tenant_id) values(${q(ctx.recipient)},${q(extra)});`);}
      if(kind==='revoked')await sql(`update tenant_memberships set status='inactive' where user_id=${q(ctx.recipient)};`);
      if(kind==='suspended')await sql(`update users set is_active=false where id=${q(ctx.recipient)};`);
      await assert.rejects(redeemVoucher(ctx));assert.equal(await redemptionCount(ctx),'0');assert.equal(await seatGrants(ctx),'0');
    }
  });
  await check('voucher redemption assigned email requires verified auth identity and cannot trust the domain mirror',async()=>{
    for(const kind of ['unconfirmed','other-email','empty']) {
      const ctx=await voucherFixture();const issued=await issueVouchers(ctx,ctx.key,voucherRequest(ctx,'subscription',{assigned_students:[{email:ctx.email}]}));ctx.vouchers=issued.vouchers;
      await sql(`insert into auth.users(id,email,email_confirmed_at) values(${q(ctx.recipient)},${q(kind==='other-email'?'other-'+ctx.email:kind==='empty'?'':ctx.email)},${kind==='unconfirmed'?'null':'now()'});`);
      await assert.rejects(redeemVoucher(ctx),/verified account/);assert.equal(await seatGrants(ctx),'0');assert.equal(await redemptionCount(ctx),'0');
    }
  });
  await check('voucher redemption late receipt failure rolls back grants student registration and seat assignment',async()=>{
    for(const kind of ['subscription','seat']) {
      const ctx=await redemptionFixture(kind);await sql(`create function reject_voucher_redemption() returns trigger language plpgsql as $$begin raise exception 'owned late redemption failure';end;$$;create trigger reject_voucher_redemption before insert on voucher_redemption_receipts for each row execute function reject_voucher_redemption();`);
      try {await assert.rejects(redeemVoucher(ctx),/owned late/);assert.equal(await seatGrants(ctx),'0');assert.equal(await redemptionCount(ctx),'0');
        assert.equal(await sql(`select status from partner_vouchers where id=${q(ctx.vouchers[0].id)};`),'unused');
        assert.equal(await sql(`select count(*) from partner_center_students where tenant_id=${q(ctx.scope)} and user_id=${q(ctx.recipient)};`),'0');
        if(kind==='seat')assert.equal(await seatReceipts(ctx.vouchers[0].seat_license_id),'0');
      } finally {await sql('drop trigger reject_voucher_redemption on voucher_redemption_receipts;drop function reject_voucher_redemption();');}
      assert.equal((await redeemVoucher(ctx)).state,'redeemed');
    }
  });
  await check('voucher redemption dropped connection rolls back and exact retry creates one claim',async()=>{
    const ctx=await redemptionFixture();await sql(`create function delay_voucher_redemption() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(434400);perform pg_sleep(10);return new;end;$$;create trigger delay_voucher_redemption before insert on voucher_redemption_receipts for each row execute function delay_voucher_redemption();`);
    const pending=redeemVoucher(ctx).then(()=>null,error=>error);
    try {await barrier(434400);await sql("select pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and query like '%select redeem_purchased_voucher(%' and state='active';");}
    finally {await pending;await sql('drop trigger delay_voucher_redemption on voucher_redemption_receipts;drop function delay_voucher_redemption();');}
    assert.equal(await redemptionCount(ctx),'0');assert.equal(await seatGrants(ctx),'0');assert.equal((await redeemVoucher(ctx)).deduped,false);assert.equal((await redeemVoucher(ctx)).deduped,true);
  });
  await check('voucher redemption classroom enrollment fails atomically and never takes over another account by email or phone',async()=>{
    const ctx=await voucherFixture(),academy=randomUUID(),classroom=randomUUID();
    await sql(`insert into auth.users(id,email,email_confirmed_at) values(${q(ctx.recipient)},${q(ctx.email)},now());
      insert into tenants(id,metadata) values(${q(academy)},${json({parent_center_id:ctx.scope,service_family:'academy'})});
      insert into academy_classrooms(id,academy_id,name) values(${q(classroom)},${q(academy)},'Owned classroom');
      insert into academy_contacts(academy_id,user_id,email,phone,first_name) values(${q(academy)},${q(ctx.actor)},${q(ctx.email)},'owned-phone','Original account');`);
    ctx.vouchers=(await issueVouchers(ctx,ctx.key,voucherRequest(ctx,'subscription',{classroom_id:classroom,assigned_students:[{email:ctx.email,phone:'owned-phone'}]}))).vouchers;
    await assert.rejects(redeemVoucher(ctx),/Academy identity/);assert.equal(await seatGrants(ctx),'0');assert.equal(await redemptionCount(ctx),'0');
    assert.equal(await sql(`select first_name from academy_contacts where academy_id=${q(academy)} and user_id=${q(ctx.actor)};`),'Original account');
    await sql(`update academy_contacts set email='other@example.invalid' where academy_id=${q(academy)};`);
    assert.equal((await redeemVoucher(ctx)).state,'redeemed');assert.equal(await sql(`select count(*) from academy_classroom_memberships where classroom_id=${q(classroom)};`),'1');
    assert.equal(await sql(`select user_id=${q(ctx.actor)}::uuid from academy_contacts where academy_id=${q(academy)} and phone='owned-phone';`),'t');
    assert.equal((await redeemVoucher(ctx)).deduped,true);assert.equal(await sql(`select count(*) from academy_classroom_memberships where classroom_id=${q(classroom)};`),'1');
  });
  await check('voucher redemption legacy uncertainty and disabled inventory never manufacture access',async()=>{
    for(const kind of ['void','legacy','expired','paused']) {
      const ctx=await redemptionFixture();
      if(kind==='void')await sql(`update partner_vouchers set status='void' where id=${q(ctx.vouchers[0].id)};`);
      if(kind==='paused')await sql(`update partner_center_profiles set status='paused' where tenant_id=${q(ctx.scope)};`);
      if(kind==='legacy') {
        const id=randomUUID(),code='LEGACY-'+randomUUID().toUpperCase();await sql(`insert into partner_vouchers(id,tenant_id,code,access_kind,product_id,plan_id,expires_at) values(${q(id)},${q(ctx.scope)},${q(code)},'subscription',${q(product)},${q(ctx.seatPlan)},now()+interval '1 day');`);ctx.vouchers[0]={id,code};
      }
      if(kind==='expired') {
        const id=randomUUID(),code='EXPIRED-'+randomUUID().toUpperCase();await sql(`insert into partner_vouchers(id,tenant_id,code,access_kind,product_id,plan_id,expires_at) values(${q(id)},${q(ctx.scope)},${q(code)},'subscription',${q(product)},${q(ctx.seatPlan)},now()-interval '1 day');`);ctx.vouchers[0]={id,code};
      }
      await assert.rejects(redeemVoucher(ctx));assert.equal(await seatGrants(ctx),'0');assert.equal(await redemptionCount(ctx),'0');
    }
  });
  for(const role of ['anon','authenticated','service_role'])await check(role+' cannot rewrite voucher redemption receipts or impersonate claims through private helpers',async()=>{
    for(const change of ["update voucher_redemption_receipts set result='{}'",'delete from voucher_redemption_receipts','insert into voucher_redemption_receipts default values'])await assert.rejects(sql(`set role ${role};${change};`),/permission denied/);
    if(role!=='service_role')await assert.rejects(sql(`set role ${role};select redeem_purchased_voucher(${q(user)},'OWNED-EXAMPLE');`),/permission denied/);
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
  report={status:'passed',scope:caseFilter?.source ?? 'all',engine:'native PostgreSQL 17.5',checks,productionChanged:false,cleanup:'owned container removed'};
  console.log(checks.length+' native payment cases passed.');
} finally {
  if(owned){assert.equal(await run(['inspect','--format','{{index .Config.Labels "schood.qa"}}',name]),'payment-fulfillment');await run(['rm','--force',name]);console.log('Owned network-isolated PostgreSQL container removed.');}
}

const reportPath=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
if(report && reportPath){mkdirSync(dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
