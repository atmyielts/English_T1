-- Schood Company English: running many company contracts (ops stream).
--   * company_contracts: quotes and contracts staff enter per workspace;
--   * company_invoices and company_invoice_payments: invoices, acts and payments, with the
--     seller and buyer details copied in when issued, so a later change never rewrites a document;
--   * company_billing_settings: Schood's own details, entered by staff and never invented;
--   * company_org_billing: the buyer's details (bank, MFO, account), entered by HR or staff;
--   * company_doc_counters: invoice and act number sequences per year;
--   * company_saved_filters, company_member_requests, company_manager_departments:
--     saved People filters, requests from employees, extra departments for a manager;
--   * company_members.last_seen_at (for HR only, the workspace health signal) and locale.
-- Additive and idempotent: every statement can run twice.

alter table public.company_members add column if not exists last_seen_at timestamptz;
alter table public.company_members add column if not exists locale text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_members_locale_check') then
    alter table public.company_members add constraint company_members_locale_check check (locale is null or locale in ('en','ru','uz'));
  end if;
end
$$;

create table if not exists public.company_contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  status text not null default 'quote' check (status in ('quote','sent','negotiating','signed','lost','ended')),
  seats integer not null default 0 check (seats between 0 and 100000),
  -- Null means tests are not limited by this contract.
  tests integer check (tests is null or tests between 0 and 1000000),
  -- Entered by staff for the whole term, never computed from a price list.
  price_per_seat bigint not null default 0 check (price_per_seat between 0 and 10000000000),
  tests_fee bigint not null default 0 check (tests_fee between 0 and 10000000000000),
  term_months integer not null default 12 check (term_months between 1 and 120),
  currency text not null default 'UZS' check (currency = 'UZS'),
  start_date date,
  end_date date,
  renewal_date date,
  signed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 4000),
  renewed_from uuid references public.company_contracts(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_contracts_dates_check check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists company_contracts_org_idx on public.company_contracts (org_id, created_at desc);
create index if not exists company_contracts_status_idx on public.company_contracts (status, end_date);
-- One open renewal per contract, so two renew clicks at once cannot open two quotes.
create unique index if not exists company_contracts_renewed_from_uq on public.company_contracts (renewed_from) where renewed_from is not null and status <> 'lost';

create table if not exists public.company_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete restrict,
  contract_id uuid references public.company_contracts(id) on delete set null,
  number text not null,
  act_number text,
  act_date date,
  issue_date date not null,
  due_date date,
  status text not null default 'issued' check (status in ('issued','partial','paid','void')),
  currency text not null default 'UZS' check (currency = 'UZS'),
  lines jsonb not null default '[]'::jsonb,
  subtotal bigint not null default 0 check (subtotal >= 0),
  vat_percent numeric(5,2) not null default 0 check (vat_percent between 0 and 100),
  vat_amount bigint not null default 0 check (vat_amount >= 0),
  total bigint not null default 0 check (total >= 0),
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  paid_on date,
  seller jsonb not null default '{}'::jsonb,
  buyer jsonb not null default '{}'::jsonb,
  notes text check (notes is null or char_length(notes) <= 2000),
  activated_at timestamptz,
  activated_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_invoices_number_key on public.company_invoices (number);
create unique index if not exists company_invoices_act_number_key on public.company_invoices (act_number) where act_number is not null;
create index if not exists company_invoices_org_idx on public.company_invoices (org_id, issue_date desc);
create index if not exists company_invoices_due_idx on public.company_invoices (status, due_date);

create table if not exists public.company_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.company_invoices(id) on delete cascade,
  org_id uuid not null references public.company_orgs(id) on delete restrict,
  amount bigint not null check (amount > 0),
  paid_on date not null,
  reference text check (reference is null or char_length(reference) <= 200),
  -- One per opened form: a double click or a retry lands on the same row.
  client_key text check (client_key is null or char_length(client_key) <= 80),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists company_invoice_payments_invoice_idx on public.company_invoice_payments (invoice_id);
create unique index if not exists company_invoice_payments_key on public.company_invoice_payments (invoice_id, client_key) where client_key is not null;

-- Schood's own details on invoices and acts. One row; empty until staff fill it in.
create table if not exists public.company_billing_settings (
  id boolean primary key default true check (id),
  legal_name text check (legal_name is null or char_length(legal_name) <= 200),
  tax_id text check (tax_id is null or char_length(tax_id) <= 40),
  vat_code text check (vat_code is null or char_length(vat_code) <= 40),
  bank_name text check (bank_name is null or char_length(bank_name) <= 200),
  mfo text check (mfo is null or char_length(mfo) <= 20),
  account text check (account is null or char_length(account) <= 40),
  address text check (address is null or char_length(address) <= 300),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  director text check (director is null or char_length(director) <= 160),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- The buyer's details. The STIR stays on company_orgs.tax_id.
create table if not exists public.company_org_billing (
  org_id uuid primary key references public.company_orgs(id) on delete cascade,
  legal_name text check (legal_name is null or char_length(legal_name) <= 200),
  vat_code text check (vat_code is null or char_length(vat_code) <= 40),
  bank_name text check (bank_name is null or char_length(bank_name) <= 200),
  mfo text check (mfo is null or char_length(mfo) <= 20),
  account text check (account is null or char_length(account) <= 40),
  address text check (address is null or char_length(address) <= 300),
  director text check (director is null or char_length(director) <= 160),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.company_doc_counters (
  kind text not null check (kind in ('invoice','act')),
  year integer not null check (year between 2000 and 2100),
  last integer not null default 0 check (last >= 0),
  primary key (kind, year)
);

create table if not exists public.company_saved_filters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_saved_filters_name_key on public.company_saved_filters (org_id, user_id, lower(btrim(name)));

-- What an employee asks HR for: a learning seat, or a different job role.
create table if not exists public.company_member_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  kind text not null check (kind in ('seat','job_role')),
  job_role text,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','declined','withdrawn')),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_member_requests_org_idx on public.company_member_requests (org_id, status, created_at desc);
-- One open request of each kind per person: a double click becomes a friendly conflict.
create unique index if not exists company_member_requests_open_key on public.company_member_requests (member_id, kind) where status = 'pending';

-- Departments a manager looks after beyond their own company_members.department_id.
create table if not exists public.company_manager_departments (
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  department_id uuid not null references public.company_departments(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (member_id, department_id)
);
create index if not exists company_manager_departments_org_idx on public.company_manager_departments (org_id);

drop trigger if exists company_contracts_updated_at on public.company_contracts;
create trigger company_contracts_updated_at before update on public.company_contracts for each row execute function public.set_updated_at();
drop trigger if exists company_invoices_updated_at on public.company_invoices;
create trigger company_invoices_updated_at before update on public.company_invoices for each row execute function public.set_updated_at();
drop trigger if exists company_billing_settings_updated_at on public.company_billing_settings;
create trigger company_billing_settings_updated_at before update on public.company_billing_settings for each row execute function public.set_updated_at();
drop trigger if exists company_org_billing_updated_at on public.company_org_billing;
create trigger company_org_billing_updated_at before update on public.company_org_billing for each row execute function public.set_updated_at();
drop trigger if exists company_saved_filters_updated_at on public.company_saved_filters;
create trigger company_saved_filters_updated_at before update on public.company_saved_filters for each row execute function public.set_updated_at();
drop trigger if exists company_member_requests_updated_at on public.company_member_requests;
create trigger company_member_requests_updated_at before update on public.company_member_requests for each row execute function public.set_updated_at();

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'company_contracts', 'company_invoices', 'company_invoice_payments', 'company_billing_settings', 'company_org_billing',
    'company_doc_counters', 'company_saved_filters', 'company_member_requests', 'company_manager_departments'
  ] loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('revoke all on table public.%I from anon, authenticated', relation_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', relation_name);
  end loop;
end
$$;

-- Closing an account erases the person's saved filters and requests too (same additive
-- registry pattern as 20261031100000_company_core.sql).
do $$
declare
  relations text[];
  wanted text[] := array['company_saved_filters', 'company_member_requests'];
  relation_name text;
  guard_installed boolean := to_regprocedure('public.guard_closed_personal_record()') is not null;
begin
  if to_regprocedure('public.account_personal_erasure_tables()') is null then
    raise notice 'account_personal_erasure_tables() is not installed; erasure registry not extended';
    return;
  end if;
  relations := public.account_personal_erasure_tables();
  foreach relation_name in array wanted loop
    if to_regclass(format('public.%I', relation_name)) is null then
      continue;
    end if;
    if not (relation_name = any(relations)) then
      relations := relations || relation_name;
      if guard_installed then
        execute format('drop trigger if exists account_closed_personal_guard on public.%I', relation_name);
        execute format(
          'create trigger account_closed_personal_guard before insert or update on public.%I for each row execute function public.guard_closed_personal_record(%L)',
          relation_name, 'user_id'
        );
      end if;
    end if;
  end loop;
  execute format(
    'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
    format('select %L::text[];', relations::text)
  );
end
$$;
