"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BasemapHandle,
  BasemapProps,
  createMarkerElement,
  zoomScale,
  panelOffsetPx,
  COVERAGE_BBOX,
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
const GLYPHS =
  "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
const SPRITE = "https://protomaps.github.io/basemaps-assets/sprites/v4/light";
const ATTRIB =
  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>';

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
  function VectorBasemap({ markers, activeId, onSelect, onFail }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const glRef = useRef<any>(null);
    const markerEls = useRef<Map<string, HTMLElement>>(new Map());
    const markerObjs = useRef<any[]>([]);
    const readyRef = useRef(false);
    const rebuildRef = useRef<() => void>(() => {});

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
      };
      rebuildRef.current = rebuildMarkers;

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
          });
        } catch {
          if (!cancelled) onFail?.();
          return;
        }
        mapRef.current = map;
        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "bottom-right",
        );

        const applyScale = () =>
          containerRef.current?.style.setProperty(
            "--mk",
            zoomScale(map.getZoom()).toFixed(3),
          );
        applyScale();
        map.on("zoom", applyScale);
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

    // reflect the active airport without rebuilding
    useEffect(() => {
      markerEls.current.forEach((el, id) =>
        el.classList.toggle("marker--active", id === activeId),
      );
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
