"use client";

import type { AirportMarker, AirportDetail } from "@/lib/types";
import OrgCard from "./OrgCard";

interface Props {
  marker: AirportMarker;
  detail: AirportDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  /** Narrows the list to the organisations that matched the search query. */
  orgFilter?: { orgIds: string[]; label: string } | null;
  onClearFilter?: () => void;
}

export default function AirportPanel({
  marker,
  detail,
  loading,
  error,
  onClose,
  orgFilter,
  onClearFilter,
}: Props) {
  const code = marker.iata ?? marker.icao ?? "";
  const allOrgs = detail?.organisations ?? [];
  const filtered = orgFilter
    ? allOrgs.filter((o) => orgFilter.orgIds.includes(o.organisationId))
    : allOrgs;
  // if the filter matches nothing here (stale ids), fall back to the full list
  const orgs = orgFilter && filtered.length === 0 ? allOrgs : filtered;
  const filterActive = Boolean(orgFilter) && orgs.length < allOrgs.length;

  return (
    <aside className="animate-slide-in absolute right-0 top-0 z-[700] flex h-full w-full flex-col border-l border-white/10 bg-[#141414]/95 backdrop-blur-xl sm:w-[420px] md:w-[630px]">
      {/* header */}
      <div className="relative border-b border-white/10 px-6 pb-5 pt-6">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-[2px] text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          {code && (
            <span className="rounded-[2px] border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-lg font-semibold tracking-wide2 text-accent-bright">
              {code}
            </span>
          )}
          {marker.countryCode && (
            <span className="text-xs uppercase tracking-wide2 text-white/40">
              {marker.countryCode}
            </span>
          )}
        </div>
        {marker.name && marker.name.toUpperCase() !== code.toUpperCase() && (
          <h2 className="mt-3 pr-8 text-lg font-light leading-snug text-white">
            {marker.name}
          </h2>
        )}
        {marker.city && marker.city.toUpperCase() !== code.toUpperCase() && (
          <p className="mt-0.5 text-sm text-white/45">{marker.city}</p>
        )}
      </div>

      {/* body */}
      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
        {loading && <PanelSkeleton />}

        {!loading && error && (
          <div className="mx-2 mt-6 rounded-[2px] border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && orgs.length === 0 && (
          <div className="mt-10 px-4 text-center">
            <p className="text-sm text-white/50">
              No maintenance organisations listed here.
            </p>
          </div>
        )}

        {!loading && !error && orgs.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-3 pt-1">
              <p className="text-[11px] uppercase tracking-wide2 text-white/40">
                {filterActive ? (
                  <>
                    <span className="text-white/70">{orgs.length}</span> of{" "}
                    {allOrgs.length}{" "}
                    {allOrgs.length === 1 ? "organisation" : "organisations"}
                  </>
                ) : (
                  <>
                    {orgs.length}{" "}
                    {orgs.length === 1 ? "organisation" : "organisations"}
                  </>
                )}
              </p>
              {filterActive && orgFilter && (
                <button
                  onClick={onClearFilter}
                  title="Show all organisations at this airport"
                  className="group flex items-center gap-1 rounded-[2px] bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent-bright transition hover:bg-accent/25"
                >
                  <span className="max-w-[10rem] truncate">
                    {orgFilter.label}
                  </span>
                  <span className="text-accent-bright/60 group-hover:text-accent-bright">
                    ✕
                  </span>
                </button>
              )}
            </div>
            <div className="flex flex-col">
              {orgs.map((org, i) => (
                <div key={org.stationId}>
                  {i > 0 && (
                    <div className="mx-3 border-t border-white/10" aria-hidden />
                  )}
                  <OrgCard org={org} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-2 pt-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-fade-in rounded-[2px] border border-white/5 bg-base-800/60 p-4"
        >
          <div className="h-4 w-2/3 rounded-[2px] bg-white/10" />
          <div className="mt-3 h-3 w-1/3 rounded-[2px] bg-white/5" />
          <div className="mt-4 flex gap-2">
            <div className="h-5 w-12 rounded-[2px] bg-white/5" />
            <div className="h-5 w-12 rounded-[2px] bg-white/5" />
            <div className="h-5 w-12 rounded-[2px] bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
