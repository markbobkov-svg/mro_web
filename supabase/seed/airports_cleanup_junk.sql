-- ONE4FIVE — delete the rows where the scraper stored a city name as a code
--
-- Run after airports_repair.sql. Apply by hand in the Supabase SQL editor.
-- Safe to re-run.
--
-- 21 rows in `airports` carry a city name in the code column. None is an
-- airport: each duplicates a real one the seed added, under a string that is
-- either no code at all or — worse — a genuine code somewhere else.
--
--   stored   really is                          the real airport
--   ------   --------------------------------   ----------------------------
--   BARI     no such code                       Bari            LIBD
--   BELP     no such code                       Bern-Belp       LSZB
--   BRNO     no such code                       Brno-Tuřany     LKTB
--   CAEN     no such code                       Caen-Carpiquet  LFRK
--   CALI     no such code                       Cali            SKCL
--   GENF     no such code (German for Geneva)   Geneva          LSGG
--   GENK     no such code                       Genk-Zwartberg  EBZW
--   GOMA     no such code                       Goma            FZNA
--   GRAY     no such code                       Gray-St-Adrien  LFEV
--   LINZ     no such code                       Linz            LOWL
--   ORLY     no such code                       Paris Orly      LFPO
--   OSLO     no such code                       Oslo Gardermoen ENGM
--   PULA     no such code                       Pula            LDPL
--   REUS     no such code                       Reus            LERS
--   RIGA     no such code                       Riga            EVRA
--   ROMA     no such code                       Rome            LIRF / LIRA
--   ROME     no such code                       Rome            LIRF / LIRA
--   FARO     Rooiberg Airport, SOUTH AFRICA     Faro            LPFR
--   SION     Tibagi Heliport, BRAZIL            Sion            LSGS
--   KOS      Sihanouk Intl, CAMBODIA (iata)     Kos             LGKO / iata KGS
--   PAU      Pauk Airport, MYANMAR (iata)       Pau             LFBP / iata PUF
--
-- The last four are why this is a delete and not a coordinate backfill: their
-- codes resolve to real airports on other continents, so "filling in what is
-- missing" would have moved Faro to South Africa and Kos to Cambodia, then
-- drawn a map pin there.
--
-- Nothing points at any of them — checked, only EPGN ever had a station and it
-- is a real landing site, now placed. The guard below keeps that true: if a
-- station has appeared since, its row survives and the check at the foot finds
-- it. Any other foreign key would make Postgres refuse the delete outright,
-- which is the outcome we want rather than a silent break.

delete from public.airports a
 where a.icao_code in (
   'BARI','BELP','BRNO','CAEN','CALI','FARO','GENF','GENK','GOMA','GRAY',
   'LINZ','ORLY','OSLO','PULA','REUS','RIGA','ROMA','ROME','SION'
 )
   and not exists (
     select 1 from public.organisation_stations st where st.airport_id = a.id
   );

delete from public.airports a
 where a.icao_code is null
   and a.iata_code in ('KOS', 'PAU')
   and not exists (
     select 1 from public.organisation_stations st where st.airport_id = a.id
   );

-- ==================================================================== check
--
--   select count(*) as total,
--          count(*) filter (where latitude is null or longitude is null) as unplaceable
--     from public.airports;
--
-- `unplaceable` should now be 0, and every airport in the register is a real
-- one that can be placed on the map and offered in the Stations type-ahead.
--
-- Anything left behind by the guard — i.e. junk that has since acquired a
-- station — shows up here and needs the station repointing at the real airport
-- first:
--
--   select a.icao_code, a.iata_code, a.name, count(st.id) as stations
--     from public.airports a
--     join public.organisation_stations st on st.airport_id = a.id
--    where a.latitude is null or a.longitude is null
--    group by 1,2,3;
--
-- ================================================================ and again
--
-- THIS WILL COME BACK. These rows are made by `data_scraper`, which writes a
-- city name into the code column when it cannot find a real one. Until that is
-- fixed in that repo, every run recreates them and this file has to be run
-- again. The lasting fix is there, not here.
