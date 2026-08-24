"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";

import {
  deleteOrgScopeAction,
  deleteStationScopeAction,
  importOrgScopeToStationAction,
  saveOrgScopeAction,
  saveStationScopeAction,
  type ActionState,
} from "../actions";
import type {
  DashboardApproval,
  DashboardOrg,
  DashboardScopeLine,
  DashboardStation,
} from "@/lib/dashboard";
import { Alert, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: ActionState = {};

/**
 * Certified scope, at two levels.
 *
 * `OrgScopePanel` maintains `organisation_scope` — everything the organisation
 * is approved for. `StationScopePanel` maintains `organisation_station_scope`
 * — what it actually works at one airport, which is what the public card shows.
 * A station can import the organisation's scope wholesale and then trim it, or
 * be filled in line by line from scratch.
 *
 * Every line points at the approval it is certified under, so the card can group
 * it by authority.
 */

// ------------------------------------------------------------ shared UI ----

function ScopeLineRow({
  line,
  approvals,
  onEdit,
  children,
}: {
  line: DashboardScopeLine;
  approvals: DashboardApproval[];
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const approval = approvals.find((a) => a.id === line.approvalId) ?? null;

  return (
    <li
      className="flex items-start justify-between gap-4 rounded-[2px] border
        border-white/10 bg-black/30 p-4"
    >
      <div className="min-w-0">
        <p className="text-sm text-white/90">
          {line.ratingClass ? (
            <span className="mr-2 rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 text-white/45">
              {line.ratingClass}
            </span>
          ) : null}
          {line.scopeText}
          {line.locationScope ? (
            <span className="ml-2 text-xs text-white/25">[{line.locationScope}]</span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-white/35">
          {approval ? (
            <>
              {approval.authorityCode} · {approval.approvalType}
              {approval.reference ? ` · ${approval.reference}` : ""}
            </>
          ) : (
            <span className="text-amber-300/70">No approval linked</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-white/45 transition hover:text-white"
        >
          Edit
        </button>
        {children}
      </div>
    </li>
  );
}

function DeleteLineButton({
  action,
  organisationId,
  scopeId,
}: {
  action: typeof deleteOrgScopeAction;
  organisationId: string;
  scopeId: string;
}) {
  const [state, formAction] = useFormState(action, EMPTY);

  return (
    // `contents` keeps the button itself the flex item, so it lines up with Edit.
    <form action={formAction} className="contents">
      <input type="hidden" name="organisationId" value={organisationId} />
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

/** The fields shared by both scope levels, including the approval dropdown. */
function ScopeFields({
  line,
  approvals,
}: {
  line: DashboardScopeLine | null;
  approvals: DashboardApproval[];
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Approval" hint="which certificate covers this line">
          <Select name="approvalId" defaultValue={line?.approvalId ?? ""}>
            <option value="">— not linked —</option>
            {approvals.map((a) => (
              <option key={a.id} value={a.id}>
                {[a.authorityCode, a.approvalType, a.reference]
                  .filter(Boolean)
                  .join(" · ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class rating">
          <Input
            name="ratingClass"
            defaultValue={line?.ratingClass ?? ""}
            placeholder="A1 / C6 / Components"
          />
        </Field>
      </div>

      <Field label="Scope line" hint="as it should read on the card">
        <Textarea
          name="scopeText"
          rows={2}
          defaultValue={line?.scopeText ?? ""}
          placeholder="Boeing 737-600/700/800/900 (CFM56)"
        />
      </Field>

      <Field label="Line or base">
        <Select name="locationScope" defaultValue={line?.locationScope ?? ""}>
          <option value="">—</option>
          <option value="line">Line</option>
          <option value="base">Base</option>
          <option value="both">Both</option>
        </Select>
      </Field>
    </>
  );
}

function AddBox({
  label,
  open,
  onOpen,
  onClose,
  children,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="rounded-[2px] border border-dashed border-white/10 px-4 py-2 text-sm
          text-white/45 transition hover:border-white/25 hover:text-white"
      >
        + {label}
      </button>
    );
  }
  return (
    <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide2 text-white/45">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-white/35 transition hover:text-white/70"
        >
          Close
        </button>
      </div>
      {children}
    </div>
  );
}

// ------------------------------------------------- organisation scope ------

export function OrgScopePanel({ org }: { org: DashboardOrg }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {org.orgScope.length === 0 ? (
        <p className="text-sm text-white/35">
          No certified scope on file yet. Add what you are approved for — a
          station can then import it in one click.
        </p>
      ) : (
        <ul className="space-y-2">
          {org.orgScope.map((line) =>
            editingId === line.id ? (
              <li
                key={line.id}
                className="rounded-[2px] border border-white/10 bg-black/30 p-4"
              >
                <OrgScopeForm
                  org={org}
                  line={line}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ScopeLineRow
                key={line.id}
                line={line}
                approvals={org.approvals}
                onEdit={() => setEditingId(line.id)}
              >
                <DeleteLineButton
                  action={deleteOrgScopeAction}
                  organisationId={org.id}
                  scopeId={line.id}
                />
              </ScopeLineRow>
            ),
          )}
        </ul>
      )}

      <AddBox
        label="Add a scope line"
        open={adding}
        onOpen={() => setAdding(true)}
        onClose={() => setAdding(false)}
      >
        <OrgScopeForm org={org} line={null} onDone={() => setAdding(false)} />
      </AddBox>
    </div>
  );
}

function OrgScopeForm({
  org,
  line,
  onDone,
}: {
  org: DashboardOrg;
  line: DashboardScopeLine | null;
  onDone: () => void;
}) {
  const [state, action] = useFormState(saveOrgScopeAction, EMPTY);

  // Close once the save lands, so the new line shows in the list and the next
  // one can be added — otherwise the form stays open holding what was just
  // saved and re-submitting it trips the duplicate guard.
  const saved = Boolean(state.notice);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (saved) done.current();
  }, [saved]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      {line ? <input type="hidden" name="scopeId" value={line.id} /> : null}

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <ScopeFields line={line} approvals={org.approvals} />

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">
          {line ? "Save line" : "Add line"}
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

// ----------------------------------------------------- station scope -------

export function StationScopePanel({ org }: { org: DashboardOrg }) {
  const [stationId, setStationId] = useState(org.stations[0]?.id ?? "");

  if (org.stations.length === 0) {
    return (
      <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
        <p className="text-sm text-white/35">
          You don&rsquo;t appear at any airport yet, so there is no station scope
          to edit. Stations are added from the Stations tab.
        </p>
      </div>
    );
  }

  const station = org.stations.find((s) => s.id === stationId) ?? org.stations[0];

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[10px] uppercase tracking-wide2 text-white/40">
          Station
        </span>
        <Select
          value={station.id}
          onChange={(e) => setStationId(e.target.value)}
          className="max-w-md"
        >
          {org.stations.map((s) => (
            <option key={s.id} value={s.id}>
              {[s.iata ?? s.icao, s.airportName].filter(Boolean).join(" — ") ||
                "Station"}
            </option>
          ))}
        </Select>
      </label>

      {/* Remount on station switch so every in-flight form resets cleanly. */}
      <StationScopeBody key={station.id} org={org} station={station} />
    </div>
  );
}

function StationScopeBody({
  org,
  station,
}: {
  org: DashboardOrg;
  station: DashboardStation;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      {station.scope.length === 0 ? (
        <p className="text-sm text-white/35">
          Nothing on file for this station yet. Import the organisation&rsquo;s
          scope below, or add the lines you work here one at a time.
        </p>
      ) : (
        <ul className="space-y-2">
          {station.scope.map((line) =>
            editingId === line.id ? (
              <li
                key={line.id}
                className="rounded-[2px] border border-white/10 bg-black/30 p-4"
              >
                <StationScopeForm
                  org={org}
                  station={station}
                  line={line}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ScopeLineRow
                key={line.id}
                line={line}
                approvals={org.approvals}
                onEdit={() => setEditingId(line.id)}
              >
                <DeleteLineButton
                  action={deleteStationScopeAction}
                  organisationId={org.id}
                  scopeId={line.id}
                />
              </ScopeLineRow>
            ),
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <AddBox
          label="Add a scope line"
          open={adding}
          onOpen={() => setAdding(true)}
          onClose={() => setAdding(false)}
        >
          <StationScopeForm
            org={org}
            station={station}
            line={null}
            onDone={() => setAdding(false)}
          />
        </AddBox>
        {!adding ? <ImportOrgScopeButton org={org} station={station} /> : null}
      </div>
    </div>
  );
}

/**
 * Copy the whole organisation scope onto this station. It replaces what the
 * station has, so importing twice can't double it up; individual lines are then
 * edited or removed above.
 */
function ImportOrgScopeButton({
  org,
  station,
}: {
  org: DashboardOrg;
  station: DashboardStation;
}) {
  const [state, action] = useFormState(importOrgScopeToStationAction, EMPTY);

  if (org.orgScope.length === 0) return null;

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="stationId" value={station.id} />
      <SubmitButton variant="ghost" pendingLabel="Importing…">
        {station.scope.length > 0
          ? `Replace with organisation scope (${org.orgScope.length})`
          : `Import organisation scope (${org.orgScope.length})`}
      </SubmitButton>
      {state.error ? (
        <span className="text-xs text-red-300">{state.error}</span>
      ) : null}
    </form>
  );
}

function StationScopeForm({
  org,
  station,
  line,
  onDone,
}: {
  org: DashboardOrg;
  station: DashboardStation;
  line: DashboardScopeLine | null;
  onDone: () => void;
}) {
  const [state, action] = useFormState(saveStationScopeAction, EMPTY);

  // Close once the save lands, so the new line shows in the list and the next
  // one can be added — otherwise the form stays open holding what was just
  // saved and re-submitting it trips the duplicate guard.
  const saved = Boolean(state.notice);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (saved) done.current();
  }, [saved]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="stationId" value={station.id} />
      {line ? <input type="hidden" name="scopeId" value={line.id} /> : null}

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <ScopeFields line={line} approvals={org.approvals} />

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">
          {line ? "Save line" : "Add line"}
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
