import Link from "next/link";

/**
 * The front door for signed-out visitors.
 *
 * The map is the product, so it sits behind a sign-in wall: this page is what an
 * unauthenticated request to `/` renders instead (see src/app/page.tsx). It
 * keeps the map's visual language — a dark field of glowing "stations" blurred
 * behind frosted glass — and routes the two audiences to their own sign-up:
 * airlines/operators to the airline registration, Part-145 organisations to the
 * account sign-up that leads into the claim flow.
 *
 * Server component: every action is a link, so there is no client JS and nothing
 * to hydrate. The backdrop is deliberately markerless — no organisation data
 * reaches a signed-out visitor, the whole point of the wall.
 */
export function Landing({
  organisationCount = 0,
}: {
  organisationCount?: number;
}) {
  const count = organisationCount > 0 ? organisationCount : null;

  return (
    <main className="relative h-viewport w-full overflow-y-auto overflow-x-hidden scroll-thin bg-black">
      <Backdrop />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-5 py-16">
        {/* Brand */}
        <div className="text-center">
          <span className="block text-2xl font-normal tracking-brand text-white">
            ONE<span className="text-accent-bright">4</span>FIVE
          </span>
          <span className="mt-2 block text-[10px] font-medium uppercase tracking-brand text-accent-bright/80">
            Part-145 · MRO · Europe
          </span>
        </div>

        {/* Hero */}
        <div className="mt-12 text-center">
          <h1 className="mx-auto max-w-2xl text-balance text-3xl font-light leading-tight tracking-wide2 text-white sm:text-[2.6rem]">
            Europe&rsquo;s Part-145 maintenance network, on one map.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
            Search any airport and see which approved organisations work there —
            their approvals per authority, certified scope, and the desk to call
            when an aircraft is on the ground.
          </p>

          {count ? (
            <p className="mt-6 text-xs uppercase tracking-wide2 text-white/40">
              <span className="text-white/70">{count.toLocaleString("en-GB")}</span>{" "}
              Part-145 organisations · across Europe
            </p>
          ) : null}
        </div>

        {/* The wall: pick an audience, register to open the map */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AudienceCard
            eyebrow="Airlines & operators"
            title="Find who can work your fleet, and where."
            body="Browse the map by airport, compare approvals and scope, and reach the right maintenance desk directly."
            ctaHref="/airline/register"
            ctaLabel="Create an account"
          />
          <AudienceCard
            eyebrow="Part-145 organisations"
            title="Claim your listing and keep it accurate."
            body="Own your card: approvals, per-station certified scope and the contacts operators see — kept current by you."
            ctaHref="/signup"
            ctaLabel="Create an account"
          />
        </div>

        {/* Returning users */}
        <div className="mt-8 text-center">
          <p className="text-sm text-white/45">
            Already have an account?{" "}
            <Link
              href="/login?next=%2F"
              className="text-accent-bright underline-offset-4 transition hover:text-white hover:underline"
            >
              Log in
            </Link>
          </p>
        </div>

        <p className="mx-auto mt-14 max-w-md text-center text-[11px] leading-relaxed text-white/25">
          Data compiled from EASA and national aviation-authority registers.
          Access is free — an account keeps the map and the organisation data it
          holds for the industry it serves.
        </p>
      </div>
    </main>
  );
}

function AudienceCard({
  eyebrow,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  eyebrow: string;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-col rounded-[3px] border border-white/10 bg-[#0d1017]/70 p-6
        backdrop-blur-md transition hover:border-white/20"
    >
      <p className="text-[10px] uppercase tracking-wide2 text-accent-bright/80">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-lg font-normal leading-snug text-white">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-white/45">{body}</p>
      <Link
        href={ctaHref}
        className="mt-5 inline-flex items-center justify-center rounded-[2px] border border-accent/40
          bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent-bright transition
          hover:border-accent hover:bg-accent/20 hover:text-white"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

/**
 * A markerless, map-evoking backdrop: a scatter of soft "station" glows over a
 * dark radial field, blurred so it reads as the map behind frosted glass. Dot
 * positions are fixed (no random at render, so nothing to mismatch on hydrate)
 * and carry no data.
 */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Deep field + centre glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,#12161f_0%,#070809_55%,#000_100%)]" />

      {/* Faint tactical grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* Station glows, blurred behind the glass */}
      <div className="absolute inset-0 blur-[2px]">
        {STATIONS.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-[#dfe8f7]"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.r,
              height: s.r,
              opacity: s.o,
              boxShadow: `0 0 ${s.r * 2}px ${s.r / 2}px rgba(120,165,255,0.55)`,
            }}
          />
        ))}
      </div>

      {/* Scrim for legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/80" />
    </div>
  );
}

/**
 * Fixed "airport" positions (percent of viewport) that lean toward the centre
 * to suggest a European cluster. Purely decorative.
 */
const STATIONS: { x: number; y: number; r: number; o: number }[] = [
  { x: 18, y: 22, r: 4, o: 0.5 },
  { x: 30, y: 30, r: 6, o: 0.7 },
  { x: 41, y: 26, r: 3, o: 0.45 },
  { x: 52, y: 33, r: 7, o: 0.85 },
  { x: 47, y: 44, r: 4, o: 0.6 },
  { x: 58, y: 40, r: 5, o: 0.7 },
  { x: 63, y: 28, r: 3, o: 0.4 },
  { x: 68, y: 46, r: 6, o: 0.75 },
  { x: 72, y: 34, r: 3, o: 0.5 },
  { x: 38, y: 52, r: 5, o: 0.6 },
  { x: 44, y: 62, r: 4, o: 0.5 },
  { x: 55, y: 56, r: 6, o: 0.7 },
  { x: 61, y: 66, r: 3, o: 0.4 },
  { x: 33, y: 42, r: 3, o: 0.45 },
  { x: 26, y: 54, r: 4, o: 0.5 },
  { x: 78, y: 56, r: 4, o: 0.5 },
  { x: 83, y: 40, r: 3, o: 0.4 },
  { x: 50, y: 20, r: 3, o: 0.4 },
  { x: 66, y: 58, r: 3, o: 0.45 },
  { x: 22, y: 68, r: 3, o: 0.4 },
  { x: 74, y: 70, r: 4, o: 0.45 },
  { x: 15, y: 40, r: 3, o: 0.35 },
  { x: 88, y: 62, r: 3, o: 0.35 },
  { x: 48, y: 74, r: 3, o: 0.4 },
  { x: 36, y: 18, r: 3, o: 0.35 },
];
