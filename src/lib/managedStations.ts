import "server-only";

/**
 * The organisation-owned station override (migration 0004).
 *
 * The scraper owns `organisation_stations` and rewrites it on every run, so
 * nothing an organisation types may live there. Its edits go to
 * `organisation_managed_stations` instead — one row per (organisation, airport)
 * — and are merged over the scraped rows at read time by every path that places
 * an organisation at an airport: the map markers, the airport card, the search
 * index and the dashboard.
 *
 * Merge rule, the same "once you touch it, you own it" as managed contacts:
 *   - a managed row REPLACES the scraped station's details for that airport
 *     (the dashboard form prefills from the merged values, so a save always
 *     carries the full picture — no half-merged rows);
 *   - `removed` is a tombstone: the organisation is not at that airport, even
 *     though the scrape says it is;
 *   - a managed row at an airport with no scraped station ADDS the station.
 *
 * Every read soft-fails to "no overrides" when 0004 hasn't been applied to this
 * database yet, so the map keeps working before the migration is run.
 */

export interface ManagedStation {
  organisationId: string;
  airportId: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  isBase: boolean;
  removed: boolean;
}

const COLUMNS =
  "organisation_id, airport_id, address, phone, email, is_base, removed";
const PAGE = 1000;

/** Key for the (organisation, airport) pair a managed row overrides. */
export function stationKey(organisationId: string, airportId: string): string {
  return `${organisationId}::${airportId}`;
}

function toManaged(row: Record<string, unknown>): ManagedStation {
  return {
    organisationId: String(row.organisation_id),
    airportId: String(row.airport_id),
    address: (row.address as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    isBase: row.is_base === true,
    removed: row.removed === true,
  };
}

/**
 * Managed rows for one airport (the airport card), one organisation (the
 * dashboard), or the whole table (the map markers and the search index).
 * `organisationIds` narrows to a signed-in MRO's own organisations.
 */
export async function fetchManagedStations(
  supabase: any,
  filter: {
    airportId?: string;
    organisationIds?: string[] | null;
    all?: boolean;
  } = {},
): Promise<ManagedStation[]> {
  const { airportId, organisationIds, all } = filter;
  const scope = organisationIds && organisationIds.length ? organisationIds : null;

  // Whole-table reads are paginated; the targeted ones fit in a single request.
  if (all) {
    const out: ManagedStation[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from("organisation_managed_stations")
        .select(COLUMNS)
        .range(from, from + PAGE - 1);
      if (scope) query = query.in("organisation_id", scope);
      const { data, error } = await query;
      if (error) return []; // migration not applied — no overrides
      const rows = (data as Record<string, unknown>[]) ?? [];
      for (const r of rows) out.push(toManaged(r));
      if (rows.length < PAGE) break;
    }
    return out;
  }

  let query = supabase.from("organisation_managed_stations").select(COLUMNS);
  if (airportId) query = query.eq("airport_id", airportId);
  if (scope) query = query.in("organisation_id", scope);
  const { data, error } = await query;
  if (error) return []; // migration not applied — no overrides
  return ((data as Record<string, unknown>[]) ?? []).map(toManaged);
}

/** Index managed rows by their (organisation, airport) key. */
export function indexManagedStations(
  rows: ManagedStation[],
): Map<string, ManagedStation> {
  const byPair = new Map<string, ManagedStation>();
  for (const r of rows) byPair.set(stationKey(r.organisationId, r.airportId), r);
  return byPair;
}
