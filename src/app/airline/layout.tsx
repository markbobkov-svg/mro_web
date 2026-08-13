/**
 * Shared dark scroll container for every /airline screen.
 *
 * Kept deliberately chrome-less: the public register / confirm pages render a
 * centred card (like the sign-in screens), while the dashboard renders its own
 * header. globals.css sets `overflow: hidden` on the body for the map, so these
 * pages scroll inside their own container.
 */
export default function AirlineSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-viewport overflow-y-auto scroll-thin bg-black">{children}</div>
  );
}
