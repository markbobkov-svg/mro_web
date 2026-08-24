"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";

import {
  deleteContactAction,
  deleteStationAction,
  saveContactAction,
  saveStationAction,
  type ActionState,
} from "../actions";
import type {
  DashboardContact,
  DashboardOrg,
  DashboardStation,
} from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton } from "@/components/ui/Form";

const EMPTY: ActionState = {};

/**
 * Stations, and the desks operators call at each one.
 *
 * There is no separate Contacts tab any more: a desk belongs to the station it
 * answers for. A station with no desks of its own falls back to the
 * organisation-wide ones, which are maintained in their own block at the foot
 * of the tab. Everything here publishes instantly, straight to the real tables.
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
                          {s.address || s.phone || s.email || s.hours ? (
                            <p className="mt-0.5 truncate text-xs text-white/35">
                              {[s.address, s.phone, s.hours, s.email]
                                .filter(Boolean)
                                .join(" · ")}
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

      <OrgWideContacts org={org} />
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const usingFallback = station.contacts.length === 0 && org.orgContacts.length > 0;

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide2 text-white/35">
        Contacts at this station
      </p>

      {station.contacts.length > 0 ? (
        <ul className="space-y-1.5">
          {station.contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="rounded-[2px] bg-black/40 p-3">
                <ContactForm
                  org={org}
                  stationId={station.id}
                  contact={c}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ContactRow
                key={c.id}
                org={org}
                contact={c}
                onEdit={() => setEditingId(c.id)}
              />
            ),
          )}
        </ul>
      ) : (
        <p className="text-xs text-white/35">
          {usingFallback
            ? "None of its own — the organisation-wide desks below are shown for this station."
            : "No desks yet."}
        </p>
      )}

      {adding ? (
        <div className="mt-2 rounded-[2px] bg-black/40 p-3">
          <ContactForm
            org={org}
            stationId={station.id}
            contact={null}
            onDone={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 text-xs text-white/45 transition hover:text-white"
        >
          + Add a contact here
        </button>
      )}
    </div>
  );
}

/** Desks with no station — the fallback for stations that have none. */
function OrgWideContacts({ org }: { org: DashboardOrg }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-white">Organisation-wide desks</h3>
        <p className="mt-1 text-xs text-white/35">
          Shown for any station that has no contacts of its own.
        </p>
      </div>

      {org.orgContacts.length === 0 ? (
        <p className="text-sm text-white/35">
          None yet. Add the desks operators should call when a station has no
          number of its own.
        </p>
      ) : (
        <ul className="space-y-2">
          {org.orgContacts.map((c) =>
            editingId === c.id ? (
              <li
                key={c.id}
                className="rounded-[2px] border border-white/10 bg-black/30 p-4"
              >
                <ContactForm
                  org={org}
                  stationId=""
                  contact={c}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ContactRow
                key={c.id}
                org={org}
                contact={c}
                boxed
                onEdit={() => setEditingId(c.id)}
              />
            ),
          )}
        </ul>
      )}

      {adding ? (
        <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide2 text-white/45">
              Add a contact
            </span>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-xs text-white/35 transition hover:text-white/70"
            >
              Close
            </button>
          </div>
          <ContactForm
            org={org}
            stationId=""
            contact={null}
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
          + Add a contact
        </button>
      )}
    </div>
  );
}

function ContactRow({
  org,
  contact,
  boxed,
  onEdit,
}: {
  org: DashboardOrg;
  contact: DashboardContact;
  boxed?: boolean;
  onEdit: () => void;
}) {
  return (
    <li
      className={`flex items-start justify-between gap-4 ${
        boxed
          ? "rounded-[2px] border border-white/10 bg-black/30 p-4"
          : "rounded-[2px] bg-black/20 px-3 py-2"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm text-white/90">
          {contact.functionLabel ?? contact.name ?? "Contact"}
        </p>
        <p className="mt-0.5 truncate text-xs text-white/35">
          {[contact.name, contact.phone, contact.email, contact.hours]
            .filter(Boolean)
            .join(" · ")}
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
        <DeleteContactButton orgId={org.id} contactId={contact.id} />
      </div>
    </li>
  );
}

function ContactForm({
  org,
  stationId,
  contact,
  onDone,
}: {
  org: DashboardOrg;
  /** "" makes it an organisation-wide desk. */
  stationId: string;
  contact: DashboardContact | null;
  onDone: () => void;
}) {
  const [state, action] = useFormState(saveContactAction, EMPTY);

  // Close once the save lands. The saved desk then appears in the list above and
  // the "+ Add a contact" button comes back — without this the form stayed open
  // still holding the values just saved, so adding a second desk re-submitted
  // the first one and tripped the duplicate guard.
  const saved = Boolean(state.notice);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (saved) done.current();
  }, [saved]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="stationId" value={stationId} />
      {contact ? <input type="hidden" name="contactId" value={contact.id} /> : null}

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Desk / function">
          <Input
            name="functionLabel"
            defaultValue={contact?.functionLabel ?? ""}
            placeholder="Line Maintenance Control"
          />
        </Field>
        <Field label="Person" hint="optional">
          <Input name="name" defaultValue={contact?.name ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={contact?.phone ?? ""} />
        </Field>
        <Field label="E-mail">
          <Input name="email" type="email" defaultValue={contact?.email ?? ""} />
        </Field>
        <Field label="Phone hours" hint="when this desk is reachable">
          <Input
            name="hours"
            defaultValue={contact?.hours ?? ""}
            placeholder="24/7 or Mon–Fri 06:00–22:00"
          />
        </Field>
        <Field label="Order" hint="lower shows first">
          <Input
            name="sortOrder"
            type="number"
            defaultValue={String(contact?.sortOrder ?? 0)}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">
          {contact ? "Save contact" : "Add contact"}
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

function DeleteContactButton({
  orgId,
  contactId,
}: {
  orgId: string;
  contactId: string;
}) {
  const [state, action] = useFormState(deleteContactAction, EMPTY);

  return (
    // `contents` keeps the button itself the flex item, so it lines up with Edit.
    <form action={action} className="contents">
      <input type="hidden" name="organisationId" value={orgId} />
      <input type="hidden" name="contactId" value={contactId} />
      <button
        type="submit"
        className="text-xs text-white/35 transition hover:text-red-300"
        title={state.error ?? "Remove this contact"}
      >
        Remove
      </button>
    </form>
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
        <Field label="Phone">
          <Input name="phone" defaultValue={station?.phone ?? ""} />
        </Field>
        <Field label="Phone hours" hint="when that number is answered">
          <Input
            name="hours"
            defaultValue={station?.hours ?? ""}
            placeholder="24/7 or Mon–Fri 06:00–22:00"
          />
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
