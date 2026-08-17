# ONE4FIVE — project notes

Full-screen dark map for finding **Part-145 approved maintenance organisations
across Europe**. Airlines and operators click an airport (or search) and get
cards with each organisation's approvals per authority, certified scope and
contacts. Data comes from the Supabase DB populated by the `data_scraper` repo.

**Access — the sign-in wall.** The map is the product, so it sits behind
registration: an unauthenticated request to `/` renders the landing
(`src/components/Landing.tsx`) instead of the map, routing the two audiences to
their own sign-up — airlines/operators to `/airline/register`, Part-145
organisations to `/signup` (which leads into the claim flow). The map's own data
endpoints enforce the same wall via `hasValidSession` (`/api/search`,
`/api/airports/[id]` → 401 when signed out, and `private`-cached so a shared CDN
can't serve them on), while the airline type-ahead (`/api/airline/search`) stays
public because registration needs it. The landing's backdrop is the blurred
basemap with the airport dot *positions* (coordinates only — no names, counts or
organisation details, rendered as a GL circle layer); the full markers and every
per-organisation detail stay behind the wall. So the "SSR ships all markers" note
below applies only to signed-in requests.

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
- **Attribution.** The basemap is OpenStreetMap data (ODbL) rendered via
  Protomaps, so OSM attribution is **required** and shown: a compact "ⓘ" bottom
  -right on the vector map (expands to *Protomaps © OpenStreetMap*) and a small
  credit on the raster fallback. It can be styled and made unobtrusive, but not
  removed — the map is our *product*, the underlying data is not our *property*.
- **Fonts, sprites and the raster fallback are all env-overridable**
  (`NEXT_PUBLIC_GLYPHS_URL`, `NEXT_PUBLIC_SPRITE_URL`,
  `NEXT_PUBLIC_RASTER_TILES_URL`, `NEXT_PUBLIC_RASTER_ATTRIB`). Defaults keep the
  current Protomaps-GitHub / CARTO sources so nothing breaks; see the pre-launch
  TODO for why to move them before going commercial.

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
6. **Mirror fonts + sprites to R2, and settle the raster fallback — before
   going commercial.** Fonts/sprites currently load from `protomaps.github.io`
   (Protomaps' GitHub Pages): free, but a third-party host with no SLA and
   possible rate limits. Copy `basemaps-assets/fonts/**` and
   `basemaps-assets/sprites/v4/light.*` into the R2 bucket and set
   `NEXT_PUBLIC_GLYPHS_URL` / `NEXT_PUBLIC_SPRITE_URL`. The raster fallback uses
   CARTO's public CDN, whose free basemaps have usage limits a commercial
   product can exceed — either self-host raster tiles, drop the fallback
   (vector-only; it only serves ancient no-WebGL browsers), or take a CARTO
   plan, via `NEXT_PUBLIC_RASTER_TILES_URL`. None of this is a licence fee — the
   OSM/Protomaps/MapLibre stack is free for commercial use — it is about not
   depending on someone else's host in production.
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
Migrations: `supabase/migrations/0001_org_dashboard.sql` (accounts, claims,
moderation, the profile/contacts override layer) and
`supabase/migrations/0002_managed_station_scope.sql` (the per-station scope
override layer). Both are applied by hand in the Supabase SQL editor.

- **Accounts** are Supabase Auth, e-mail + password, confirmation required.
  All auth goes through Server Actions (`src/lib/authApi.ts`); the tokens live
  in **httpOnly cookies**, so — as with the DB key — nothing reaches browser JS.
- **Claiming.** A confirmed address on the organisation's own domain (its
  website, or a domain already in its scraped contacts) is approved on the
  spot; anything else queues for manual review. Free-mail domains never
  auto-approve. Organisations *not yet in the DB* are always reviewed by hand,
  and the organisation row is created on approval.
- **What an organisation may edit directly:** profile (tagline, description,
  logo, website/e-mail/phone/address overrides, AOG desk), contacts, and the
  **per-station certified scope** shown on its card (the Scope tab). These
  publish immediately.
- **What goes through moderation:** approvals and stations — regulatory facts
  from the authorities' registers. Organisations file change requests; an admin
  applies them from `/admin`. (Per-station scope used to be here too, but an
  organisation knows what it works at each station better than a reviewer does,
  so it moved to instant-publish via its own override table — see below.)
- **Admin** is the `app_users.is_admin` flag; there is no separate role table.

### The rule that keeps scraper and dashboard from fighting

The scraper owns `organisations`, `organisation_approvals`, `organisation_scope`,
`organisation_station_scope` and re-writes them on every run. **Nothing an
organisation types is ever stored in those tables.** Edits live in
`organisation_profiles`, `organisation_managed_contacts` and
`organisation_managed_station_scope`, and are merged *over* the scraped rows at
read time in `getAirportDetail`, so a re-scrape cannot wipe them. Precedence is
organisation → station → scraped organisation row; an organisation that adds
any managed contact replaces the scraped contact list outright.

The per-station scope override follows the same "once you touch it, you own it"
rule, per station: for any airport an organisation maintains, its managed lines
replace the scraped `organisation_station_scope` for that station on the card.
It keys on `(organisation_id, airport_id)`, **not** `station_id`, so it survives
the scraper regenerating station rows — the id it can churn is never the id we
key our own rows off. Authority is stored as the code the organisation types
(`EASA`, `FAA`) and matched to `authorities.code` at read time.

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

## Airline accounts (`/airline`)

Airlines and operators — the people the map is *for* — get a light account of
their own. Migration `supabase/migrations/0003_airline_dashboard.sql`
(`airline_members`, `airline_registrations`), applied by hand like the others.
It reuses 0001's `claim_status` enum, `touch_updated_at()` and `is_admin()`, and
the same auth stack (`authApi.ts`, httpOnly-cookie sessions).

- **Deliberately thinner than the organisation side.** Airlines don't appear on
  the public map, so there is *no listing to claim*, no profile/override layer
  and no change-request moderation — hence a **simple** dashboard: the airline's
  own register details (read-only), the account holder's contact details
  (editable, `app_users`), and a link to the map. The `airlines` table stays
  scraper-owned; nothing a user types is written to it (except an admin creating
  a brand-new airline on approval — the one exception, same as `organisations`).
- **Registration is the whole flow — no separate claim step.** `/airline/register`
  (public) takes a work e-mail, a password and the airline (type-ahead over
  `airlines`, or a name to propose if it's not listed). A confirmation mail is
  always sent; the account can't sign in until it's clicked (`mailer_autoconfirm`
  is off) — that confirmation is what makes the domain check mean anything.
- **The rule.** When the confirmed e-mail's domain is the **exact** website
  domain of the selected airline (`exactDomainMatchesWebsite` — exact, not the
  subdomain-tolerant `domainsMatch` the org claim uses), the registration is
  auto-approved; anything else (different domain, free mailbox, no website on
  file, not-yet-listed airline) queues for an admin in `/admin`.
- **Confirmation-gated membership.** Registration happens *before* the e-mail is
  confirmed, so an auto-approved sign-up can't be granted its `airline_members`
  row on the spot. `activateAirlineMemberships` (called on the dashboard) closes
  the gap once the account is confirmed; it's idempotent and never grants
  anything for an unconfirmed account. Admin approval grants membership directly.
- Same **service_role security model** as the org dashboard: `requireAirlineMember`
  / `requireAdmin` in `guards.ts` are the boundary, RLS the second line. The
  airline reads soft-fail (empty) when 0003 hasn't been applied yet, so login
  routing and `/admin` keep working — the same tolerance `data.ts` shows.
- **Shares pre-launch TODO #4 (custom SMTP).** Until it's done, airline
  confirmation mail only reaches the project team's own addresses, so the same
  "don't advertise it yet" caveat applies.

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
