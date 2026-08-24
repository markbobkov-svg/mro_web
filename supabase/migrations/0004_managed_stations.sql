-- ONE4FIVE — organisation-owned station override
--
-- The map places an organisation at an airport from the scraper-owned
-- `organisation_stations`, which is rewritten on every scrape. This table lets
-- an organisation maintain that presence itself: correct a station's contact
-- details, flag it as a main base, add a station the scrape missed, or drop one
-- that isn't theirs. It is merged *over* the scraped rows at read time (see
-- getAirportMarkers / getAirportDetail / getDashboardOrg) — the same "once you
-- touch it, you own it" rule as managed contacts and managed station scope. A
-- re-scrape can never wipe it.
--
-- Keyed by (organisation_id, airport_id), NOT by station_id — one row per
-- organisation per airport, which is exactly what "a station" means here.
-- organisation_id and airport_id are stable across scrapes; the scraper may
-- regenerate organisation_stations.id on any run, so we never key our own rows
-- off an id it can churn. (Same reasoning as 0002.)
--
-- `removed` is a tombstone, not a delete: we cannot delete a scraped row (the
-- next scrape would bring it back), so removing a station means recording that
-- this organisation is not at that airport. A row with removed = true hides the
-- station everywhere — map marker, card and dashboard.
--
-- Instant-publish, no moderation: an organisation knows which airports it works
-- at, and which of them is its base, better than a reviewer does — the same call
-- already made for per-station scope in 0002. Stations used to go through the
-- change-request queue; they no longer do.
--
-- Depends on 0001 (touch_updated_at, is_member, is_admin, organisations).
-- Safe to run more than once.

create table if not exists public.organisation_managed_stations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  airport_id      uuid not null references public.airports (id) on delete cascade,
  address         text,
  phone           text,
  email           text,
  -- Mirrors organisation_stations.is_base: this airport is a main base for the
  -- organisation (heavy/base maintenance), not just a line station.
  is_base         boolean not null default false,
  -- Tombstone — see the note above.
  removed         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, airport_id)
);

drop trigger if exists organisation_managed_stations_touch on public.organisation_managed_stations;
create trigger organisation_managed_stations_touch before update on public.organisation_managed_stations
  for each row execute function public.touch_updated_at();

create index if not exists organisation_managed_stations_org_idx
  on public.organisation_managed_stations (organisation_id);
create index if not exists organisation_managed_stations_airport_idx
  on public.organisation_managed_stations (airport_id);

-- ---------------------------------------------------------------- RLS -------
-- Same posture as the rest of the override layer: world-readable (it is shown on
-- the public map), writable only by members of that organisation. The server
-- holds the service_role key and enforces membership in guards.ts; these policies
-- are the second line of defence if that ever changes.

alter table public.organisation_managed_stations enable row level security;

drop policy if exists organisation_managed_stations_public_read on public.organisation_managed_stations;
create policy organisation_managed_stations_public_read on public.organisation_managed_stations
  for select using (true);

drop policy if exists organisation_managed_stations_member_write on public.organisation_managed_stations;
create policy organisation_managed_stations_member_write on public.organisation_managed_stations
  for all using (public.is_member(organisation_id) or public.is_admin())
  with check (public.is_member(organisation_id) or public.is_admin());
