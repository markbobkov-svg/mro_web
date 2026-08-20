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
  /** Passive backdrop use (the signed-out landing): disable pan/zoom handlers.
   *  Defaults to true — the map is interactive everywhere else. */
  interactive?: boolean;
  /** Show the zoom + attribution controls. Defaults to true; the landing turns
   *  them off (they would be blurred) and prints its own sharp credit. */
  controls?: boolean;
  /** Decorative airport dots for the signed-out backdrop, as [lng, lat] pairs —
   *  coordinates only, no names/counts/ids. Rendered as a cheap GL circle layer
   *  (not DOM markers), so they blur with the canvas and never carry data. */
  dots?: [number, number][];
  /** Frame the markers on load instead of the whole-Europe default — used when a
   *  signed-in MRO sees only its own stations, so it lands zoomed on its region
   *  rather than staring at all of Europe. Ignored when there are no markers. */
  fitMarkers?: boolean;
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

// The dot (with its pulse) is always drawn. The code label beside it ships in
// the markup but stays hidden (opacity 0) until an engine adds `marker--label`,
// which it does once the map is zoomed in far enough that the dots have spread
// apart and the code has room to sit without hitting a neighbour — see
// LABEL_MIN_ZOOM and pickLabels below.
const MARKER_DOT =
  '<span class="marker__scale"><span class="marker__pulse"></span><span class="marker__dot"></span></span>';

/** Minimal HTML-escape so a stray character in a code can't break the markup. */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      (({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }) as Record<string, string>)[c],
  );
}

/** The airport's short code — IATA where it has one, else ICAO (may be empty). */
export function markerCode(m: AirportMarker): string {
  return m.iata ?? m.icao ?? "";
}

/** The class / inner-HTML / tooltip for a glowing pin — shared by both engines. */
export function markerParts(m: AirportMarker): {
  className: string;
  html: string;
  title: string;
} {
  const code = markerCode(m);
  const label = code
    ? `<span class="marker__label">${escapeHtml(code)}</span>`
    : "";
  return {
    className: "marker" + (m.orgCount >= 5 ? " marker--lg" : ""),
    html: MARKER_DOT + label,
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

/**
 * Below this zoom most of Europe is on screen and the dots pile on top of one
 * another, so no codes are drawn. At or above it the engines run pickLabels()
 * to reveal as many codes as fit without overlapping. Dots reach full size at
 * zoom 7 (see zoomScale), which is also about where neighbours separate — so
 * that is where the codes begin to appear.
 */
export const LABEL_MIN_ZOOM = 7;

/**
 * Greedy label placement in screen space. Markers are walked in the order given
 * (the caller sorts them busiest-first and puts the selected airport at the very
 * front, so its code always wins) and a code is kept only when its label box
 * clears every code already placed — so no two labels ever overlap. The dot is
 * always drawn; only the text is gated. This is what stops the codes conflicting
 * as the dots crowd together.
 *
 * project() is supplied by the caller because the pixel projection differs per
 * engine (MapLibre map.project vs Leaflet latLngToContainerPoint); the viewport
 * size lets off-screen markers be skipped cheaply.
 *
 * @returns the ids whose label should be visible.
 */
export function pickLabels(
  ordered: AirportMarker[],
  project: (coordinates: [number, number]) => { x: number; y: number } | null,
  viewport: { width: number; height: number },
): Set<string> {
  const shown = new Set<string>();
  // label boxes already placed, as [x1, y1, x2, y2] in screen px
  const boxes: Array<[number, number, number, number]> = [];
  // a little slack past the edges keeps labels from popping in late while panning
  const margin = 32;

  const hits = (b: [number, number, number, number]) =>
    boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

  for (const m of ordered) {
    const code = markerCode(m);
    if (!code) continue;
    const p = project(m.coordinates);
    if (!p) continue;
    if (
      p.x < -margin ||
      p.x > viewport.width + margin ||
      p.y < -margin ||
      p.y > viewport.height + margin
    ) {
      continue; // off-screen — don't spend a slot on a label nobody can see
    }
    // The label sits just right of the dot; approximate its box. Monospace makes
    // the width predictable (~6.5px per char at the label's size) plus padding.
    const w = code.length * 6.5 + 8;
    const h = 15;
    const x1 = p.x + 10; // dot half-width + gap to the text
    const y1 = p.y - h / 2;
    const box: [number, number, number, number] = [x1, y1, x1 + w, y1 + h];
    if (!hits(box)) {
      shown.add(m.id);
      boxes.push(box);
    }
  }
  return shown;
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

/**
 * Bounding box of a set of markers as [[west, south], [east, north]] — the order
 * MapLibre's fitBounds/bounds option expects — or null when there are none. Used
 * to frame a signed-in MRO's own stations on load.
 */
export function markerBounds(
  markers: AirportMarker[],
): [[number, number], [number, number]] | null {
  if (markers.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const m of markers) {
    const [lng, lat] = m.coordinates;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [
    [west, south],
    [east, north],
  ];
}

/**
 * How close the initial "frame my stations" fit is allowed to zoom in. A lone
 * station would otherwise fit at the extract's deepest level (rooftop detail);
 * capping it leaves a single-station MRO at a comfortable city-scale view.
 */
export const FIT_MAX_ZOOM = 9;
/** Padding (px) kept around the fitted stations so pins don't touch the edges. */
export const FIT_PADDING = 72;
