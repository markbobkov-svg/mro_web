"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";

import {
  deleteContactAction,
  saveContactAction,
  type ActionState,
} from "../actions";
import type { DashboardContact, DashboardOrg } from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton } from "@/components/ui/Form";

const EMPTY: ActionState = {};

/**
 * The list-plus-add-form for contact desks, shared by the Stations tab and the
 * Profile tab.
 *
 * The only difference between the two is `stationId`: a desk with one answers
 * for that airport, a desk without is the organisation's own and stands in for
 * any station that has no desks of its own (see getAirportDetail). Everything
 * else — the fields, the duplicate handling, closing on save — is identical, so
 * it lives here once rather than twice.
 */
export function ContactsBlock({
  org,
  stationId,
  contacts,
  title,
  emptyText,
}: {
  org: DashboardOrg;
  /** The station these desks answer for; null for the organisation's own. */
  stationId: string | null;
  contacts: DashboardContact[];
  title: string;
  emptyText: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const count = contacts.length;
  const here = stationId ? " here" : "";

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide2 text-white/35">
        {title}
      </p>

      {count > 0 ? (
        <ul className="space-y-1.5">
          {contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="rounded-[2px] bg-black/40 p-3">
                <ContactForm
                  org={org}
                  stationId={stationId}
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
        <p className="text-xs text-white/35">{emptyText}</p>
      )}

      {adding ? (
        <div className="mt-2 rounded-[2px] bg-black/40 p-3">
          <ContactForm
            org={org}
            stationId={stationId}
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
          {count > 0 ? `+ Add another contact${here}` : `+ Add a contact${here}`}
        </button>
      )}
    </div>
  );
}

function ContactRow({
  org,
  contact,
  onEdit,
}: {
  org: DashboardOrg;
  contact: DashboardContact;
  onEdit: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-4 rounded-[2px] bg-black/20 px-3 py-2">
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
  stationId: string | null;
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
      <input type="hidden" name="stationId" value={stationId ?? ""} />
      {/* A station-less desk has to be asked for: the action refuses one that
          simply arrives with no station, so a bug in the station form can never
          quietly create an organisation-wide desk. */}
      {stationId ? null : <input type="hidden" name="orgWide" value="1" />}
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
