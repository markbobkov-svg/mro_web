# Airports seed

Fills `public.airports` so an organisation adding a station can find its airport
even when the scraper never met it. The Stations tab only lets you pick a row
that exists (`/api/dashboard/airport-search` → `saveStationAction` re-reads the
posted id), so an airport missing from this table is an airport nobody can add.

**Source:** [OurAirports](https://ourairports.com/data/), public domain.
**Scope:** the map's coverage bbox — longitude −32…46, latitude 27…72 — minus
closed airfields and balloonports, keeping anything with an ICAO or IATA code.
**4 386 rows**: 2 304 small, 905 heliports, 820 medium, 345 large, 12 seaplane.

## Running it

Six files, `airports_seed_01.sql` … `_06.sql`, in the Supabase SQL editor. Order
does not matter and each is independent — they are split only to keep a single
paste manageable.

Every row is guarded:

```sql
where not exists (
  select 1 from public.airports a
   where (v.icao_code is not null and a.icao_code = v.icao_code)
      or (v.iata_code is not null and a.iata_code = v.iata_code)
)
```

so an airport the scraper already put there is never duplicated, and re-running
a file inserts nothing. That matters more than it looks: a duplicate Frankfurt
would show twice in the type-ahead while existing stations still pointed at the
original row.

The batch itself is collision-free — every ICAO and every IATA in it is unique —
so the guard only ever has to compare against what is already in the table.

### Columns it writes

`icao_code`, `iata_code`, `name`, `city`, `country_code`, `latitude`,
`longitude`. Nothing else, so `id` and any timestamps must come from column
defaults. If the table has another NOT NULL column without one, the insert says
so and nothing is written.

### Afterwards

```sql
select count(*) as total,
       count(*) filter (where icao_code is not null) as with_icao,
       count(*) filter (where iata_code is not null) as with_iata,
       count(*) filter (where latitude is null or longitude is null) as unplaceable
  from public.airports;
```

`unplaceable` should not grow: every row here carries coordinates, which is what
lets an airport become a map pin at all (`resolveCoordinates` in `data.ts`).

## Regenerating

```sh
curl -sSLO https://davidmegginson.github.io/ourairports-data/airports.csv
mv airports.csv airports_raw.csv
python3 generate_airports_seed.py
```

Edit the bbox or `SKIP_TYPES` at the top of the script to change the scope —
worldwide with a code is ~45 000 rows, without heliports ~33 000.

## `airports_fix_coords.sql`

Run after the seed. 79 rows in the register carried no latitude/longitude, so
`getAirportMarkers` skipped them (`if (!coordinates) continue`) and a station
there was invisible on the map — 58 stations pointed into that set.

It fills 53 of them from OurAirports, matched on the code already stored,
touching only rows still missing a coordinate.

**Six are excluded on purpose.** The scraper stored some city names in the code
column, and those strings are real codes elsewhere:

| stored | the code actually means | should be |
|---|---|---|
| `FARO` | Rooiberg Airport, South Africa | Faro is `LPFR` |
| `SION` | Tibagi Heliport, Brazil | Sion is `LSGS` |
| `KOS`  | Sihanouk Intl, Cambodia | Kos is IATA `KGS` |
| `PAU`  | Pauk Airport, Myanmar | Pau is IATA `PUF` |
| `LFEC` | Ouessant Airport | stored as "Châtellerault", which is `LFCA` |
| `LOXN` | Wiener Neustadt West, Austria | stored as "Osoppo, Udine, Italy" |

Filling those would put the airport in the wrong country and then draw a pin
there. They need a decision, not a coordinate.

A further 20 rows are city names that match no airport code at all — `BARI`,
`OSLO`, `RIGA`, `ROMA`, `ROME`, `ORLY`, `LINZ`, `PULA`, `REUS`, `GENF`, `GENK`,
`GOMA`, `GRAY`, `BELP`, `BRNO`, `CAEN`, `CALI`, `EPGN`, `LEAZ`, `DGX`. Most now
duplicate a real airport the seed added (`OSLO` beside `ENGM`, `RIGA` beside
`EVRA`), so the fix is to repoint their stations at the real row and delete
them — a merge, not a backfill.

## `airports_repair.sql`

Run last. Three things the earlier files could not do:

1. **Places `DGX` (MOD St Athan) and `LEAZ` (Alcazarén)** — real airfields the
   dataset carries under no code, so the seed never had them and only the
   coordinates were missing.
2. **Merges `LFEC` and `LOXN`.** Both stored the right name under another
   airport's code — `LFEC` is Ouessant but holds Safran's Châtellerault site
   (`LFCA`), `LOXN` is Wiener Neustadt West but holds AERO 4 M's Osoppo
   (`LIKH`). The station is repointed and the impostor row deleted, guarded so
   a half-applied run cannot orphan a station.
3. **Withdraws 39 seeded rows whose code cannot be trusted** — see below.

### The `icao_code` / `ident` problem

The generator reads the dataset's `icao_code`. For 39 of 4 386 European rows
that column disagrees with the row's own `ident`, and neither is reliably
correct:

| row | `ident` | `icao_code` | which is right |
|---|---|---|---|
| MOD St Athan, Wales | `EGDX` | `EGSY` | `ident` — `EGSY` is Sheffield |
| Kristianstad hospital heliport | `HSHI` | `ESHI` | `icao_code` — `HSHI` is a Sudan prefix |

They cannot be corrected in bulk, and a row under the wrong code is worse than
a missing one: the type-ahead offers the wrong airport and a station can be
attached to it. So they are deleted, and only where nothing points at them —
anything already in use survives and shows up in the check at the foot of the
file.

`EPGN` (Lądowisko Gliniany Las, used by HeliMax) is expected to remain
unplaceable: the dataset does not carry it under any code, so its coordinates
have to come from somewhere else.

## `airports_cleanup_junk.sql`

Run last of all. Deletes the 21 rows where the scraper stored a city name in the
code column — `OSLO`, `RIGA`, `ROMA`, `ORLY`, `FARO`, `KOS`… Each duplicates a
real airport the seed added, and four of them (`FARO`, `SION`, `KOS`, `PAU`)
carry strings that are genuine codes on other continents, which is why they were
deleted rather than backfilled.

Guarded: a row with a station survives, and any other foreign key makes Postgres
refuse rather than break something silently. Afterwards `unplaceable` should be
0 — every airport in the register real, placeable and offerable in the Stations
type-ahead.

**It will come back.** `data_scraper` creates these rows; until that is fixed in
that repo, every run recreates them. Same root cause as the wrong
`country_code`s (`ESCF` marked DE though Malmen is Swedish, `RJAA` marked FR
though Narita is Japanese).
