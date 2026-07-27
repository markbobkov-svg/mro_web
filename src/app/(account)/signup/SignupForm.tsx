"use client";

import Link from "next/link";
import { useFormState } from "react-dom";

import { signUpAction, type FormState } from "../actions";
import { Alert, Field, Input, SubmitButton } from "@/components/ui/Form";

const EMPTY: FormState = {};

export function SignupForm() {
  const [state, action] = useFormState(signUpAction, EMPTY);

  return (
    <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-6">
      <h1 className="text-sm font-medium tracking-wide2 text-white">Create an account</h1>
      <p className="mt-1 text-sm text-white/45">
        For Part-145 organisations that want to manage their own listing.
      </p>

      <form action={action} className="mt-5 space-y-4">
        {state.error ? <Alert kind="error">{state.error}</Alert> : null}

        <Field
          label="Work e-mail"
          hint="on your organisation's domain"
        >
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@your-mro.com"
          />
        </Field>

        <p className="text-xs leading-relaxed text-white/35">
          Use the address on your organisation&rsquo;s own domain. It lets us
          verify your claim automatically — a free mailbox
          (gmail, outlook&nbsp;…) means the claim waits for manual review.
        </p>

        <Field label="Your name">
          <Input name="fullName" autoComplete="name" placeholder="Jane Doe" />
        </Field>

        <Field label="Job title" hint="optional">
          <Input
            name="jobTitle"
            autoComplete="organization-title"
            placeholder="Quality Manager"
          />
        </Field>

        <Field label="Password" hint="10 characters or more">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>

        <SubmitButton className="w-full" pendingLabel="Creating…">
          Create account
        </SubmitButton>
      </form>

      <p className="mt-4 text-center text-xs text-white/35">
        Already registered?{" "}
        <Link href="/login" className="text-white/70 transition hover:text-white">
          Sign in
        </Link>
      </p>
    </div>
  );
}
