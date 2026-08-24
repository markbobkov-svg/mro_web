import MapView from "@/components/MapView";
import SetupNotice from "@/components/SetupNotice";
// TEMPORARY: the landing is swapped for the test-account switcher — see below.
// import { Landing } from "@/components/Landing";
import DevLoginPanel from "./dev-login/DevLoginPanel";
import { hasSupabaseCredentials } from "@/lib/supabase";
import { getAirportMarkers } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { getViewerOrgScope, resolveHomePath } from "@/lib/guards";
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
    // TEMPORARY — while testing, the front door is the one-click switcher for
    // the TESTING.md accounts instead of the landing. To put the landing back:
    // restore the `Landing` / `getPublicStats` imports above and swap this
    // block for the original, which is one `git show` away —
    //
    //   let organisationCount = 0;
    //   try {
    //     organisationCount = (await getPublicStats()).organisationCount;
    //   } catch {}
    //   return <Landing organisationCount={organisationCount} />;
    //
    // then delete src/app/dev-login/. Nothing else references either.
    return <DevLoginPanel />;
  }

  // A signed-in MRO sees only its own network: the airports where it has a
  // station, and only its own card there. Everyone else (admins, airlines,
  // brand-new sign-ups) gets the whole map — see getViewerOrgScope.
  // dashboardHref is where the map's Dashboard button opens (in a right drawer):
  // airlines to /airline, everyone else to /dashboard.
  const [orgScope, dashboardHref] = await Promise.all([
    getViewerOrgScope(user),
    resolveHomePath(user.id),
  ]);

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
      scoped={orgScope !== null}
      dashboardHref={dashboardHref}
    />
  );
}
