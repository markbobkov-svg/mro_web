import MapView from "@/components/MapView";
import SetupNotice from "@/components/SetupNotice";
import { Landing } from "@/components/Landing";
import { hasSupabaseCredentials } from "@/lib/supabase";
import { getAirportMarkers, getPublicStats } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { getViewerOrgScope } from "@/lib/guards";
import type { AirportMarker } from "@/lib/types";

// Always render fresh from the DB (data changes as the scraper runs), and it
// branches on the signed-in user, so it can never be statically cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!hasSupabaseCredentials()) {
    return <SetupNotice />;
  }

  // The map is the product; it sits behind a sign-in wall. A signed-out visitor
  // gets the landing page instead. It carries airport dot *positions* for the
  // blurred backdrop and the headline count — coordinates only, no names,
  // counts or per-organisation details, and the backdrop map is non-interactive.
  const user = await getCurrentUser();
  if (!user) {
    // Dots are the airport positions; the count is the *whole* register (1,600+),
    // not just the ~700 orgs with a mapped station — see getPublicStats.
    let dots: [number, number][] = [];
    let organisationCount = 0;
    try {
      const [markerData, stats] = await Promise.all([
        getAirportMarkers(),
        getPublicStats(),
      ]);
      dots = markerData.markers.map((m) => m.coordinates);
      organisationCount = stats.organisationCount;
    } catch {
      // Dots and the count are nice-to-have; never block the front door.
    }
    return <Landing organisationCount={organisationCount} dots={dots} />;
  }

  // A signed-in MRO sees only its own network: the airports where it has a
  // station, and only its own card there. Everyone else (admins, airlines,
  // brand-new sign-ups) gets the whole map — see getViewerOrgScope.
  const orgScope = await getViewerOrgScope(user);

  let markers: AirportMarker[] = [];
  let organisationCount = 0;
  let error: string | null = null;
  try {
    const data = await getAirportMarkers(orgScope);
    markers = data.markers;
    organisationCount = data.organisationCount;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load airports";
  }

  return (
    <MapView
      markers={markers}
      organisationCount={organisationCount}
      loadError={error}
      // A scoped MRO lands framed on its own stations; the full map keeps its
      // deliberate whole-Europe view.
      fitToMarkers={orgScope !== null && markers.length > 0}
    />
  );
}
