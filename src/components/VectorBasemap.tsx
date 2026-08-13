"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AirportMarker } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BasemapHandle,
  BasemapProps,
  createMarkerElement,
  pickLabels,
  zoomScale,
  panelOffsetPx,
  COVERAGE_BBOX,
  LABEL_MIN_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
} from "@/lib/basemap";

// maplibre-gl + pmtiles + @protomaps/basemaps ship as npm dependencies and are
// pulled in with dynamic import(): they land in their own chunk served from our
// own origin (no extra DNS/TLS round trips to a CDN, no third-party uptime
// dependency) and stay out of the initial bundle.

// Protomaps "black" basemap — a very dark vector theme; English labels.
// The browser reads the PMTiles straight from our R2 bucket (CORS on the bucket
// allows ranged GETs from our origins). Going direct drops a serverless hop per
// tile request and lets Cloudflare's CDN serve the ranges.
// NOTE: r2.dev is rate limited by Cloudflare and meant for development; for
// production traffic, point this at a custom domain on the bucket by setting
// NEXT_PUBLIC_PMTILES_URL (e.g. https://tiles.one4five.tech/europe-z13.pmtiles).
const PMTILES_URL =
  process.env.NEXT_PUBLIC_PMTILES_URL ??
  "https://pub-8dfd157e131f4ce29bfa353f4c095e5a.r2.dev/europe-z13.pmtiles";
// Fonts + sprites default to Protomaps' own GitHub-hosted assets, but both are
// overridable so they can be mirrored to our R2 alongside the tiles — relying on
// someone else's GitHub Pages for a commercial product is a reliability risk
// (rate limits, path changes), not a licensing one. Mirror once, then set these.
const GLYPHS =
  process.env.NEXT_PUBLIC_GLYPHS_URL ??
  "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
const SPRITE =
  process.env.NEXT_PUBLIC_SPRITE_URL ??
  "https://protomaps.github.io/basemaps-assets/sprites/v4/light";
// OpenStreetMap's ODbL requires attribution — shown via a compact control below.
const ATTRIB =
  '<a href="https://protomaps.com" target="_blank" rel="noreferrer">Protomaps</a> © <a href="https://openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

// Keep the Protomaps "black" theme's full detail (roads, buildings, labels) as
// it ships, and only strip the two point-markers the user doesn't want:
//   1. roads_shields  – the highway "index" badges (A1, E20…). Road lines and
//      road-name labels (roads_labels_*) are separate layers and stay.
//   2. the dot next to each city – places_locality is one symbol layer that
//      draws BOTH a "townspot"/"capital" circle (icon-image) AND the city name
//      (text-field). We drop just the icon so the name label survives.
function tidyLayers(layers: any[]): any[] {
  return layers
    .filter((l) => l.id !== "roads_shields")
    .map((l) => {
      if (l.id === "places_locality" && l.layout) {
        const layout = { ...l.layout };
        delete layout["icon-image"];
        delete layout["icon-size"];
        delete layout["icon-padding"];
        return { ...l, layout };
      }
      return l;
    });
}

interface Libs {
  maplibregl: any;
  pmtiles: any;
  basemaps: any;
}

let libsPromise: Promise<Libs> | null = null;
function loadLibs(): Promise<Libs> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (libsPromise) return libsPromise;
  libsPromise = (async () => {
    const [maplibreMod, pmtilesMod, basemapsMod] = await Promise.all([
      import("maplibre-gl"),
      import("pmtiles"),
      import("@protomaps/basemaps"),
    ]);
    return {
      maplibregl: (maplibreMod as any).default ?? maplibreMod,
      pmtiles: pmtilesMod,
      basemaps: basemapsMod,
    };
  })();
  return libsPromise;
}

