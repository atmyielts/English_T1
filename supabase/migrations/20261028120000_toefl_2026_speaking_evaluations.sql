-- TOEFL iBT 2026: allow the transcript-based speaking estimate written by the
-- toefl-speaking Edge Function (evaluations.method = 'ai_speaking').
-- Widening only: every existing row and writer stays valid.
begin;
set local lock_timeout='5s';

alter table public.evaluations drop constraint if exists evaluations_method_check;
alter table public.evaluations
  add constraint evaluations_method_check
  check (method in ('auto', 'manual', 'ai', 'admin', 'ai_speaking')) not valid;

commit;

-- Validation scans the table without blocking writers.
alter table public.evaluations validate constraint evaluations_method_check;
