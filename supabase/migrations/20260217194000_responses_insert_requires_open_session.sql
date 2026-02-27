-- ============================================================================
-- RESPONSES: ONLY ALLOW INSERTS FOR OPEN SESSIONS
-- ============================================================================
-- Prevent post-completion tampering by ensuring users can only insert responses
-- while a session is in progress.

drop policy if exists "Responses insert for own session" on public.responses;
create policy "Responses insert for own session"
on public.responses
for insert
with check (
  exists (
    select 1
    from public.sessions s
    join public.content_units cu on cu.id = responses.content_unit_id
    join public.parts p on p.id = cu.part_id
    where s.id = responses.session_id
      and s.user_id = auth.uid()
      and s.status in ('active', 'paused')
      -- If a deadline exists for this section, enforce it server-side.
      and (
        (s.metadata->'deadlines'->>p.section_id::text) is null
        or now() <= (s.metadata->'deadlines'->>p.section_id::text)::timestamptz
      )
  )
);
