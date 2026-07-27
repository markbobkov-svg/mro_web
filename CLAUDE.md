# ONE4FIVE — project notes

Full-screen dark map for finding **Part-145 approved maintenance organisations
across Europe**. Airlines and operators click an airport (or search) and get
cards with each organisation's approvals per authority, certified scope and
contacts. Data comes from the Supabase DB populated by the `data_scraper` repo.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Supabase** — queried **server-side only** (`src/lib/data.ts` is `server-only`);
  the DB key never reaches the browser
- **MapLibre GL** + Protomaps "black" basemap, tiles self-hosted as PMTiles on
  **Cloudflare R2**; **Leaflet/CARTO raster** fallback when WebGL is missing
- Deployed on **Vercel**, production branch `main` (git auto-deploy — a push to
  `main` deploys to production). Preview deploys sit behind Vercel's SSO login,
  so share the production URL, not previews.

## Basemap / tiles

- `europe-z13.pmtiles` — 13.3 GB, Europe bbox `-32,27 → 46,72`, zoom 0–13,
  extracted from Protomaps' planet build, stored in R2 bucket `mro-basemap`.
- The browser reads byte ranges **straight from R2**; the bucket's CORS policy
  allows `range` and `if-match` from our origins. There is no proxy route.
- Tile URL is overridable with **`NEXT_PUBLIC_PMTILES_URL`** — no code change
  needed to repoint it.
- Map `maxZoom` is capped at **13** to match the extract (no overzoom, always
  crisp) and `maxBounds` is set to `COVERAGE_BBOX`, so the un-extracted rest of
  the world can't be panned/zoomed into.

## Pre-launch TODO

1. **Move tiles off `pub-….r2.dev` to `tiles.one4five.tech`.**
   `r2.dev` is rate-limited by Cloudflare and documented as development-only; a
   custom domain removes the limits and enables full CDN caching of the ranges.
   Steps: move `one4five.tech` DNS to Cloudflare (it is on Namecheap
   nameservers today) → R2 → `mro-basemap` → Settings → Custom Domains →
   connect `tiles.one4five.tech` → set
   `NEXT_PUBLIC_PMTILES_URL=https://tiles.one4five.tech/europe-z13.pmtiles`
   in Vercel. Deliberately deferred: on light traffic `r2.dev` is fine.
2. **Connect `one4five.tech` to the site on Vercel.** The domain is bought but
   not attached. If DNS is on Cloudflare by then, set the Vercel records to
   **DNS only** (grey cloud) so traffic isn't double-proxied; the tiles
   subdomain, by contrast, *should* stay proxied (orange cloud) for the CDN.
3. Refresh the PMTiles extract when the OSM snapshot gets stale.

## Decisions already taken — don't redo

- **Vite/SPA migration was considered and rejected**, based on measurements:
  the bottleneck was the per-tile proxy hop, not Next.js. SSR ships all ~405
  markers inside the HTML; a client-only SPA would add a round trip before
  first paint and would force the Supabase key into the browser. First-load JS
  is ~95 kB and the ~871 kB map chunk is lazy-loaded. If dev-server speed is
  the complaint, use `next dev --turbo` rather than switching bundlers.
- Map libraries come from **npm + dynamic `import()`**, not unpkg script tags.
- The `/api/basemap` proxy was **deleted** once tiles moved to our own R2 with
  CORS. Vercel's edge may still replay cached responses for that path because
  they were sent with `immutable` cache-control — harmless, nothing calls it.
- Basemap decluttering is deliberately minimal: only `roads_shields` and the
  `places_locality` **icon** are dropped. All other detail (roads, buildings,
  labels) stays — an earlier, more aggressive filter was rolled back.

## Data model notes

Tables: `airports`, `authorities`, `organisations`, `organisation_stations`,
`organisation_approvals`, `organisation_scope`, `organisation_station_scope`,
`organisation_contacts`.

- Approvals and scope are grouped **per authority** (EASA first, then foreign
  ones like FAA / UK-CAA / GCAA), then **per class rating**.
- Class labels are scraped free text and vary wildly (`A1`, `Aircraft`,
  `ÕHUSÕIDUKID / AIRCRAFT`); they're merged case-insensitively and sorted by
  canonical EASA order where recognisable.
- `organisation_scope.location_scope` (`line` / `base` / `both`) drives the
  LINE/BASE ✕ columns shown for aircraft classes.
- `source_url` on scope rows is the certificate link shown next to each
  approval reference.

## Gotchas

- maplibre-gl's CSS forces `position: relative` on its container, which cancels
  Tailwind's `absolute inset-0` and collapses the map to zero height. The
  sizing must come from a **wrapper** div — see `VectorBasemap`.
- Headless Chromium does not composite WebGL into screenshots, so the vector
  map renders black in automated captures. DOM/CSS overlays (panel, search,
  brand) do capture fine — verify the map itself in a real browser.
- Supabase RLS: the publishable key only sees tables with public read policies.
