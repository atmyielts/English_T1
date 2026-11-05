-- Schood AI: a workspace may tailor a built-in assistant without renaming it, so
-- the built-in keeps its own name in every language. A null name means "keep the
-- built-in's name"; custom assistants are still named (the function requires it).
-- Additive to 20261030100000_schood_ai_core.sql; no existing row changes.
begin;
alter table public.ai_specialists alter column name drop not null;
commit;
