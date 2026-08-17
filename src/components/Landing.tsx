import MapBackdrop from "./MapBackdrop";
import LandingContent from "./LandingContent";

/**
 * The front door for signed-out visitors.
 *
 * The map is the product, so it sits behind a sign-in wall: this page is what an
 * unauthenticated request to `/` renders instead (see src/app/page.tsx). The
 * backdrop is our own map, blurred behind frosted glass (MapBackdrop), over a
 * static field that shows while it loads or if WebGL is missing.
 *
 * The backdrop shows the airport dot *positions* (coordinates only — no names,
 * counts or per-organisation details) and is non-interactive, so the wall still
 * holds: the data an operator signs in for stays server-side. The content column
 * (brand, sign-in, register) is `LandingContent`, a client component so the
 * surrounding text can collapse when a registration form opens.
 */
export function Landing({
  organisationCount = 0,
  dots = [],
}: {
  organisationCount?: number;
  /** Airport dot coordinates for the blurred backdrop (positions only). */
  dots?: [number, number][];
}) {
  return (
    <main className="relative h-viewport w-full overflow-y-auto overflow-x-hidden scroll-thin bg-black">
      <BaseField />
      <MapBackdrop dots={dots} />
      <Scrim />
      <LandingContent organisationCount={organisationCount} />
    </main>
  );
}

/**
 * The static field shown under the map backdrop: a dark radial gradient, a faint
 * grid, and a scatter of soft "station" glows. The real map (MapBackdrop) paints
 * over this once it loads and covers it; until then — and if WebGL is missing —
 * this is what shows. Dot positions are fixed (no random at render, nothing to
 * mismatch on hydrate) and carry no data.
 */
function BaseField() {
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

      {/* Station glows */}
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
    </div>
  );
}

/**
 * Darkens the (real, detailed) map enough for the white gate text to read, while
 * keeping the map clearly visible. A centre vignette plus a top-to-bottom fade.
 */
function Scrim() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_44%,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.40)_60%,rgba(0,0,0,0.66)_100%)]"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/45" />
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
