"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";

import {
  deleteStationScopeAction,
  importStationScopeAction,
  revertStationScopeAction,
  saveStationScopeAction,
  type ActionState,
} from "../actions";
import type { DashboardOrg, ManagedStationScopeRow } from "@/lib/dashboard";
import { Alert, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: ActionState = {};

/**
 * Per-station certified scope — the lines shown on the public card for each
 * airport. Unlike the moderated approvals, these publish instantly and live in
 * their own override table, so the flow is a direct add / edit / remove like the
 * contacts editor, but scoped to one station at a time. For any station the
 * organisation edits here, its lines replace the scraped scope on the card.
 */

interface StationOption {
  airportId: string;
  label: string;
}

export function StationScopeEditor({ org }: { org: DashboardOrg }) {
  // Stations are the org's presence per airport; the override keys on airport,
  // so collapse any duplicates and drop stations we can't place on the map.
  const stations = useMemo<StationOption[]>(() => {
    const seen = new Set<string>();
    const out: StationOption[] = [];
    for (const s of org.stations) {
      if (!s.airportId || seen.has(s.airportId)) continue;
      seen.add(s.airportId);
      out.push({
        airportId: s.airportId,
        label: [s.iata ?? s.icao, s.airportName].filter(Boolean).join(" — ") || "Station",
      });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [org.stations]);

  const authorityCodes = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const a of org.approvals) if (a.authorityCode) set.add(a.authorityCode);
    for (const r of org.stationScope) if (r.authorityCode) set.add(r.authorityCode);
    return [...set].sort();
  }, [org.approvals, org.stationScope]);

  const [airportId, setAirportId] = useState(stations[0]?.airportId ?? "");

  if (stations.length === 0) {
    return (
      <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
        <p className="text-sm text-white/35">
          You don&rsquo;t appear at any airport yet, so there is no station scope
          to edit. Stations are added from the Stations tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      <label className="block">
        <span className="mb-1.5 block text-[10px] uppercase tracking-wide2 text-white/40">
          Station
        </span>
        <Select
          value={airportId}
          onChange={(e) => setAirportId(e.target.value)}
          className="max-w-md"
        >
          {stations.map((s) => (
            <option key={s.airportId} value={s.airportId}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>

      <datalist id="station-authority-codes">
        {authorityCodes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Remount on station switch so every in-flight form resets cleanly. */}
      <StationPanel key={airportId} org={org} airportId={airportId} />
    </div>
  );
}

function StationPanel({ org, airportId }: { org: DashboardOrg; airportId: string }) {
  const managed = org.stationScope
    .filter((r) => r.airportId === airportId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const scraped = org.scrapedStationScope.filter((r) => r.airportId === airportId);
  const managing = managed.length > 0;

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const nextSort = managed.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;

  const groups = new Map<string, ManagedStationScopeRow[]>();
  for (const r of managed) {
    const key = r.authorityCode?.trim() || "Other";
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  return (
    <div className="space-y-4 border-t border-white/10 pt-4">
      {managing ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/35">
              You maintain this station&rsquo;s scope — these {managed.length} line
              {managed.length === 1 ? "" : "s"} replace the scraped scope on your card.
            </p>
            <RevertButton orgId={org.id} airportId={airportId} />
          </div>

          <div className="space-y-4">
            {[...groups.entries()].map(([authority, rows]) => (
              <div key={authority}>
                <p className="mb-2 text-[10px] uppercase tracking-wide2 text-white/45">
                  {authority}
                </p>
                <ul className="divide-y divide-white/10 rounded-[2px] border border-white/10 bg-black/30">
                  {rows.map((r) =>
                    editingId === r.id ? (
                      <li key={r.id} className="p-3">
                        <ScopeLineForm
                          org={org}
                          airportId={airportId}
                          row={r}
                          nextSort={nextSort}
                          onDone={() => setEditingId(null)}
                        />
                      </li>
                    ) : (
                      <li
                        key={r.id}
                        className="flex items-start justify-between gap-4 p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white/90">
                            {r.ratingClass ? (
                              <span className="mr-2 rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 text-white/45">
                                {r.ratingClass}
                              </span>
                            ) : null}
                            {r.scopeText}
                            {r.locationScope ? (
                              <span className="ml-2 text-xs text-white/25">
                                [{r.locationScope}]
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(r.id)}
                            className="text-xs text-white/45 transition hover:text-white"
                          >
                            Edit
                          </button>
                          <DeleteLineButton orgId={org.id} scopeId={r.id} />
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : (
        <ImportPanel org={org} airportId={airportId} scrapedCount={scraped.length} />
      )}

      {adding ? (
        <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide2 text-white/45">
              New scope line
            </span>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-xs text-white/35 transition hover:text-white/70"
            >
              Close
            </button>
          </div>
          {!managing ? (
            <p className="mb-3 text-xs text-white/35">
              Adding a line makes your lines replace the scraped scope for this
              station on the card.
            </p>
          ) : null}
          <ScopeLineForm
            org={org}
            airportId={airportId}
            row={null}
            nextSort={nextSort}
            onDone={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-[2px] border border-dashed border-white/10 px-4 py-2 text-sm
            text-white/45 transition hover:border-white/25 hover:text-white"
        >
          + Add a line
        </button>
      )}
    </div>
  );
}

function ImportPanel({
  org,
  airportId,
  scrapedCount,
}: {
  org: DashboardOrg;
  airportId: string;
  scrapedCount: number;
}) {
  const [state, action] = useFormState(importStationScopeAction, EMPTY);
  const preview = org.scrapedStationScope
    .filter((r) => r.airportId === airportId)
    .slice(0, 6);

  if (scrapedCount === 0) {
    return (
      <p className="text-sm text-white/35">
        No scope on record for this station yet. Add the classes and lines you work
        here.
      </p>
    );
  }

  return (
    <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <p className="text-xs text-white/45">
        We currently show {scrapedCount} scraped scope line
        {scrapedCount === 1 ? "" : "s"} for this station:
      </p>
      <ul className="mt-2 space-y-1">
        {preview.map((r, i) => (
          <li key={i} className="truncate text-xs text-white/35">
            {r.ratingClass ? (
              <span className="text-white/45">{r.ratingClass}</span>
            ) : null}
            {r.ratingClass ? " · " : ""}
            {r.scopeText}
            {r.locationScope ? ` [${r.locationScope}]` : ""}
          </li>
        ))}
        {scrapedCount > preview.length ? (
          <li className="text-xs text-white/25">
            …and {scrapedCount - preview.length} more
          </li>
        ) : null}
      </ul>
      <form action={action} className="mt-3">
        <input type="hidden" name="organisationId" value={org.id} />
        <input type="hidden" name="airportId" value={airportId} />
        <SubmitButton variant="ghost" pendingLabel="Importing…">
          Edit this station&rsquo;s scope
        </SubmitButton>
      </form>
    </div>
  );
}

function ScopeLineForm({
  org,
  airportId,
  row,
  nextSort,
  onDone,
}: {
  org: DashboardOrg;
  airportId: string;
  row: ManagedStationScopeRow | null;
  nextSort: number;
  onDone: () => void;
}) {
  const [state, action] = useFormState(saveStationScopeAction, EMPTY);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="airportId" value={airportId} />
      {row ? <input type="hidden" name="scopeId" value={row.id} /> : null}
      <input
        type="hidden"
        name="sortOrder"
        value={String(row?.sortOrder ?? nextSort)}
      />

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Authority" hint="EASA, FAA, UK-CAA…">
          <Input
            name="authorityCode"
            list="station-authority-codes"
            defaultValue={row?.authorityCode ?? ""}
            placeholder="EASA"
          />
        </Field>
        <Field label="Class rating">
          <Input
            name="ratingClass"
            defaultValue={row?.ratingClass ?? ""}
            placeholder="A1 / C6 / Components"
          />
        </Field>
      </div>

      <Field label="Scope line" hint="as it should read on the card">
        <Textarea
          name="scopeText"
          rows={2}
          defaultValue={row?.scopeText ?? ""}
          placeholder="Boeing 737-600/700/800/900 (CFM56)"
        />
      </Field>

      <Field label="Line or base" hint="where you work it at this station">
        <Select name="locationScope" defaultValue={row?.locationScope ?? ""}>
          <option value="">—</option>
          <option value="line">Line</option>
          <option value="base">Base</option>
          <option value="both">Both</option>
        </Select>
      </Field>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">
          {row ? "Save line" : "Add line"}
        </SubmitButton>
        <button
          type="button"
          onClick={onDone}
          className="rounded-[2px] px-3 py-2 text-sm text-white/35 transition hover:text-white/70"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteLineButton({ orgId, scopeId }: { orgId: string; scopeId: string }) {
  const [state, action] = useFormState(deleteStationScopeAction, EMPTY);

  return (
    <form action={action}>
      <input type="hidden" name="organisationId" value={orgId} />
      <input type="hidden" name="scopeId" value={scopeId} />
      <button
        type="submit"
        className="text-xs text-white/35 transition hover:text-red-300"
        title={state.error ?? "Remove this line"}
      >
        Remove
      </button>
    </form>
  );
}

function RevertButton({ orgId, airportId }: { orgId: string; airportId: string }) {
  const [state, action] = useFormState(revertStationScopeAction, EMPTY);

  return (
    <form action={action}>
      <input type="hidden" name="organisationId" value={orgId} />
      <input type="hidden" name="airportId" value={airportId} />
      <button
        type="submit"
        className="text-xs text-white/35 transition hover:text-red-300"
        title={
          state.error ??
          "Drop your lines for this station and show the scraped scope again"
        }
      >
        Revert to scraped
      </button>
    </form>
  );
}
