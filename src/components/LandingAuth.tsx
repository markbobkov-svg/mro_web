"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";

import { signInAction, type FormState } from "@/app/(account)/actions";
import { RegisterForm } from "@/app/airline/register/RegisterForm";
import { SignupForm } from "@/app/(account)/signup/SignupForm";
import { Alert, SubmitButton } from "@/components/ui/Form";

/**
 * The landing's auth area. It opens on sign-in — an e-mail field, with the
 * password dropping in once an address is entered — because most visits are
 * returning users. "Register" switches to the role-first sign-up (pick who you
 * are, then the matching form loads); those forms are the same ones served at
 * /airline/register and /signup, reused here so there is one path in.
 */
const EMPTY: FormState = {};
type Role = "airline" | "org";

export default function LandingAuth() {
  const [mode, setMode] = useState<"login" | "role" | "form">("login");
  const [role, setRole] = useState<Role | null>(null);

  if (mode === "login") {
    return <LoginPanel onRegister={() => setMode("role")} />;
  }

  if (mode === "role") {
    return (
      <RolePicker
        onPick={(r) => {
          setRole(r);
          setMode("form");
        }}
        onCancel={() => setMode("login")}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <button
        type="button"
        onClick={() => setMode("role")}
        className="mb-3 text-xs text-white/45 transition hover:text-white/80"
      >
        ← Choose a different role
      </button>
      {role === "airline" ? <RegisterForm /> : <SignupForm />}
    </div>
  );
}

function LoginPanel({ onRegister }: { onRegister: () => void }) {
  const [state, action] = useFormState(signInAction, EMPTY);
  const [email, setEmail] = useState("");
  const [emailBlurred, setEmailBlurred] = useState(false);

  // Reveal the password once an e-mail has been entered.
  const reveal =
    /^\S+@\S+/.test(email.trim()) || (emailBlurred && email.trim().length > 0);

  // No card: frosted-glass fields that sit straight on the map, so the sign-in
  // reads as part of the page rather than a boxed widget over it.
  const field =
    "w-full rounded-[2px] border border-white/15 bg-white/[0.06] px-4 py-3 text-sm " +
    "text-white placeholder:text-white/40 outline-none backdrop-blur-md transition " +
    "focus:border-accent/60 focus:bg-white/[0.10]";

  return (
    <div className="mx-auto w-full max-w-sm">
      {state.error ? (
        <div className="mb-3">
          <Alert kind="error">{state.error}</Alert>
        </div>
      ) : null}

      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value="/" />

        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailBlurred(true)}
          placeholder="Work e-mail"
          aria-label="Work e-mail"
          className={field}
        />

        {/* Password drops down once an e-mail is entered (grid-rows 0fr→1fr is a
            real height animation; the inner div clips it meanwhile). */}
        <div
          className={`grid transition-all duration-300 ease-out ${
            reveal ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-3">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required={reveal}
                placeholder="Password"
                aria-label="Password"
                className={field}
              />
              <SubmitButton className="w-full py-3" pendingLabel="Signing in…">
                Sign in
              </SubmitButton>
              <div className="text-right">
                <Link
                  href="/login?next=%2F"
                  className="text-xs text-white/35 transition hover:text-white/70"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          </div>
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-white/55">
        Don&rsquo;t have an account yet?{" "}
        <button
          type="button"
          onClick={onRegister}
          className="text-accent-bright transition hover:text-white"
        >
          Register
        </button>
      </p>
    </div>
  );
}

function RolePicker({
  onPick,
  onCancel,
}: {
  onPick: (role: Role) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-[2px] border border-white/10 bg-[#141414]/70 p-6 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium tracking-wide2 text-white">
            Create an account
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-white/40 transition hover:text-white/75"
          >
            Cancel
          </button>
        </div>
        <p className="mt-1 text-sm text-white/45">First, who are you?</p>

        <div className="mt-4 grid gap-3">
          <RoleOption
            onClick={() => onPick("airline")}
            eyebrow="Airlines & operators"
            title="I operate aircraft"
            body="Find MROs by airport, compare approvals and scope, keep an account."
          />
          <RoleOption
            onClick={() => onPick("org")}
            eyebrow="Part-145 organisations"
            title="I run a maintenance organisation"
            body="Claim your listing and keep your approvals, scope and contacts current."
          />
        </div>
      </div>
      <p className="mt-3 text-center text-sm text-white/45">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onCancel}
          className="text-accent-bright transition hover:text-white"
        >
          Log in
        </button>
      </p>
    </div>
  );
}

function RoleOption({
  onClick,
  eyebrow,
  title,
  body,
}: {
  onClick: () => void;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[2px] border border-white/10 bg-black/40 p-4 text-left transition
        hover:border-accent/50 hover:bg-accent/5"
    >
      <p className="text-[10px] uppercase tracking-wide2 text-accent-bright/80">
        {eyebrow}
      </p>
      <p className="mt-1.5 text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/45">{body}</p>
    </button>
  );
}
