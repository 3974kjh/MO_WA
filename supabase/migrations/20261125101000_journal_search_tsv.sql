-- BE follow-up: journal_entries full-text search column (title + memo_md).
-- FE-10 currently filters journal q via title/memo_md ilike because no tsvector existed.
-- Do NOT apply remotely from the agent — PM only.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS public.journal_search_gin;
--   ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS search_tsv;

alter table public.journal_entries
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(memo_md, '')
    )
  ) stored;

create index if not exists journal_search_gin
  on public.journal_entries using gin (search_tsv);
