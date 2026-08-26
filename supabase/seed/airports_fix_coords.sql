-- ONE4FIVE — fill the coordinates the scraper never captured
--
-- 79 airports carried no latitude/longitude, so getAirportMarkers skipped them
-- (`if (!coordinates) continue`) and any station there was invisible on the
-- map. 58 stations point at rows in that set.
--
-- Source: OurAirports, matched on the code already stored. Only rows that are
-- still missing a coordinate are touched, so nothing already correct is
-- overwritten and re-running changes nothing.
--
-- DELIBERATELY EXCLUDED — the stored code belongs to a different airport, and
-- filling it would place the row in the wrong country:
--   FARO -> Rooiberg Airport, South Africa   (Faro, Portugal is LPFR)
--   SION -> Tibagi Heliport, Brazil          (Sion, Switzerland is LSGS)
--   KOS  -> Sihanouk Intl, Cambodia          (Kos, Greece is IATA KGS)
--   PAU  -> Pauk Airport, Myanmar            (Pau, France is IATA PUF)
-- and two where the code is real but our name is another place entirely:
--   LFEC  stored as "Chatellerault" -- LFEC is Ouessant (Chatellerault is LFCA)
--   LOXN  stored as "Osoppo, Udine" -- LOXN is Wiener Neustadt West, Austria
-- Those six need a human decision, not a coordinate.
--
-- Apply by hand in the Supabase SQL editor. Safe to re-run.

update public.airports a
   set latitude  = v.lat,
       longitude = v.lon,
       city      = coalesce(a.city, v.city)
  from (values
    ('EDTG', 47.903186, 7.617416, 'Eschbach'),
    ('EDTN', 48.612778, 9.477222, 'Kirchheim unter Teck'),
    ('EDWQ', 53.03611, 8.505556, 'Ganderkesee'),
    ('EFLA', 61.144199, 25.693501, 'Lahti'),
    ('EFNU', 60.3339, 24.2964, 'Vihti / Nummela'),
    ('EGLD', 51.588299, -0.513056, 'Uxbridge, Greater London'),
    ('EGSC', 52.205002, 0.175, 'Cambridge, Cambridgeshire'),
    ('EHMZ', 51.512199, 3.73111, 'Middelburg'),
    ('ENBL', 61.391102, 5.75694, 'Førde'),
    ('ENEG', 60.214672, 10.318737, 'Hønefoss'),
    ('ENKJ', 59.969089, 11.040482, 'Kjeller'),
    ('ENRK', 59.397499, 11.3469, 'Rakkestad'),
    ('EPKK', 50.077702, 19.7848, 'Balice'),
    ('EPSC', 53.584702, 14.9022, 'Szczecin(Glewice)'),
    ('EPZP', 51.978901, 15.4639, 'Zielona Góra'),
    ('ESCF', 58.397666, 15.522422, 'Linköping'),
    ('ESGP', 57.7747, 11.8704, 'Göteborg'),
    ('ESKM', 60.957901, 14.5114, 'Mora'),
    ('ESNG', 67.13240051269531, 20.814599990844727, 'Gällivare'),
    ('ESNL', 64.548302, 18.7162, 'Lycksele'),
    ('ESOK', 59.444698, 13.3374, 'Karlstad'),
    ('KBUR', 34.202834, -118.35805, 'Burbank'),
    ('KP08', 32.935902, -111.427002, 'Coolidge'),
    ('KTUL', 36.197084, -95.886225, 'Tulsa'),
    ('LDOS', 45.462355, 18.811278, 'Osijek(Klisa)'),
    ('LDVA', 46.294668, 16.383222, 'Varaždin'),
    ('LDVC', 46.391899, 16.500299, 'Čakovec'),
    ('LFBP', 43.380001, -0.418611, 'Pau/Pyrénées (Uzein)'),
    ('LFCS', 44.700298, -0.595556, 'Bordeaux-Saucats'),
    ('LFMT', 43.576199, 3.96301, 'Montpellier/Méditerranée'),
    ('LHKK', 47.174484, 19.077501, 'Kiskunlacháza'),
    ('LHSA', 47.0779, 17.968399, 'Szentkirályszabadja'),
    ('LIKE', 45.611944, 12.814722, 'Caorle (VE)'),
    ('LJPZ', 45.47201, 13.615951, 'Sečovlje'),
    ('LJSK', 46.31033, 15.492024, 'Loče'),
    ('LKOL', 49.587712, 17.209275, 'Olomouc'),
    ('LOGI', 47.493364, 14.49558, 'Trieben'),
    ('LPCO', 40.158758, -8.470815, 'Coimbra'),
    ('LPVZ', 40.725498, -7.88899, 'Viseu'),
    ('LSER', 46.301595, 7.832923, 'Raron'),
    ('LSEZ', 46.02932, 7.753366, 'Zermatt'),
    ('LSZA', 46.004299, 8.91058, 'Agno'),
    ('LSZC', 46.974444, 8.396944, 'Buochs'),
    ('LSZL', 46.162535, 8.878908, 'Locarno'),
    ('LSZW', 46.756401, 7.60056, 'Thun'),
    ('LZTT', 49.070994, 20.241394, 'Poprad'),
    ('NTAA', -17.553472, -149.606936, 'Papeete'),
    ('RJAA', 35.76858, 140.388714, 'Narita'),
    ('RPLL', 14.5086, 121.019997, 'Manila (Pasay)'),
    ('TJBQ', 18.4949, -67.129402, 'Aguadilla'),
    ('ZGSZ', 22.639474, 113.803262, 'Shenzhen')
  ) as v (icao_code, lat, lon, city)
 where a.icao_code = v.icao_code
   and (a.latitude is null or a.longitude is null);

-- rows stored with an IATA code and no ICAO
update public.airports a
   set latitude  = v.lat,
       longitude = v.lon,
       city      = coalesce(a.city, v.city)
  from (values
    ('GDN', 54.377602, 18.4662, 'Gdańsk'),
    ('HRE', -17.931801, 31.0928, 'Harare')
  ) as v (iata_code, lat, lon, city)
 where a.iata_code = v.iata_code
   and a.icao_code is null
   and (a.latitude is null or a.longitude is null);
