"use client";

import { useState } from "react";
import type { OrgAtAirport } from "@/lib/types";

const SCOPE_PREVIEW = 12;

const SCOPE_STYLE: Record<string, string> = {
  line: "bg-emerald-400/10 text-emerald-300",
  base: "bg-amber-400/10 text-amber-300",
  both: "bg-accent/15 text-accent-bright",
};

export default function OrgCard({ org }: { org: OrgAtAirport }) {
  const [expanded, setExpanded] = useState(false);

  const part145 = org.approvals.find((a) => a.approvalType === "Part-145");
  const otherApprovals = org.approvals.filter(
    (a) => a.approvalType !== "Part-145",
  );

  const shown = expanded ? org.scope : org.scope.slice(0, SCOPE_PREVIEW);
  const hiddenCount = org.scope.length - shown.length;

  return (
    <div className="group rounded-lg border border-white/10 bg-base-800/70 p-4 transition hover:border-white/20 hover:bg-base-800">
      {/* header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium leading-snug text-white">
            {org.name}
          </h3>
          {org.legalName && org.legalName !== org.name && (
            <p className="mt-0.5 truncate text-xs text-white/40">
              {org.legalName}
            </p>
          )}
        </div>
        {org.locationScope && (
          <span
            className={
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 " +
              (SCOPE_STYLE[org.locationScope] ?? "bg-white/10 text-white/60")
            }
          >
            {org.locationScope}
          </span>
        )}
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

      {/* scope / aircraft covered here */}
      {org.scope.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide2 text-white/35">
            Scope at this station
          </p>
          <div className="flex flex-wrap gap-1">
            {shown.map((s, i) => (
              <span
                key={s + i}
                className="max-w-full truncate rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-white/75"
                title={s}
              >
                {s}
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

      {/* contacts */}
      {org.contacts.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
          {org.contacts.map((c, i) => (
            <div key={i} className="text-xs">
              {(c.label || c.name) && (
                <p className="text-white/70">
                  {c.label}
                  {c.label && c.name ? " · " : ""}
                  {c.name}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {c.phone && (
                  <a
                    href={`tel:${c.phone.replace(/\s+/g, "")}`}
                    className="text-white/50 hover:text-white"
                  >
                    {c.phone}
                  </a>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="truncate text-white/50 hover:text-white"
                  >
                    {c.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* org-level contact fallback */}
      {org.contacts.length === 0 && (org.phone || org.email || org.website) && (
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

      {/* website when contacts exist */}
      {org.contacts.length > 0 && org.website && (
        <div className="mt-2 text-xs">
          <a
            href={normaliseUrl(org.website)}
            target="_blank"
            rel="noreferrer"
            className="text-accent-bright/80 transition hover:text-accent-bright"
          >
            Website ↗
          </a>
        </div>
      )}
    </div>
  );
}

function normaliseUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}
