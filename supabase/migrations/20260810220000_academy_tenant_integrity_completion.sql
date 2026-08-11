-- SCHood Academy tenant-integrity completion.
-- Existing Academy tables predate the Education Business OS and often carried
-- academy_id beside a globally unique foreign key. These additive constraints
-- make the tenant relationship structural without changing the public API.

create unique index if not exists academy_action_items_academy_id_id_uidx on public.academy_action_items(academy_id,id);
create unique index if not exists academy_assignments_academy_id_id_uidx on public.academy_assignments(academy_id,id);
create unique index if not exists academy_classroom_memberships_academy_id_id_uidx on public.academy_classroom_memberships(academy_id,id);
create unique index if not exists academy_classroom_resources_academy_id_id_uidx on public.academy_classroom_resources(academy_id,id);
create unique index if not exists academy_conversations_academy_id_id_uidx on public.academy_conversations(academy_id,id);
create unique index if not exists academy_guardian_messages_academy_id_id_uidx on public.academy_guardian_messages(academy_id,id);
create unique index if not exists academy_offers_academy_id_id_uidx on public.academy_offers(academy_id,id);
create unique index if not exists academy_payments_academy_id_id_uidx on public.academy_payments(academy_id,id);

alter table public.academy_action_items
  add constraint academy_action_items_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete cascade not valid,
  add constraint academy_action_items_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete cascade not valid;

alter table public.academy_alerts
  add constraint academy_alerts_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete set null(contact_id) not valid;

alter table public.academy_announcements
  add constraint academy_announcements_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete set null(classroom_id) not valid;

alter table public.academy_assignments
  add constraint academy_assignments_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete cascade not valid,
  add constraint academy_assignments_prerequisite_tenant_fk foreign key(academy_id,prerequisite_id)
    references public.academy_assignments(academy_id,id) on delete set null(prerequisite_id) not valid;

alter table public.academy_attendance
  add constraint academy_attendance_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete cascade not valid,
  add constraint academy_attendance_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete cascade not valid;

alter table public.academy_audit_events
  add constraint academy_audit_events_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete set null(classroom_id) not valid,
  add constraint academy_audit_events_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete set null(contact_id) not valid;

alter table public.academy_bulk_invites
  add constraint academy_bulk_invites_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete cascade not valid;

alter table public.academy_classroom_memberships
  add constraint academy_memberships_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete cascade not valid,
  add constraint academy_memberships_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete cascade not valid,
  add constraint academy_memberships_transfer_tenant_fk foreign key(academy_id,transferred_from_membership_id)
    references public.academy_classroom_memberships(academy_id,id) on delete set null(transferred_from_membership_id) not valid;

alter table public.academy_classroom_resources
  add constraint academy_resources_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete cascade not valid;

alter table public.academy_classroom_resource_progress
  add constraint academy_resource_progress_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete cascade not valid,
  add constraint academy_resource_progress_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete cascade not valid,
  add constraint academy_resource_progress_resource_tenant_fk foreign key(academy_id,resource_id)
    references public.academy_classroom_resources(academy_id,id) on delete cascade not valid;

alter table public.academy_classroom_schedules
  add constraint academy_schedules_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete cascade not valid;

alter table public.academy_conversations
  add constraint academy_conversations_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete cascade not valid;

alter table public.academy_entitlements
  add constraint academy_entitlements_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete cascade not valid,
  add constraint academy_entitlements_offer_tenant_fk foreign key(academy_id,offer_id)
    references public.academy_offers(academy_id,id) on delete set null(offer_id) not valid,
  add constraint academy_entitlements_payment_tenant_fk foreign key(academy_id,payment_id)
    references public.academy_payments(academy_id,id) on delete set null(payment_id) not valid;

alter table public.academy_guardian_messages
  add constraint academy_guardian_messages_reply_tenant_fk foreign key(academy_id,reply_to_message_id)
    references public.academy_guardian_messages(academy_id,id) on delete set null(reply_to_message_id) not valid;

alter table public.academy_messages
  add constraint academy_messages_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete set null(contact_id) not valid,
  add constraint academy_messages_conversation_tenant_fk foreign key(academy_id,conversation_id)
    references public.academy_conversations(academy_id,id) on delete cascade not valid;

alter table public.academy_notifications
  add constraint academy_notifications_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete cascade not valid;

alter table public.academy_offer_grants
  add constraint academy_offer_grants_offer_tenant_fk foreign key(academy_id,offer_id)
    references public.academy_offers(academy_id,id) on delete cascade not valid;

alter table public.academy_offers
  add constraint academy_offers_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete set null(classroom_id) not valid;

alter table public.academy_payments
  add constraint academy_payments_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete set null(contact_id) not valid,
  add constraint academy_payments_offer_tenant_fk foreign key(academy_id,offer_id)
    references public.academy_offers(academy_id,id) on delete set null(offer_id) not valid;

alter table public.academy_referrals
  add constraint academy_referrals_referrer_tenant_fk foreign key(academy_id,referrer_contact_id)
    references public.academy_contacts(academy_id,id) on delete cascade not valid,
  add constraint academy_referrals_referred_tenant_fk foreign key(academy_id,referred_contact_id)
    references public.academy_contacts(academy_id,id) on delete set null(referred_contact_id) not valid;

alter table public.academy_submissions
  add constraint academy_submissions_assignment_tenant_fk foreign key(academy_id,assignment_id)
    references public.academy_assignments(academy_id,id) on delete cascade not valid,
  add constraint academy_submissions_classroom_tenant_fk foreign key(academy_id,classroom_id)
    references public.academy_classrooms(academy_id,id) on delete cascade not valid,
  add constraint academy_submissions_contact_tenant_fk foreign key(academy_id,contact_id)
    references public.academy_contacts(academy_id,id) on delete cascade not valid;

do $$
declare constraint_row record;
begin
  for constraint_row in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where connamespace='public'::regnamespace
      and contype='f'
      and not convalidated
      and conname like 'academy_%_tenant_fk'
  loop
    execute format('alter table %s validate constraint %I',constraint_row.table_name,constraint_row.conname);
  end loop;
end;
$$;
