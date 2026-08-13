-- ONE4FIVE — organisation-owned per-station scope override
--
-- The public card shows each station's certified scope from the scraper-owned
-- `organisation_station_scope`, which is rewritten on every scrape. This table
-- lets an organisation maintain that per-station scope itself. It is merged
-- *over* the scraped rows at read time (see getAirportDetail): for any station
-- that has a managed row, the managed rows replace the scraped scope for that
-- station entirely — the same "once you touch it, you own it" rule as managed
-- contacts. A re-scrape can never wipe it.
--
-- Keyed by (organisation_id, airport_id), NOT by station_id. organisation_id is
-- stable across scrapes (the whole override layer depends on that), and
-- airport_id points at the airports reference table, which is stable too. A
-- station is just "this organisation at this airport", so even if the scraper
-- regenerates organisation_stations.id on a run, this override still lands on
-- the right station. (organisation_station_scope is joined by station_id, but we
-- only ever read it — never key our own rows off an id the scraper may churn.)
--
-- Instant-publish, no moderation: this is the organisation stating what it
-- actually works at that station, not a regulatory fact copied from a register,
-- so it goes live immediately like the profile and the managed contacts.
--
-- Depends on 0001 (touch_updated_at, is_member, is_admin, organisations).
-- Safe to run more than once.

create table if not exists public.organisation_managed_station_scope (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations (id) on delete cascade,
  airport_id        uuid not null references public.airports (id) on delete cascade,
  -- Authority as the organisation types it ('EASA', 'FAA', 'UK-CAA'). Matched
  -- case-insensitively to authorities.code at read time so the line lands in the
  -- right authority group on the card; anything unrecognised shows under "Other".
  authority_code    text,
  rating_class_text text,
  scope_text        text,
  location_scope    text check (location_scope in ('line', 'base', 'both')),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists organisation_managed_station_scope_touch on public.organisation_managed_station_scope;
create trigger organisation_managed_station_scope_touch before update on public.organisation_managed_station_scope
  for each row execute function public.touch_updated_at();

create index if not exists organisation_managed_station_scope_org_idx
  on public.organisation_managed_station_scope (organisation_id);
create index if not exists organisation_managed_station_scope_airport_idx
  on public.organisation_managed_station_scope (airport_id);
create index if not exists organisation_managed_station_scope_pair_idx
  on public.organisation_managed_station_scope (organisation_id, airport_id, sort_order);

-- ---------------------------------------------------------------- RLS -------
-- Same posture as the rest of the override layer: world-readable (it is shown on
-- the public map), writable only by members of that organisation. The server
-- holds the service_role key and enforces membership in guards.ts; these policies
-- are the second line of defence if that ever changes.

alter table public.organisation_managed_station_scope enable row level security;

drop policy if exists organisation_managed_station_scope_public_read on public.organisation_managed_station_scope;
create policy organisation_managed_station_scope_public_read on public.organisation_managed_station_scope
  for select using (true);

drop policy if exists organisation_managed_station_scope_member_write on public.organisation_managed_station_scope;
create policy organisation_managed_station_scope_member_write on public.organisation_managed_station_scope
  for all using (public.is_member(organisation_id) or public.is_admin())
  with check (public.is_member(organisation_id) or public.is_admin());
