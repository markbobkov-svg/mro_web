import "server-only";

import { getSupabase } from "./supabase";
import { resolveCoordinates } from "./airportCoords";
import type {
  AirportMarker,
  AirportDetail,
  OrgAtAirport,
  Approval,
  Contact,
} from "./types";

const PAGE = 1000;

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * Every airport that has at least one MRO station, with resolved coordinates
 * and a count of distinct organisations. Drives the map markers.
 */
export async function getAirportMarkers(): Promise<AirportMarker[]> {
  const supabase = getSupabase();

  // 1. all station → airport links (paginated)
  const airportOrgs = new Map<string, Set<string>>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("organisation_stations")
      .select("airport_id, organisation_id")
      .not("airport_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`getAirportMarkers(stations): ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as any[]) {
      let set = airportOrgs.get(row.airport_id);
      if (!set) {
        set = new Set();
        airportOrgs.set(row.airport_id, set);
      }
      if (row.organisation_id) set.add(row.organisation_id);
    }
    if (data.length < PAGE) break;
  }

  const airportIds = Array.from(airportOrgs.keys());
  if (airportIds.length === 0) return [];

  // 2. airport details for those ids (chunked .in)
  const markers: AirportMarker[] = [];
  const CHUNK = 200;
  for (let i = 0; i < airportIds.length; i += CHUNK) {
    const ids = airportIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("airports")
      .select("id, iata_code, icao_code, name, city, country_code, latitude, longitude")
      .in("id", ids);
    if (error) throw new Error(`getAirportMarkers(airports): ${error.message}`);
    for (const a of (data as any[]) ?? []) {
      const coordinates = resolveCoordinates(
        a.latitude != null ? Number(a.latitude) : null,
        a.longitude != null ? Number(a.longitude) : null,
        a.icao_code,
        a.iata_code,
      );
      if (!coordinates) continue; // can't place it — skip
      markers.push({
        id: a.id,
        iata: a.iata_code ?? null,
        icao: a.icao_code ?? null,
        name: a.name,
        city: a.city ?? null,
        countryCode: a.country_code ?? null,
        coordinates,
        orgCount: airportOrgs.get(a.id)?.size ?? 0,
      });
    }
  }
  return markers;
}

const APPROVAL_ORDER = ["Part-145", "Part-CAMO", "Part-M", "Part-CAO"];

function approvalRank(type: string): number {
  const i = APPROVAL_ORDER.indexOf(type);
  return i === -1 ? 99 : i;
}

/** Collapse a station's location_scope rows to one label. */
function deriveLocationScope(values: (string | null)[]): string | null {
  const set = new Set(values.filter(Boolean) as string[]);
  if (set.size === 0) return null;
  if (set.has("both") || (set.has("line") && set.has("base"))) return "both";
  return [...set][0];
}

