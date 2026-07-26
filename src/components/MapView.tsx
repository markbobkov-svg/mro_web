"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { AirportMarker, AirportDetail } from "@/lib/types";
import AirportPanel from "./AirportPanel";

// Free CARTO "dark matter" RASTER tiles — plain <img> tiles rendered by Leaflet
// with no WebGL, so the dark world map shows in every browser regardless of GPU
// / hardware-acceleration settings. CORS-enabled, no token.
const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

interface Props {
  markers: AirportMarker[];
  loadError: string | null;
}

export default function MapView({ markers, loadError }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markerObjs = useRef<Map<string, any>>(new Map());
  const detailCache = useRef<Map<string, AirportDetail>>(new Map());
  const activeIdRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AirportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const totalOrgs = useMemo(
    () => markers.reduce((sum, m) => sum + m.orgCount, 0),
    [markers],
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return markers
      .filter(
        (m) =>
          m.iata?.toLowerCase().includes(q) ||
          m.icao?.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.city?.toLowerCase().includes(q),
      )
      .sort((a, b) => b.orgCount - a.orgCount)
      .slice(0, 8);
  }, [search, markers]);

  const loadDetail = useCallback(async (id: string) => {
    const cached = detailCache.current.get(id);
    if (cached) {
      setDetail(cached);
      setLoadingDetail(false);
      setDetailError(null);
      return;
    }
    setDetail(null);
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/airports/${id}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: AirportDetail = await res.json();
      detailCache.current.set(id, data);
      if (activeIdRef.current === id) {
        setDetail(data);
        setLoadingDetail(false);
      }
    } catch (err) {
      if (activeIdRef.current === id) {
        setDetailError(
          err instanceof Error ? err.message : "Failed to load organisations",
        );
        setLoadingDetail(false);
      }
    }
  }, []);

  const setActiveMarkerClass = useCallback((id: string | null) => {
    markerObjs.current.forEach((mk, key) => {
      const el = mk.getElement?.();
      if (el) el.classList.toggle("marker--active", key === id);
    });
  }, []);

  const selectAirport = useCallback(
    (id: string) => {
      activeIdRef.current = id;
      setActiveId(id);
      setActiveMarkerClass(id);
      const m = markers.find((x) => x.id === id);
      const map = mapRef.current;
      if (m && map) {
        const [lng, lat] = m.coordinates;
        const targetZoom = Math.max(map.getZoom(), 8);
        let center: any = [lat, lng];
        // shift the target left so the pin isn't hidden behind the right panel
        if (typeof window !== "undefined" && window.innerWidth >= 640) {
          const pt = map.project([lat, lng], targetZoom).subtract([210, 0]);
          center = map.unproject(pt, targetZoom);
        }
        map.flyTo(center, targetZoom, { duration: 0.8 });
      }
      loadDetail(id);
    },
    [markers, loadDetail, setActiveMarkerClass],
  );

  const closePanel = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
    setDetail(null);
    setDetailError(null);
    setActiveMarkerClass(null);
  }, [setActiveMarkerClass]);

  // Initialise the map once.
  useEffect(() => {
    let cancelled = false;
    let map: any;
    (async () => {
      const L = (await import("leaflet")).default;
      leafletRef.current = L;
      if (cancelled || !mapContainer.current || mapRef.current) return;
      map = L.map(mapContainer.current, {
        center: [50, 10],
        zoom: 4,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false,
        worldCopyJump: true,
        attributionControl: true,
        // default wheel zoom (one level per notch) — clear and reliable; the
        // smooth feel comes from Leaflet's zoom animation + the tile options.
      });
      L.tileLayer(TILE_URL, {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: TILE_ATTRIB,
        crossOrigin: true,
        // Preload a wide ring so zooming out / panning doesn't reveal blanks.
        keepBuffer: 6,
        // Failed/rate-limited tiles render as a solid dark pixel (the map's own
        // colour, #0a0e16) instead of the browser's white broken-image box.
        errorTileUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg4hMDAABUAC9qIiHaAAAAAElFTkSuQmCC",
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapRef.current = map;

      // Scale the airport points with the zoom level via the --mk CSS variable.
      const applyMarkerScale = () => {
        const z = map.getZoom();
        // Cap at the original size (1×) when zoomed in; shrink below 1× as you
        // zoom out so the dense clusters stop overlapping.
        const scale = Math.max(0.4, Math.min(1, 1 - (7 - z) * 0.13));
        mapContainer.current?.style.setProperty("--mk", scale.toFixed(3));
      };
      applyMarkerScale();
      map.on("zoom", applyMarkerScale);
      map.on("zoomend", applyMarkerScale);

      // container may have been 0-sized during hydration
      setTimeout(() => {
        if (!cancelled && mapRef.current) mapRef.current.invalidateSize();
      }, 0);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  // Place markers once the map is ready (or when the data changes).
  useEffect(() => {
    if (!ready || !mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;

    markerObjs.current.forEach((mk) => map.removeLayer(mk));
    markerObjs.current.clear();

    for (const m of markers) {
      const [lng, lat] = m.coordinates;
      const icon = L.divIcon({
        className: "marker" + (m.orgCount >= 5 ? " marker--lg" : ""),
        html: '<span class="marker__scale"><span class="marker__pulse"></span><span class="marker__dot"></span></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const code = m.iata ?? m.icao ?? "";
      const marker = L.marker([lat, lng], {
        icon,
        title: `${code ? code + " — " : ""}${m.name}${
          m.city ? ", " + m.city : ""
        } · ${m.orgCount} MRO`,
        keyboard: false,
      });
      marker.on("click", () => selectAirport(m.id));
      marker.addTo(map);
      markerObjs.current.set(m.id, marker);
    }
  }, [ready, markers, selectAirport]);

  const activeMarker = activeId
    ? markers.find((m) => m.id === activeId) ?? null
    : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <div ref={mapContainer} className="absolute inset-0 z-0" />

      {/* top scrim for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] h-40 bg-gradient-to-b from-black/80 to-transparent" />

      {/* brand + search */}
      <div className="absolute left-0 top-0 z-[500] flex w-full max-w-md flex-col gap-4 p-5 sm:p-6">
        <div className="pointer-events-none select-none">
          <h1 className="text-lg font-medium tracking-brand text-white sm:text-xl">
            MRO&nbsp;FINDER
          </h1>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-brand text-accent-bright/80">
            Part-145 · Line Maintenance · Europe
          </p>
        </div>

        {/* search box */}
        <div className="pointer-events-auto relative">
          <div className="flex items-center gap-2 rounded-[2px] border border-white/10 bg-base-900/80 px-3 py-2 backdrop-blur-md transition focus-within:border-accent/60">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className="shrink-0 text-white/40"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path
                d="M21 21l-4.3-4.3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Search airport, city or code…"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="shrink-0 text-white/40 hover:text-white"
                aria-label="Clear"
              >
                ✕
              </button>
            )}
          </div>

          {searchFocused && searchResults.length > 0 && (
            <div className="scroll-thin absolute mt-2 max-h-80 w-full overflow-y-auto rounded-[2px] border border-white/10 bg-base-900/95 py-1 shadow-2xl backdrop-blur-md">
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearch("");
                    selectAirport(m.id);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">
                      {m.name}
                    </span>
                    <span className="block truncate text-xs text-white/40">
                      {m.city ? m.city + " · " : ""}
                      {m.countryCode ?? ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-accent-bright">
                      {m.iata ?? m.icao}
                    </span>
                    <span className="rounded-[2px] bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                      {m.orgCount}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* bottom-left stats */}
      {!loadError && markers.length > 0 && (
        <div className="pointer-events-none absolute bottom-5 left-5 z-[500] select-none sm:bottom-6 sm:left-6">
          <p className="text-[11px] uppercase tracking-wide2 text-white/45">
            <span className="text-white/80">{markers.length}</span> airports
            <span className="mx-2 text-white/20">/</span>
            <span className="text-white/80">{totalOrgs}</span> stations
          </p>
        </div>
      )}

      {/* error / empty toasts */}
      {loadError && (
        <div className="absolute bottom-6 left-1/2 z-[600] -translate-x-1/2 rounded-[2px] border border-red-500/30 bg-red-950/70 px-4 py-2 text-xs text-red-200 backdrop-blur">
          Could not load data: {loadError}
        </div>
      )}
      {!loadError && markers.length === 0 && (
        <div className="absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-1/2 select-none text-center">
          <p className="text-sm text-white/50">No airports to display yet.</p>
        </div>
      )}

      {/* detail panel */}
      {activeId && activeMarker && (
        <AirportPanel
          marker={activeMarker}
          detail={detail}
          loading={loadingDetail}
          error={detailError}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
