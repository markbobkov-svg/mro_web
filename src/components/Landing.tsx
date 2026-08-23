import MapBackdrop from "./MapBackdrop";
import LandingContent from "./LandingContent";

/**
 * The front door for signed-out visitors.
 *
 * The map is the product, so it sits behind a sign-in wall: this page is what an
 * unauthenticated request to `/` renders instead (see src/app/page.tsx). The
 * backdrop is our own map, blurred behind frosted glass (MapBackdrop), over the
 * black `<main>` that shows while it loads or if WebGL is missing.
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
    <main className="relative h-viewport w-full overflow-hidden bg-black">
      {/* Backdrop + darkening are pinned to the viewport (the <main> no longer
          scrolls); only the content column below scrolls over them, so the
          blurred map and its scrim never slide away as the page is scrolled.
          Until the map paints — and if WebGL is missing — the plain black
          `<main>` shows through on its own. */}
      <MapBackdrop dots={dots} />
      <Scrim />
      {/* The scrolling layer. overscroll-y-none stops the rubber-band bounce
          when pulling down at the very top of the page. */}
      <div className="scroll-thin absolute inset-0 z-10 overflow-y-auto overflow-x-hidden overscroll-y-none">
        <LandingContent organisationCount={organisationCount} />
      </div>
    </main>
  );
}

/**
 * Darkens the (real, detailed) map enough for the white gate text to read, while
 * keeping the map clearly visible. A centre vignette for the sign-in in the
 * middle, plus the same top-and-bottom gradient fades the map itself wears (see
 * the scrims in MapView) so the landing sits on the same footing as the map.
 */
function Scrim() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Centre vignette — keeps the signed-out text legible over the map. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_44%,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.40)_60%,rgba(0,0,0,0.66)_100%)]" />
      {/* Top fade — same gradient as the map's top scrim. */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 to-transparent sm:h-40" />
      {/* Bottom fade — same gradient as the map's bottom scrim. */}
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/85 to-transparent" />
    </div>
  );
}
