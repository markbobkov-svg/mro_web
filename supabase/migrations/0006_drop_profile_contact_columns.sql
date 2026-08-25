-- ONE4FIVE — drop the profile's contact columns
--
-- `organisation_profiles` was built (0001) as an override layer over the
-- scraped record, and carried a single phone, e-mail and AOG pair for the whole
-- organisation. That model is gone: every way of reaching a person is now a
-- desk in `organisation_contacts`, which holds as many as an organisation needs
-- — per station, or organisation-wide with `station_id is null` — each with its
-- own `hours`, and an AOG desk is simply a desk named "AOG".
--
-- The application already stopped reading and writing these four columns: the
-- Profile tab offers only website and address, `saveProfileAction` omits them
-- from its upsert, and `getAirportDetail`'s header chain is `station ?? org`.
-- So this drop removes dead columns, not live data — but it IS data: whatever
-- an organisation typed into them before the change is deleted for good.
--
-- Check what would be lost before running it:
--
--   select count(*) filter (where phone     is not null) as phone,
--          count(*) filter (where email     is not null) as email,
--          count(*) filter (where aog_phone is not null) as aog_phone,
--          count(*) filter (where aog_email is not null) as aog_email
--     from public.organisation_profiles;
--
-- and, if any of it is worth keeping, copy it into desks first:
--
--   insert into public.organisation_contacts
--     (organisation_id, function_label, phone, email, sort_order, model)
--   select organisation_id, 'AOG', aog_phone, aog_email, 0, 'migration'
--     from public.organisation_profiles
--    where aog_phone is not null or aog_email is not null
--   on conflict do nothing;
--
-- Apply by hand in the Supabase SQL editor. Safe to re-run.

alter table public.organisation_profiles
  drop column if exists phone,
  drop column if exists email,
  drop column if exists aog_phone,
  drop column if exists aog_email;
