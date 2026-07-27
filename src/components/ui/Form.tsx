"use client";

import { useFormStatus } from "react-dom";

/** Shared form furniture for the account + dashboard screens. */

export function Label({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wide2 text-neutral-400">
        {children}
      </span>
      {hint ? (
        <span className="text-[11px] text-neutral-500 truncate">{hint}</span>
      ) : null}
    </span>
  );
}

const inputClass =
  "w-full rounded-md border border-base-500 bg-base-900 px-3 py-2 text-sm text-neutral-100 " +
  "placeholder:text-neutral-600 outline-none transition focus:border-accent " +
  "focus:ring-1 focus:ring-accent/40 disabled:opacity-50";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`${inputClass} resize-y leading-relaxed ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  );
}

/**
 * Submit button that disables itself while the action is in flight — without
 * it a slow claim submission invites a double click and a duplicate row.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "ghost" | "danger";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();

  const styles = {
    primary:
      "bg-accent text-white hover:bg-accent-bright disabled:bg-accent/40",
    ghost:
      "border border-base-500 bg-transparent text-neutral-300 hover:border-neutral-500 hover:text-white",
    danger:
      "border border-red-500/60 bg-red-950/40 text-red-200 hover:bg-red-900/50",
  }[variant];

  return (
    <button
      {...rest}
      type={rest.type ?? "submit"}
      disabled={pending || rest.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm
        font-medium transition disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function Alert({
  kind,
  children,
}: {
  kind: "error" | "notice" | "info";
  children: React.ReactNode;
}) {
  if (!children) return null;
  const styles = {
    error: "border-red-500/50 bg-red-950/40 text-red-200",
    notice: "border-emerald-500/40 bg-emerald-950/30 text-emerald-200",
    info: "border-base-500 bg-base-800 text-neutral-300",
  }[kind];
  return (
    <p className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</p>
  );
}
