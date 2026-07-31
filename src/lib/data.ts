import "server-only";

import { getSupabase } from "./supabase";
import { resolveCoordinates } from "./airportCoords";
import type {
  AirportMarker,
  AirportDetail,
  OrgAtAirport,
  AuthorityGroup,
  Certificate,
  ScopeClass,
  Contact,
} from "./types";

const PAGE = 1000;

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * Every airport that has at least one MRO station, with resolved coordinates
 * and a count of distinct organisations — the map pins — plus the distinct
 * organisation total across all of them (an organisation at several airports is
 * one organisation but many stations) for the corner counter.
 */
export async function getAirportMarkers(): Promise<{
  markers: AirportMarker[];
  organisationCount: number;
}> {
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
  if (airportIds.length === 0) return { markers: [], organisationCount: 0 };

  // 2. airport details for those ids (chunked .in)
  const markers: AirportMarker[] = [];
  // Distinct organisations across the airports we can actually place. Summing
  // each pin's orgCount would instead count stations, since one organisation
  // can staff many airports.
  const placedOrgs = new Set<string>();
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
      const orgs = airportOrgs.get(a.id);
      if (orgs) for (const id of orgs) placedOrgs.add(id);
      markers.push({
        id: a.id,
        iata: a.iata_code ?? null,
        icao: a.icao_code ?? null,
        name: a.name,
        city: a.city ?? null,
        countryCode: a.country_code ?? null,
        coordinates,
        orgCount: orgs?.size ?? 0,
      });
    }
  }
  return { markers, organisationCount: placedOrgs.size };
}

const APPROVAL_ORDER = ["Part-145", "Part-CAMO", "Part-M", "Part-CAO"];

function approvalRank(type: string): number {
  const i = APPROVAL_ORDER.indexOf(type);
  return i === -1 ? 99 : i;
}

// Canonical EASA Part-145 class order, so scope groups sort A1, A2 … B1 … D1.
// Descriptive / foreign labels ('Aircraft', 'Engines', 'REPAIR STATION') aren't
// in the list and sort after, alphabetically.
const EASA_CLASSES = [
  "A1", "A2", "A3", "A4",
  "B1", "B2", "B3",
  ...Array.from({ length: 22 }, (_, i) => `C${i + 1}`),
  "D1",
];
function classRank(label: string): number {
  const head = label.trim().toUpperCase().split(/[\s.]/)[0];
  const i = EASA_CLASSES.indexOf(head);
  return i === -1 ? 999 : i;
}

// Aircraft-type class (gets LINE/BASE columns in the UI): the EASA A1–A4 ratings
// or any label mentioning "aircraft" (incl. the English-normalised labels).
function isAircraftClass(label: string): boolean {
  const l = label.trim();
  return /aircraft/i.test(l) || /^A[1-4]\b/i.test(l);
}

// Scope text often repeats the class as a leading token, e.g.
// "A1.A1 Jet engine.Boeing B737…" under class "A1". Drop that duplicate prefix.
function cleanScopeText(text: string, cls: string): string {
  const t = text.trim();
  const dot = t.indexOf(".");
  if (dot > 0 && t.slice(0, dot).trim().toUpperCase() === cls.trim().toUpperCase()) {
    return t.slice(dot + 1).trim();
  }
  return t;
}

/** Collapse a station's location_scope rows to one label. */
function deriveLocationScope(values: (string | null)[]): string | null {
  const set = new Set(values.filter(Boolean) as string[]);
  if (set.size === 0) return null;
  if (set.has("both") || (set.has("line") && set.has("base"))) return "both";
  return [...set][0];
}

