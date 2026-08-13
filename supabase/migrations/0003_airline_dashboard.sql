-- ONE4FIVE — airline accounts + dashboard schema
--
-- Airlines and operators use the map to find Part-145 MROs. This adds a light
-- account layer so an airline can register and get a simple dashboard. It is
-- deliberately thinner than the organisation side: airlines do not appear on the
-- public map, so there is no listing to claim, no profile override layer and no
-- change-request moderation. Registration itself is the whole flow.
--
-- The rule that decides access, straight from the product brief: an account
-- whose confirmed e-mail is on the *exact* domain of an airline already in the
-- `airlines` table is approved on the spot; anything else waits for an admin.
--
-- Depends on 0001 (app_users, the claim_status enum, touch_updated_at(),
-- is_admin()). Safe to run more than once.

-- ------------------------------------------------------- airline members ----
-- One airline can have several staff accounts; one account maps to one airline
-- (the domain it registered under). Membership is what grants a signed-in user
-- their dashboard — created by an auto-verified registration or by an admin.

create table if not exists public.airline_members (
  airline_id  uuid not null references public.airlines (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'editor')),
  created_at  timestamptz not null default now(),
  primary key (airline_id, user_id)
);

create index if not exists airline_members_user_idx
  on public.airline_members (user_id);

-- Defined after the table it reads (PostgreSQL validates a SQL function body at
-- creation). security definer so a normal user may test their own membership
-- without being able to read the whole table.
create or replace function public.is_airline_member(airline uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.airline_members m
     where m.airline_id = airline
       and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------- airline registrations --
-- The record of a sign-up. `airline_id` is set when the person picked an airline
-- already in the DB; `proposed_*` is filled in when their airline is not listed
-- yet (always reviewed by hand, the airline row is created on approval).
--
--   status = 'approved'  auto-verified by an exact e-mail-domain match, or an
--                        admin said yes. Membership follows (see the app).
--   status = 'pending'   waiting for an admin.
--   status = 'rejected'  turned down; the person may register again.

create table if not exists public.airline_registrations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  airline_id            uuid references public.airlines (id) on delete cascade,

  -- filled in when the airline is not in the DB yet
  proposed_name         text,
  proposed_website      text,
  proposed_country_code text,

  contact_note   text,
  status         public.claim_status not null default 'pending',
  auto_verified  boolean not null default false,
  matched_domain text,

  reviewed_by  uuid references auth.users (id),
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint airline_registration_has_target check (
    airline_id is not null or proposed_name is not null
  )
);

drop trigger if exists airline_registrations_touch on public.airline_registrations;
create trigger airline_registrations_touch before update on public.airline_registrations
  for each row execute function public.touch_updated_at();

create index if not exists airline_registrations_user_idx
  on public.airline_registrations (user_id);
create index if not exists airline_registrations_status_idx
  on public.airline_registrations (status, created_at desc);

-- One live registration per user per airline; rejected ones may be retried.
create unique index if not exists airline_registrations_one_open
  on public.airline_registrations (user_id, airline_id)
  where status = 'pending' and airline_id is not null;

-- ---------------------------------------------------------------- RLS --------
-- The app reaches Supabase only from the server with the service_role key, which
-- bypasses RLS — authorisation lives in the server actions and guards.ts. These
-- policies are the second line of defence: if the key is ever swapped for an
-- anon key or a browser-side client appears, the database still refuses
-- cross-account access on its own.

alter table public.airline_members       enable row level security;
alter table public.airline_registrations enable row level security;

-- membership: visible to the member and to admins; only admins may grant it
-- (granting runs server-side under the service_role key).
drop policy if exists airline_members_read on public.airline_members;
create policy airline_members_read on public.airline_members
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists airline_members_admin_write on public.airline_members;
create policy airline_members_admin_write on public.airline_members
  for all using (public.is_admin()) with check (public.is_admin());

-- registrations: a user reads and files their own; only admins may decide them.
drop policy if exists airline_registrations_own_read on public.airline_registrations;
create policy airline_registrations_own_read on public.airline_registrations
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists airline_registrations_own_insert on public.airline_registrations;
create policy airline_registrations_own_insert on public.airline_registrations
  for insert with check (user_id = auth.uid());

drop policy if exists airline_registrations_admin_update on public.airline_registrations;
create policy airline_registrations_admin_update on public.airline_registrations
  for update using (public.is_admin()) with check (public.is_admin());
