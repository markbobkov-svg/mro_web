// Server-side coordinate fallback. When an `airports` row in Supabase has no
// latitude/longitude, resolve it from the bundled OurAirports lookup by ICAO
// then IATA code. Keeps the map complete regardless of DB coordinate coverage.
//
// The JSON is imported (not fetched) so it is inlined into the server bundle
// and never shipped to the browser. Regenerate with `npm run coords`.

import coords from "../../data/airport-coords.json";

const table = coords as unknown as Record<string, [number, number]>;

/**
 * Resolve [longitude, latitude] for an airport.
 * Preference: explicit DB coords -> ICAO lookup -> IATA lookup -> null.
 */
export function resolveCoordinates(
  dbLat: number | null | undefined,
  dbLon: number | null | undefined,
  icao: string | null | undefined,
  iata: string | null | undefined,
): [number, number] | null {
  if (
    dbLat != null &&
    dbLon != null &&
    Number.isFinite(dbLat) &&
    Number.isFinite(dbLon)
  ) {
    return [Number(dbLon), Number(dbLat)];
  }
  if (icao) {
    const hit = table[icao.toUpperCase()];
    if (hit) return hit;
  }
  if (iata) {
    const hit = table[iata.toUpperCase()];
    if (hit) return hit;
  }
  return null;
}