/** All org-level scope rows for a set of orgs (paginated — big MROs have many). */
async function fetchOrgScope(supabase: any, orgIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("organisation_scope")
      .select(
        "organisation_id, authority_id, organisation_approval_id, rating_class_text, rating_class_text_en, scope_text, scope_text_en, location_scope, source_url",
      )
      .in("organisation_id", orgIds)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`getAirportDetail(org_scope): ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/**
 * Every MRO present at one airport (via its station there). For each org we
 * return its approvals + certified scope grouped by authority (EASA first), so
 * the card can default to EASA scope, let the user switch authorities, and
 * filter the scope by class rating.
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

  const [
    orgsRes,
    apprRes,
    scopeRows,
    stationScopeRes,
    contactsRes,
    authRes,
    profilesRes,
    managedContactsRes,
    membersRes,
  ] = await Promise.all([
      supabase
        .from("organisations")
        .select("id, name, legal_name, address, country_code, phone, email, website")
        .in("id", orgIds),
      supabase
        .from("organisation_approvals")
        .select(
          "id, organisation_id, approval_type, approval_reference, ratings, valid_until, authority_id, authorities(code, name)",
        )
        .in("organisation_id", orgIds),
      fetchOrgScope(supabase, orgIds),
      supabase
        .from("organisation_station_scope")
        .select("station_id, location_scope")
        .in("station_id", stationIds),
      supabase
        .from("organisation_contacts")
        .select(
          "organisation_id, label, name, phone, email, hours, station_iata, station_icao",
        )
        .in("organisation_id", orgIds),
      supabase.from("authorities").select("id, code, name"),
      // The organisation-maintained layer. Kept in its own tables so a re-scrape
      // can never overwrite what an organisation typed; merged over the scraped
      // values here, at read time.
      supabase
        .from("organisation_profiles")
        .select(
          "organisation_id, tagline, description, logo_url, website, email, phone, address, aog_phone, aog_email",
        )
        .in("organisation_id", orgIds),
      supabase
        .from("organisation_managed_contacts")
        .select("organisation_id, function_label, name, phone, email, hours, sort_order")
        .in("organisation_id", orgIds)
        .order("sort_order"),
      supabase
        .from("organisation_members")
        .select("organisation_id")
        .in("organisation_id", orgIds),
    ]);

  for (const [label, res] of [
    ["organisations", orgsRes],
    ["approvals", apprRes],
    ["station_scope", stationScopeRes],
    ["contacts", contactsRes],
    ["authorities", authRes],
  ] as const) {
    if (res.error) throw new Error(`getAirportDetail(${label}): ${res.error.message}`);
  }

  // The dashboard tables are additive: if the migration hasn't been applied to
  // this database yet, the map must still work. Missing table => no overrides.
  const profileByOrg = new Map<string, any>();
  if (!profilesRes.error) {
    for (const p of (profilesRes.data as any[]) ?? []) {
      profileByOrg.set(p.organisation_id, p);
    }
  }

  // "Claimed" means someone from the organisation has been verified as owning
  // the listing — not that they have edited it yet, so this comes from
  // membership rather than from the presence of a profile row.
  const claimedOrgs = new Set<string>();
  if (!membersRes.error) {
    for (const m of (membersRes.data as any[]) ?? []) {
      claimedOrgs.add(m.organisation_id);
    }
  }

  const managedByOrg = new Map<string, Contact[]>();
  if (!managedContactsRes.error) {
    for (const c of (managedContactsRes.data as any[]) ?? []) {
      if (!c.phone && !c.email && !c.name && !c.function_label) continue;
      const list = managedByOrg.get(c.organisation_id) ?? [];
      list.push({
        label: c.function_label ?? null,
        name: c.name ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        hours: c.hours ?? null,
      });
      managedByOrg.set(c.organisation_id, list);
    }
  }

  const orgById = new Map<string, any>();
  for (const o of (orgsRes.data as any[]) ?? []) orgById.set(o.id, o);

  // authority id -> { code, name }
  const authById = new Map<string, { code: string; name: string | null }>();
  for (const a of (authRes.data as any[]) ?? []) {
    authById.set(a.id, { code: a.code, name: a.name ?? null });
  }

  const AUTH_NONE = "∅";

  // --- org-level scope: group org -> authority -> class -> items; collect cert links ---
  // Classes are keyed case-insensitively so scraped variants like
  // "Components…" and "COMPONENTS…" collapse into one group (first label wins).
  type ScopeAcc = { text: string; line: boolean; base: boolean };
  type ClassGroup = { label: string; items: Map<string, ScopeAcc> };
  const scopeByOrgAuth = new Map<
    string,
    Map<string, Map<string, ClassGroup>>
  >();
  const urlByApproval = new Map<string, string>(); // organisation_approval_id -> source_url
  const urlByOrgAuth = new Map<string, string>(); // `${org}|${auth}` -> source_url
  for (const sc of scopeRows) {
    const org = sc.organisation_id;
    const auth = sc.authority_id ?? AUTH_NONE;
    const cls = (sc.rating_class_text_en || sc.rating_class_text || "Other").trim() || "Other";
    const text = (sc.scope_text_en || sc.scope_text || "").trim();
    if (text) {
      const clsKey = cls.toLowerCase();
      const ls = (sc.location_scope || "").toLowerCase();
      const line = ls === "line" || ls === "both";
      const base = ls === "base" || ls === "both";
      const cleaned = cleanScopeText(text, cls);
      let am = scopeByOrgAuth.get(org);
      if (!am) { am = new Map(); scopeByOrgAuth.set(org, am); }
      let cm = am.get(auth);
      if (!cm) { cm = new Map(); am.set(auth, cm); }
      let grp = cm.get(clsKey);
      if (!grp) { grp = { label: cls, items: new Map() }; cm.set(clsKey, grp); }
      const itKey = cleaned.toLowerCase();
      let it = grp.items.get(itKey);
      if (!it) { it = { text: cleaned, line: false, base: false }; grp.items.set(itKey, it); }
      // one aircraft can appear as separate line/base rows — OR the flags together
      it.line = it.line || line;
      it.base = it.base || base;
    }
    if (sc.source_url) {
      if (sc.organisation_approval_id && !urlByApproval.has(sc.organisation_approval_id)) {
        urlByApproval.set(sc.organisation_approval_id, sc.source_url);
      }
      const k = `${org}|${auth}`;
      if (!urlByOrgAuth.has(k)) urlByOrgAuth.set(k, sc.source_url);
    }
  }

  // --- approvals: group org -> authority -> certificates[] ---
  const certsByOrgAuth = new Map<string, Map<string, Certificate[]>>();
  for (const ap of (apprRes.data as any[]) ?? []) {
    const org = ap.organisation_id;
    const auth = ap.authority_id ?? AUTH_NONE;
    // authorities may arrive as embedded object; keep its code as a fallback
    if (ap.authority_id && !authById.has(ap.authority_id) && ap.authorities?.code) {
      authById.set(ap.authority_id, {
        code: ap.authorities.code,
        name: ap.authorities.name ?? null,
      });
    }
    const cert: Certificate = {
      approvalType: ap.approval_type,
      reference: ap.approval_reference ?? null,
      ratings: Array.isArray(ap.ratings) ? ap.ratings : [],
      validUntil: ap.valid_until ?? null,
      url: (ap.id && urlByApproval.get(ap.id)) || null,
    };
    let am = certsByOrgAuth.get(org);
    if (!am) { am = new Map(); certsByOrgAuth.set(org, am); }
    const list = am.get(auth) ?? [];
    list.push(cert);
    am.set(auth, list);
  }

  const iata = airportInfo.iata?.toUpperCase();
  const icao = airportInfo.icao?.toUpperCase();
  const contactsByOrg = new Map<string, Contact[]>();
  for (const c of (contactsRes.data as any[]) ?? []) {
    // keep contacts tied to this airport, or org-wide (no station code)
    const cIata = (c.station_iata || "").toUpperCase();
    const cIcao = (c.station_icao || "").toUpperCase();
    const stationSpecific = cIata || cIcao;
    const matchesAirport = (iata && cIata === iata) || (icao && cIcao === icao);
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

  const stationLocScope = new Map<string, (string | null)[]>();
  for (const sc of (stationScopeRes.data as any[]) ?? []) {
    const list = stationLocScope.get(sc.station_id) ?? [];
    list.push(sc.location_scope ?? null);
    stationLocScope.set(sc.station_id, list);
  }

  function buildAuthorities(orgId: string): AuthorityGroup[] {
    const certMap = certsByOrgAuth.get(orgId);
    const scopeMap = scopeByOrgAuth.get(orgId);
    const authIds = new Set<string>();
    if (certMap) for (const k of certMap.keys()) authIds.add(k);
    if (scopeMap) for (const k of scopeMap.keys()) authIds.add(k);

    const groups: AuthorityGroup[] = [];
    for (const authId of authIds) {
      const meta = authById.get(authId);
      const code = meta?.code ?? "Other";
      const certificates = (certMap?.get(authId) ?? []).sort(
        (a, b) => approvalRank(a.approvalType) - approvalRank(b.approvalType),
      );
      const classesMap = scopeMap?.get(authId);
      const classes: ScopeClass[] = classesMap
        ? Array.from(classesMap.values())
            .map((g) => ({
              label: g.label,
              isAircraft: isAircraftClass(g.label),
              items: Array.from(g.items.values()),
            }))
            .sort(
              (a, b) =>
                classRank(a.label) - classRank(b.label) ||
                a.label.localeCompare(b.label),
            )
        : [];
      groups.push({
        code,
        name: meta?.name ?? null,
        isEasa: code.toUpperCase() === "EASA",
        certificates,
        classes,
        url: urlByOrgAuth.get(`${orgId}|${authId}`) ?? certificates.find((c) => c.url)?.url ?? null,
      });
    }
    // EASA first, then alphabetically by code
    groups.sort(
      (a, b) => (a.isEasa ? 0 : 1) - (b.isEasa ? 0 : 1) || a.code.localeCompare(b.code),
    );
    return groups;
  }

  const organisations: OrgAtAirport[] = stationRows.map((s) => {
    const org = orgById.get(s.organisation_id) ?? {};
    const profile = profileByOrg.get(s.organisation_id) ?? null;
    const managed = managedByOrg.get(s.organisation_id);

    // Precedence, most specific first: what the organisation typed, then the
    // station's own details, then the organisation-level scraped values.
    return {
      stationId: s.id,
      organisationId: s.organisation_id,
      name: org.name ?? "Unknown organisation",
      legalName: org.legal_name ?? null,
      locationScope: deriveLocationScope(stationLocScope.get(s.id) ?? []),
      countryCode: s.country_code ?? org.country_code ?? null,
      address: profile?.address ?? s.address ?? org.address ?? null,
      phone: profile?.phone ?? s.phone ?? org.phone ?? null,
      email: profile?.email ?? s.email ?? org.email ?? null,
      website: profile?.website ?? org.website ?? null,
      authorities: buildAuthorities(s.organisation_id),
      // An organisation that maintains its own contacts replaces the scraped
      // ones outright — a half-merged list would show stale desks next to live.
      contacts: (managed ?? contactsByOrg.get(s.organisation_id) ?? []).slice(0, 4),
      claimed: claimedOrgs.has(s.organisation_id),
      tagline: profile?.tagline ?? null,
      description: profile?.description ?? null,
      logoUrl: profile?.logo_url ?? null,
      aogPhone: profile?.aog_phone ?? null,
      aogEmail: profile?.aog_email ?? null,
    };
  });

  // MROs with a Part-145 certificate first, then alphabetical.
  organisations.sort((a, b) => {
    const pa = a.authorities.some((g) =>
      g.certificates.some((c) => c.approvalType === "Part-145"),
    )
      ? 0
      : 1;
    const pb = b.authorities.some((g) =>
      g.certificates.some((c) => c.approvalType === "Part-145"),
    )
      ? 0
      : 1;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return { airport: airportInfo, organisations };
}
