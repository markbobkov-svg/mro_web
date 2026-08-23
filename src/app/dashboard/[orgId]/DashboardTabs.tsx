"use client";

import { useEffect, useRef, useState } from "react";

import type { DashboardOrg } from "@/lib/dashboard";
import { ProfileForm } from "./ProfileForm";
import { ContactsEditor } from "./ContactsEditor";
import { ApprovalsPanel, StationsPanel } from "./RegulatorySections";
import { StationScopeEditor } from "./StationScopeEditor";
import { ChangeRequestList } from "./ChangeRequestList";

/**
 * The organisation dashboard as a tab strip rather than one long scroll.
 *
 * Every panel stays mounted and is hidden with the `hidden` attribute, so a
 * half-typed profile or an open change form survives a tab switch. The active
 * tab is mirrored into the URL hash, which keeps the old `#contacts`-style deep
 * links working and lets a tab be bookmarked. Each heading carries a badge that
 * says whether edits publish instantly (profile, contacts) or go through review
 * (the registry facts) — the one distinction that governs the whole dashboard.
 */

type TabKey =
  | "profile"
  | "contacts"
  | "approvals"
  | "scope"
  | "stations"
  | "requests";

type Publish = "instant" | "review" | "status";

interface TabDef {
  key: TabKey;
  label: string;
  title: string;
  note: string;
  publish: Publish;
}

const TABS: TabDef[] = [
  {
    key: "profile",
    label: "Profile",
    title: "Profile",
    note: "Your tagline, description, logo and contact details, shown on your public card.",
    publish: "instant",
  },
  {
    key: "contacts",
    label: "Contacts",
    title: "Contacts",
    note: "The desks operators call. Once you add one, your contacts replace the scraped ones on your card.",
    publish: "instant",
  },
  {
    key: "approvals",
    label: "Approvals",
    title: "Approvals",
    note: "From the authorities' registers. Propose a correction and we will check it against the certificate.",
    publish: "review",
  },
  {
    key: "scope",
    label: "Scope",
    title: "Certified scope",
    note: "The scope shown on your card, per station. Pick a station and edit its lines — changes go live immediately.",
    publish: "instant",
  },
  {
    key: "stations",
    label: "Stations",
    title: "Stations",
    note: "The airports where you appear on the map.",
    publish: "review",
  },
  {
    key: "requests",
    label: "Requests",
    title: "Change requests",
    note: "Corrections to approvals, scope and stations are checked before they go live — track their status here.",
    publish: "status",
  },
];

function isTabKey(v: string): v is TabKey {
  return TABS.some((t) => t.key === v);
}

export function DashboardTabs({ org }: { org: DashboardOrg }) {
  const [active, setActive] = useState<TabKey>("profile");
  const barRef = useRef<HTMLDivElement>(null);

  const pendingCount = org.changeRequests.filter(
    (c) => c.status === "pending",
  ).length;

  // Open the tab named in the URL hash on load (server render is always the
  // first tab, so this can only run client-side — no hydration mismatch).
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (isTabKey(hash)) setActive(hash);
  }, []);

  function select(key: TabKey) {
    setActive(key);
    history.replaceState(null, "", `#${key}`);
    // Bring the strip back up when switching away from a long section.
    barRef.current?.scrollIntoView({ block: "start" });
  }

  return (
    <div>
      <div ref={barRef} className="scroll-mt-20">
        <nav
          role="tablist"
          aria-label="Dashboard sections"
          // Marks this strip for the map's dashboard drawer: when shown in that
          // right slide-in drawer (an iframe), a horizontal drag on — or just
          // above/below — this bar scrolls the tabs instead of arming the
          // drawer's swipe-to-close. See startsInHorizontalScroller in MapView.
          data-drawer-hscroll
          className="flex gap-1 overflow-x-auto scroll-none rounded-[2px] border
            border-white/10 bg-[#141414]/60 p-1"
        >
          {TABS.map((t) => {
            const isActive = t.key === active;
            const badge =
              t.key === "requests" && pendingCount > 0 ? pendingCount : null;
            return (
              <button
                key={t.key}
                id={`tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${t.key}`}
                onClick={() => select(t.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-[2px] px-3 py-2
                  text-sm transition ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/45 hover:text-white/85"
                  }`}
              >
                {t.label}
                {badge != null ? (
                  <span
                    className="rounded-full bg-amber-400/90 px-1.5 text-[10px]
                      font-medium leading-4 text-black"
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-6">
        {TABS.map((t) => (
          <section
            key={t.key}
            id={`panel-${t.key}`}
            role="tabpanel"
            aria-labelledby={`tab-${t.key}`}
            hidden={t.key !== active}
          >
            <SectionHeading title={t.title} note={t.note} publish={t.publish} />
            <PanelBody tab={t.key} org={org} />
          </section>
        ))}
      </div>
    </div>
  );
}

function PanelBody({ tab, org }: { tab: TabKey; org: DashboardOrg }) {
  switch (tab) {
    case "profile":
      return <ProfileForm org={org} />;
    case "contacts":
      return <ContactsEditor org={org} />;
    case "approvals":
      return <ApprovalsPanel org={org} />;
    case "scope":
      return <StationScopeEditor org={org} />;
    case "stations":
      return <StationsPanel org={org} />;
    case "requests":
      return <ChangeRequestList org={org} />;
  }
}

function SectionHeading({
  title,
  note,
  publish,
}: {
  title: string;
  note: string;
  publish: Publish;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div>
        <h2 className="text-sm font-medium text-white">{title}</h2>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/35">
          {note}
        </p>
      </div>
      <PublishBadge publish={publish} />
    </div>
  );
}

function PublishBadge({ publish }: { publish: Publish }) {
  if (publish === "instant") {
    return (
      <span
        className="shrink-0 rounded-[2px] border border-accent/30 bg-accent/10 px-2 py-1
          text-[10px] uppercase tracking-wide2 text-accent-bright"
        title="Saved changes appear on your public card straight away."
      >
        Publishes instantly
      </span>
    );
  }
  if (publish === "review") {
    return (
      <span
        className="shrink-0 rounded-[2px] border border-amber-400/30 bg-amber-400/5 px-2 py-1
          text-[10px] uppercase tracking-wide2 text-amber-300/80"
        title="Registry facts are checked by an admin before they go live."
      >
        Reviewed before publishing
      </span>
    );
  }
  return null;
}
