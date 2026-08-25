"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import {
  deleteStationAction,
  saveStationAction,
  type ActionState,
} from "../actions";
import type { DashboardOrg, DashboardStation } from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton } from "@/components/ui/Form";
import { ContactsBlock } from "./ContactsBlock";

const EMPTY: ActionState = {};

/**
 * Stations, and the desks operators call at each one.
 *
 * There is no separate Contacts tab any more, and no organisation-wide desk
 * block either: a desk belongs to the station it answers for, and a station can
 * hold as many as it needs (each with its own opening hours). A station with no
 * desks of its own shows the contact details from the Profile tab instead.
 * Everything here publishes instantly, straight to the real tables.
 */

export function StationsPanel({ org }: { org: DashboardOrg }) {
  const [open, setOpen] = useState<{
    id: string;
    mode: "update" | "remove";
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-6">
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

              return (
                <li
                  key={s.id}
                  className="rounded-[2px] border border-white/10 bg-black/30 p-4"
                >
                  {editing ? (
                    <StationForm org={org} station={s} onDone={() => setOpen(null)} />
                  ) : removing ? (
                    <RemoveStationForm
                      org={org}
                      station={s}
                      onDone={() => setOpen(null)}
                    />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4">
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
                          {s.address ? (
                            <p className="mt-0.5 truncate text-xs text-white/35">
                              {s.address}
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
                      </div>

                      <StationContacts org={org} station={s} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

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
    </div>
  );
}

// ------------------------------------------------------ station contacts ---

function StationContacts({
  org,
  station,
}: {
  org: DashboardOrg;
  station: DashboardStation;
}) {
  return (
    <ContactsBlock
      org={org}
      stationId={station.id}
      contacts={station.contacts}
      title="Contacts at this station"
      emptyText="None yet — the contact details from your Profile tab are shown for this station. Add a desk here to give operators a number that answers at this airport, with its own hours."
    />
  );
}

// -------------------------------------------------------------- station ----

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
      {station ? <input type="hidden" name="stationId" value={station.id} /> : null}

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
        {/* No phone or e-mail: 0008 dropped those columns. A number that
            answers at this airport is a desk in the contacts below, where it
            can carry hours and there can be more than one. */}
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
      <input type="hidden" name="stationId" value={station.id} />

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <p className="text-sm text-white/60">
        Remove{" "}
        <span className="text-white/90">
          {station.airportName ?? "this station"}
        </span>{" "}
        from your listing? You disappear from that airport on the map straight
        away, and this station&rsquo;s scope and desks go with it.
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
