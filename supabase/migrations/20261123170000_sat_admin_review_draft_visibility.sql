-- Only admins can read unpublished SAT forms marked for admin review.
-- The existing section, part, and content-unit policies join through experiences.
create policy "SAT admin review drafts require admin"
on public.experiences
as restrictive
for select to authenticated
using (
  not (
    product_id = '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'::uuid
    and is_active is false
    and metadata @> '{"admin_review_only": true}'::jsonb is true
  )
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);
