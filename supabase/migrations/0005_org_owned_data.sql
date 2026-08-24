-- ONE4FIVE — hand the data back to the organisations
--
-- Until now an organisation's edits lived in a parallel "managed" override layer
-- (0001/0002/0004) that was merged over the scraper-owned rows at read time,
-- because the scraper rewrites its tables on every run. That inverts here: once
-- an organisation has claimed its listing, IT owns its rows, the scraper must
-- leave them alone, and the dashboard writes straight to the real tables.
--
-- What this migration does:
--   1. marks claimed organisations (`organisations.claimed_at`) and keeps the
--      mark in sync as claims are granted;
--   2. guards the scraper-owned tables so a scrape cannot overwrite a claimed
--      organisation (see the caveat below — this is only half the story);
--   3. links contacts to a station, so contacts can be maintained per station;
--   4. folds the managed override rows back into the real tables and drops the
--      override layer.
--
-- Apply by hand in the Supabase SQL editor, like the others. Safe to re-run.
--
--
-- ============================ THE SCRAPER CAVEAT ============================
-- The app and `data_scraper` currently share one credential (SUPABASE_KEY, a
-- service_role key). service_role BYPASSES row-level security and is exempt
-- from nothing, so **no policy or trigger can tell the two apart** while that
-- is true. The trigger below therefore blocks writes from every role EXCEPT
-- service_role — which stops an anon/authenticated client dead, but not a
-- scrape that runs with the shared service_role key.
--
-- To make the block real, do ONE of these in data_scraper:
--   (a) give it its own database role / key (anything that is not service_role)
--       — the trigger then rejects its writes on claimed organisations
--       automatically, with no scraper code change; or
--   (b) have it skip organisations where `claimed_at is not null`.
-- (a) is the safer one: it holds even if the scraper is later changed by
-- someone who does not know this rule.
-- ===========================================================================


-- ------------------------------------------------------- 1. claimed_at ------

alter table public.organisations
  add column if not exists claimed_at timestamptz;

comment on column public.organisations.claimed_at is
  'When this listing was claimed. Non-null = the organisation maintains its own '
  'data and the scraper must not write to it. See migration 0005.';

create index if not exists organisations_claimed_at_idx
  on public.organisations (claimed_at)
  where claimed_at is not null;

-- Backfill: anything with a member today is already claimed.
update public.organisations o
   set claimed_at = coalesce(o.claimed_at, m.first_joined)
  from (
    select organisation_id, min(created_at) as first_joined
      from public.organisation_members
     group by organisation_id
  ) m
 where m.organisation_id = o.id
   and o.claimed_at is null;

-- Keep it in sync: granting membership claims the listing.
create or replace function public.mark_organisation_claimed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.organisations
     set claimed_at = coalesce(claimed_at, now())
   where id = new.organisation_id;
  return new;
end;
$$;

drop trigger if exists organisation_members_mark_claimed on public.organisation_members;
create trigger organisation_members_mark_claimed
  after insert on public.organisation_members
  for each row execute function public.mark_organisation_claimed();


-- ------------------------------------------------- 2. the scrape guard ------
-- Raises on any write touching a claimed organisation, unless the caller is
-- service_role (the app). Read the caveat at the top before trusting it.

create or replace function public.guard_claimed_organisation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  is_claimed boolean;
begin
  -- The app holds service_role; nothing else may touch a claimed organisation.
  if coalesce(current_setting('request.jwt.claim.role', true),
              current_setting('role', true)) = 'service_role'
     or session_user = 'postgres' then
    return coalesce(new, old);
  end if;

  org_id := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'organisation_id')::uuid,
    (to_jsonb(coalesce(new, old)) ->> 'id')::uuid
  );
  if org_id is null then
    return coalesce(new, old);
  end if;

  select o.claimed_at is not null into is_claimed
    from public.organisations o where o.id = org_id;

  if is_claimed then
    raise exception
      'organisation % is claimed — it maintains its own data and may not be '
      'written by the scraper (migration 0005)', org_id
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'organisations',
    'organisation_stations',
    'organisation_contacts',
    'organisation_scope',
    'organisation_station_scope',
    'organisation_approvals'
  ] loop
    execute format('drop trigger if exists guard_claimed on public.%I', t);
    execute format(
      'create trigger guard_claimed before insert or update or delete on public.%I '
      'for each row execute function public.guard_claimed_organisation()', t);
  end loop;
