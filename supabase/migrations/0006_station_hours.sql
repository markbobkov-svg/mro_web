-- ONE4FIVE — opening hours for a station's own phone
--
-- A station carries a phone and an e-mail (organisation_stations.phone/email),
-- but nothing said WHEN that number is answered — the individual desks
-- (organisation_contacts.hours) had that and the station itself did not. This
-- adds it, so a station can state "24/7" or "Mon–Fri 06:00–22:00" next to its
-- number the same way a desk can.
--
-- Apply by hand in the Supabase SQL editor. Safe to re-run.

alter table public.organisation_stations
  add column if not exists hours text;

comment on column public.organisation_stations.hours is
  'When this station''s own phone is answered, e.g. "24/7" or '
  '"Mon-Fri 06:00-22:00". Per-desk hours live on organisation_contacts.hours.';
