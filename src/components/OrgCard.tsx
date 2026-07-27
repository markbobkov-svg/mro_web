"use client";

import { useState } from "react";
import type { OrgAtAirport } from "@/lib/types";

const SCOPE_PREVIEW = 16;

// Ratings printed as small badges next to a certificate — only the short, clean
// EASA codes (A1, B1, C4, D1…); long descriptive ratings live in the scope list.
function ratingBadges(ratings: string[]): string[] {
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
    <div className="px-2 py-4">
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

      {/* authority switcher — shown only when the org has more than one */}
      {authorities.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {authorities.map((a, i) => {
            const active = i === authIdx;
            return (
              <button
                key={a.code + i}
                onClick={() => selectAuthority(i)}
                title={a.name ?? a.code}
                className={
                  "rounded-[2px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide2 transition " +
                  (active
                    ? "bg-accent/20 text-accent-bright ring-1 ring-accent/40"
                    : "bg-white/[0.05] text-white/50 hover:bg-white/10 hover:text-white/80")
                }
              >
                {a.code}
              </button>
            );
          })}
        </div>
      )}

      {/* selected authority: certificates + scope */}
      {auth && (
        <div className="mt-3 rounded-[2px] border border-white/10 bg-white/[0.03] px-3 py-2.5">
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
              const badges = ratingBadges(c.ratings);
              const url = c.url ?? auth.url;
              return (
                <div key={i} className="border-t border-white/5 pt-2 first:border-0 first:pt-0">
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
                  {badges.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {badges.map((r) => (
                        <span
                          key={r}
                          className="rounded-[2px] bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-white/70"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* scope, filterable by class, rendered as a vertical list */}
          {auth.classes.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide2 text-white/35">
                Scope
              </p>
              {/* class filter chips */}
              <div className="mb-2 flex flex-wrap gap-1">
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

              {/* vertical scope list; aircraft classes get LINE / BASE columns */}
              <div className="overflow-hidden rounded-[2px] border border-white/5">
                {blocks.map((b, bi) => (
                  <div key={b.group.label + bi}>
                    {(multiGroup || b.group.isAircraft) && (
                      <div className="flex items-center gap-2 bg-white/[0.03] px-2 py-1">
                        <span
                          className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase tracking-wide2 text-white/45"
                          title={b.group.label}
                        >
                          {multiGroup ? b.group.label : ""}
                        </span>
                        {b.group.isAircraft && (
                          <>
                            <span className="w-9 shrink-0 text-center text-[9px] uppercase tracking-wide2 text-white/35">
                              Line
                            </span>
                            <span className="w-9 shrink-0 text-center text-[9px] uppercase tracking-wide2 text-white/35">
                              Base
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    {b.items.map((it, ii) => (
                      <div
                        key={ii}
                        className="flex items-center gap-2 border-t border-white/5 px-2 py-1 text-[11px]"
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
                    className="w-full border-t border-white/5 px-2 py-1 text-left text-[11px] text-accent-bright transition hover:bg-white/[0.05]"
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
        "max-w-[12rem] truncate rounded-[2px] px-1.5 py-0.5 text-[10px] font-medium transition " +
        (active
          ? "bg-accent/20 text-accent-bright ring-1 ring-accent/40"
          : "bg-white/[0.05] text-white/55 hover:bg-white/10 hover:text-white/85")
      }
    >
      {label}
      <span className={active ? "ml-1 text-accent-bright/70" : "ml-1 text-white/35"}>
        {count}
      </span>
    </button>
  );
}

function normaliseUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}
