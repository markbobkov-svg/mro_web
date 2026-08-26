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
