// Shapes returned by the data layer to the UI. These are the *view* types —
// flattened / trimmed from the raw Supabase rows, not 1:1 with DB tables.

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

export interface Approval {
  approvalType: string; // 'Part-145', 'Part-CAMO', ...
  approvalReference: string | null; // e.g. 'DE.145.0123'
  ratings: string[]; // ['A1', 'B1', ...]
  validUntil: string | null;
  authorityCode: string | null; // 'EASA', 'UK-CAA', ...
}

export interface AircraftTypeRef {
  manufacturer: string;
  model: string;
  variant: string | null;
  icao: string | null;
  rating: string | null;
}

/** One MRO organisation as seen at a specific airport (via its station there). */
export interface OrgAtAirport {
  stationId: string;
  organisationId: string;
  name: string;
  legalName: string | null;
  maintenanceScope: string; // 'line' | 'base'
  city: string | null;
  countryCode: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  approvals: Approval[];
  aircraftTypes: AircraftTypeRef[];
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
