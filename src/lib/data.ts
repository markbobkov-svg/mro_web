import "server-only";

import { getSupabase } from "./supabase";
import { resolveCoordinates } from "./airportCoords";
import type {
  AirportMarker,
  AirportDetail,
  OrgAtAirport,
  Approval,
  AircraftTypeRef,
} from "./types";

const PAGE = 1000;

/**
 * Every airport that has at least one MRO station, with resolved coordinates
 * and a count of distinct organisations. Drives the map markers.
 */
export async function getAirportMarkers(): Promise<AirportMarker[]> {
  const supabase = getSupabase();

  // aggregate: airportId -> { airport fields, set of org ids }
  const byAirport = new Map<
    string,
    {
      iata: string | null;
      icao: string | null;
      name: string;
      city: string | null;
      countryCode: string | null;
      lat: number | null;
      lon: number | null;
      orgIds: Set<string>;
    }
  >();

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("stations")
      .select(
        "organisation_id, airports!inner(id, iata_code, icao_code, name, city, country_code, latitude, longitude)",
      )
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`getAirportMarkers: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      const a = row.airports;
      if (!a) continue;
      let entry = byAirport.get(a.id);
      if (!entry) {
        entry = {
          iata: a.iata_code ?? null,
          icao: a.icao_code ?? null,
          name: a.name,
          city: a.city ?? null,
          countryCode: a.country_code ?? null,
          lat: a.latitude != null ? Number(a.latitude) : null,
          lon: a.longitude != null ? Number(a.longitude) : null,
          orgIds: new Set(),
        };
        byAirport.set(a.id, entry);
      }
      if (row.organisation_id) entry.orgIds.add(row.organisation_id);
    }

    if (data.length < PAGE) break;
  }

  const markers: AirportMarker[] = [];
  for (const [id, e] of byAirport) {
    const coordinates = resolveCoordinates(e.lat, e.lon, e.icao, e.iata);
    if (!coordinates) continue; // no way to place it — skip silently
    markers.push({
      id,
      iata: e.iata,
      icao: e.icao,
      name: e.name,
      city: e.city,
      countryCode: e.countryCode,
      coordinates,
      orgCount: e.orgIds.size,
    });
  }
  return markers;
}

const APPROVAL_ORDER = ["Part-145", "Part-CAMO", "Part-M", "Part-CAO"];

function sortApprovals(a: Approval, b: Approval): number {
  const ia = APPROVAL_ORDER.indexOf(a.approvalType);
  const ib = APPROVAL_ORDER.indexOf(b.approvalType);
  const ra = ia === -1 ? 99 : ia;
  const rb = ib === -1 ? 99 : ib;
  return ra - rb;
}

/**
 * Every MRO present at one airport (via its station there), with the org's
 * approvals and the aircraft types it covers at that station.
 */
export async function getAirportDetail(
  airportId: string,
): Promise<AirportDetail> {
  const supabase = getSupabase();

  const [{ data: airport, error: aErr }, { data: stations, error: sErr }] =
    await Promise.all([
      supabase
        .from("airports")
        .select("id, iata_code, icao_code, name, city, country_code")
        .eq("id", airportId)
        .maybeSingle(),
      supabase
        .from("stations")
        .select(
          `id, name, maintenance_scope, address, city, phone, email,
           organisations!inner (
             id, name, legal_name, city, country_code, address, phone, email, website,
             organisation_approvals ( approval_type, approval_reference, ratings, valid_until, authorities ( code, name ) )
           ),
           station_aircraft_types ( rating, aircraft_types ( manufacturer, model, variant, icao_type_designator ) )`,
        )
        .eq("airport_id", airportId),
    ]);

  if (aErr) throw new Error(`getAirportDetail(airport): ${aErr.message}`);
  if (sErr) throw new Error(`getAirportDetail(stations): ${sErr.message}`);

  const organisations: OrgAtAirport[] = ((stations as any[]) ?? []).map((s) => {
    const org = s.organisations;

    const approvals: Approval[] = (org?.organisation_approvals ?? [])
      .map((ap: any) => ({
        approvalType: ap.approval_type,
        approvalReference: ap.approval_reference ?? null,
        ratings: Array.isArray(ap.ratings) ? ap.ratings : [],
        validUntil: ap.valid_until ?? null,
        authorityCode: ap.authorities?.code ?? null,
      }))
      .sort(sortApprovals);

    const aircraftTypes: AircraftTypeRef[] = (s.station_aircraft_types ?? [])
      .map((sat: any) => {
        const t = sat.aircraft_types;
        if (!t) return null;
        return {
          manufacturer: t.manufacturer,
          model: t.model,
          variant: t.variant ?? null,
          icao: t.icao_type_designator ?? null,
          rating: sat.rating ?? null,
        };
      })
      .filter(Boolean) as AircraftTypeRef[];

    return {
      stationId: s.id,
      organisationId: org?.id,
      name: org?.name ?? "Unknown",
      legalName: org?.legal_name ?? null,
      maintenanceScope: s.maintenance_scope ?? "line",
      city: s.city ?? org?.city ?? null,
      countryCode: org?.country_code ?? null,
      address: s.address ?? org?.address ?? null,
      phone: s.phone ?? org?.phone ?? null,
      email: s.email ?? org?.email ?? null,
      website: org?.website ?? null,
      approvals,
      aircraftTypes,
    };
  });

  // MROs with a Part-145 approval first, then alphabetical.
  organisations.sort((a, b) => {
    const pa = a.approvals.some((x) => x.approvalType === "Part-145") ? 0 : 1;
    const pb = b.approvals.some((x) => x.approvalType === "Part-145") ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return {
    airport: {
      id: airportId,
      iata: airport?.iata_code ?? null,
      icao: airport?.icao_code ?? null,
      name: airport?.name ?? "Airport",
      city: airport?.city ?? null,
      countryCode: airport?.country_code ?? null,
    },
    organisations,
  };
}
