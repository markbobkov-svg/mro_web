"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import {
  deleteStationAction,
  proposeChangeAction,
  saveStationAction,
  type ActionState,
} from "../actions";
import type {
  AuthorityOption,
  DashboardApproval,
  DashboardOrg,
  DashboardStation,
} from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: ActionState = {};

/**
 * Approvals and stations — read-only registry facts, each with a "propose a
 * change" form. Nothing here writes to the scraped tables; every submission
 * becomes a change request for an admin to apply. Both panels are exported
 * individually and shown as tabs by `DashboardTabs`. (Per-station scope, which
 * publishes instantly, lives in its own `StationScopeEditor`.)
 */

// ------------------------------------------------------------- approvals ---

export function ApprovalsPanel({
  org,
  authorities,
}: {
  org: DashboardOrg;
  authorities: AuthorityOption[];
}) {
  // Which approval's inline form is open, and whether it's an edit or a removal
  // — same shape as StationsPanel, so both tabs behave identically.
  const [open, setOpen] = useState<{
    id: string;
    mode: "update" | "remove";
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-3">
      {org.approvals.length === 0 ? (
        <p className="text-sm text-white/35">
          No approvals on file. If you hold one, add it below.
        </p>
      ) : (
        <ul className="space-y-2">
          {org.approvals.map((a) => {
            const editing = open?.id === a.id && open.mode === "update";
            const removing = open?.id === a.id && open.mode === "remove";

            if (editing || removing) {
              return (
                <li
                  key={a.id}
                  className="rounded-[2px] border border-white/10 bg-black/30 p-4"
                >
                  <ApprovalForm
                    org={org}
                    mode={open!.mode}
                    approval={a}
                    authorities={authorities}
                    onDone={() => setOpen(null)}
                  />
                </li>
              );
            }

            return (
              <li
                key={a.id}
                className="flex items-start justify-between gap-4 rounded-[2px]
                  border border-white/10 bg-black/30 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white/90">
                    <span className="mr-2 rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 text-white/45">
                      {a.authorityCode}
                    </span>
                    {a.approvalType}
                    {a.reference ? (
                      <span className="ml-2 font-mono text-xs text-white/45">
                        {a.reference}
                      </span>
                    ) : null}
                  </p>
                  {a.ratings.length > 0 ? (
                    <p className="mt-1 text-xs text-white/35">
                      {a.ratings.join(" · ")}
                    </p>
                  ) : null}
                  {a.validUntil ? (
                    <p className="mt-0.5 text-xs text-white/25">
                      valid until {a.validUntil}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen({ id: a.id, mode: "update" })}
                    className="text-xs text-white/45 transition hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen({ id: a.id, mode: "remove" })}
                    className="text-xs text-white/45 transition hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add approval — its own card below the list, boxed like the Scope
          tab's "New scope line" so a multi-field form has room to breathe. */}
      {addOpen ? (
        <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide2 text-white/45">
              Add an approval
            </span>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="text-xs text-white/35 transition hover:text-white/70"
            >
              Close
            </button>
          </div>
          <ApprovalForm
            org={org}
            mode="add"
            approval={null}
            authorities={authorities}
            onDone={() => setAddOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-[2px] border border-dashed border-white/10 px-4 py-2 text-sm
            text-white/45 transition hover:border-white/25 hover:text-white"
        >
          + Add an approval
        </button>
      )}
    </div>
  );
}

function ApprovalForm({
  org,
  mode,
  approval,
  authorities,
  onDone,
}: {
  org: DashboardOrg;
  mode: "add" | "update" | "remove";
  approval: DashboardApproval | null;
  authorities: AuthorityOption[];
  onDone: () => void;
}) {
  const [state, action] = useFormState(proposeChangeAction, EMPTY);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="target" value="approval" />
      <input type="hidden" name="action" value={mode} />
      {approval ? <input type="hidden" name="targetId" value={approval.id} /> : null}
      {/* Every approval on this map is a Part-145 approval — assign it by
          default rather than asking, so there's no type field to fill in. */}
      {mode === "add" ? <input type="hidden" name="approvalType" value="Part-145" /> : null}

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      {mode === "remove" ? (
        <p className="text-sm text-white/60">
          Remove{" "}
          <span className="text-white/90">
            {[approval?.authorityCode, approval?.approvalType]
              .filter(Boolean)
              .join(" ") || "this approval"}
          </span>{" "}
          from your listing? Tell the reviewer why below.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Authority" hint="from the authorities register">
            <select
              name="authorityCode"
              defaultValue={approval?.authorityCode ?? ""}
              required
              className="w-full rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 text-sm
                text-white/90 outline-none focus:border-accent"
            >
              <option value="">Select authority…</option>
              {authorities.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name ? `${a.code} — ${a.name}` : a.code}
                </option>
              ))}
              {/* Keep an existing code selectable even if it's not in the
                  register (e.g. an older scraped value). */}
              {approval?.authorityCode &&
              !authorities.some((a) => a.code === approval.authorityCode) ? (
                <option value={approval.authorityCode}>
                  {approval.authorityCode}
                </option>
              ) : null}
            </select>
          </Field>
          <Field label="Reference">
            <Input
              name="approvalReference"
              defaultValue={approval?.reference ?? ""}
              placeholder="DE.145.0123"
            />
          </Field>
          <Field label="Valid until" hint="YYYY-MM-DD">
            <Input name="validUntil" defaultValue={approval?.validUntil ?? ""} />
          </Field>
          <Field label="Ratings" hint="comma separated">
            <Input
              name="ratings"
              defaultValue={approval?.ratings.join(", ") ?? ""}
              placeholder="A1, C1, C2"
            />
          </Field>
          <Field label="Certificate URL">
            <Input
              name="sourceUrl"
              type="url"
              defaultValue={approval?.sourceUrl ?? ""}
            />
          </Field>
        </div>
      )}

      <Field
        label="Note for the reviewer"
        hint={mode === "remove" ? "required" : "a link to the certificate helps"}
      >
        <Textarea name="note" rows={2} />
      </Field>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Sending…">Send for review</SubmitButton>
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

// -------------------------------------------------------------- stations ---

export function StationsPanel({ org }: { org: DashboardOrg }) {
  // Which station's inline form is open, and whether it's an edit or a removal.
  const [open, setOpen] = useState<{
    id: string;
    mode: "update" | "remove";
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-3">
      {org.stations.length === 0 ? (
        <p className="text-sm text-white/35">
          You don&rsquo;t appear at any airport yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {org.stations.map((s) => {
            const editing = open?.id === s.id && open.mode === "update";
            const removing = open?.id === s.id && open.mode === "remove";

            if (editing || removing) {
              return (
                <li
                  key={s.id}
                  className="rounded-[2px] border border-white/10 bg-black/30 p-4"
                >
                  {editing ? (
                    <StationForm
                      org={org}
                      station={s}
                      onDone={() => setOpen(null)}
                    />
                  ) : (
                    <RemoveStationForm
                      org={org}
                      station={s}
                      onDone={() => setOpen(null)}
                    />
                  )}
                </li>
              );
            }

            return (
              <li
                key={s.id}
                className="flex items-start justify-between gap-4 rounded-[2px]
                  border border-white/10 bg-black/30 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white/90">
                    {s.iata || s.icao ? (
                      <span className="mr-2 font-mono text-xs text-accent">
                        {s.iata ?? s.icao}
                      </span>
                    ) : null}
                    {s.airportName ?? "Unknown airport"}
                    {s.isBase ? (
                      <span
                        className="ml-2 rounded-[2px] border border-accent/40 bg-accent/10
                          px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 text-accent-bright"
                        title="A main base for this organisation"
                      >
                        Base
                      </span>
                    ) : null}
                  </p>
                  {s.address || s.phone || s.email ? (
                    <p className="mt-0.5 truncate text-xs text-white/35">
                      {[s.address, s.phone, s.email].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen({ id: s.id, mode: "update" })}
                    className="text-xs text-white/45 transition hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen({ id: s.id, mode: "remove" })}
                    className="text-xs text-white/45 transition hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add station — its own card below the list, boxed like the Scope
          tab's "New scope line" so a multi-field form has room to breathe. */}
      {addOpen ? (
        <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide2 text-white/45">
              Add a station
            </span>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="text-xs text-white/35 transition hover:text-white/70"
            >
              Close
            </button>
          </div>
          <StationForm org={org} station={null} onDone={() => setAddOpen(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-[2px] border border-dashed border-white/10 px-4 py-2 text-sm
            text-white/45 transition hover:border-white/25 hover:text-white"
        >
          + Add a station
        </button>
      )}
    </div>
  );
}

/**
 * Add or correct a station. Publishes instantly — it writes the organisation's
 * own override row, never the scraped table, so a re-scrape can't undo it.
 *
 * An existing station is keyed by its airport (the pair the override keys on),
 * so the airport itself isn't editable here: moving to another airport is
 * removing this one and adding that one.
 */
function StationForm({
  org,
  station,
  onDone,
}: {
  org: DashboardOrg;
  station: DashboardStation | null;
  onDone: () => void;
}) {
  const [state, action] = useFormState(saveStationAction, EMPTY);
  const isNew = station === null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      {station?.airportId ? (
        <input type="hidden" name="airportId" value={station.airportId} />
      ) : null}

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      {!isNew ? (
        <p className="text-sm text-white/90">
          {station.iata || station.icao ? (
            <span className="mr-2 font-mono text-xs text-accent">
              {station.iata ?? station.icao}
            </span>
          ) : null}
          {station.airportName ?? "Unknown airport"}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {isNew ? (
          <Field label="Airport code" hint="IATA or ICAO">
            <Input name="airportCode" placeholder="FRA / EDDF" />
          </Field>
        ) : null}
        <Field label="Phone">
          <Input name="phone" defaultValue={station?.phone ?? ""} />
        </Field>
        <Field label="E-mail">
          <Input name="email" type="email" defaultValue={station?.email ?? ""} />
        </Field>
        <Field label="Address">
          <Input name="address" defaultValue={station?.address ?? ""} />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-white/70">
        <input
          type="checkbox"
          name="isBase"
          defaultChecked={station?.isBase ?? false}
          className="h-4 w-4 shrink-0 accent-accent"
        />
        This station is a main base
        <span className="text-xs text-white/35">
          (base maintenance, not just line)
        </span>
      </label>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">
          {isNew ? "Add station" : "Save station"}
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

/**
 * Removing a station takes the organisation off that airport on the public map
 * straight away, so it asks first — unlike the one-click Remove on contacts and
 * scope lines, which are cheap to retype.
 */
function RemoveStationForm({
  org,
  station,
  onDone,
}: {
  org: DashboardOrg;
  station: DashboardStation;
  onDone: () => void;
}) {
  const [state, action] = useFormState(deleteStationAction, EMPTY);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="airportId" value={station.airportId ?? ""} />

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <p className="text-sm text-white/60">
        Remove{" "}
        <span className="text-white/90">
          {station.airportName ?? "this station"}
        </span>{" "}
        from your listing? You disappear from that airport on the map straight
        away. You can add it back later.
      </p>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Removing…">Remove station</SubmitButton>
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

