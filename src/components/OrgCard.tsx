"use client";

import { useState } from "react";
import type { OrgAtAirport } from "@/lib/types";

const SCOPE_PREVIEW = 16;

// Only the short, clean EASA codes (A1, B1, C4, D1…) are shown as a ratings
// line; long descriptive ratings live in the scope list below.
function ratingCodes(ratings: string[]): string[] {
  return ratings.filter((r) => r && r.trim().length <= 5);
}

export default function OrgCard({ org }: { org: OrgAtAirport }) {
  const [authIdx, setAuthIdx] = useState(0);
  const [cls, setCls] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const authorities = org.authorities;
  const auth = authorities[Math.min(authIdx, authorities.length - 1)] ?? null;

  const selectAuthority = (i: number) => {
    setAuthIdx(i);
    setCls(null);
    setExpanded(false);
  };
  const selectClass = (label: string | null) => {
    setCls(label);
    setExpanded(false);
  };

  // classes to show for the current filter, then a preview slice across them
  const groups = auth
    ? cls
      ? auth.classes.filter((c) => c.label === cls)
      : auth.classes
    : [];
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  let budget = expanded ? Infinity : SCOPE_PREVIEW;
  const blocks = groups
    .map((g) => {
      const take = budget === Infinity ? g.items.length : Math.min(g.items.length, budget);
      if (budget !== Infinity) budget -= take;
      return { group: g, items: g.items.slice(0, take) };
    })
    .filter((b) => b.items.length > 0);
  const shownItems = blocks.reduce((n, b) => n + b.items.length, 0);
  const hidden = totalItems - shownItems;
  const multiGroup = groups.length > 1;

  return (
    <div className="px-2 py-5">
      {/* header */}
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

      {authorities.length === 0 && (
        <p className="mt-3 text-xs text-white/30">No approval details.</p>
      )}

      {/* authority switcher — text buttons, shown only when there's more than one */}
      {authorities.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {authorities.map((a, i) => {
            const active = i === authIdx;
            return (
              <button
                key={a.code + i}
                onClick={() => selectAuthority(i)}
                title={a.name ?? a.code}
                className={
                  "text-[10px] uppercase tracking-wide2 transition " +
                  (active
                    ? "font-semibold text-accent-bright"
                    : "font-medium text-white/40 hover:text-white/75")
                }
              >
                {a.code}
              </button>
            );
          })}
        </div>
      )}

      {/* selected authority: certificates + scope — flat on the panel, no box */}
      {auth && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide2 text-accent-bright">
            {auth.isEasa ? "EASA" : auth.code}
            {auth.name && auth.name !== auth.code ? (
              <span className="ml-1.5 font-normal normal-case tracking-normal text-white/40">
                {auth.name}
              </span>
            ) : null}
          </div>

          {/* certificate references under this authority */}
          <div className="mt-2 space-y-2">
            {auth.certificates.map((c, i) => {
              const codes = ratingCodes(c.ratings);
              const url = c.url ?? auth.url;
              return (
                <div key={i}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[9px] font-semibold uppercase tracking-wide2 text-white/45">
                      {c.approvalType}
                    </span>
                    {c.reference && (
                      <span className="font-mono text-xs text-white/85">
                        {c.reference}
                      </span>
                    )}
                    {c.validUntil && (
                      <span className="text-[10px] text-white/35">
                        · valid to {c.validUntil}
                      </span>
                    )}
                    {url && (
                      <a
                        href={normaliseUrl(url)}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto shrink-0 text-[11px] text-accent-bright/90 transition hover:text-accent-bright"
                      >
                        Certificate ↗
                      </a>
                    )}
                  </div>
                  {codes.length > 0 && (
                    <p className="mt-1 font-mono text-[10px] text-white/45">
                      {codes.join("  ·  ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* scope, filterable by class, as an airy vertical list */}
          {auth.classes.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wide2 text-white/35">
                Scope
              </p>
              {/* class filter — text buttons */}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                <ClassChip
                  label="All"
                  count={totalItemsAll(auth)}
                  active={cls === null}
                  onClick={() => selectClass(null)}
                />
                {auth.classes.map((c) => (
                  <ClassChip
                    key={c.label}
                    label={c.label}
                    count={c.items.length}
                    active={cls === c.label}
                    onClick={() => selectClass(c.label)}
                  />
                ))}
              </div>

              {/* vertical list; aircraft classes get LINE / BASE columns */}
              <div className="mt-2">
                {blocks.map((b, bi) => (
                  <div key={b.group.label + bi} className="mt-3 first:mt-0">
                    {(multiGroup || b.group.isAircraft) && (
                      <div className="flex items-center gap-2 pb-0.5">
                        <span
                          className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase tracking-wide2 text-white/40"
                          title={b.group.label}
                        >
                          {multiGroup ? b.group.label : ""}
                        </span>
                        {b.group.isAircraft && (
                          <>
                            <span className="w-9 shrink-0 text-center text-[9px] uppercase tracking-wide2 text-white/30">
                              Line
                            </span>
                            <span className="w-9 shrink-0 text-center text-[9px] uppercase tracking-wide2 text-white/30">
                              Base
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    {b.items.map((it, ii) => (
                      <div
                        key={ii}
                        className="flex items-center gap-2 py-1 text-[11px]"
                      >
                        <span
                          className="min-w-0 flex-1 truncate text-white/75"
                          title={it.text}
                        >
                          {it.text}
                        </span>
                        {b.group.isAircraft && (
                          <>
                            <Mark on={it.line} />
                            <Mark on={it.base} />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                {hidden > 0 && (
                  <button
                    onClick={() => setExpanded(true)}
                    className="mt-2 text-[11px] text-accent-bright/90 transition hover:text-accent-bright"
                  >
                    +{hidden} more
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* contacts */}
      {org.contacts.length > 0 && (
        <div className="mt-4 space-y-1.5">
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
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
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

function totalItemsAll(auth: OrgAtAirport["authorities"][number]): number {
  return auth.classes.reduce((n, c) => n + c.items.length, 0);
}

function Mark({ on }: { on: boolean }) {
  return (
    <span className="w-9 shrink-0 text-center">
      {on ? (
        <span className="text-accent-bright">✕</span>
      ) : (
        <span className="text-white/15">·</span>
      )}
    </span>
  );
}

function ClassChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={
        "max-w-[13rem] truncate text-[10px] transition " +
        (active
          ? "font-semibold text-accent-bright"
          : "font-medium text-white/45 hover:text-white/80")
      }
    >
      {label}
      <span className={active ? "ml-1 text-accent-bright/60" : "ml-1 text-white/30"}>
        {count}
      </span>
    </button>
  );
}

function normaliseUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}
