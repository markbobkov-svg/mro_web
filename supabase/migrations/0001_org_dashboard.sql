-- ONE4FIVE — organisation dashboard schema
--
-- Adds the account / claim / moderation layer on top of the scraped data.
--
-- Design rule that everything else follows: the scraper owns `organisations`,
-- `organisation_approvals`, `organisation_scope` and friends, and re-writes them
-- on every run. Nothing an organisation types is ever stored in those tables.
-- Organisation edits live in a separate layer (`organisation_profiles`,
-- `organisation_managed_contacts`) that is merged *over* the scraped rows at
-- read time, so a re-scrape can never wipe them.
--
-- Safe to run more than once.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- helpers ---

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------------ enums ---

do $$ begin
  create type public.claim_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.claim_kind as enum ('existing', 'new');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.change_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------- app_users ------
-- Profile mirror of auth.users. Rows are created by the app on sign-up (the
-- server holds the service_role key), so no trigger on the auth schema.

create table if not exists public.app_users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  job_title   text,
  phone       text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists app_users_touch on public.app_users;
create trigger app_users_touch before update on public.app_users
  for each row execute function public.touch_updated_at();

-- Admin check used by the policies below. security definer so that a normal
-- user may test their own flag without being able to read the whole table.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.is_admin from public.app_users u where u.id = auth.uid()),
    false
  );
$$;

create or replace function public.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.organisation_members m
     where m.organisation_id = org
       and m.user_id = auth.uid()
  );
$$;

-- --------------------------------------------------------- membership ------

