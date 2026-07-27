"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { useState } from "react";

import {
  requestPasswordResetAction,
  signInAction,
  type FormState,
} from "../actions";
import { Alert, Field, Input, SubmitButton } from "@/components/ui/Form";

const EMPTY: FormState = {};

export function LoginForm({
  next,
  confirmed,
}: {
  next: string;
  confirmed: boolean;
}) {
  const [state, action] = useFormState(signInAction, EMPTY);
  const [resetState, resetAction] = useFormState(requestPasswordResetAction, EMPTY);
  const [showReset, setShowReset] = useState(false);

  return (
    <div className="rounded-xl border border-base-600 bg-base-800 p-6">
      <h1 className="text-base font-semibold text-white">Sign in</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Manage your organisation&rsquo;s listing.
      </p>

      <div className="mt-5 space-y-4">
        {confirmed ? (
          <Alert kind="notice">E-mail confirmed — you can sign in now.</Alert>
        ) : null}
        {state.error ? <Alert kind="error">{state.error}</Alert> : null}

        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Work e-mail">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@your-mro.com"
            />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <SubmitButton className="w-full" pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>

        <div className="flex items-center justify-between text-xs text-neutral-500">
          <button
            type="button"
            onClick={() => setShowReset((v) => !v)}
            className="transition hover:text-neutral-300"
          >
            Forgot password?
          </button>
          <Link href="/signup" className="transition hover:text-neutral-300">
            Create an account
          </Link>
        </div>

        {showReset ? (
          <form action={resetAction} className="space-y-3 border-t border-base-600 pt-4">
            {resetState.error ? <Alert kind="error">{resetState.error}</Alert> : null}
            {resetState.notice ? <Alert kind="notice">{resetState.notice}</Alert> : null}
            <Field label="Send a reset link to">
              <Input name="email" type="email" required placeholder="you@your-mro.com" />
            </Field>
            <SubmitButton variant="ghost" className="w-full" pendingLabel="Sending…">
              Send reset link
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
