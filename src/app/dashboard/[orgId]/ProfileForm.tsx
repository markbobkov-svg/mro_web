"use client";

import { useFormState } from "react-dom";

import { saveProfileAction, type ActionState } from "../actions";
import type { DashboardOrg } from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton, Textarea } from "@/components/ui/Form";
import { ContactsBlock } from "./ContactsBlock";

const EMPTY: ActionState = {};

export function ProfileForm({ org }: { org: DashboardOrg }) {
  return (
    <div className="space-y-4">
      <ProfileFields org={org} />

      {/* Its own panel, and deliberately outside the form above: each desk is a
          form of its own, and a form inside a form is invalid HTML — the inner
          one is dropped and its fields post to the outer action instead. */}
      <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
        <p className="text-[11px] uppercase tracking-wide2 text-white/50">
          Contact desks
        </p>
        <p className="mt-1 text-xs leading-relaxed text-white/40">
          The organisation&rsquo;s own desks, each with its own phone hours.
          They stand in at any of your airports that has no desks of its own —
          add those on the Stations tab, where they belong to one airport.
        </p>
        <ContactsBlock
          org={org}
          stationId={null}
          contacts={org.orgContacts}
          title="Organisation-wide desks"
          emptyText="None yet — the phone, e-mail and website above are shown instead. Add a desk to give operators a named number with its own hours."
        />
      </div>
    </div>
  );
}

function ProfileFields({ org }: { org: DashboardOrg }) {
  const [state, action] = useFormState(saveProfileAction, EMPTY);
  const p = org.profile;

  return (
    <form action={action} className="space-y-4 rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      <input type="hidden" name="organisationId" value={org.id} />

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <Field label="Tagline" hint="one line, shown under your name">
        <Input
          name="tagline"
          defaultValue={p?.tagline ?? ""}
          maxLength={120}
          placeholder="Line and base maintenance for narrow-body fleets"
        />
      </Field>

      <Field label="About">
        <Textarea
          name="description"
          rows={4}
          defaultValue={p?.description ?? ""}
          placeholder="What you do, which fleets you cover, how fast you can respond."
        />
      </Field>

      <Field label="Logo URL" hint="a direct link to a PNG or SVG">
        <Input
          name="logoUrl"
          type="url"
          defaultValue={p?.logoUrl ?? ""}
          placeholder="https://example.com/logo.svg"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website">
          <Input
            name="website"
            type="url"
            defaultValue={p?.website ?? org.scraped.website ?? ""}
            placeholder="https://…"
          />
        </Field>
        <Field label="E-mail">
          <Input
            name="email"
            type="email"
            defaultValue={p?.email ?? org.scraped.email ?? ""}
            placeholder="ops@example.com"
          />
        </Field>
        <Field label="Phone">
          <Input
            name="phone"
            defaultValue={p?.phone ?? org.scraped.phone ?? ""}
            placeholder="+49 …"
          />
        </Field>
        <Field label="Address">
          <Input
            name="address"
            defaultValue={p?.address ?? org.scraped.address ?? ""}
            placeholder="Street, City, Country"
          />
        </Field>
      </div>

      <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
        <p className="mb-3 text-[10px] uppercase tracking-wide2 text-white/45">
          AOG desk
        </p>
        <p className="mb-3 text-xs text-white/35">
          The number an operator calls when an aircraft is on the ground. Shown
          prominently on your card.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="AOG phone">
            <Input name="aogPhone" defaultValue={p?.aogPhone ?? ""} placeholder="+49 …" />
          </Field>
          <Field label="AOG e-mail">
            <Input name="aogEmail" type="email" defaultValue={p?.aogEmail ?? ""} />
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <p className="text-xs text-white/25">
          {p?.updatedAt ? `Last saved ${formatDate(p.updatedAt)}` : "Not edited yet"}
        </p>
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
      </div>
    </form>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB");
}
