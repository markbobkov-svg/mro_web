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

/** A class rating group (e.g. 'A1' or 'Aircraft') and the scope it covers. */
export interface ScopeClass {
  label: string;
  items: string[];
}

/** All of an organisation's approvals + scope under one authority. */
export interface AuthorityGroup {
  code: string; // 'EASA', 'FAA', 'UK-CAA', ...
  name: string | null;
  isEasa: boolean;
  certificates: Certificate[];
  classes: ScopeClass[]; // scope grouped by class; clickable in the UI
  url: string | null; // representative certificate link for this authority
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