end $$;


-- --------------------------------------- 3. contacts belong to a station ----
-- The dashboard maintains contacts per station. The scraper already records a
-- station code on some contacts (station_iata / station_icao); this adds the
-- real link and backfills it from those codes. A contact with no station is
-- organisation-wide and is shown when a station has none of its own.

alter table public.organisation_contacts
  add column if not exists station_id uuid references public.organisation_stations (id) on delete set null;

alter table public.organisation_contacts
  add column if not exists sort_order integer not null default 0;

create index if not exists organisation_contacts_station_idx
  on public.organisation_contacts (station_id);

-- Backfill station_id where the scraped code matches one of that organisation's
-- own stations (join through airports on either IATA or ICAO).
update public.organisation_contacts c
   set station_id = s.id
  from public.organisation_stations s
  join public.airports a on a.id = s.airport_id
 where c.station_id is null
   and s.organisation_id = c.organisation_id
   and (
     (c.station_iata is not null and upper(c.station_iata) = upper(a.iata_code)) or
     (c.station_icao is not null and upper(c.station_icao) = upper(a.icao_code))
   );


-- ------------------------------- 4. fold the override layer back in ---------
-- Only claimed organisations ever had override rows, and there are very few of
-- them, so this simply replays each managed row onto the real table.

-- 4a. managed contacts -> organisation_contacts (they replaced the scraped list
--     outright, so clear the organisation's scraped contacts first).
do $$
begin
  if to_regclass('public.organisation_managed_contacts') is not null then
    delete from public.organisation_contacts c
     where exists (select 1 from public.organisation_managed_contacts m
                    where m.organisation_id = c.organisation_id);

    insert into public.organisation_contacts
      (organisation_id, function_label, name, phone, email, hours, sort_order)
    select m.organisation_id, m.function_label, m.name, m.phone, m.email, m.hours,
           coalesce(m.sort_order, 0)
      from public.organisation_managed_contacts m;
  end if;
end $$;

-- 4b. managed station scope -> organisation_station_scope, resolved from
--     (organisation, airport) to that organisation's station at that airport.
do $$
begin
  if to_regclass('public.organisation_managed_station_scope') is not null then
    delete from public.organisation_station_scope ss
     using public.organisation_managed_station_scope m,
           public.organisation_stations s
     where s.organisation_id = m.organisation_id
       and s.airport_id = m.airport_id
       and ss.station_id = s.id;

    insert into public.organisation_station_scope
      (organisation_id, station_id, authority_id, authority_text,
       rating_class_text, scope_text, location_scope)
    select m.organisation_id, s.id,
           (select a.id from public.authorities a
             where upper(a.code) = upper(m.authority_code) limit 1),
           m.authority_code, m.rating_class_text, m.scope_text, m.location_scope
      from public.organisation_managed_station_scope m
      join public.organisation_stations s
        on s.organisation_id = m.organisation_id
       and s.airport_id = m.airport_id;
  end if;
end $$;

-- 4c. managed stations -> organisation_stations (0004 may not have been applied).
do $$
begin
  if to_regclass('public.organisation_managed_stations') is not null then
    -- removals
    delete from public.organisation_stations s
     using public.organisation_managed_stations m
     where m.removed
       and s.organisation_id = m.organisation_id
       and s.airport_id = m.airport_id;

    -- edits
    update public.organisation_stations s
       set address = m.address, phone = m.phone, email = m.email, is_base = m.is_base
      from public.organisation_managed_stations m
     where not m.removed
       and s.organisation_id = m.organisation_id
       and s.airport_id = m.airport_id;

    -- additions
    insert into public.organisation_stations
      (organisation_id, airport_id, address, phone, email, is_base)
    select m.organisation_id, m.airport_id, m.address, m.phone, m.email, m.is_base
      from public.organisation_managed_stations m
     where not m.removed
       and not exists (
         select 1 from public.organisation_stations s
          where s.organisation_id = m.organisation_id
            and s.airport_id = m.airport_id);
  end if;
end $$;

drop table if exists public.organisation_managed_contacts;
drop table if exists public.organisation_managed_station_scope;
drop table if exists public.organisation_managed_stations;
