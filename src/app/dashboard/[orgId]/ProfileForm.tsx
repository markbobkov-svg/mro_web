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

      {/* Website and address only. Every way of reaching a person — the phone,
          the e-mail, the AOG number — is a desk now: organisation-wide ones
          below, per-airport ones on the Stations tab, each with its own hours.
          saveProfileAction leaves the old profile phone/e-mail/AOG columns
          alone rather than nulling them, since nothing posts them any more. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website">
          <Input
            name="website"
            type="url"
            defaultValue={p?.website ?? org.scraped.website ?? ""}
            placeholder="https://…"
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
