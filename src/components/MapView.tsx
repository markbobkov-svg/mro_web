"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AirportMarker, AirportDetail } from "@/lib/types";
import AirportPanel from "./AirportPanel";

// Free CARTO dark vector basemap — no API token required.
const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface Props {
  markers: AirportMarker[];
  loadError: string | null;
}

export default function MapView({ markers, loadError }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerEls = useRef<Map<string, HTMLElement>>(new Map());
  const markerObjs = useRef<any[]>([]);
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
      .filter((m) => {
        return (
          m.iata?.toLowerCase().includes(q) ||
          m.icao?.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.city?.toLowerCase().includes(q)
        );
      })
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

  const selectAirport = useCallback(
    (id: string) => {
      activeIdRef.current = id;
      setActiveId(id);
      markerEls.current.forEach((el, key) =>
        el.classList.toggle("marker--active", key === id),
      );
      const m = markers.find((x) => x.id === id);
      if (m && mapRef.current) {
        const isSmall = window.innerWidth < 640;
        mapRef.current.flyTo({
          center: m.coordinates,
          zoom: Math.max(mapRef.current.getZoom(), 8),
          duration: 900,
          essential: true,
          padding: isSmall ? { bottom: 0 } : { right: 440 },
        });
      }
      loadDetail(id);
    },
    [markers, loadDetail],
  );

  const closePanel = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
    setDetail(null);
    setDetailError(null);
    markerEls.current.forEach((el) => el.classList.remove("marker--active"));
  }, []);

  // Initialise the map once.
  useEffect(() => {
    let cancelled = false;
    let map: any;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !mapContainer.current) return;
      map = new maplibregl.Map({
        container: mapContainer.current,
        style: MAP_STYLE,
        center: [10, 50],
        zoom: 3.6,
        minZoom: 2,
        maxZoom: 15,
        attributionControl: false,
        dragRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right",
      );
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right",
      );
      mapRef.current = map;
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      // Swallow tile/style network errors so the console stays clean.
      map.on("error", () => {});
      // Fallback: markers are DOM overlays and don't need the basemap style, so
      // render them even if the style is slow or unreachable (blank dark map is
      // still usable via search + pins).
      fallbackTimer = setTimeout(() => {
        if (!cancelled) setReady(true);
      }, 3500);
    })();
    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (map) map.remove();
    };
  }, []);

  // Place markers once the map is ready (or when the data changes).
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;
      const map = mapRef.current;

      markerObjs.current.forEach((mk) => mk.remove());
      markerObjs.current = [];
      markerEls.current.clear();

      for (const m of markers) {
        const el = document.createElement("div");
        el.className = "marker" + (m.orgCount >= 5 ? " marker--lg" : "");
        el.innerHTML =
          '<span class="marker__pulse"></span><span class="marker__dot"></span>';
        const code = m.iata ?? m.icao ?? "";
        el.title = `${code ? code + " — " : ""}${m.name}${
          m.city ? ", " + m.city : ""
        } · ${m.orgCount} MRO`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          selectAirport(m.id);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(m.coordinates)
          .addTo(map);
        markerObjs.current.push(marker);
        markerEls.current.set(m.id, el);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, markers, selectAirport]);

  const activeMarker = activeId
    ? markers.find((m) => m.id === activeId) ?? null
    : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* top scrim for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent" />

      {/* brand + search */}
      <div className="absolute left-0 top-0 z-20 flex w-full max-w-md flex-col gap-4 p-5 sm:p-6">
        <div className="pointer-events-none select-none">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-medium tracking-brand text-white sm:text-xl">
              MRO&nbsp;FINDER
            </h1>
          </div>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-brand text-accent-bright/80">
            Part-145 · Line Maintenance · Europe
          </p>
        </div>

        {/* search box */}
        <div className="pointer-events-auto relative">
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-base-900/80 px-3 py-2 backdrop-blur-md transition focus-within:border-accent/60">
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
            <div className="scroll-thin absolute mt-2 max-h-80 w-full overflow-y-auto rounded-md border border-white/10 bg-base-900/95 py-1 shadow-2xl backdrop-blur-md">
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
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
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
        <div className="pointer-events-none absolute bottom-5 left-5 z-10 select-none sm:bottom-6 sm:left-6">
          <p className="text-[11px] uppercase tracking-wide2 text-white/45">
            <span className="text-white/80">{markers.length}</span> airports
            <span className="mx-2 text-white/20">/</span>
            <span className="text-white/80">{totalOrgs}</span> stations
          </p>
        </div>
      )}

      {/* error / empty toasts */}
      {loadError && (
        <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-md border border-red-500/30 bg-red-950/70 px-4 py-2 text-xs text-red-200 backdrop-blur">
          Could not load data: {loadError}
        </div>
      )}
      {!loadError && markers.length === 0 && (
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 select-none text-center">
          <p className="text-sm text-white/50">No airports to display yet.</p>
          <p className="mt-1 text-xs text-white/30">
            The database returned no stations with a locatable airport.
          </p>
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
