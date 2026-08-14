"use client";

import Link from "next/link";
import { useState } from "react";

import { RegisterForm } from "@/app/airline/register/RegisterForm";
import { SignupForm } from "@/app/(account)/signup/SignupForm";

/**
 * The landing's only actions: log in, or register. Registration is role-first —
 * "Register" opens a step where you pick who you are (airline/operator or
 * Part-145 organisation), and the matching form loads. Those two forms are the
 * very same ones served at /airline/register and /signup, reused here so there
 * is one registration path, not a fork the visitor has to find.
 */
type Role = "airline" | "org";

export default function LandingAuth() {
  const [step, setStep] = useState<"choose" | "role" | "form">("choose");
  const [role, setRole] = useState<Role | null>(null);

  // Entry — two buttons, nothing else.
  if (step === "choose") {
    return (
      <div className="mx-auto flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => setStep("role")}
          className="w-full rounded-[2px] border border-accent/50 bg-accent/15 px-4 py-3
            text-sm font-medium text-accent-bright transition
            hover:border-accent hover:bg-accent/25 hover:text-white"
        >
          Register
        </button>
        <Link
          href="/login?next=%2F"
          className="w-full rounded-[2px] border border-white/15 bg-white/[0.04] px-4 py-3
            text-center text-sm text-white/80 backdrop-blur-sm transition
            hover:border-white/30 hover:text-white"
        >
          Log in
        </Link>
      </div>
    );
  }

  // Step 1 of registration — choose a role.
  if (step === "role") {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-[2px] border border-white/10 bg-[#141414]/70 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium tracking-wide2 text-white">
              Create an account
            </h2>
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="text-xs text-white/40 transition hover:text-white/75"
            >
              Cancel
            </button>
          </div>
          <p className="mt-1 text-sm text-white/45">First, who are you?</p>

          <div className="mt-4 grid gap-3">
            <RoleOption
              onClick={() => {
                setRole("airline");
                setStep("form");
              }}
              eyebrow="Airlines & operators"
              title="I operate aircraft"
              body="Find MROs by airport, compare approvals and scope, keep an account."
            />
            <RoleOption
              onClick={() => {
                setRole("org");
                setStep("form");
              }}
              eyebrow="Part-145 organisations"
              title="I run a maintenance organisation"
              body="Claim your listing and keep your approvals, scope and contacts current."
            />
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-white/45">
          Already have an account?{" "}
          <Link
            href="/login?next=%2F"
            className="text-accent-bright transition hover:text-white"
          >
            Log in
          </Link>
        </p>
      </div>
    );
  }

  // Step 2 — the role-specific form (reused from its own route).
  return (
    <div className="mx-auto w-full max-w-md">
      <button
        type="button"
        onClick={() => setStep("role")}
        className="mb-3 text-xs text-white/45 transition hover:text-white/80"
      >
        ← Choose a different role
      </button>
      {role === "airline" ? <RegisterForm /> : <SignupForm />}
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
