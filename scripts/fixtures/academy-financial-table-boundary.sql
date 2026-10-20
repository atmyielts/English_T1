begin;
do $fixture$
declare target text;column_name text;role_name text;
begin
 for target in select distinct c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in('r','v') and(c.relname=any(array['academy_account_balances','academy_account_ledger_entries','academy_branch_contribution','academy_budgets','academy_cash_movements','academy_cash_reconciliations','academy_cashboxes','academy_cashier_shifts','academy_charge_balances','academy_charges','academy_classroom_contribution','academy_collection_attempts','academy_collection_cases','academy_collection_events','academy_debt_cases','academy_expense_categories','academy_expenses','academy_finance_command_receipts','academy_payment_allocations','academy_payment_promises','academy_payment_reconciliations','academy_payments','academy_payroll_adjustments','academy_payroll_payouts','academy_payroll_periods','academy_payroll_row_components','academy_payroll_row_totals','academy_payroll_rows','academy_pricing_adjustments','academy_pricing_plans','academy_subscription_freezes','academy_subscriptions','academy_compensation_rules','academy_lesson_deliveries'])
  or exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname and(p.qual like '%academy_finance_can_view%' or p.qual like '%academy_payroll_can_view%'))) loop
  foreach role_name in array array['anon','authenticated'] loop
   if has_table_privilege(role_name,'public.'||target,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege(role_name,'public.'||target,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Browser role % bypasses the financial gateway on %',role_name,target;end if;
  end loop;
  if not has_table_privilege('service_role','public.'||target,'SELECT') then raise exception 'Gateway lost financial read access on %',target;end if;
 end loop;
end;$fixture$;
rollback;
select 'financial-table-boundary-captured-schema-ok';
