"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AirportMarker, AirportDetail, SearchHit } from "@/lib/types";
import { BasemapHandle, hasWebGL } from "@/lib/basemap";
import AirportPanel from "./AirportPanel";
import RasterBasemap from "./RasterBasemap";
import VectorBasemap from "./VectorBasemap";
import { signOutAction } from "@/app/(account)/actions";

interface Props {
  markers: AirportMarker[];
  /** Distinct organisations across all airports (one org, many stations). */
  organisationCount: number;
  loadError: string | null;
  /** Frame the markers on load rather than the whole-Europe default — set when
   *  the signed-in viewer is an MRO seeing only its own stations. */
  fitToMarkers?: boolean;
  /** The viewer is a scoped MRO (sees only its own network) — shows a quiet
   *  "only your stations" note so an empty-looking map is never a surprise. */
  scoped?: boolean;
  /** Where the top-right Dashboard button opens (in a right slide-in drawer):
   *  airlines to /airline, everyone else to /dashboard. */
  dashboardHref?: string;
}

type Engine = "vector" | "raster";

export default function MapView({
  markers,
  organisationCount,
  loadError,
  fitToMarkers = false,
  scoped = false,
  dashboardHref = "/dashboard",
}: Props) {
  const basemapRef = useRef<BasemapHandle>(null);
  const detailCache = useRef<Map<string, AirportDetail>>(new Map());
  const activeIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const dashboardIframeRef = useRef<HTMLIFrameElement>(null);
  // Live state of a swipe-to-close drag on the dashboard drawer (touch only).
  const swipe = useRef<{ x: number; y: number; w: number; axis: "" | "h" | "v"; dx: number } | null>(null);

  const [engine, setEngine] = useState<Engine | null>(null);
  // The dashboard opens in a right slide-in drawer (an iframe of the user's own
  // dashboard); mounted lazily on first open, then kept so it doesn't reload.
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dashboardMounted, setDashboardMounted] = useState(false);
  // Rightward drag offset (px) while swiping the drawer closed; null when idle.
  const [swipeX, setSwipeX] = useState<number | null>(null);
  // The iframe paints its own dark theme only once loaded; until then a dark
  // veil hides the browser's default white canvas. True until the first load.
  const [iframeLoading, setIframeLoading] = useState(true);
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
  // Which suggestion the keyboard has highlighted (-1 = none).
  const [activeIndex, setActiveIndex] = useState(-1);

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

  // Each pin's orgCount is the orgs at that airport; summed, that's the number
  // of stations (an org staffing several airports is counted at each one).
  const totalStations = useMemo(
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

  // Reset the keyboard highlight as the query (and result list) changes.
  useEffect(() => setActiveIndex(-1), [search]);

  // Keep the highlighted suggestion in view when navigating with the keyboard.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-idx="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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

  // Keyboard conveniences that work anywhere on the map: "/" jumps to the search
  // box, and Escape closes the open airport panel. (The search box handles its
  // own Escape, so we ignore it while the box is focused.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.isContentEditable === true;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (
        e.key === "Escape" &&
        activeIdRef.current &&
        el !== inputRef.current
      ) {
        closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel]);

  const onVectorFail = useCallback(() => setEngine("raster"), []);

  const openDashboard = useCallback(() => {
    setDashboardMounted(true);
    setDashboardOpen(true);
  }, []);

  // Escape closes the dashboard drawer.
  useEffect(() => {
    if (!dashboardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDashboardOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dashboardOpen]);

  // Swipe-to-close for the drawer (touch), working anywhere on the panel. The
  // panel is mostly a same-origin <iframe>, and touches that start inside an
  // iframe are delivered to *its* document and never bubble out to us — so we
  // feed one gesture engine from two places: the header bar (ours) and, attached
  // on load, the iframe's own document.
  //
  // The engine works in top-viewport X. From the header that's just clientX.
  // From inside the iframe it is not: as the panel follows the finger, the
  // iframe's viewport slides with it, so its clientX shrinks by exactly the
  // panel's offset — feed that back raw and the panel judders. We convert by
  // adding the panel's live left edge (getBoundingClientRect already includes
  // the drag transform): clientX-in-iframe + panelLeft is the finger's true
  // viewport X, steady however far the panel has travelled. `touch-action: none`
  // on the header stops the browser scrolling there; inside the iframe we stay
  // passive so the dashboard keeps scrolling vertically, and the axis lock
  // ignores those vertical drags.
  const beginSwipe = useCallback((px: number, py: number) => {
    swipe.current = {
      x: px,
      y: py,
      w: drawerPanelRef.current?.offsetWidth ?? window.innerWidth,
      axis: "",
      dx: 0,
    };
  }, []);

  const moveSwipe = useCallback((px: number, py: number) => {
    const s = swipe.current;
    if (!s) return;
    const dx = px - s.x;
    const dy = py - s.y;
    // Lock the axis once the finger has clearly moved, so a vertical scroll (or
    // a tap on a header button) is never mistaken for a close gesture.
    if (s.axis === "") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (s.axis !== "h") return;
    s.dx = Math.max(0, dx); // only a rightward pull dismisses the right drawer
    setSwipeX(s.dx);
  }, []);

  const endSwipe = useCallback(() => {
    const s = swipe.current;
    swipe.current = null;
    // Past a third of the panel's width (capped) it dismisses; otherwise the
    // panel springs back to open as the inline transform is dropped.
    if (s && s.axis === "h" && s.dx > Math.min(s.w * 0.33, 140)) {
      setDashboardOpen(false);
    }
    setSwipeX(null);
  }, []);

  // Parent-document (header handle) touch handlers — clientX is already the
  // finger's viewport X here, since the header lives in the top document.
  const onSwipeStart = useCallback(
    (e: React.TouchEvent) => beginSwipe(e.touches[0].clientX, e.touches[0].clientY),
    [beginSwipe],
  );
  const onSwipeMove = useCallback(
    (e: React.TouchEvent) => moveSwipe(e.touches[0].clientX, e.touches[0].clientY),
    [moveSwipe],
  );

  // Wire the same gesture into the iframe's own document, so a swipe that starts
  // over the dashboard content closes the drawer too. It's same-origin, so we
  // can reach in. We use a native `load` listener (React's onLoad on an iframe
  // is unreliable) plus an immediate pass for the case where it already loaded
  // before this effect ran; a per-document flag stops double-wiring, and the
  // listeners die with the document on navigation/unmount. Passive throughout,
  // so vertical scrolling inside the dashboard is untouched.
  useEffect(() => {
    if (!dashboardMounted) return;
    const iframe = dashboardIframeRef.current;
    if (!iframe) return;
    const passive = { passive: true } as const;
    // clientX inside the iframe is relative to the iframe's (moving) viewport;
    // add the panel's live left edge to recover the finger's top-viewport X.
    const panelLeft = () => drawerPanelRef.current?.getBoundingClientRect().left ?? 0;
    const wire = () => {
      const doc = iframe.contentDocument;
      if (!doc || (doc as unknown as { __o4fWired?: boolean }).__o4fWired) return;
      (doc as unknown as { __o4fWired?: boolean }).__o4fWired = true;
      doc.addEventListener("touchstart", (ev) => {
        const t = (ev as TouchEvent).touches[0];
        if (t) beginSwipe(t.clientX + panelLeft(), t.clientY);
      }, passive);
      // touchmove is non-passive so that, once the gesture locks into a
      // horizontal close-drag, we can preventDefault to freeze the dashboard's
      // own scroll underneath it. A vertical gesture never locks to "h", so
      // scrolling the dashboard stays completely normal.
      doc.addEventListener("touchmove", (ev) => {
        const t = (ev as TouchEvent).touches[0];
        if (!t) return;
        moveSwipe(t.clientX + panelLeft(), t.clientY);
        if (swipe.current?.axis === "h") ev.preventDefault();
      }, { passive: false });
      doc.addEventListener("touchend", endSwipe, passive);
      doc.addEventListener("touchcancel", endSwipe, passive);
    };
    const onLoad = () => {
      setIframeLoading(false); // drop the veil once the dashboard has painted
      wire(); // (re-)wire the swipe gesture onto the freshly loaded document
    };
    wire(); // already loaded before the effect ran
    iframe.addEventListener("load", onLoad); // and re-wire after in-iframe nav
    return () => iframe.removeEventListener("load", onLoad);
  }, [dashboardMounted, beginSwipe, moveSwipe, endSwipe]);

  const activeMarker = activeId
    ? markers.find((m) => m.id === activeId) ?? null
    : null;

  const suggestionsOpen = searchFocused && searchResults.length > 0;
  const queryLen = search.trim().length;
  // On an empty, focused box, teach the search's reach (organisations and
  // aircraft types, not just airports); on a settled query with nothing found,
  // confirm the search actually ran rather than leaving a silent blank.
  const showHint = searchFocused && queryLen === 0;
  const noMatches =
    searchFocused &&
    queryLen >= 2 &&
    serverResults !== null &&
    searchResults.length === 0;

  const commitHit = useCallback(
    (hit: SearchHit) => {
      const label = search.trim();
      setSearch("");
      setSearchFocused(false);
      inputRef.current?.blur();
      selectAirport(hit.id, { orgIds: hit.matchedOrgIds, label });
    },
    [search, selectAirport],
  );

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = searchResults.length;
    if (e.key === "ArrowDown" && n > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % n);
    } else if (e.key === "ArrowUp" && n > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter" && n > 0) {
      e.preventDefault();
      const hit = searchResults[activeIndex >= 0 ? activeIndex : 0];
      if (hit) commitHit(hit);
    } else if (e.key === "Escape") {
      // first clear the text, then (already empty) release focus
      if (search) setSearch("");
      else {
        setSearchFocused(false);
        inputRef.current?.blur();
      }
    }
  };

  // Rendered in two spots: above the search bar on mobile, bottom-left on ≥sm.
  // The mobile line sits directly under the search bar where width is tight,
  // so it uses APT/ORG/STA; the ≥sm line has the room to spell them out.
  const hasCounts = !loadError && markers.length > 0;
  const countsFull = hasCounts ? (
    <p className="text-[11px] uppercase tracking-wide2 text-white/45">
      <span className="text-white/80">{markers.length}</span> airports
      <span className="mx-2 text-white/20">/</span>
      <span className="text-white/80">{organisationCount}</span> organisations
      <span className="mx-2 text-white/20">/</span>
      <span className="text-white/80">{totalStations}</span> stations
    </p>
  ) : null;
  const countsCompact = hasCounts ? (
    <p className="text-[11px] uppercase tracking-wide2 text-white/45">
      <span className="text-white/80">{markers.length}</span> APT
      <span className="mx-2 text-white/20">/</span>
      <span className="text-white/80">{organisationCount}</span> ORG
      <span className="mx-2 text-white/20">/</span>
      <span className="text-white/80">{totalStations}</span> STA
    </p>
  ) : null;

  // A quiet line for a scoped MRO, so a map framed on its own handful of pins
  // doesn't read as "where is everyone else?".
  const scopeNote =
    scoped && !loadError ? (
      <p className="mt-1 text-[10px] uppercase tracking-wide2 text-white/30">
        Showing only your stations
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
          fitMarkers={fitToMarkers}
        />
      )}
      {engine === "raster" && (
        <RasterBasemap
          ref={basemapRef}
          markers={markers}
          activeId={activeId}
          onSelect={selectAirport}
          fitMarkers={fitToMarkers}
        />
      )}

      {/* top scrim for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] h-24 bg-gradient-to-b from-black/80 to-transparent sm:h-40" />
      {/* bottom scrim — mobile only, where the search bar lives */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[400] h-36 bg-gradient-to-t from-black/85 to-transparent sm:hidden" />

      {/* Brand — pinned to the top-left corner on every screen. */}
      {!activeId && (
        <div className="pointer-events-none absolute left-0 top-0 z-[500] select-none p-5 sm:p-6">
          <h1 className="text-lg font-normal tracking-brand text-white sm:text-xl">
            ONE<span className="text-accent-bright">4</span>FIVE
          </h1>
          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-brand text-accent-bright/80">
            Part-145 · MRO · Europe
          </p>
        </div>
      )}

      {/* Search. Mobile: pinned to the bottom of the screen, within thumb reach
          (and lifted when the keyboard opens). ≥sm: centred along the top,
          between the brand (left) and the Dashboard button (right) — the width
          keeps a 12rem gutter each side so it never collides with either. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[500] p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-0 sm:w-[calc(100vw_-_24rem)] sm:max-w-md sm:-translate-x-1/2 sm:p-6 ${
          // the panel is full-screen on mobile — don't let the bar glow through it
          activeId ? "hidden" : "block"
        }`}
        style={
          keyboardInset ? { paddingBottom: keyboardInset + 12 } : undefined
        }
      >
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
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search airport, organisation or aircraft…"
              role="combobox"
              aria-expanded={suggestionsOpen}
              aria-controls="search-listbox"
              aria-autocomplete="list"
              aria-activedescendant={
                activeIndex >= 0 ? `search-opt-${activeIndex}` : undefined
              }
              aria-label="Search airports, cities, organisations or aircraft types"
              // 16px on mobile keeps iOS from zooming the page in on focus
              className="w-full bg-transparent text-base text-white placeholder:text-white/35 focus:outline-none sm:text-sm"
            />
            {search ? (
              <button
                onClick={() => {
                  setSearch("");
                  inputRef.current?.focus();
                }}
                className="shrink-0 text-white/40 hover:text-white"
                aria-label="Clear"
              >
                ✕
              </button>
            ) : (
              !searchFocused && (
                /* the "/" shortcut focuses this box — a quiet hint on ≥sm */
                <kbd
                  aria-hidden
                  className="pointer-events-none hidden shrink-0 rounded-[2px] border border-white/10 px-1.5 py-0.5 font-mono text-[10px] leading-none text-white/25 sm:block"
                >
                  /
                </kbd>
              )
            )}
          </div>

          {(suggestionsOpen || showHint || noMatches) && (
            /* opens upward on mobile (the bar is at the bottom), downward on ≥sm */
            <div className="absolute bottom-full mb-2 w-full sm:bottom-auto sm:top-full sm:mb-0 sm:mt-2">
              <div className="scroll-thin max-h-[45vh] overflow-y-auto rounded-[2px] border border-white/10 bg-[#141414]/80 shadow-2xl backdrop-blur-xl sm:max-h-80">
                {suggestionsOpen && (
                  <div ref={listRef} id="search-listbox" role="listbox" className="py-1">
                    {searchResults.map((m, i) => (
                      <button
                        key={m.id}
                        id={`search-opt-${i}`}
                        data-idx={i}
                        role="option"
                        aria-selected={i === activeIndex}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          commitHit(m);
                        }}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                          i === activeIndex ? "bg-white/10" : "hover:bg-white/5"
                        }`}
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

                {/* focus hint on an empty box — teaches what the search accepts */}
                {showHint && (
                  <div className="px-3 py-2.5">
                    <p className="mb-2 text-[10px] uppercase tracking-wide2 text-white/35">
                      Search by
                    </p>
                    <ul className="space-y-1.5">
                      {(
                        [
                          ["Airport, city", "Frankfurt, Hamburg"],
                          ["Code", "FRA · EDDF"],
                          ["Organisation", "by company name"],
                          ["Aircraft, engine", "A320 · 737 · CFM56"],
                        ] as const
                      ).map(([label, example]) => (
                        <li
                          key={label}
                          className="flex items-baseline gap-3 text-xs"
                        >
                          <span className="w-28 shrink-0 text-white/40">
                            {label}
                          </span>
                          <span className="min-w-0 truncate text-white/65">
                            {example}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* the query settled with nothing found */}
                {noMatches && (
                  <div className="px-3 py-3">
                    <p className="truncate text-xs text-white/45">
                      No matches for “{search.trim()}”
                    </p>
                    <p className="mt-1 text-[11px] text-white/30">
                      Try an airport code, city, organisation or aircraft type.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* stats sit under the search bar on mobile; the suggestions open
            upwards from the bar, so they never cover this line */}
        {(countsCompact || scopeNote) && (
          <div className="mt-2 select-none px-0.5 sm:hidden">
            {countsCompact}
            {scopeNote}
          </div>
        )}
      </div>

      {/* top-right account chrome: Dashboard (opens a right drawer). Logout now
          lives at the foot of that drawer, not here. Hidden while an airport
          panel is open, like the brand/search block. */}
      {!activeId && (
        <div className="absolute right-0 top-0 z-[500] flex items-center gap-2 p-5 sm:p-6">
          {/* Dashboard: just the word — no border, no fill. On hover the
              letters fill with a white diagonal hatch (a repeating-linear-
              gradient clipped to the text). */}
          <button
            type="button"
            onClick={openDashboard}
            className="pointer-events-auto px-3 py-1.5
              text-[10px] uppercase tracking-wide2 text-white
              [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.9))] transition-colors
              hover:bg-clip-text hover:text-transparent
              hover:[background-image:repeating-linear-gradient(45deg,#fff_0,#fff_0.5px,transparent_0.5px,transparent_1px)]"
          >
            Dashboard
          </button>
        </div>
      )}

      {/* bottom-left stats (≥sm — on mobile they sit under the search bar) */}
      {(countsFull || scopeNote) && (
        <div className="pointer-events-none absolute bottom-6 left-6 z-[500] hidden select-none sm:block">
          {countsFull}
          {scopeNote}
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

      {/* Dashboard drawer — the user's own dashboard as a right slide-in panel
          over the map (an iframe of dashboardHref: /dashboard or /airline), so
          it opens without leaving the map. */}
      <div
        className={`absolute inset-0 z-[900] ${dashboardOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!dashboardOpen}
      >
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            dashboardOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setDashboardOpen(false)}
        />
        <div
          ref={drawerPanelRef}
          className={`absolute right-0 top-0 flex h-full w-full max-w-[720px] transform flex-col
            overflow-hidden border-l border-white/10 bg-black shadow-2xl transition-transform duration-300 ${
              dashboardOpen ? "translate-x-0" : "translate-x-full"
            }`}
          style={
            swipeX != null
              ? { transform: `translateX(${swipeX}px)`, transition: "none" }
              : undefined
          }
        >
          {/* The header bar is a drag handle (swipe it right to close); the same
              gesture also works over the dashboard content via the iframe touch
              listeners wired above. `touch-action: none` keeps the browser from
              scrolling here. */}
          <div
            onTouchStart={onSwipeStart}
            onTouchMove={onSwipeMove}
            onTouchEnd={endSwipe}
            className="flex shrink-0 touch-none select-none items-center justify-between
              px-4 py-2"
          >
            <span className="text-[10px] uppercase tracking-wide2 text-white/45">
              Dashboard
            </span>
            <button
              type="button"
              onClick={() => setDashboardOpen(false)}
              aria-label="Close dashboard"
              className="rounded-[2px] border border-white/10 px-2 py-1 text-xs leading-none text-white/60
                transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
          {dashboardMounted && (
            <div className="relative flex-1">
              <iframe
                ref={dashboardIframeRef}
                src={dashboardHref}
                title="Dashboard"
                // color-scheme: dark makes the browser paint the iframe's own
                // loading/blank canvas dark instead of the default white, so
                // there's no white flash before the dashboard's CSS applies.
                style={{ colorScheme: "dark" }}
                className="h-full w-full border-0 bg-black"
              />
              {/* Dark veil over the still-loading iframe; fades out on load so
                  the dashboard appears without a flash. pointer-events-none so it
                  never blocks the content or the swipe underneath. */}
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 flex items-center justify-center
                  bg-black transition-opacity duration-500 ${
                    iframeLoading ? "opacity-100" : "opacity-0"
                  }`}
              >
                <span
                  className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/40"
                />
              </div>
            </div>
          )}
          {/* Logout sits at the foot of the dashboard drawer. The form submits in
              the top document (not the iframe), so signing out navigates the
              whole page to the signed-out landing rather than only the framed
              dashboard view — which would leave the map behind it stale. */}
          <div className="flex shrink-0 items-center justify-center px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-[2px] border border-white/10 bg-[#141414]/60 px-4 py-1.5
                  text-[10px] uppercase tracking-wide2 text-white/55 transition
                  hover:bg-white/10 hover:text-white"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
