-- ONE4FIVE — repair the last airports the coordinate fill could not reach,
-- and withdraw the seeded rows whose code cannot be trusted.
--
-- Run after airports_seed_*.sql and airports_fix_coords.sql.
-- Apply by hand in the Supabase SQL editor. Safe to re-run.
--
-- ============================================================ 1. coordinates
--
-- Two of the five remaining rows that carry a station are real airfields the
-- dataset knows under no code at all, so they were never seeded and only need
-- placing. The code stored against them stays as it is.
--
--   DGX  MOD St Athan, Wales      -- eCube Maintenance
--   LEAZ Aeródromo de Alcazarén   -- ELIANCE SERVICE & SUPPORT
--
-- St Athan's coordinates come from the dataset row whose ident is EGDX; its
-- icao_code column says EGSY, which is Sheffield, so only the position is
-- taken from it. See section 3.

update public.airports
   set latitude  = 51.405229,
       longitude = -3.433254,
       city      = coalesce(city, 'St Athan, Vale of Glamorgan')
 where iata_code = 'DGX'
   and (latitude is null or longitude is null);

update public.airports
   set latitude  = 41.3727778,
       longitude = -4.6958333,
       city      = coalesce(city, 'Alcazarén')
 where icao_code = 'LEAZ'
   and (latitude is null or longitude is null);

-- ================================================================= 2. merges
--
-- Two rows carry the right name under another airport's code. Filling their
-- coordinates would have moved the organisation to the wrong country, so the
-- station is repointed at the real airport instead and the impostor row is
-- dropped.
--
--   LFEC stored as "Châtellerault Aerodrome" (Safran Aircraft Engines)
--        LFEC is Ouessant; Châtellerault-Targé is LFCA.
--   LOXN stored as "Airfield Osoppo (Udine, Italy)" (AERO 4 M d.o.o.)
--        LOXN is Wiener Neustadt West, Austria; Osoppo is LIKH.
--
-- The repoint is skipped when the organisation already has a station at the
-- target, and the delete is skipped while anything still points at the row —
-- so a half-applied run cannot orphan a station.

update public.organisation_stations st
   set airport_id = tgt.id
  from public.airports tgt, public.airports src
 where tgt.icao_code = 'LFCA'
   and src.icao_code = 'LFEC'
   and st.airport_id = src.id
   and not exists (
     select 1 from public.organisation_stations s2
      where s2.organisation_id = st.organisation_id
        and s2.airport_id = tgt.id
   );

update public.organisation_stations st
   set airport_id = tgt.id
  from public.airports tgt, public.airports src
 where tgt.icao_code = 'LIKH'
   and src.icao_code = 'LOXN'
   and st.airport_id = src.id
   and not exists (
     select 1 from public.organisation_stations s2
      where s2.organisation_id = st.organisation_id
        and s2.airport_id = tgt.id
   );

delete from public.airports a
 where a.icao_code in ('LFEC', 'LOXN')
   and a.latitude is null
   and not exists (
     select 1 from public.organisation_stations st where st.airport_id = a.id
   );

-- ====================================================== 3. untrusted codes
--
-- The seed took each airport's code from the dataset's `icao_code` column. For
-- 39 of the 4 386 rows that column disagrees with the row's `ident`, and
-- neither field is reliably the real ICAO:
--
--   ident EGDX / icao_code EGSY  -- MOD St Athan, Wales. EGSY is Sheffield.
--   ident HSHI / icao_code ESHI  -- Kristianstad hospital heliport, Sweden.
--                                   Here `icao_code` is the correct one.
--
-- So they cannot be corrected in bulk, and a row under the wrong code is worse
-- than a missing one: the type-ahead would offer the wrong airport and a
-- station could be attached to it. They are withdrawn instead — but only where
-- nothing points at them, so anything already in use is left alone and shows
-- up in the check below.

delete from public.airports a
 where a.icao_code in (
   'BI42','DAEO','EBLX','EDGY','EDRE','EFIJ','EGCM','EGDI','EGSY','EHVD',
   'EIBB','EKAB','ENSM','ENUA','ENUK','EPSL','ESEN','ESHI','ETSR','EVJA',
   'EVLI','EYNI','GMMP','HE24','HEAX','LERJ','LJSO','LKCP','LKZL','LODH',
   'LRPW','LSEC','LSEG','LSEY','LSPR','LZKV','OJPH','ORSJ','XUBK'
 )
   and not exists (
     select 1 from public.organisation_stations st where st.airport_id = a.id
   );

-- ==================================================================== check
--
-- `unplaceable` should now be 24: the 20 city names the scraper stored as codes
-- (BARI, OSLO, RIGA, ROMA, ROME, ORLY, LINZ, PULA, REUS, GENF, GENK, GOMA,
-- GRAY, BELP, BRNO, CAEN, CALI, EPGN, LEAZ→placed above, DGX→placed above),
-- less the two placed here, plus FARO, SION, KOS, PAU.
--
--   select count(*) as total,
--          count(*) filter (where latitude is null or longitude is null) as unplaceable
--     from public.airports;
--
-- And nothing should be left that is both unplaceable and in use:
--
--   select a.icao_code, a.iata_code, a.name, count(st.id) as stations
--     from public.airports a
--     join public.organisation_stations st on st.airport_id = a.id
--    where a.latitude is null or a.longitude is null
--    group by 1,2,3 order by stations desc;
--
-- EPGN (Lądowisko Gliniany Las, HeliMax) is expected to survive: it is a Polish
-- landing site the dataset does not carry at all, so its coordinates have to
-- come from somewhere else.

-- ============================================== 4. EPGN, added after the fact
--
-- Lądowisko Gliniany Las — a registered private helicopter landing site in
-- Świętokrzyskie, used by HeliMax Sp. z o.o. OurAirports does not carry it
-- under any code, so the coordinates come from the Polish register listing:
-- N51°01'40.9" E20°24'09.3"  ->  51.0280278, 20.4025833
-- https://lotniska.dlapilota.pl/gliniany-las-h
--
-- A helicopter site for a helicopter operator, which is the sanity check that
-- it is the right place.

update public.airports
   set latitude  = 51.0280278,
       longitude = 20.4025833
 where icao_code = 'EPGN'
   and (latitude is null or longitude is null);
