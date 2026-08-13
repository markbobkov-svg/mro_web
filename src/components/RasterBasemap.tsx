"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { AirportMarker } from "@/lib/types";
import "leaflet/dist/leaflet.css";
import {
  BasemapHandle,
  BasemapProps,
  markerParts,
  pickLabels,
  zoomScale,
  panelOffsetPx,
  COVERAGE_BBOX,
  LABEL_MIN_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
} from "@/lib/basemap";

// RASTER tiles — plain <img> tiles (no WebGL). Fallback for browsers without
// WebGL (rare). Defaults to CARTO's public "dark matter" CDN, but overridable:
// CARTO's free basemaps carry usage limits that a commercial product may exceed,
// so this can be repointed at our own raster tiles or a licensed provider
// without a code change. Keep the attribution in step with whatever URL is set.
const TILE_URL =
  process.env.NEXT_PUBLIC_RASTER_TILES_URL ??
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIB =
  process.env.NEXT_PUBLIC_RASTER_ATTRIB ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
// solid dark 1×1 pixel — failed tiles blend into the map instead of flashing white
const ERROR_TILE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg4hMDAABUAC9qIiHaAAAAAElFTkSuQmCC";

const RasterBasemap = forwardRef<BasemapHandle, BasemapProps>(
  function RasterBasemap({ markers, activeId, onSelect }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const LRef = useRef<any>(null);
    const markerObjs = useRef<Map<string, any>>(new Map());
    const [ready, setReady] = useState(false);
    // Busiest-first order for stable label priority; the current active id read
    // from a ref so the label pass (a stable init-time closure) sees the latest.
    const orderedRef = useRef<AirportMarker[]>([]);
    const activeIdRef = useRef<string | null>(activeId);
    activeIdRef.current = activeId;
    const scheduleLabelsRef = useRef<() => void>(() => {});

    useImperativeHandle(ref, () => ({
      flyTo: (m) => {
        const map = mapRef.current;
        if (!map) return;
        const [lng, lat] = m.coordinates;
        const targetZoom = Math.max(map.getZoom(), 8);
        const off =
          typeof window !== "undefined" ? panelOffsetPx(window.innerWidth) : 0;
        let center: any = [lat, lng];
        if (off > 0) {
          const pt = map.project([lat, lng], targetZoom).subtract([off, 0]);
          center = map.unproject(pt, targetZoom);
        }
        map.flyTo(center, targetZoom, { duration: 0.8 });
      },
    }));

    // init once
    useEffect(() => {
      let cancelled = false;
      let map: any;
      let labelRaf = 0;
      (async () => {
        const L = (await import("leaflet")).default;
        LRef.current = L;
        if (cancelled || !containerRef.current || mapRef.current) return;
        map = L.map(containerRef.current, {
          center: [50, 10],
          zoom: 4,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          zoomControl: false,
          attributionControl: false,
          // Match the vector map: keep the view within our coverage area.
          maxBounds: [
            [COVERAGE_BBOX.south, COVERAGE_BBOX.west],
            [COVERAGE_BBOX.north, COVERAGE_BBOX.east],
          ],
          maxBoundsViscosity: 1,
        });
        L.tileLayer(TILE_URL, {
          subdomains: "abcd",
          maxZoom: 20,
          attribution: TILE_ATTRIB,
          crossOrigin: true,
          keepBuffer: 6,
          errorTileUrl: ERROR_TILE,
        }).addTo(map);
        L.control.zoom({ position: "bottomright" }).addTo(map);
        // Required OpenStreetMap attribution (prefix:false drops Leaflet's own
        // "Leaflet" credit so only the data attribution shows).
        L.control
          .attribution({ position: "bottomright", prefix: false })
          .addAttribution(TILE_ATTRIB)
          .addTo(map);
        mapRef.current = map;

        const applyScale = () =>
          containerRef.current?.style.setProperty(
            "--mk",
            zoomScale(map.getZoom()).toFixed(3),
          );
        applyScale();
        map.on("zoom", applyScale);
        map.on("zoomend", applyScale);

        // Reveal each dot's code once zoomed in past LABEL_MIN_ZOOM, picking the
        // set that fits without overlapping. Selected airport goes first so its
        // code always shows.
        let labelsOn = false;
        const updateLabels = () => {
          const mp = mapRef.current;
          if (!mp) return;
          const els = markerObjs.current;
          if (mp.getZoom() < LABEL_MIN_ZOOM) {
            if (labelsOn) {
              els.forEach((mk) =>
                mk.getElement?.()?.classList.remove("marker--label"),
              );
              labelsOn = false;
            }
            return;
          }
          labelsOn = true;
          const active = activeIdRef.current;
          const b = orderedRef.current;
          const ordered =
            active && els.has(active)
              ? [
                  ...b.filter((mk) => mk.id === active),
                  ...b.filter((mk) => mk.id !== active),
                ]
              : b;
          const size = mp.getSize();
          const shown = pickLabels(
            ordered,
            ([lng, lat]) => {
              const pt = mp.latLngToContainerPoint([lat, lng]);
              return pt ? { x: pt.x, y: pt.y } : null;
            },
            { width: size.x, height: size.y },
          );
          els.forEach((mk, id) => {
            const el = mk.getElement?.();
            if (el) el.classList.toggle("marker--label", shown.has(id));
          });
        };
        // Coalesce the burst of move/zoom events into one recompute per frame.
        const scheduleLabels = () => {
          if (labelRaf) return;
          labelRaf = requestAnimationFrame(() => {
            labelRaf = 0;
            updateLabels();
          });
        };
        scheduleLabelsRef.current = scheduleLabels;
        map.on("move", scheduleLabels);
        map.on("zoom", scheduleLabels);

        setTimeout(() => {
          if (!cancelled && mapRef.current) mapRef.current.invalidateSize();
        }, 0);
        setReady(true);
      })();
      return () => {
        cancelled = true;
        if (labelRaf) cancelAnimationFrame(labelRaf);
        if (map) map.remove();
        mapRef.current = null;
      };
    }, []);

    // (re)build markers
    useEffect(() => {
      if (!ready || !mapRef.current || !LRef.current) return;
      const L = LRef.current;
      const map = mapRef.current;
      markerObjs.current.forEach((mk) => map.removeLayer(mk));
      markerObjs.current.clear();
      for (const m of markers) {
        const [lng, lat] = m.coordinates;
        const { className, html, title } = markerParts(m);
        const icon = L.divIcon({
          className,
          html,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const marker = L.marker([lat, lng], { icon, title, keyboard: false });
        marker.on("click", () => onSelect(m.id));
        marker.addTo(map);
        markerObjs.current.set(m.id, marker);
      }
      orderedRef.current = [...markers].sort((a, b) => b.orgCount - a.orgCount);
      scheduleLabelsRef.current();
    }, [ready, markers, onSelect]);

    // reflect the active airport, and re-run the label pass so the newly selected
    // airport's code is forced to the front
    useEffect(() => {
      markerObjs.current.forEach((mk, id) => {
        const el = mk.getElement?.();
        if (el) el.classList.toggle("marker--active", id === activeId);
      });
      scheduleLabelsRef.current();
    }, [activeId]);

    return (
      <div className="absolute inset-0 z-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  },
);

export default RasterBasemap;
