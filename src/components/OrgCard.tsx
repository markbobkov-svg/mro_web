"use client";

import { useState } from "react";
import type { OrgAtAirport, AircraftTypeRef } from "@/lib/types";

function typeLabel(t: AircraftTypeRef): string {
  if (t.variant && t.variant !== t.model) return t.variant;
  return t.model;
}

const AIRCRAFT_PREVIEW = 12;

export default function OrgCard({ org }: { org: OrgAtAirport }) {
  const [expanded, setExpanded] = useState(false);

  const part145 = org.approvals.find((a) => a.approvalType === "Part-145");
  const otherApprovals = org.approvals.filter(
    (a) => a.approvalType !== "Part-145",
  );

  // de-duplicate aircraft labels, keep order
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const t of org.aircraftTypes) {
    const l = typeLabel(t);
    if (l && !seen.has(l)) {
      seen.add(l);
      labels.push(l);
    }
  }
  const shown = expanded ? labels : labels.slice(0, AIRCRAFT_PREVIEW);
  const hiddenCount = labels.length - shown.length;

  return (
    <div className="group rounded-lg border border-white/10 bg-base-800/70 p-4 transition hover:border-white/20 hover:bg-base-800">
      {/* header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-white">
            {org.name}
          </h3>
          {org.legalName && org.legalName !== org.name && (
            <p className="mt-0.5 truncate text-xs text-white/40">
              {org.legalName}
            </p>
          )}
        </div>
        <span
          className={
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 " +
            (org.maintenanceScope === "base"
              ? "bg-amber-400/10 text-amber-300"
              : "bg-emerald-400/10 text-emerald-300")
          }
        >
          {org.maintenanceScope}
        </span>
      </div>

      {/* Part-145 approval */}
      {part145 ? (
        <div className="mt-3 rounded-md border border-accent/25 bg-accent/[0.06] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide2 text-accent-bright">
              Part-145
            </span>
            {part145.authorityCode && (
              <span className="text-[10px] uppercase tracking-wide2 text-white/35">
                {part145.authorityCode}
              </span>
            )}
          </div>
          {part145.approvalReference && (
            <p className="mt-1 font-mono text-xs text-white/80">
              {part145.approvalReference}
            </p>
          )}
          {part145.ratings.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {part145.ratings.map((r) => (
                <span
                  key={r}
                  className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-white/70"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        org.approvals.length === 0 && (
          <p className="mt-3 text-xs text-white/30">No approval details.</p>
        )
      )}

      {/* other approvals */}
      {otherApprovals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {otherApprovals.map((a, i) => (
            <span
              key={a.approvalType + i}
              className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 text-white/45"
            >
              {a.approvalType.replace(/^Part-/, "")}
            </span>
          ))}
        </div>
      )}

      {/* aircraft types */}
      {labels.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide2 text-white/35">
            Aircraft
          </p>
          <div className="flex flex-wrap gap-1">
            {shown.map((l) => (
              <span
                key={l}
                className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-white/75"
              >
                {l}
              </span>
            ))}
            {hiddenCount > 0 && (
              <button
                onClick={() => setExpanded(true)}
                className="rounded bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-accent-bright hover:bg-white/[0.08]"
              >
                +{hiddenCount} more
              </button>
            )}
          </div>
        </div>
      )}

      {/* contact */}
      {(org.phone || org.email || org.website) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/5 pt-3 text-xs">
          {org.phone && (
            <a
              href={`tel:${org.phone.replace(/\s+/g, "")}`}
              className="text-white/55 transition hover:text-white"
            >
              {org.phone}
            </a>
          )}
          {org.email && (
            <a
              href={`mailto:${org.email}`}
              className="truncate text-white/55 transition hover:text-white"
            >
              {org.email}
            </a>
          )}
          {org.website && (
            <a
              href={normaliseUrl(org.website)}
              target="_blank"
              rel="noreferrer"
              className="text-accent-bright/80 transition hover:text-accent-bright"
            >
              Website ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function normaliseUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}
