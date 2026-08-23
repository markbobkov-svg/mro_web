/**
 * Shared dark scroll container for every /airline screen.
 *
 * Kept deliberately chrome-less: the public register / confirm pages render a
 * centred card (like the sign-in screens), while the dashboard renders its own
 * header. globals.css sets `overflow: hidden` on the body for the map, so these
 * pages scroll inside their own container.
 *
 * The scroll layer sits inside a non-scrolling box so the top/bottom fades can
 * pin to the viewport and never slide with the content — the same split the org
 * dashboard and the landing use for their scrims. The fades (.dash-scrim) show
 * only when the dashboard is embedded in the map's drawer, where its own header
 * is hidden, so they fall flush at the edges; on the standalone dashboard and
 * the public card screens they stay hidden.
 */
export default function AirlineSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-viewport overflow-hidden bg-black">
      <div className="absolute inset-0 overflow-y-auto scroll-thin">{children}</div>

      {/* Top/bottom dark fades over the scrolling content, like the landing's
          scrims. Shown only inside the map's dashboard drawer (.dash-scrim →
          html.embedded). pointer-events-none so they never block the UI. */}
      <div
        aria-hidden
        className="dash-scrim pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-black to-transparent"
      />
      <div
        aria-hidden
        className="dash-scrim pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-black to-transparent"
      />
    </div>
  );
}
