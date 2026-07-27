"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AirportMarker, AirportDetail, SearchHit } from "@/lib/types";
import { BasemapHandle, hasWebGL } from "@/lib/basemap";
import AirportPanel from "./AirportPanel";
import RasterBasemap from "./RasterBasemap";
import VectorBasemap from "./VectorBasemap";

interface Props {
  markers: AirportMarker[];
  loadError: string | null;
}

type Engine = "vector" | "raster";

export default function MapView({ markers, loadError }: Props) {
  const basemapRef = useRef<BasemapHandle>(null);
  const detailCache = useRef<Map<string, AirportDetail>>(new Map());
  const activeIdRef = useRef<string | null>(null);

  const [engine, setEngine] = useState<Engine | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AirportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [serverResults, setServerResults] = useState<SearchHit[] | null>(null);
  const [orgFilter, setOrgFilter] = useState<{
    orgIds: string[];
    label: string;
  } | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  // pick the engine on the client (vector needs WebGL; raster works everywhere)
  useEffect(() => {
    setEngine(hasWebGL() ? "vector" : "raster");
  }, []);

  // On phones the search bar sits at the bottom of the screen, where the
  // on-screen keyboard would cover it. The visual viewport tells us how much of
  // the layout viewport the keyboard eats, so the bar can be lifted above it.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      // A keyboard eats ~300px; anything smaller is browser chrome moving, so
      // the threshold sits well clear of a toolbar's height.
      setKeyboardInset(hidden > 150 ? Math.round(hidden) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const totalOrgs = useMemo(
    () => markers.reduce((sum, m) => sum + m.orgCount, 0),
    [markers],
  );

  // Instant, local matches on the airport's own fields — shown while the
  // server answers so typing never feels laggy.
  const localResults = useMemo<SearchHit[]>(() => {
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
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        iata: m.iata,
        icao: m.icao,
        name: m.name,
        city: m.city,
        countryCode: m.countryCode,
        orgCount: m.orgCount,
        totalOrgCount: m.orgCount,
        matchedOrgIds: [],
        matchedOrgs: [],
        matchedScope: [],
      }));
  }, [search, markers]);

  // Full-text search across organisation names and certified scope, which is
  // far too much data to ship to the browser — so it runs on the server.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setServerResults(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`search failed (${res.status})`);
        const data: { results?: SearchHit[] } = await res.json();
        setServerResults(data.results ?? []);
      } catch {
        // keep showing the local matches if the request fails or is aborted
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [search]);

  // Only airports we can actually place on the map are selectable.
  const searchResults = useMemo<SearchHit[]>(() => {
    const list = serverResults ?? localResults;
    if (!serverResults) return list;
    const placeable = new Set(markers.map((m) => m.id));
    return list.filter((r) => placeable.has(r.id));
  }, [serverResults, localResults, markers]);

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
    (id: string, filter?: { orgIds: string[]; label: string } | null) => {
      activeIdRef.current = id;
      setActiveId(id);
      // picking a pin off the map shows everything; picking a search result
      // carries the query through as a filter on the organisations
      setOrgFilter(filter?.orgIds.length ? filter : null);
      const m = markers.find((x) => x.id === id);
      if (m) basemapRef.current?.flyTo(m);
      loadDetail(id);
    },
    [markers, loadDetail],
  );

  const closePanel = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
    setDetail(null);
    setDetailError(null);
    setOrgFilter(null);
  }, []);

  const onVectorFail = useCallback(() => setEngine("raster"), []);

  const activeMarker = activeId
    ? markers.find((m) => m.id === activeId) ?? null
    : null;

  const suggestionsOpen = searchFocused && searchResults.length > 0;

  // rendered in two spots: above the search bar on mobile, bottom-left on ≥sm
  const counts =
    !loadError && markers.length > 0 ? (
      <p className="text-[11px] uppercase tracking-wide2 text-white/45">
        <span className="text-white/80">{markers.length}</span> airports
        <span className="mx-2 text-white/20">/</span>
        <span className="text-white/80">{totalOrgs}</span> stations
      </p>
    ) : null;

  return (
    <div className="h-viewport relative w-screen overflow-hidden bg-black">
      {engine === "vector" && (
        <VectorBasemap
          ref={basemapRef}
          markers={markers}
          activeId={activeId}
          onSelect={selectAirport}
          onFail={onVectorFail}
        />
      )}
      {engine === "raster" && (
        <RasterBasemap
          ref={basemapRef}
          markers={markers}
          activeId={activeId}
          onSelect={selectAirport}
        />
      )}

      {/* top scrim for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] h-24 bg-gradient-to-b from-black/80 to-transparent sm:h-40" />
      {/* bottom scrim — mobile only, where the search bar lives */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[400] h-36 bg-gradient-to-t from-black/85 to-transparent sm:hidden" />

      {/* Brand + search. ≥sm: stacked in the top-left corner. Mobile: the brand
          stays up top and the search bar is pinned to the bottom of the screen,
          within thumb reach (and lifted when the keyboard opens). */}
      <div
        className={`pointer-events-none absolute inset-0 z-[500] flex-col p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:inset-auto sm:left-0 sm:top-0 sm:flex sm:w-full sm:max-w-md sm:gap-4 sm:p-6 ${
          // the panel is full-screen on mobile — don't let the bar glow through it
          activeId ? "hidden" : "flex"
        }`}
        style={
          keyboardInset ? { paddingBottom: keyboardInset + 12 } : undefined
        }
      >
        <div className="select-none">
          <h1 className="text-lg font-normal tracking-brand text-white sm:text-xl">
            ONE<span className="text-accent-bright">4</span>FIVE
          </h1>
          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-brand text-accent-bright/80">
            Part-145 · MRO · Europe
          </p>
        </div>

        {/* pushes the search bar to the bottom edge on mobile only */}
        <div className="flex-1 sm:hidden" />

        {/* search box */}
        <div className="pointer-events-auto relative">
          <div className="flex items-center gap-2 rounded-[2px] border border-white/10 bg-[#141414]/45 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-xl transition focus-within:border-accent/60 focus-within:bg-[#141414]/60">
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
              // 16px on mobile keeps iOS from zooming the page in on focus
              className="w-full bg-transparent text-base text-white placeholder:text-white/35 focus:outline-none sm:text-sm"
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

          {suggestionsOpen && (
            /* opens upward on mobile (the bar is at the bottom), downward on ≥sm */
            <div className="scroll-thin absolute bottom-full mb-2 max-h-[45vh] w-full overflow-y-auto rounded-[2px] border border-white/10 bg-[#141414]/80 py-1 shadow-2xl backdrop-blur-xl sm:bottom-auto sm:top-full sm:mb-0 sm:mt-2 sm:max-h-80">
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const label = search.trim();
                    setSearch("");
                    selectAirport(m.id, { orgIds: m.matchedOrgIds, label });
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
                    {/* why this airport matched, when it wasn't the name */}
                    {m.matchedOrgs.length > 0 && (
                      <span className="mt-0.5 block truncate text-[11px] text-accent-bright/70">
                        {m.matchedOrgs.join(" · ")}
                      </span>
                    )}
                    {m.matchedScope.length > 0 && (
                      <span className="mt-0.5 block truncate text-[11px] text-white/45">
                        {m.matchedScope.join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-accent-bright">
                      {m.iata ?? m.icao}
                    </span>
                    <span
                      className="rounded-[2px] bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60"
                      title={
                        m.orgCount < m.totalOrgCount
                          ? `${m.orgCount} of ${m.totalOrgCount} organisations match`
                          : `${m.orgCount} organisations`
                      }
                    >
                      {m.orgCount < m.totalOrgCount
                        ? `${m.orgCount}/${m.totalOrgCount}`
                        : m.orgCount}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* stats sit under the search bar on mobile; the suggestions open
            upwards from the bar, so they never cover this line */}
        {counts && (
          <div className="mt-2 select-none px-0.5 sm:hidden">{counts}</div>
        )}
      </div>

      {/* bottom-left stats (≥sm — on mobile they sit under the search bar) */}
      {counts && (
        <div className="pointer-events-none absolute bottom-6 left-6 z-[500] hidden select-none sm:block">
          {counts}
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
          orgFilter={orgFilter}
          onClearFilter={() => setOrgFilter(null)}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
