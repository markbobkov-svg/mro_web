// Shapes returned by the data layer to the UI. These are the *view* types —
// flattened / trimmed from the raw Supabase rows. They map to the LIVE database
// schema (organisation_stations, organisation_station_scope, organisation_scope,
// organisation_contacts, …), not the reference schema in the scraper repo.

/** One airport pin on the map. */
export interface AirportMarker {
  id: string;
  iata: string | null;
  icao: string | null;
  name: string;
  city: string | null;
  countryCode: string | null;
  /** [longitude, latitude] — GeoJSON order. */
  coordinates: [number, number];
  /** number of distinct MRO organisations present at this airport */
  orgCount: number;
}

/** One approval certificate issued by a single authority. */
export interface Certificate {
  approvalType: string; // 'Part-145', 'Part-CAMO', ...
  reference: string | null; // e.g. 'DE.145.0123'
  ratings: string[]; // clean EASA classes on the certificate, e.g. ['A1','B1']
  validUntil: string | null;
  url: string | null; // link to the certificate / source document, if known
}

/** One scope line. line/base come from the DB's location_scope for the row. */
export interface ScopeItem {
  text: string;
  line: boolean;
  base: boolean;
}

/** A class rating group (e.g. 'A1' or 'Aircraft') and the scope it covers. */
export interface ScopeClass {
  label: string;
  /** Aircraft-type class (A1–A4 / 'Aircraft') — shown with LINE/BASE columns. */
  isAircraft: boolean;
  items: ScopeItem[];
}

/** All of an organisation's approvals + scope under one authority. */
export interface AuthorityGroup {
  code: string; // 'EASA', 'FAA', 'UK-CAA', ...
  name: string | null;
  isEasa: boolean;
  certificates: Certificate[];
  classes: ScopeClass[]; // scope grouped by class; clickable in the UI
}

export interface Contact {
  label: string | null; // e.g. 'Line Maintenance Control'
  name: string | null;
  phone: string | null;
  email: string | null;
  hours: string | null;
}

/** One MRO organisation as seen at a specific airport (via its station there). */
export interface OrgAtAirport {
  stationId: string;
  organisationId: string;
  name: string;
  legalName: string | null;
  /** 'line' | 'base' | 'both' — derived from the station's scope rows. */
  locationScope: string | null;
  countryCode: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** Approvals + scope grouped by authority, EASA first (the default view). */
  authorities: AuthorityGroup[];
  contacts: Contact[];

  // --- filled in from the organisation's own dashboard, when it has one ---
  /** The organisation has claimed this listing and maintains it themselves. */
  claimed: boolean;
  /** One-liner the organisation wrote about itself. */
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  /** Aircraft-on-ground desk — the number an operator calls in a hurry. */
  aogPhone: string | null;
  aogEmail: string | null;
}

/** One row of the search dropdown, with the reason it matched. */
export interface SearchHit {
  id: string;
  iata: string | null;
  icao: string | null;
  name: string;
  city: string | null;
  countryCode: string | null;
  /** Organisations at this airport that satisfy the query. */
  orgCount: number;
  /** Total organisations at this airport, before the query narrowed them. */
  totalOrgCount: number;
  /** Ids of the matching organisations — used to filter the airport panel. */
  matchedOrgIds: string[];
  /** Organisations at this airport whose name matched the query. */
  matchedOrgs: string[];
  /** Scope lines (aircraft, engines, …) that matched the query. */
  matchedScope: string[];
}

export interface AirportDetail {
  airport: {
    id: string;
    iata: string | null;
    icao: string | null;
    name: string;
    city: string | null;
    countryCode: string | null;
  };
  organisations: OrgAtAirport[];
}
