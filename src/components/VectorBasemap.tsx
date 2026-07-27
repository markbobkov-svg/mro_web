"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  BasemapHandle,
  BasemapProps,
  createMarkerElement,
  zoomScale,
  PANEL_OFFSET_PX,
} from "@/lib/basemap";

// maplibre-gl + pmtiles + @protomaps/basemaps are loaded from a CDN at runtime
// (the same setup as the Protomaps demo). Loading maplibre this way also sizes
// its worker correctly; the container-height fix (wrapper below) is what makes
// it paint.
const CDN = {
  maplibreJs: "https://unpkg.com/maplibre-gl@5.0.1/dist/maplibre-gl.js",
  maplibreCss: "https://unpkg.com/maplibre-gl@5.0.1/dist/maplibre-gl.css",
  pmtiles: "https://unpkg.com/pmtiles@4.2.1/dist/pmtiles.js",
  basemaps: "https://unpkg.com/@protomaps/basemaps@5.7.2/dist/basemaps.js",
};

// Protomaps "black" basemap — a very dark vector theme; English labels.
// The PMTiles are served same-origin through our /api/basemap proxy (the
// Protomaps demo bucket blocks cross-origin browser reads via CORS).
const PMTILES_PROXY_PATH = "/api/basemap";
const GLYPHS =
  "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
const SPRITE = "https://protomaps.github.io/basemaps-assets/sprites/v4/light";
const ATTRIB =
  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>';

// Declutter the basemap for an aviation map: drop road lines/labels (keeping
// only airport runways & taxiways), city/town/suburb labels, and buildings.
// Country / region / water labels, borders and land/water stay for orientation.
const HIDE_LAYERS = new Set([
  "places_locality",
  "places_subplace",
  "buildings",
  "address_label",
]);
const KEEP_ROADS = new Set(["roads_runway", "roads_taxiway"]);
function tidyLayers(layers: any[]): any[] {
  return layers.filter(
    (l) =>
      !HIDE_LAYERS.has(l.id) &&
      !(l.id.startsWith("roads_") && !KEEP_ROADS.has(l.id)),
  );
}

interface Libs {
  maplibregl: any;
  pmtiles: any;
  basemaps: any;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

let libsPromise: Promise<Libs> | null = null;
function loadLibs(): Promise<Libs> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  const w = window as any;
  if (w.maplibregl && w.pmtiles && w.basemaps) {
    return Promise.resolve({
      maplibregl: w.maplibregl,
      pmtiles: w.pmtiles,
      basemaps: w.basemaps,
    });
  }
  if (libsPromise) return libsPromise;
  libsPromise = (async () => {
    if (!document.querySelector(`link[href="${CDN.maplibreCss}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = CDN.maplibreCss;
      document.head.appendChild(l);
    }
    await loadScript(CDN.maplibreJs);
    await Promise.all([loadScript(CDN.pmtiles), loadScript(CDN.basemaps)]);
    if (!w.maplibregl || !w.pmtiles || !w.basemaps) {
      throw new Error("map libraries missing after load");
    }
    return {
      maplibregl: w.maplibregl,
      pmtiles: w.pmtiles,
      basemaps: w.basemaps,
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
        const wide = typeof window !== "undefined" && window.innerWidth >= 640;
        map.flyTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), 8),
          offset: wide ? [-PANEL_OFFSET_PX, 0] : [0, 0],
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
                  url: `pmtiles://${window.location.origin}${PMTILES_PROXY_PATH}`,
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
            minZoom: 2,
            maxZoom: 17,
            attributionControl: true,
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
