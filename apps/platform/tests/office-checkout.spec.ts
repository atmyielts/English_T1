import { expect, test, type Page } from '@playwright/test';

const actor='11111111-1111-4111-8111-111111111111', tenant='22222222-2222-4222-8222-222222222222';
const item='33333333-3333-4333-8333-333333333333', transaction='44444444-4444-4444-8444-444444444444';
const session={access_token:'office-browser-contract',refresh_token:'office-browser-refresh',token_type:'bearer',expires_in:3600,
  expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,aud:'authenticated',role:'authenticated',email:'office-qa@example.invalid',
    app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};

async function fixture(page: Page, lost=false, providerPending=false, failureStatus=503) {
  let activated=false, polls=0;
  const orders: Record<string, unknown>[]=[];
  await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  await page.route('**/auth/v1/**',route=>route.fulfill({json:session.user}));
  await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
  await page.route('**/functions/v1/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/click/status')) { polls++; return route.fulfill({json:{status:'paid',grant_completed:activated}}); }
    if(url.pathname.endsWith('/partner-office') && route.request().method()==='POST') {
      const body=route.request().postDataJSON();
      if(String(body.action).startsWith('create_') && body.action!=='create_student_invites') {
        orders.push(body);
        if(lost && orders.length===1)return route.fulfill({status:failureStatus,json:{error:'Recorded checkout response unavailable. Resume the same purchase.'}});
        return route.fulfill({status:202,json:{transaction_id:transaction,status:providerPending?'pending':'paid',grant_completed:false,payment_url:providerPending?'https://my.click.uz/services/pay?transaction_param='+transaction:null,
          amount:1000,original_amount:1000,currency:'UZS',plan_id:item,product_id:item}});
      }
      return route.fulfill({json:{}});
    }
    if(url.pathname.endsWith('/partner-office')) {
      const base={tickets:[],seats:[],payments:[],vouchers:[],batches:[],students:[],academies:[],members:[],invites:[],results:[],
        events:[],review_items:[],statements:[],ledger:[],reports:null,analytics:{},credit:{currency:'UZS',available_amount:1000},wallet:{currency:'UZS',available_amount:0},counts:{}};
      const action=url.searchParams.get('action');
      if(action==='center')return route.fulfill({json:{center:{tenant_id:tenant,display_name:'Owned center fixture',slug:'owned-center',status:'active',package_tier:'starter'},
        access:{role:'owner',can_operate:true,can_manage:true,can_manage_finance:true,can_manage_inventory:true,can_manage_staff:true,
          can_manage_academies:true,can_invite_students:true,can_view_results:true,can_manage_reviews:true,can_manage_branding:true}}});
      if(action==='catalog'||action==='plans')return route.fulfill({json:{experiences:[{id:item,name:'Owned mock fixture',is_ticket_ready:true,price_amount:1000,price_currency:'UZS'}],
        plans:[{id:item,name:'Owned seat fixture',amount:1000,currency:'UZS',duration_days:30}]}});
      if(action==='payment_capabilities')return route.fulfill({json:{providers:[{provider:'click',enabled:true,currency:'UZS',max_amount:2000000000}]}});
      if(action==='tier_catalog')return route.fulfill({json:{tiers:[{tier:'growth',tier_label:'Growth',capabilities:{staff_limit:10,max_voucher_batch_quantity:50,included_features:[]},
        plans:[{id:item,name:'Owned growth fixture',tier:'growth',billing_period:'monthly',amount:1000,currency:'UZS',duration_days:30}]}],requests:[]}});
      return route.fulfill({json:base});
    }
    return route.fulfill({json:{user:session.user,memberships:[],entitlements:[],effective_product_ids:[]}});
  });
  return {activate:()=>{activated=true;},polls:()=>polls,orders};
}

async function buyTab(page:Page,path:string) {
  await page.goto(path);
  const buy=page.getByRole('button',{name:'Buy',exact:true}).last();
  await expect(buy).toBeVisible();await buy.click();
  await expect(page.getByRole('button',{name:'Buy tickets',exact:true})).toBeEnabled();
}

