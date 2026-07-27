"use client";

import { useFormStatus } from "react-dom";

/**
 * Shared furniture for the account + dashboard screens.
 *
 * Same visual language as the map: 2px corners, hairline white borders over a
 * near-black translucent panel, tiny uppercase labels, opacity-graded text
 * rather than a grey scale, and accent-bright reserved for what matters.
 */

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[2px] border border-white/10 bg-[#141414]/60 backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

/** Section eyebrow — the `Part-145 · MRO · Europe` treatment. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-wide2 text-white/35">
      {children}
    </p>
  );
}

export function Label({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wide2 text-white/40">
        {children}
      </span>
      {hint ? (
        <span className="truncate text-[10px] text-white/25">{hint}</span>
      ) : null}
    </span>
  );
}

const inputClass =
  "w-full rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/90 " +
  "placeholder:text-white/20 outline-none transition focus:border-accent/60 " +
  "focus:bg-black/60 disabled:opacity-40";

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
      "border border-accent/40 bg-accent/15 text-accent-bright hover:bg-accent/25 " +
      "disabled:border-white/10 disabled:bg-white/5 disabled:text-white/30",
    ghost:
      "border border-white/10 text-white/50 hover:bg-white/10 hover:text-white",
    danger:
      "border border-red-400/30 bg-red-500/5 text-red-300/80 hover:bg-red-500/15 hover:text-red-200",
  }[variant];

  return (
    <button
      {...rest}
      type={rest.type ?? "submit"}
      disabled={pending || rest.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[2px] px-4 py-2
        text-[11px] uppercase tracking-wide2 transition disabled:cursor-not-allowed
        ${styles} ${className}`}
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
    error: "border-red-400/30 bg-red-500/5 text-red-200/90",
    notice: "border-accent/30 bg-accent/10 text-accent-bright",
    info: "border-white/10 bg-white/[0.03] text-white/55",
  }[kind];
  return (
    <p
      className={`rounded-[2px] border px-3 py-2 text-xs leading-relaxed ${styles}`}
    >
      {children}
    </p>
  );
}
