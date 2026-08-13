import MapView from "@/components/MapView";
import SetupNotice from "@/components/SetupNotice";
import { Landing } from "@/components/Landing";
import { hasSupabaseCredentials } from "@/lib/supabase";
import { getAirportMarkers, getPublicStats } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import type { AirportMarker } from "@/lib/types";

// Always render fresh from the DB (data changes as the scraper runs), and it
// branches on the signed-in user, so it can never be statically cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!hasSupabaseCredentials()) {
    return <SetupNotice />;
  }

  // The map is the product; it sits behind a sign-in wall. A signed-out visitor
  // gets the landing page instead — and none of the ~405 markers, which would
  // otherwise ship inside the HTML.
  const user = await getCurrentUser();
  if (!user) {
    let organisationCount = 0;
    try {
      organisationCount = (await getPublicStats()).organisationCount;
    } catch {
      // A stat is nice-to-have; never let it keep the front door from opening.
    }
    return <Landing organisationCount={organisationCount} />;
  }

  let markers: AirportMarker[] = [];
  let organisationCount = 0;
  let error: string | null = null;
  try {
    const data = await getAirportMarkers();
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
    />
  );
}
