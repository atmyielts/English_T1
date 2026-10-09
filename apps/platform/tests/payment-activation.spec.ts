import { expect, test, type Page } from '@playwright/test';

const actor='11111111-1111-4111-8111-111111111111', product='22222222-2222-4222-8222-222222222222', plan='33333333-3333-4333-8333-333333333333';
const session={access_token:'payment-browser-contract',refresh_token:'payment-browser-refresh',token_type:'bearer',
  expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,
  user:{id:actor,aud:'authenticated',role:'authenticated',email:'payment-qa@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};

async function fixture(page:Page, credit=false) {
  let activated=false, orders=0, polls=0;
  await page.context().addCookies([{name:'schood-auth',value:encodeURIComponent(JSON.stringify(session)),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  await page.route('**/auth/v1/**',route=>route.fulfill({json:session.user}));
  await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
  await page.route('**/functions/v1/**',route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    if(path.endsWith('/click/readiness'))return route.fulfill({json:{configured:true,missing_configuration:[]}});
    if(path.endsWith('/billing/plans'))return route.fulfill({json:{plans:[{id:plan,product_id:product,name:'Synthetic practice plan',amount:1000,currency:'UZS',duration_days:30}]}});
    if(path.endsWith('/click/create-transaction')){
      orders++;return route.fulfill({status:credit?202:200,json:{transaction_id:'owned-payment-qa',status:credit?'paid':'pending',
        grant_completed:false,payment_url:credit?null:'https://my.click.uz/services/pay?transaction_param=owned-payment-qa',
        amount:credit?0:1000,currency:'UZS',original_amount:1000,discount_amount:0,credit_amount:credit?1000:0,
        final_amount:credit?0:1000,coupon_code:null,product_id:product,plan_id:plan}});
    }
    if(path.endsWith('/click/status')){polls++;return route.fulfill({json:{status:'paid',grant_completed:activated}});}
    return route.fulfill({json:{user:session.user,memberships:[],current_tenant:null,
      entitlements:activated?[{resource_type:'product',resource_id:product,is_active:true}]:[],effective_product_ids:activated?[product]:[]}});
  });
  return {activate:()=>{activated=true;},orders:()=>orders,polls:()=>polls};
}

for(const width of [390,1280])for(const credit of [false,true])test(`checkout ${width}px ${credit?'credit-covered':'provider-paid'} keeps checking until access commits and prevents a second payment`,async({page})=>{
  await page.setViewportSize({width,height:900});const qa=await fixture(page,credit);
  await page.goto(`/checkout?plan_id=${plan}&product_id=${product}&returnTo=%2F`);
  const create=page.getByRole('button',{name:'Create payment link and continue'});
  await expect(create).toBeEnabled();await create.click();
  if(!credit)await page.getByRole('button',{name:'Check status'}).click();
  await expect(page.getByRole('status')).toContainText('Do not pay again');
  await expect(create).toBeDisabled();await expect(page).toHaveURL(/\/checkout\?/);
  await expect(page.getByRole('link',{name:'Open payment page'})).toHaveCount(0);
  const before=qa.polls();await expect.poll(()=>qa.polls(),{timeout:12000}).toBeGreaterThan(before);
  await expect(page).toHaveURL(/\/checkout\?/);expect(qa.orders()).toBe(1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);expect(overflow).toBe(false);
  if(process.env.PW_PAYMENT_CAPTURE==='1' && !credit)await page.screenshot({path:`test-results/payment-activation-${width}.png`,fullPage:true});
  qa.activate();await page.getByRole('button',{name:'Check status'}).click();
  await expect(page).toHaveURL(/\/$/);expect(qa.orders()).toBe(1);
});
