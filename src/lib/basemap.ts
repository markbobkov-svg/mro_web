// Shared helpers for the two basemap engines (MapLibre vector / Leaflet raster).
import type { AirportMarker } from "./types";

export interface BasemapHandle {
  /** Fly/zoom to an airport, leaving room for the right-hand panel. */
  flyTo: (marker: AirportMarker) => void;
}

export interface BasemapProps {
  markers: AirportMarker[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Called if this engine can't start (e.g. the CDN lib fails to load), so the
   *  parent can fall back to the other engine. */
  onFail?: () => void;
}

/** True if the browser can create a WebGL context (needed for the vector map). */
export function hasWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return Boolean(
      c.getContext("webgl2") ||
        c.getContext("webgl") ||
        (c.getContext("experimental-webgl") as unknown),
    );
  } catch {
    return false;
  }
}

const MARKER_HTML =
  '<span class="marker__scale"><span class="marker__pulse"></span><span class="marker__dot"></span></span>';

/** The class / inner-HTML / tooltip for a glowing pin — shared by both engines. */
export function markerParts(m: AirportMarker): {
  className: string;
  html: string;
  title: string;
} {
  const code = m.iata ?? m.icao ?? "";
  return {
    className: "marker" + (m.orgCount >= 5 ? " marker--lg" : ""),
    html: MARKER_HTML,
    title: `${code ? code + " — " : ""}${m.name}${
      m.city ? ", " + m.city : ""
    } · ${m.orgCount} MRO`,
  };
}

/** Build the glowing-pin DOM element (used by the MapLibre engine). */
export function createMarkerElement(m: AirportMarker): HTMLElement {
  const { className, html, title } = markerParts(m);
  const el = document.createElement("div");
  el.className = className;
  el.innerHTML = html;
  el.title = title;
  return el;
}

/**
 * Marker size relative to the original (1×). The original size is the MAX,
 * reached when zoomed in; points shrink below 1× as you zoom out so dense
 * clusters stop overlapping. Written to the `--mk` CSS var on the map container.
 */
export function zoomScale(zoom: number): number {
  return Math.max(0.4, Math.min(1, 1 - (7 - zoom) * 0.13));
}

// How far (px) to shift the focused airport left of centre so it sits in the
// visible map area, not under the right-hand panel. Roughly half the panel
// width at each breakpoint (panel: full width < 640, 420px ≥ 640, 630px ≥ 768).
export function panelOffsetPx(viewportWidth: number): number {
  if (viewportWidth >= 768) return 315;
  if (viewportWidth >= 640) return 210;
  return 0; // panel is full-screen on mobile — don't shift
}

/**
 * Geographic coverage of the self-hosted basemap (the Europe extract on R2), as
 * [west, south, east, north]. Panning and zoom-out are constrained to this box
 * so the areas we didn't extract are never visible as blank.
 */
export const COVERAGE_BBOX = {
  west: -32,
  south: 27,
  east: 46,
  north: 72,
};

/** Max zoom = the extract's deepest level, so there's no overzoom (always crisp). */
export const MAX_ZOOM = 13;
/** Min zoom floor; maxBounds further limits zoom-out per screen so no voids show. */
export const MIN_ZOOM = 3;
