"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  BasemapHandle,
  BasemapProps,
  createMarkerElement,
  zoomScale,
  PANEL_OFFSET_PX,
} from "@/lib/basemap";

// MapLibre GL is loaded from a CDN at runtime (the same way the Protomaps demo
// does) rather than bundled — this avoids the Next.js/webpack worker-bundling
// issue that left the canvas blank when maplibre-gl was imported as a module.
const MAPLIBRE_VER = "5.0.1";
const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VER}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VER}/dist/maplibre-gl.css`;

// Free CARTO "dark matter" VECTOR style (GPU, smooth zoom) — no API token.
const VECTOR_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

let maplibrePromise: Promise<any> | null = null;
function loadMaplibre(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  const w = window as any;
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  if (maplibrePromise) return maplibrePromise;
  maplibrePromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = MAPLIBRE_CSS;
      document.head.appendChild(css);
    }
    const s = document.createElement("script");
    s.src = MAPLIBRE_JS;
    s.async = true;
    s.onload = () =>
      w.maplibregl
        ? resolve(w.maplibregl)
        : reject(new Error("maplibregl missing after load"));
    s.onerror = () => reject(new Error("failed to load maplibre-gl"));
    document.head.appendChild(s);
  });
  return maplibrePromise;
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
        let maplibregl: any;
        try {
          maplibregl = await loadMaplibre();
        } catch {
          if (!cancelled) onFail?.();
          return;
        }
        if (cancelled || !containerRef.current || mapRef.current) return;
        glRef.current = maplibregl;
        try {
          map = new maplibregl.Map({
            container: containerRef.current,
            style: VECTOR_STYLE,
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
