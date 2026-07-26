import MapView from "@/components/MapView";
import SetupNotice from "@/components/SetupNotice";
import { hasSupabaseCredentials } from "@/lib/supabase";
import { getAirportMarkers } from "@/lib/data";
import type { AirportMarker } from "@/lib/types";

// Always render fresh from the DB (data changes as the scraper runs).
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!hasSupabaseCredentials()) {
    return <SetupNotice />;
  }

  let markers: AirportMarker[] = [];
  let error: string | null = null;
  try {
    markers = await getAirportMarkers();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load airports";
  }

  return <MapView markers={markers} loadError={error} />;
}