for(const path of ['/center-office','/partner'])for(const width of [390,1280])test(`${path} ${width}px paid order waits for fulfillment, polls and blocks another purchase`,async({page})=>{
  await page.setViewportSize({width,height:900});const qa=await fixture(page);
  await buyTab(page,path);const buy=page.getByRole('button',{name:'Buy tickets',exact:true});
  await buy.click();await expect(page.getByRole('status')).toContainText('Do not pay again');
  await expect(buy).toBeDisabled();await expect(page.getByRole('button',{name:'Buy seats',exact:true})).toBeDisabled();
  await expect(page.getByRole('link',{name:'Continue payment',exact:true})).toHaveCount(0);
  expect(qa.orders).toHaveLength(1);expect(qa.orders[0].idempotency_key).toMatch(/^[a-f0-9-]{36}$/i);
  expect(new URL(String(qa.orders[0].redirect_url)).pathname).toBe(path);
  const before=qa.polls();await expect.poll(()=>qa.polls(),{timeout:12000}).toBeGreaterThan(before);
  await expect(page.getByText('Mock tickets generated.',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
  qa.activate();await page.getByRole('button',{name:'Check recorded purchase',exact:true}).click();
  await expect(page.getByText('Mock tickets generated.',{exact:true})).toBeVisible();await expect(buy).toBeEnabled();
  expect(qa.orders).toHaveLength(1);
});

for(const path of ['/center-office','/partner'])test(`${path} lost response restores original choices and key instead of creating a different purchase`,async({page})=>{
  const qa=await fixture(page,true);await buyTab(page,path);
  await page.getByLabel('Quantity',{exact:true}).first().fill('5');
  await page.getByRole('button',{name:'Buy tickets',exact:true}).click();
  await expect(page.getByRole('button',{name:'Resume original purchase',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'Resume original purchase',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Resume original purchase',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Do not pay again');
  expect(qa.orders).toHaveLength(2);expect(qa.orders[1].idempotency_key).toBe(qa.orders[0].idempotency_key);
  expect(qa.orders[0].quantity).toBe(5);expect(qa.orders[1].quantity).toBe(5);
});

for(const path of ['/center-office','/partner'])test(`${path} mutable catalogue rejection retains the original key after refresh`,async({page})=>{
  const qa=await fixture(page,true,false,400);await buyTab(page,path);
  await page.getByLabel('Quantity',{exact:true}).first().fill('5');
  await page.getByRole('button',{name:'Buy tickets',exact:true}).click();
  await expect(page.getByRole('button',{name:'Resume original purchase',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Buy tickets',exact:true})).toBeDisabled();
  await page.reload();await expect(page.getByRole('button',{name:'Resume original purchase',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Resume original purchase',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Do not pay again');
  expect(qa.orders).toHaveLength(2);expect(qa.orders[1].idempotency_key).toBe(qa.orders[0].idempotency_key);
  expect(qa.orders[1].quantity).toBe(5);
});

for(const path of ['/center-office','/partner'])test(`${path} seat purchase waits for committed inventory`,async({page})=>{
  const qa=await fixture(page);await buyTab(page,path);await page.getByRole('button',{name:'Buy seats',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Do not pay again');
  expect(qa.orders[0].action).toBe('create_seat_purchase');expect(qa.orders[0].plan_id).toBe(item);
  qa.activate();await page.getByRole('button',{name:'Check recorded purchase',exact:true}).click();
  await expect(page.getByText('Seats added.',{exact:true})).toBeVisible();expect(qa.orders).toHaveLength(1);
});
for(const kind of ['wallet','tier'])test(`center ${kind} purchase retains its choices and waits for activation`,async({page})=>{
  const qa=await fixture(page);await page.goto('/center-office');
  await page.getByRole('button',{name:kind==='wallet'?'Wallet':'Upgrade',exact:true}).last().click();
  if(kind==='wallet'){await page.getByLabel('Amount',{exact:true}).fill('5000');await page.getByLabel('Note',{exact:true}).fill('Owned payment annotation');}
  await page.getByRole('button',{name:kind==='wallet'?'Pay with Click':'Pay and upgrade',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Do not pay again');
  expect(qa.orders).toHaveLength(1);
  if(kind==='wallet'){expect(qa.orders[0].amount).toBe(5000);expect(qa.orders[0].note).toBe('Owned payment annotation');}
  else {expect(qa.orders[0].requested_tier).toBe('growth');expect(qa.orders[0].billing_period).toBe('monthly');}
  qa.activate();await page.getByRole('button',{name:'Check recorded purchase',exact:true}).click();
  await expect(page.getByText(kind==='wallet'?'Wallet topped up.':'Center tier updated.',{exact:true})).toBeVisible();
});

for(const path of ['/center-office','/partner'])test(`${path} provider-paid status removes the payable link while access is pending`,async({page})=>{
  await page.addInitScript(()=>{window.open=()=>null;});
  const qa=await fixture(page,false,true);await buyTab(page,path);
  await page.getByRole('button',{name:'Buy tickets',exact:true}).click();
  await expect(page.getByRole('link',{name:'Open recorded payment',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Check recorded purchase',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Do not pay again');
  await expect(page.getByRole('link',{name:'Open recorded payment',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Continue payment',exact:true})).toHaveCount(0);
  expect(qa.orders).toHaveLength(1);
});

for(const path of ['/center-office','/partner'])test(`${path} definite uncreated validation failure permits corrected choices with a new key`,async({page})=>{
  await fixture(page);const orders:Record<string,unknown>[]=[];
  await page.route('**/functions/v1/partner-office',route=>{
    const body=route.request().postDataJSON();
    if(body.action!=='create_ticket_purchase')return route.fallback();
    orders.push(body);
    return orders.length===1?route.fulfill({status:400,json:{error:'Choose a valid quantity.',checkout_not_created:true}})
      :route.fulfill({status:202,json:{transaction_id:transaction,status:'paid',grant_completed:false,payment_url:null}});
  });
  await buyTab(page,path);await page.getByRole('button',{name:'Buy tickets',exact:true}).click();
  await expect(page.getByText('Choose a valid quantity.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Buy tickets',exact:true})).toBeEnabled();
  await page.getByLabel('Quantity',{exact:true}).first().fill('6');
  await page.getByRole('button',{name:'Buy tickets',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Do not pay again');
  expect(orders).toHaveLength(2);expect(orders[1].idempotency_key).not.toBe(orders[0].idempotency_key);expect(orders[1].quantity).toBe(6);
});
