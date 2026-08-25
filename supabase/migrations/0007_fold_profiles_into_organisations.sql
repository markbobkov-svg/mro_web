-- ONE4FIVE — fold organisation_profiles back into organisations
--
-- The last piece of the override layer. 0001 put an organisation's own edits in
-- a parallel table merged over the scraped row at read time; 0005 reversed that
-- for contacts, stations and scope — a claimed organisation owns its real rows
-- — and dropped the three managed tables, but never touched
-- `organisation_profiles`. This finishes the job: the Profile tab edits
-- `organisations`, the same table every other tab already writes.
--
-- `organisations` is created by the data_scraper repo, not by these migrations,
-- so this only ADDS columns to it and never drops or retypes one. tagline,
-- description and logo_url have no scraped equivalent; website and address
-- already exist there and were being shadowed by the profile copy.
--
-- The fold prefers the profile's value wherever it has one, because that is
-- what the organisation typed and `profile ?? org` is exactly what the read
-- chain did before.
--
-- `updated_by` is not carried over: it was written and never read.
-- `profile_updated_at` is a new name rather than reusing any `updated_at` the
-- scraper may maintain, so "Last saved" cannot end up showing a scrape time.
--
-- THE CAVEAT THAT MATTERS. `guard_claimed_organisation` is meant to stop the
-- scraper writing a claimed organisation, but it exempts service_role — and the
-- app and data_scraper still share one service_role key. Until data_scraper
-- gets its own non-service_role key (or skips rows where `claimed_at is not
-- null`), a re-scrape can overwrite the tagline, description, website and
-- address an organisation typed. That risk is the reason the separate table
-- existed; moving off it is a deliberate choice, not an oversight.
--
-- The migration's own UPDATE passes the guard: it exempts session_user
-- 'postgres', which is what the Supabase SQL editor runs as.
--
-- ORDER MATTERS, unlike 0006. Apply this BEFORE deploying the code that goes
-- with it. Reads are safe either way — both selects use `*`, so a missing
-- column is just undefined — but `saveProfileAction` UPDATEs organisations with
-- tagline / description / logo_url / profile_updated_at, and against the old
-- schema PostgREST rejects that with PGRST204 and "Save profile" fails. There
-- is deliberately no retry-without-the-columns fallback: silently dropping the
-- tagline someone just typed is worse than an error telling them to migrate.
--
-- Apply by hand in the Supabase SQL editor. Safe to re-run — after the table is
-- dropped the update is skipped and only the idempotent adds remain.

alter table public.organisations
  add column if not exists tagline            text,
  add column if not exists description        text,
  add column if not exists logo_url           text,
  add column if not exists profile_updated_at timestamptz;

do $$
begin
  if to_regclass('public.organisation_profiles') is null then
    raise notice 'organisation_profiles already gone — nothing to fold';
    return;
  end if;

  update public.organisations o
     set tagline            = coalesce(p.tagline, o.tagline),
         description        = coalesce(p.description, o.description),
         logo_url           = coalesce(p.logo_url, o.logo_url),
         website            = coalesce(p.website, o.website),
         address            = coalesce(p.address, o.address),
         profile_updated_at = p.updated_at
    from public.organisation_profiles p
   where p.organisation_id = o.id;

  raise notice 'folded % profile row(s) into organisations',
    (select count(*) from public.organisation_profiles);
end $$;

drop table if exists public.organisation_profiles;
