-- ============================================================================
-- RUNTIME WRITE POLICIES (SESSIONS / RESPONSES)
-- ============================================================================
-- The platform spine initially only allowed SELECT under RLS.
-- The simulator needs authenticated users to create/update their own sessions
-- and insert immutable responses.

-- Sessions: create own sessions
drop policy if exists "Sessions insert own" on public.sessions;
create policy "Sessions insert own"
on public.sessions
for insert
with check (auth.uid() = user_id);

-- Sessions: update own sessions (status, metadata, timestamps)
drop policy if exists "Sessions update own" on public.sessions;
create policy "Sessions update own"
on public.sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Responses: insert only for sessions the user owns
drop policy if exists "Responses insert for own session" on public.responses;
create policy "Responses insert for own session"
on public.responses
for insert
with check (
  exists (
    select 1
    from public.sessions s
    where s.id = responses.session_id
      and s.user_id = auth.uid()
  )
);

