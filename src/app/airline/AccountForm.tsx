"use client";

import { useFormState } from "react-dom";

import { saveAirlineAccountAction, type AirlineFormState } from "./actions";
import { Alert, Field, Input, SubmitButton } from "@/components/ui/Form";

const EMPTY: AirlineFormState = {};

export function AccountForm({
  fullName,
  jobTitle,
  phone,
}: {
  fullName: string;
  jobTitle: string;
  phone: string;
}) {
  const [state, action] = useFormState(saveAirlineAccountAction, EMPTY);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name">
          <Input name="fullName" defaultValue={fullName} placeholder="Jane Doe" />
        </Field>
        <Field label="Job title" hint="optional">
          <Input
            name="jobTitle"
            defaultValue={jobTitle}
            placeholder="Fleet Manager"
          />
        </Field>
      </div>
      <Field label="Phone" hint="optional">
        <Input name="phone" defaultValue={phone} placeholder="+49 …" />
      </Field>

      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