const VectorBasemap = forwardRef<BasemapHandle, BasemapProps>(
  function VectorBasemap(
    { markers, activeId, onSelect, onFail, interactive = true, controls = true },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const glRef = useRef<any>(null);
    const markerEls = useRef<Map<string, HTMLElement>>(new Map());
    const markerObjs = useRef<any[]>([]);
    const readyRef = useRef(false);
    const rebuildRef = useRef<() => void>(() => {});
    // Markers sorted busiest-first, so the same airports keep their codes as you
    // pan (no flicker). Recomputed only when the dataset changes.
    const orderedRef = useRef<AirportMarker[]>([]);
    // Recomputes which codes are visible, rAF-throttled — exposed so the active
    // and dataset effects can nudge it without reaching into the init closure.
    const scheduleLabelsRef = useRef<() => void>(() => {});

    // keep the latest props readable from stable closures
    const markersRef = useRef(markers);
    markersRef.current = markers;
    const activeIdRef = useRef<string | null>(activeId);
    activeIdRef.current = activeId;
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;

    useImperativeHandle(ref, () => ({
      flyTo: (m) => {
        const map = mapRef.current;
        if (!map) return;
        const [lng, lat] = m.coordinates;
        const off =
          typeof window !== "undefined" ? panelOffsetPx(window.innerWidth) : 0;
        map.flyTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), 8),
          offset: [-off, 0],
          duration: 900,
          essential: true,
        });
      },
    }));

    // init once
    useEffect(() => {
      let cancelled = false;
      let map: any;

      const rebuildMarkers = () => {
        const maplibregl = glRef.current;
        const m = mapRef.current;
        if (!maplibregl || !m) return;
        markerObjs.current.forEach((mk) => mk.remove());
        markerObjs.current = [];
        markerEls.current.clear();
        for (const mk of markersRef.current) {
          const el = createMarkerElement(mk);
          el.classList.toggle("marker--active", mk.id === activeIdRef.current);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onSelectRef.current(mk.id);
          });
          const obj = new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat(mk.coordinates)
            .addTo(m);
          markerObjs.current.push(obj);
          markerEls.current.set(mk.id, el);
        }
        orderedRef.current = [...markersRef.current].sort(
          (a, b) => b.orgCount - a.orgCount,
        );
        scheduleLabelsRef.current();
      };
      rebuildRef.current = rebuildMarkers;

      // Reveal each dot's code once the map is zoomed in past LABEL_MIN_ZOOM,
      // choosing the set that fits without overlapping (pickLabels). The selected
      // airport goes first so its code always shows.
      let labelsOn = false;
      const updateLabels = () => {
        const m = mapRef.current;
        if (!m) return;
        const els = markerEls.current;
        if (m.getZoom() < LABEL_MIN_ZOOM) {
          if (labelsOn) {
            els.forEach((el) => el.classList.remove("marker--label"));
            labelsOn = false;
          }
          return;
        }
        labelsOn = true;
        const active = activeIdRef.current;
        const base = orderedRef.current;
        const ordered =
          active && els.has(active)
            ? [
                ...base.filter((mk) => mk.id === active),
                ...base.filter((mk) => mk.id !== active),
              ]
            : base;
        const c = m.getContainer();
        const shown = pickLabels(
          ordered,
          (coords) => {
            const pt = m.project(coords);
            return pt ? { x: pt.x, y: pt.y } : null;
          },
          { width: c.clientWidth, height: c.clientHeight },
        );
        els.forEach((el, id) =>
          el.classList.toggle("marker--label", shown.has(id)),
        );
      };

      // Coalesce the burst of move/zoom events into one recompute per frame.
      let labelRaf = 0;
      const scheduleLabels = () => {
        if (labelRaf) return;
        labelRaf = requestAnimationFrame(() => {
          labelRaf = 0;
          updateLabels();
        });
      };
      scheduleLabelsRef.current = scheduleLabels;

      (async () => {
        let libs: Libs;
        try {
          libs = await loadLibs();
        } catch {
          if (!cancelled) onFail?.();
          return;
        }
        if (cancelled || !containerRef.current || mapRef.current) return;
        const { maplibregl, pmtiles, basemaps } = libs;
        glRef.current = maplibregl;
        // register the pmtiles:// protocol once per maplibre instance
        if (!maplibregl.__pmtilesRegistered) {
          const protocol = new pmtiles.Protocol();
          maplibregl.addProtocol("pmtiles", protocol.tile);
          maplibregl.__pmtilesRegistered = true;
        }
        try {
          map = new maplibregl.Map({
            container: containerRef.current,
            style: {
              version: 8,
              glyphs: GLYPHS,
              sprite: SPRITE,
              sources: {
                protomaps: {
                  type: "vector",
                  url: `pmtiles://${PMTILES_URL}`,
                  attribution: ATTRIB,
                },
              },
              layers: tidyLayers(
                basemaps.layers("protomaps", basemaps.namedFlavor("black"), {
                  lang: "en",
                }),
              ),
            },
            center: [10, 50],
            zoom: 4,
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
            // Keep the view inside the area we actually extracted, so the
            // uncovered rest of the world never shows as blank.
            maxBounds: [
              [COVERAGE_BBOX.west, COVERAGE_BBOX.south],
              [COVERAGE_BBOX.east, COVERAGE_BBOX.north],
            ],
            attributionControl: false,
            dragRotate: false,
            pitchWithRotate: false,
            // Backdrop use (the landing) passes interactive=false to freeze it.
            interactive,
          });
        } catch {
          if (!cancelled) onFail?.();
          return;
        }
        mapRef.current = map;
        if (controls) {
          map.addControl(
            new maplibregl.NavigationControl({ showCompass: false }),
            "bottom-right",
          );
          // Required OpenStreetMap attribution. Compact = a small "ⓘ" that expands
          // on click, so the map still reads as ours while staying ODbL-compliant.
          // customAttribution guarantees it regardless of source-load timing; it
          // matches the source string above, so MapLibre shows it once, not twice.
          map.addControl(
            new maplibregl.AttributionControl({
              compact: true,
              customAttribution: ATTRIB,
            }),
            "bottom-right",
          );
        }
        // Backdrop use turns controls off (they would be blurred); the landing
        // prints its own sharp OpenStreetMap credit to stay ODbL-compliant.

        const applyScale = () =>
          containerRef.current?.style.setProperty(
            "--mk",
            zoomScale(map.getZoom()).toFixed(3),
          );
        applyScale();
        map.on("zoom", applyScale);
        // `move` fires for both pan and zoom, so one listener keeps the codes in
        // step with either gesture.
        map.on("move", scheduleLabels);
        map.on("error", () => {});
        map.on("load", () => {
          if (cancelled) return;
          map.resize();
          readyRef.current = true;
          rebuildMarkers();
        });
      })();

      return () => {
        cancelled = true;
        if (labelRaf) cancelAnimationFrame(labelRaf);
        if (map) map.remove();
        mapRef.current = null;
        readyRef.current = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // rebuild markers when the dataset changes (once ready)
    useEffect(() => {
      if (readyRef.current) rebuildRef.current();
    }, [markers]);

    // reflect the active airport without rebuilding, and re-run the label pass so
    // the newly selected airport's code is forced to the front
    useEffect(() => {
      markerEls.current.forEach((el, id) =>
        el.classList.toggle("marker--active", id === activeId),
      );
      scheduleLabelsRef.current();
    }, [activeId]);

    // Outer div owns the absolute full-screen box; the inner (map) div fills it
    // via h/w-full. MapLibre's own CSS forces position:relative on its container,
    // which would cancel `absolute inset-0` and collapse it to height 0 — so the
    // sizing must come from the wrapper, not from inset.
    return (
      <div className="absolute inset-0 z-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  },
);

export default VectorBasemap;
