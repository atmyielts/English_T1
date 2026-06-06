-- Bind partner voucher batches to academy classrooms for automatic enrollment.

alter table public.partner_voucher_batches
  add column if not exists classroom_id uuid references public.academy_classrooms(id) on delete set null;

alter table public.partner_vouchers
  add column if not exists classroom_id uuid references public.academy_classrooms(id) on delete set null;

create index if not exists partner_voucher_batches_classroom_idx
  on public.partner_voucher_batches (classroom_id)
  where classroom_id is not null;

create index if not exists partner_vouchers_classroom_idx
  on public.partner_vouchers (classroom_id)
  where classroom_id is not null;

create or replace function public.partner_voucher_apply_batch_classroom()
returns trigger
language plpgsql
as $$
begin
  if new.classroom_id is null and new.batch_id is not null then
    select b.classroom_id
      into new.classroom_id
    from public.partner_voucher_batches b
    where b.id = new.batch_id;
  end if;

  return new;
end;
$$;

drop trigger if exists partner_vouchers_apply_batch_classroom on public.partner_vouchers;
create trigger partner_vouchers_apply_batch_classroom
before insert or update of batch_id, classroom_id
on public.partner_vouchers
for each row execute procedure public.partner_voucher_apply_batch_classroom();
