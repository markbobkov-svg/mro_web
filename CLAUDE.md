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
4. **Custom SMTP — this gates opening the dashboard to organisations.**
   Supabase's built-in mailer is rate-limited to a handful of messages an hour
   and on new projects only delivers to the project team's own addresses. So a
   real organisation never receives its confirmation link, and an unconfirmed
   address makes the whole claim flow meaningless: the domain check only proves
   something because confirming the address proves it is yours. Anyone could
   otherwise type `someone@lufthansa-technik.com` at sign-up and be auto-approved.
   Until this is done, the dashboard works for admins and for hand-confirmed
   accounts (`email_confirm: true` via the admin API) but **must not be
   advertised to organisations**.
   Fix: Authentication → Emails → set up Resend / Postmark / SES, then remove
   this item.
5. **Set `NEXT_PUBLIC_SITE_URL` in Vercel.** Without it the confirmation and
   password-reset links fall back to `VERCEL_URL`, the per-deployment hostname
   — the links work but look wrong, and preview hostnames sit behind Vercel SSO.
   Depends on item 2 (domain attached).

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

## Organisation dashboard (`/dashboard`, `/admin`)

Part-145 organisations claim their listing and maintain it themselves.
Migration: `supabase/migrations/0001_org_dashboard.sql`.

- **Accounts** are Supabase Auth, e-mail + password, confirmation required.
  All auth goes through Server Actions (`src/lib/authApi.ts`); the tokens live
  in **httpOnly cookies**, so — as with the DB key — nothing reaches browser JS.
- **Claiming.** A confirmed address on the organisation's own domain (its
  website, or a domain already in its scraped contacts) is approved on the
  spot; anything else queues for manual review. Free-mail domains never
  auto-approve. Organisations *not yet in the DB* are always reviewed by hand,
  and the organisation row is created on approval.
- **What an organisation may edit directly:** profile (tagline, description,
  logo, website/e-mail/phone/address overrides, AOG desk) and contacts. These
  publish immediately.
- **What goes through moderation:** approvals, scope and stations — regulatory
  facts from the authorities' registers. Organisations file change requests;
  an admin applies them from `/admin`.
- **Admin** is the `app_users.is_admin` flag; there is no separate role table.

### The rule that keeps scraper and dashboard from fighting

The scraper owns `organisations`, `organisation_approvals`, `organisation_scope`
and re-writes them on every run. **Nothing an organisation types is ever stored
in those tables.** Edits live in `organisation_profiles` and
`organisation_managed_contacts` and are merged *over* the scraped rows at read
time in `getAirportDetail`, so a re-scrape cannot wipe them. Precedence is
organisation → station → scraped organisation row; an organisation that adds
any managed contact replaces the scraped contact list outright.

The one place this does not hold is an **admin-approved change request**, which
writes to the scraped tables by design — so a later scrape can revert it. If
that starts to bite, teach `data_scraper` to leave rows it did not produce
alone.

### Security boundary — read before touching the dashboard

`SUPABASE_KEY` is a **service_role** key, so the DB returns any row it is asked
for: **RLS is not what protects one organisation from another.** The guards in
`src/lib/guards.ts` are. Any path that reads or writes rows for an organisation
id taken from the request must go through `requireMember` / `requireAdmin`
first. The migration still enables RLS with restrictive policies as a second
line of defence, so the database is safe if the key is ever swapped for an anon
key or a browser-side client appears.

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
- The certificate link next to each approval reference comes **only** from
  `organisation_approvals.source_url` — the authority's own register entry or
  certificate document. There is no fallback: a scope row's `source_url` is
  often just the organisation's website, so it is never used for the cert link,
  and an approval with no `source_url` shows no certificate icon at all.

## Gotchas

- maplibre-gl's CSS forces `position: relative` on its container, which cancels
  Tailwind's `absolute inset-0` and collapses the map to zero height. The
  sizing must come from a **wrapper** div — see `VectorBasemap`.
- Headless Chromium does not composite WebGL into screenshots, so the vector
  map renders black in automated captures. DOM/CSS overlays (panel, search,
  brand) do capture fine — verify the map itself in a real browser.
- Supabase RLS: the publishable key only sees tables with public read policies.
