-- ONE4FIVE — every desk belongs to a station
--
-- (A previous 0006 added a station-level `hours` column; it was reverted before
-- it was ever applied — hours belong to a desk, not a station. The number is
-- reused here.)
--
-- The dashboard maintains contacts per station only: the Stations tab has no
-- "organisation-wide desks" block any more, a station takes as many desks as it
-- needs, and a station with none of its own now shows the organisation's own
-- details from the Profile tab (phone / e-mail / website) on its public card.
--
-- That leaves the station-less rows a *claimed* organisation may still have
-- from the old model: the dashboard can no longer reach them. This attaches
-- each of those to one of that organisation's stations, picked as
--   1. the station whose IATA/ICAO code the desk names ("TLL line maintenance"),
--   2. otherwise a main base,
--   3. otherwise the first station by code.
--
-- Unclaimed listings are deliberately left alone: their station-less contacts
-- are scraped data, and the map still shows them as the fallback for a station
-- that has no desks of its own.
--
-- Apply by hand in the Supabase SQL editor, like the others. Safe to re-run.
-- The SQL editor connects as `postgres`, which `guard_claimed_organisation`
-- (migration 0005) lets through, so the guard does not block this.

update public.organisation_contacts c
   set station_id = t.station_id
  from (
    select c.id as contact_id,
           (
             select s.id
               from public.organisation_stations s
               left join public.airports a on a.id = s.airport_id
              where s.organisation_id = c.organisation_id
              order by
                -- 1. the desk names the airport it answers for
                case
                  when a.iata_code is not null
                   and coalesce(c.function_label, c.label, '') || ' ' ||
                       coalesce(c.name, '') || ' ' || coalesce(c.hours, '')
                       ~* ('(^|[^[:alnum:]])' || a.iata_code || '([^[:alnum:]]|$)')
                  then 0
                  when a.icao_code is not null
                   and coalesce(c.function_label, c.label, '') || ' ' ||
                       coalesce(c.name, '') || ' ' || coalesce(c.hours, '')
                       ~* ('(^|[^[:alnum:]])' || a.icao_code || '([^[:alnum:]]|$)')
                  then 0
                  else 1
                end,
                -- 2. a main base before a line station
                case when s.is_base then 0 else 1 end,
                -- 3. stable tie-break
                coalesce(a.iata_code, a.icao_code, ''),
                s.id
              limit 1
           ) as station_id
      from public.organisation_contacts c
      join public.organisations o on o.id = c.organisation_id
     where c.station_id is null
       and o.claimed_at is not null
  ) t
 where c.id = t.contact_id
   and t.station_id is not null;

-- Check afterwards — this should return no rows for any organisation that has
-- at least one station:
--
--   select o.name, count(*)
--     from public.organisation_contacts c
--     join public.organisations o on o.id = c.organisation_id
--    where c.station_id is null
--      and o.claimed_at is not null
--    group by o.name;
--
-- A claimed organisation with no stations at all keeps its station-less rows;
-- there is nowhere to put them, and it has no card on the map either.
