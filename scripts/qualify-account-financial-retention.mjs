// Qualifies lifecycle retention against the reviewed payment candidate in an
// isolated checkout. No production credentials or provider calls are used.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const accountRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const financialArgument=process.argv.find(arg=>arg.startsWith('--financial-root='))?.slice(17);
if(!financialArgument)throw Error('Pass --financial-root=<isolated reviewed payment checkout>');
const financialRoot=resolve(financialArgument);
const git=args=>execFileSync('git',args,{cwd:financialRoot,encoding:'utf8',windowsHide:true}).trim();
const financialHead=git(['rev-parse','HEAD']);
if(financialHead!=='16a8eb759d470410b14e1f0e1c898b636aa834b2'||git(['status','--porcelain','--untracked-files=no']))throw Error('Financial qualification requires the clean reviewed candidate checkout');
const original=readFileSync(financialRoot+'/scripts/test-payment-fulfillment.mjs','utf8');
const originalHash=createHash('sha256').update(original).digest('hex');
if(originalHash!=='e094514ee07602fde70b8d6276cf93f15cc38b98d75d0ccb9c75cec32778f4f1')throw Error('Reviewed financial harness hash changed');
mkdirSync(accountRoot+'/supabase/.temp/account-retention',{recursive:true});
const block=`
  // Exclusive native qualification against the actual nine financial migrations.
  const planCase=await checkoutActor();const planOrder=await createCheckout(planCase);await fulfill(planOrder.payment.id);
  const seatCase=await seatFixture();await assignSeat(seatCase);
  const voucherCase=await redemptionFixture();await redeemVoucher(voucherCase);
  const examCase=await candidateFixture('voucher',true);const admission=await admit(examCase);
  const academyCase=await academyFixture();const academyOrder=await academyCheckout(academyCase);await settleAcademy(academyOrder.payment.id);
  await sql(\`alter table auth.users add column if not exists deleted_at timestamptz,add column if not exists email_confirmed_at timestamptz;
    insert into auth.users(id,email) select id,coalesce(email,id::text||'@example.invalid') from users on conflict(id) do nothing;
    alter table users add constraint owned_auth_user_fk foreign key(id) references auth.users(id) on delete cascade;
    alter table users add column full_name text,add column avatar_url text,add column telegram_chat_id text,add column role text default 'user';
    alter table academy_contacts add column notify_enabled boolean not null default true;
    alter table tenants add column name text default 'Owned QA',add column slug text,add column created_by uuid references users(id) on delete set null;
    update tenants set slug=id::text;
    create role authenticator noinherit login;grant anon,authenticated,service_role to authenticator;
    grant usage on schema auth to authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    update tenants set type='personal',created_by=\$\{q(planCase.actor)\} where id=\$\{q(planCase.scope)\};
    update tenants set created_by=\$\{q(seatCase.recipient)\} where id=\$\{q(seatCase.target)\};
    update tenants set created_by=\$\{q(voucherCase.recipient)\} where id=\$\{q(voucherCase.target)\};
    update tenants set created_by=\$\{q(examCase.recipient)\} where id=\$\{q(examCase.target)\};
    update tenant_memberships set role='member' where tenant_id=\$\{q(academyCase.scope)\} and user_id=\$\{q(academyCase.actor)\};
    insert into tenant_memberships(tenant_id,user_id) values(\$\{q(academyCase.scope)\},\$\{q(referrer)\});\`);
  for(const file of ['20261010154000_account_deletion_ownership_guard.sql','20261010155000_account_closed_principal_boundary.sql','20261010160000_account_personal_erasure_transaction.sql','20261010161000_account_api_request_guard.sql'])await sql(readFileSync(${JSON.stringify(accountRoot+'/supabase/migrations/')}+file,'utf8'));
  await sql('update account_closure_config set enabled=true;');
  const closeAccount=id=>sql(\`update auth.users set deleted_at=now(),email='provider-obfuscated' where id=\$\{q(id)\};\`);
  const snapshot=(relation,predicate)=>sql(\`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from \$\{relation\} r where \$\{predicate\};\`);
  await check('account retention keeps actual plan checkout, fulfillment and payment evidence byte-identical',async()=>{
    const id=planOrder.payment.id;const before=await Promise.all(['payments','payment_checkout_requests','payment_fulfillment_receipts','payment_fulfillment_jobs'].map(t=>snapshot(t,\`\$\{t==='payments'?'id':'payment_id'\}=\$\{q(id)\}\`)));
    await closeAccount(planCase.actor);
    const after=await Promise.all(['payments','payment_checkout_requests','payment_fulfillment_receipts','payment_fulfillment_jobs'].map(t=>snapshot(t,\`\$\{t==='payments'?'id':'payment_id'\}=\$\{q(id)\}\`)));assert.deepEqual(after,before);
    assert.equal(await sql(\`select bool_and(not is_active) from entitlements where tenant_id=\$\{q(planCase.scope)\};\`),'t');
    await assert.rejects(createCheckout({...planCase,key:randomUUID()}));
    assert.equal((await fulfill(id)).deduped,true);
  });
  await check('account retention keeps actual assigned seat identity and receipt without reactivating access',async()=>{
    const before=await snapshot('seat_assignment_receipts',\`seat_id=\$\{q(seatCase.seats[0])\}\`);
    await closeAccount(seatCase.recipient);assert.equal(await snapshot('seat_assignment_receipts',\`seat_id=\$\{q(seatCase.seats[0])\}\`),before);
    assert.equal(await sql(\`select assigned_user_id=\$\{q(seatCase.recipient)\}::uuid from seat_licenses where id=\$\{q(seatCase.seats[0])\};\`),'t');
    assert.equal(await sql(\`select bool_and(not is_active) from entitlements where tenant_id=\$\{q(seatCase.target)\};\`),'t');
    await assert.rejects(assignSeat(seatCase));
  });
  await check('account retention keeps actual voucher redemption and center records with immutable beneficiary identity',async()=>{
    const id=voucherCase.vouchers[0].id;const before=await snapshot('voucher_redemption_receipts',\`voucher_id=\$\{q(id)\}\`);
    await closeAccount(voucherCase.recipient);assert.equal(await snapshot('voucher_redemption_receipts',\`voucher_id=\$\{q(id)\}\`),before);
    assert.equal(await sql(\`select count(*) from partner_center_students where user_id=\$\{q(voucherCase.recipient)\};\`),'1');
    await assert.rejects(redeemVoucher(voucherCase));
  });
  await check('account retention keeps actual exam admission and institutional session while erasing the personal profile',async()=>{
    const before=await snapshot('exam_admission_receipts',\`token_id=\$\{q(examCase.token.id)\}\`);
    await closeAccount(examCase.recipient);assert.equal(await snapshot('exam_admission_receipts',\`token_id=\$\{q(examCase.token.id)\}\`),before);
    assert.equal(await sql(\`select count(*) from sessions where id=\$\{q(admission.session_id)\};\`),'1');
    assert.equal(await sql(\`select count(*) from user_profiles where user_id=\$\{q(examCase.recipient)\};\`),'0');
    assert.equal(await sql(\`select count(*) from academy_contacts where user_id=\$\{q(examCase.recipient)\};\`),'1');
    await assert.rejects(admit(examCase));
  });
  await check('account retention keeps actual Academy invoice and sold terms after an ownership transfer',async()=>{
    const ap=academyOrder.payment.metadata.academy_payment_id;
    const before=await Promise.all(['academy_payments','academy_payment_purchase_terms','academy_entitlements'].map(t=>snapshot(t,\`\$\{t==='academy_payments'?'id':t==='academy_payment_purchase_terms'?'academy_payment_id':'payment_id'\}=\$\{q(ap)\}\`)));
    await closeAccount(academyCase.actor);
    const after=await Promise.all(['academy_payments','academy_payment_purchase_terms','academy_entitlements'].map(t=>snapshot(t,\`\$\{t==='academy_payments'?'id':t==='academy_payment_purchase_terms'?'academy_payment_id':'payment_id'\}=\$\{q(ap)\}\`)));assert.deepEqual(after,before);
    assert.equal(await sql(\`select count(*) from academy_contacts where id=\$\{q(academyCase.contact)\};\`),'1');
    assert.equal(await sql(\`select count(*) from tenant_memberships where tenant_id=\$\{q(academyCase.scope)\} and user_id=\$\{q(referrer)\} and role='owner';\`),'1');
  });
  await check('account retention cannot delete or detach the real durable financial principals',async()=>{
    for(const id of [planCase.actor,seatCase.recipient,voucherCase.recipient,examCase.recipient,academyCase.actor]){
      await assert.rejects(sql(\`delete from users where id=\$\{q(id)\};\`),/foreign key constraint|immutable/);
      await assert.rejects(sql(\`delete from auth.users where id=\$\{q(id)\};\`),/account_soft_delete_required/);
      assert.equal(await sql(\`select is_active::text||':'||(email='deleted-'||id::text||'@deleted.invalid')::text from users where id=\$\{q(id)\};\`),'false:true');
    }
  });
`;
const derived=original.replace("  report={status:'passed'",()=>block+"  report={status:'passed'");
if(derived===original)throw Error('Reviewed financial harness insertion point unavailable');
writeFileSync(accountRoot+'/supabase/.temp/account-retention/qualify-actual-financial-retention.mjs',derived);
writeFileSync(accountRoot+'/supabase/.temp/account-retention/financial-source-proof.json',JSON.stringify({financialHead,originalHarnessSha256:createHash('sha256').update(original).digest('hex'),derivedHarnessSha256:createHash('sha256').update(derived).digest('hex'),productionChanged:false},null,2)+'\n');

execFileSync(process.execPath,[accountRoot+'/supabase/.temp/account-retention/qualify-actual-financial-retention.mjs','--grep=account retention','--output='+accountRoot+'/supabase/.temp/account-retention/financial-native-proof.json'],{cwd:financialRoot,stdio:'inherit',windowsHide:true});
