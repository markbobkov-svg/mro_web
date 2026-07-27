"use client";

import { useFormState } from "react-dom";

import { saveProfileAction, type ActionState } from "../actions";
import type { DashboardOrg } from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: ActionState = {};

export function ProfileForm({ org }: { org: DashboardOrg }) {
  const [state, action] = useFormState(saveProfileAction, EMPTY);
  const p = org.profile;

  return (
    <form action={action} className="space-y-4 rounded-xl border border-base-600 bg-base-800 p-5">
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
        <Field label="Website" hint={fallbackHint(org.scraped.website)}>
          <Input name="website" type="url" defaultValue={p?.website ?? ""} />
        </Field>
        <Field label="E-mail" hint={fallbackHint(org.scraped.email)}>
          <Input name="email" type="email" defaultValue={p?.email ?? ""} />
        </Field>
        <Field label="Phone" hint={fallbackHint(org.scraped.phone)}>
          <Input name="phone" defaultValue={p?.phone ?? ""} />
        </Field>
        <Field label="Address" hint={fallbackHint(org.scraped.address)}>
          <Input name="address" defaultValue={p?.address ?? ""} />
        </Field>
      </div>

      <div className="rounded-lg border border-base-500 bg-base-900 p-4">
        <p className="mb-3 text-[11px] uppercase tracking-wide2 text-neutral-400">
          AOG desk
        </p>
        <p className="mb-3 text-xs text-neutral-500">
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
        <p className="text-xs text-neutral-600">
          {p?.updatedAt ? `Last saved ${formatDate(p.updatedAt)}` : "Not edited yet"}
        </p>
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
      </div>
    </form>
  );
}

function fallbackHint(value: string | null): string | undefined {
  return value ? `now: ${value}` : "not on file";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB");
}
