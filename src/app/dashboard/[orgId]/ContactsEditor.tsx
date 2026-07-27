"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import {
  deleteContactAction,
  importScrapedContactsAction,
  saveContactAction,
  type ActionState,
} from "../actions";
import type { DashboardOrg, ManagedContact } from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton } from "@/components/ui/Form";

const EMPTY: ActionState = {};

export function ContactsEditor({ org }: { org: DashboardOrg }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const hasManaged = org.contacts.length > 0;

  return (
    <div className="space-y-3 rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      {!hasManaged ? (
        <ImportPanel org={org} />
      ) : null}

      {hasManaged ? (
        <ul className="divide-y divide-white/10">
          {org.contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="py-4">
                <ContactForm
                  org={org}
                  contact={c}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={c.id}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white/90">
                    {c.functionLabel ?? c.name ?? "Contact"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-white/35">
                    {[c.name, c.phone, c.email, c.hours].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(c.id)}
                    className="text-xs text-white/45 transition hover:text-white"
                  >
                    Edit
                  </button>
                  <DeleteContactButton orgId={org.id} contactId={c.id} />
                </div>
              </li>
            ),
          )}
        </ul>
      ) : null}

      {adding ? (
        <div className="border-t border-white/10 pt-4">
          <ContactForm
            org={org}
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

function ImportPanel({ org }: { org: DashboardOrg }) {
  const [state, action] = useFormState(importScrapedContactsAction, EMPTY);

  if (org.scrapedContacts.length === 0) {
    return (
      <p className="text-sm text-white/35">
        No contacts on file yet. Add the desks operators should call.
      </p>
    );
  }

  return (
    <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <p className="text-xs text-white/45">
        We currently show {org.scrapedContacts.length} scraped contact
        {org.scrapedContacts.length === 1 ? "" : "s"} on your card:
      </p>
      <ul className="mt-2 space-y-1">
        {org.scrapedContacts.slice(0, 5).map((c) => (
          <li key={c.id} className="truncate text-xs text-white/35">
            {[c.functionLabel, c.name, c.phone, c.email].filter(Boolean).join(" · ")}
          </li>
        ))}
      </ul>
      <form action={action} className="mt-3">
        <input type="hidden" name="organisationId" value={org.id} />
        <SubmitButton variant="ghost" pendingLabel="Importing…">
          Import them and take over
        </SubmitButton>
      </form>
    </div>
  );
}

function ContactForm({
  org,
  contact,
  onDone,
}: {
  org: DashboardOrg;
  contact: ManagedContact | null;
  onDone: () => void;
}) {
  const [state, action] = useFormState(saveContactAction, EMPTY);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
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
        <Field label="Hours" hint="optional">
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
    <form action={action}>
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
