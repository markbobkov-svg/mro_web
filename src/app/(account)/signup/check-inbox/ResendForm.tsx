"use client";

import { useFormState } from "react-dom";

import { resendConfirmationAction, type FormState } from "../../actions";
import { Alert, SubmitButton } from "@/components/ui/Form";

const EMPTY: FormState = {};

export function ResendForm({ email }: { email: string }) {
  const [state, action] = useFormState(resendConfirmationAction, EMPTY);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}
      <SubmitButton variant="ghost" className="w-full" pendingLabel="Sending…">
        Send the link again
      </SubmitButton>
    </form>
  );
}