create table if not exists public.organisation_members (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null default 'owner' check (role in ('owner', 'editor')),
  created_at      timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create index if not exists organisation_members_user_idx
  on public.organisation_members (user_id);

-- ------------------------------------------------------------- claims ------
-- `kind = 'existing'` claims an organisation already in the DB.
-- `kind = 'new'`      asks for an organisation that is not in the DB yet; those
--                     are always reviewed by hand and create the organisation
--                     on approval.

create table if not exists public.organisation_claims (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  kind                 public.claim_kind not null default 'existing',
  organisation_id      uuid references public.organisations (id) on delete cascade,

  -- filled in for kind = 'new'
  proposed_name         text,
  proposed_legal_name   text,
  proposed_country_code text,
  proposed_website      text,
  proposed_address      text,
  proposed_approval_ref text,

  contact_note   text,
  status         public.claim_status not null default 'pending',
  auto_verified  boolean not null default false,
  matched_domain text,

  reviewed_by  uuid references auth.users (id),
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint claim_has_target check (
    (kind = 'existing' and organisation_id is not null) or
    (kind = 'new'      and proposed_name is not null)
  )
);

drop trigger if exists organisation_claims_touch on public.organisation_claims;
create trigger organisation_claims_touch before update on public.organisation_claims
  for each row execute function public.touch_updated_at();

create index if not exists organisation_claims_user_idx   on public.organisation_claims (user_id);
create index if not exists organisation_claims_status_idx on public.organisation_claims (status, created_at desc);

-- One live claim per user per organisation; rejected ones may be retried.
create unique index if not exists organisation_claims_one_open
  on public.organisation_claims (user_id, organisation_id)
  where status = 'pending' and organisation_id is not null;

-- ------------------------------------------- organisation-owned profile ----
-- Instant-publish layer. Every column is an override: NULL means "keep whatever
-- the scraper found".

create table if not exists public.organisation_profiles (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  tagline     text,
  description text,
  logo_url    text,
  website     text,
  email       text,
  phone       text,
  address     text,
  aog_phone   text,
  aog_email   text,
  updated_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists organisation_profiles_touch on public.organisation_profiles;
create trigger organisation_profiles_touch before update on public.organisation_profiles
  for each row execute function public.touch_updated_at();

-- ------------------------------------------ organisation-owned contacts ----
-- When an organisation has any managed contacts, they replace the scraped
-- contacts on the public card entirely — an organisation knows its own desks
-- better than the scraper does.

create table if not exists public.organisation_managed_contacts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  function_label  text,
  name            text,
  phone           text,
  email           text,
  hours           text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists organisation_managed_contacts_touch on public.organisation_managed_contacts;
create trigger organisation_managed_contacts_touch before update on public.organisation_managed_contacts
  for each row execute function public.touch_updated_at();

create index if not exists organisation_managed_contacts_org_idx
  on public.organisation_managed_contacts (organisation_id, sort_order);

-- ------------------------------------------------------ change requests ----
-- Regulatory data (approvals, scope, stations) is never edited in place by an
-- organisation. They propose, an admin applies.

create table if not exists public.organisation_change_requests (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  target          text not null check (target in ('approval', 'scope', 'station')),
  action          text not null check (action in ('add', 'update', 'remove')),
  target_id       uuid,
  payload         jsonb not null default '{}'::jsonb,
  note            text,
  status          public.change_status not null default 'pending',
  reviewed_by     uuid references auth.users (id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists organisation_change_requests_touch on public.organisation_change_requests;
create trigger organisation_change_requests_touch before update on public.organisation_change_requests
  for each row execute function public.touch_updated_at();

create index if not exists organisation_change_requests_org_idx
  on public.organisation_change_requests (organisation_id, created_at desc);
create index if not exists organisation_change_requests_status_idx
  on public.organisation_change_requests (status, created_at desc);

-- ---------------------------------------------------------------- RLS -------
-- The app reaches Supabase only from the server and currently holds the
-- service_role key, which bypasses RLS — authorisation is enforced in the
-- server actions. These policies are the second line of defence: if the key is
-- ever swapped for an anon key, or a browser-side client is added, the database
-- still refuses cross-organisation access on its own.

alter table public.app_users                     enable row level security;
alter table public.organisation_members          enable row level security;
alter table public.organisation_claims           enable row level security;
alter table public.organisation_profiles         enable row level security;
alter table public.organisation_managed_contacts enable row level security;
alter table public.organisation_change_requests  enable row level security;

-- app_users: a user sees and edits only their own row; admins see all.
drop policy if exists app_users_self_read on public.app_users;
create policy app_users_self_read on public.app_users
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists app_users_self_write on public.app_users;
create policy app_users_self_write on public.app_users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- membership: visible to the member and to admins; only admins may grant it
-- (membership is granted by claim approval, which runs server-side).
drop policy if exists organisation_members_read on public.organisation_members;
create policy organisation_members_read on public.organisation_members
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists organisation_members_admin_write on public.organisation_members;
create policy organisation_members_admin_write on public.organisation_members
  for all using (public.is_admin()) with check (public.is_admin());

-- claims: a user reads and files their own; only admins may decide them.
drop policy if exists organisation_claims_own_read on public.organisation_claims;
create policy organisation_claims_own_read on public.organisation_claims
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists organisation_claims_own_insert on public.organisation_claims;
create policy organisation_claims_own_insert on public.organisation_claims
  for insert with check (user_id = auth.uid() and status = 'pending');

drop policy if exists organisation_claims_admin_update on public.organisation_claims;
create policy organisation_claims_admin_update on public.organisation_claims
  for update using (public.is_admin()) with check (public.is_admin());

-- profile + contacts: world-readable (they are shown on the public map),
-- writable only by members of that organisation.
drop policy if exists organisation_profiles_public_read on public.organisation_profiles;
create policy organisation_profiles_public_read on public.organisation_profiles
  for select using (true);

drop policy if exists organisation_profiles_member_write on public.organisation_profiles;
create policy organisation_profiles_member_write on public.organisation_profiles
  for all using (public.is_member(organisation_id) or public.is_admin())
  with check (public.is_member(organisation_id) or public.is_admin());

drop policy if exists organisation_managed_contacts_public_read on public.organisation_managed_contacts;
create policy organisation_managed_contacts_public_read on public.organisation_managed_contacts
  for select using (true);

drop policy if exists organisation_managed_contacts_member_write on public.organisation_managed_contacts;
create policy organisation_managed_contacts_member_write on public.organisation_managed_contacts
  for all using (public.is_member(organisation_id) or public.is_admin())
  with check (public.is_member(organisation_id) or public.is_admin());

-- change requests: members see and file their organisation's; admins decide.
drop policy if exists organisation_change_requests_read on public.organisation_change_requests;
create policy organisation_change_requests_read on public.organisation_change_requests
  for select using (public.is_member(organisation_id) or public.is_admin());

drop policy if exists organisation_change_requests_insert on public.organisation_change_requests;
create policy organisation_change_requests_insert on public.organisation_change_requests
  for insert with check (
    public.is_member(organisation_id) and user_id = auth.uid() and status = 'pending'
  );

drop policy if exists organisation_change_requests_admin_update on public.organisation_change_requests;
create policy organisation_change_requests_admin_update on public.organisation_change_requests
  for update using (public.is_admin()) with check (public.is_admin());
