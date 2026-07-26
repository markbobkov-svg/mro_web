# MRO Finder

A full-screen, dark, SpaceX-styled map for airlines and aircraft operators to
find **Part-145** approved maintenance organisations across European airports.

Airports that have an MRO presence are shown as glowing pins. Click a pin (or
use the search box) and cards slide in over the map listing every organisation
with a station there — its Part-145 certificate, EASA class ratings, the
aircraft types it covers at that airport, and contact details.

Data comes from the Supabase database populated by the
[`data_scraper`](https://github.com/markbobkov-svg/data_scraper) project.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **MapLibre GL JS** with the free CARTO *dark-matter* vector basemap (no token)
- **Tailwind CSS** for the dark UI
- **@supabase/supabase-js** — queried **server-side only**, so the database key
  never reaches the browser

## How it works

```
airports ──< stations >── organisations ──< organisation_approvals (Part-145)
                 │
                 └──< station_aircraft_types >── aircraft_types
```

- `getAirportMarkers()` aggregates every airport that has ≥1 station, resolves
  its coordinates, and counts distinct organisations → map pins.
- `GET /api/airports/[id]` returns the organisations at one airport with their
  approvals and per-station aircraft types → the cards.

Airport coordinates come from the `airports` table when present, and fall back
to a bundled [OurAirports](https://ourairports.com/) lookup
(`data/airport-coords.json`, regenerate with `npm run coords`) keyed by ICAO /
IATA, so a pin can always be placed.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable       | Description                                                        |
| -------------- | ----------------------------------------------------------------- |
| `SUPABASE_URL` | Supabase project URL, e.g. `https://xxxx.supabase.co`             |
| `SUPABASE_KEY` | anon/publishable key **or** service_role key (server-side, reads) |

Both are read only on the server. If they are missing, the site renders a
friendly setup notice instead of crashing.

## Deploy to Vercel

1. Import this repository as a new Vercel project (framework auto-detects as
   Next.js — no extra config).
2. Add the two environment variables above in **Settings → Environment
   Variables**.
3. Deploy. Every push to the branch redeploys automatically.

## Notes

- The map basemap is CARTO's free *dark-matter* style; attribution (OpenStreetMap
  + CARTO) is shown on the map.
- If the basemap is slow or blocked, pins still render over a plain dark map, so
  the tool stays usable.
