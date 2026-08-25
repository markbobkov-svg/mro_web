-- ONE4FIVE — one home per fact
--
-- Drops the columns that duplicate something the model already holds properly:
--
--   organisations.phone / .email           -> organisation_contacts
--   organisation_stations.phone / .email   -> organisation_contacts (per station)
--   organisations.legal_name               -> just `name`
--   organisation_contacts.station_iata     -> station_id
--   organisation_contacts.station_icao     -> station_id
--
-- Both phone/email pairs fed one thing: the single line of links OrgCard printed
-- at the foot of a card when an organisation had NO desks at all. That is not a
-- second contact model worth keeping, it is a stand-in for the desks nobody had
-- entered yet — so this migration turns those values INTO desks first and drops
-- the columns second. Nothing that was reachable on the map stops being
-- reachable.
--
-- `organisations` and `organisation_contacts` belong to the data_scraper repo.
-- Dropping columns it writes WILL break it until it is updated: it must stop
-- writing organisations.phone / .email / .legal_name and
-- organisation_contacts.station_iata / .station_icao. Do that side first, or
-- accept a failing scrape until you do.
--
-- ORDER: apply this AFTER deploying the code that goes with it, or together.
-- The app stops reading these columns in the same change; reading a dropped
-- column is what breaks, and the deploy is what stops the reads.
--
-- Apply by hand in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------- preflight --
-- `contact_key` is a generated, UNIQUE column created by data_scraper, which
-- upserts on it. If its expression mentions the station codes, dropping them
-- fails — and redefining the key is a data_scraper change, not ours. Check
-- before touching anything, so this stops here rather than half-done.
--
-- To see the expression yourself:
--   select column_name, generation_expression
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'organisation_contacts'
--      and is_generated = 'ALWAYS';

do $$
declare expr text;
begin
  select generation_expression into expr
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'organisation_contacts'
     and column_name  = 'contact_key';

  if expr is not null and expr ~* 'station_i(ata|cao)' then
    raise exception
      'contact_key is generated from the station codes (%). Redefine it in '
      'data_scraper first — it upserts on this key — then re-run.', expr;
  end if;
end $$;

-- ------------------------------------------------- keep the contacts first ---

-- An organisation's own phone/e-mail becomes an organisation-wide desk, but
-- only where the organisation has no desks at all — which is exactly when the
-- card was showing it. Where desks exist the scalar was already invisible, so
-- copying it in would add a contact the map never displayed.
insert into public.organisation_contacts
  (organisation_id, station_id, function_label, phone, email, sort_order, model)
select o.id, null, 'General enquiries', o.phone, o.email, 100, 'migration'
  from public.organisations o
 where (o.phone is not null or o.email is not null)
   and not exists (
     select 1 from public.organisation_contacts c where c.organisation_id = o.id
   )
on conflict do nothing;

-- A station's own phone/e-mail becomes a desk at that station (22 rows at time
-- of writing), where it can finally carry hours like every other desk.
insert into public.organisation_contacts
  (organisation_id, station_id, function_label, phone, email, sort_order, model)
select st.organisation_id, st.id, 'Station contact', st.phone, st.email, 100, 'migration'
  from public.organisation_stations st
 where (st.phone is not null or st.email is not null)
   and not exists (
     select 1 from public.organisation_contacts c where c.station_id = st.id
   )
on conflict do nothing;

-- ------------------------------------------------------------------ drops ----

alter table public.organisations
  drop column if exists phone,
  drop column if exists email,
  drop column if exists legal_name;

alter table public.organisation_stations
  drop column if exists phone,
  drop column if exists email;

alter table public.organisation_contacts
  drop column if exists station_iata,
  drop column if exists station_icao;

-- `proposed_legal_name` existed only to fill organisations.legal_name when an
-- admin approves a new-organisation claim. With no column to fill, the claim
-- form stops asking and this goes with it. (Ours, from 0001.)
alter table public.organisation_claims
  drop column if exists proposed_legal_name;