/**
 * Every MRO present at one airport (via its station there), with the org's
 * approvals, the scope/aircraft it covers at that station, and contacts.
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
        .from("organisation_stations")
        .select("id, address, country_code, phone, email, organisation_id")
        .eq("airport_id", airportId),
    ]);
  if (aErr) throw new Error(`getAirportDetail(airport): ${aErr.message}`);
  if (sErr) throw new Error(`getAirportDetail(stations): ${sErr.message}`);

  const stationRows = (stations as any[]) ?? [];
  const airportInfo = {
    id: airportId,
    iata: (airport as any)?.iata_code ?? null,
    icao: (airport as any)?.icao_code ?? null,
    name: (airport as any)?.name ?? "Airport",
    city: (airport as any)?.city ?? null,
    countryCode: (airport as any)?.country_code ?? null,
  };

  if (stationRows.length === 0) {
    return { airport: airportInfo, organisations: [] };
  }

  const orgIds = uniq(stationRows.map((s) => s.organisation_id).filter(Boolean));
  const stationIds = stationRows.map((s) => s.id);

  const [orgsRes, apprRes, scopeRes, contactsRes] = await Promise.all([
    supabase
      .from("organisations")
      .select("id, name, legal_name, address, country_code, phone, email, website")
      .in("id", orgIds),
    supabase
      .from("organisation_approvals")
      .select(
        "organisation_id, approval_type, approval_reference, ratings, valid_until, authorities(code, name)",
      )
      .in("organisation_id", orgIds),
    supabase
      .from("organisation_station_scope")
      .select("station_id, scope_text, scope_text_en, location_scope")
      .in("station_id", stationIds),
    supabase
      .from("organisation_contacts")
      .select(
        "organisation_id, label, name, phone, email, hours, station_iata, station_icao",
      )
      .in("organisation_id", orgIds),
  ]);

  for (const [label, res] of [
    ["organisations", orgsRes],
    ["approvals", apprRes],
    ["station_scope", scopeRes],
    ["contacts", contactsRes],
  ] as const) {
    if (res.error) throw new Error(`getAirportDetail(${label}): ${res.error.message}`);
  }

  const orgById = new Map<string, any>();
  for (const o of (orgsRes.data as any[]) ?? []) orgById.set(o.id, o);

  const approvalsByOrg = new Map<string, Approval[]>();
  for (const ap of (apprRes.data as any[]) ?? []) {
    const list = approvalsByOrg.get(ap.organisation_id) ?? [];
    list.push({
      approvalType: ap.approval_type,
      approvalReference: ap.approval_reference ?? null,
      ratings: Array.isArray(ap.ratings) ? ap.ratings : [],
      validUntil: ap.valid_until ?? null,
      authorityCode: ap.authorities?.code ?? null,
    });
    approvalsByOrg.set(ap.organisation_id, list);
  }

  const scopeByStation = new Map<string, { texts: string[]; scopes: (string | null)[] }>();
  for (const sc of (scopeRes.data as any[]) ?? []) {
    const entry = scopeByStation.get(sc.station_id) ?? { texts: [], scopes: [] };
    const text = (sc.scope_text_en || sc.scope_text || "").trim();
    if (text) entry.texts.push(text);
    entry.scopes.push(sc.location_scope ?? null);
    scopeByStation.set(sc.station_id, entry);
  }

  const iata = airportInfo.iata?.toUpperCase();
  const icao = airportInfo.icao?.toUpperCase();
  const contactsByOrg = new Map<string, Contact[]>();
  for (const c of (contactsRes.data as any[]) ?? []) {
    // keep contacts tied to this airport, or org-wide (no station code)
    const cIata = (c.station_iata || "").toUpperCase();
    const cIcao = (c.station_icao || "").toUpperCase();
    const stationSpecific = cIata || cIcao;
    const matchesAirport =
      (iata && cIata === iata) || (icao && cIcao === icao);
    if (stationSpecific && !matchesAirport) continue;
    if (!c.phone && !c.email && !c.name && !c.label) continue;
    const list = contactsByOrg.get(c.organisation_id) ?? [];
    list.push({
      label: c.label ?? null,
      name: c.name ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      hours: c.hours ?? null,
    });
    contactsByOrg.set(c.organisation_id, list);
  }

  const organisations: OrgAtAirport[] = stationRows.map((s) => {
    const org = orgById.get(s.organisation_id) ?? {};
    const approvals = (approvalsByOrg.get(s.organisation_id) ?? []).sort(
      (a, b) => approvalRank(a.approvalType) - approvalRank(b.approvalType),
    );
    const scopeEntry = scopeByStation.get(s.id) ?? { texts: [], scopes: [] };
    return {
      stationId: s.id,
      organisationId: s.organisation_id,
      name: org.name ?? "Unknown organisation",
      legalName: org.legal_name ?? null,
      locationScope: deriveLocationScope(scopeEntry.scopes),
      countryCode: s.country_code ?? org.country_code ?? null,
      address: s.address ?? org.address ?? null,
      phone: s.phone ?? org.phone ?? null,
      email: s.email ?? org.email ?? null,
      website: org.website ?? null,
      approvals,
      scope: uniq(scopeEntry.texts),
      contacts: (contactsByOrg.get(s.organisation_id) ?? []).slice(0, 4),
    };
  });

  // MROs with a Part-145 approval first, then alphabetical.
  organisations.sort((a, b) => {
    const pa = a.approvals.some((x) => x.approvalType === "Part-145") ? 0 : 1;
    const pb = b.approvals.some((x) => x.approvalType === "Part-145") ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return { airport: airportInfo, organisations };
}
