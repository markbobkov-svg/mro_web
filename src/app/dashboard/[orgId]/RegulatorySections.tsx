"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import { proposeChangeAction, type ActionState } from "../actions";
import type {
  AuthorityOption,
  DashboardApproval,
  DashboardOrg,
  DashboardStation,
} from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: ActionState = {};

/**
 * Approvals and stations — read-only registry facts, each with a "propose a
 * change" form. Nothing here writes to the scraped tables; every submission
 * becomes a change request for an admin to apply. Both panels are exported
 * individually and shown as tabs by `DashboardTabs`. (Per-station scope, which
 * publishes instantly, lives in its own `StationScopeEditor`.)
 */

// ------------------------------------------------------------- approvals ---

export function ApprovalsPanel({
  org,
  authorities,
}: {
  org: DashboardOrg;
  authorities: AuthorityOption[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-3 rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      {org.approvals.length === 0 ? (
        <p className="text-sm text-white/35">
          No approvals on file. If you hold one, propose it below.
        </p>
      ) : (
        <ul className="divide-y divide-white/10">
          {org.approvals.map((a) => (
            <li key={a.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white/90">
                    <span className="mr-2 rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 text-white/45">
                      {a.authorityCode}
                    </span>
                    {a.approvalType}
                    {a.reference ? (
                      <span className="ml-2 font-mono text-xs text-white/45">
                        {a.reference}
                      </span>
                    ) : null}
                  </p>
                  {a.ratings.length > 0 ? (
                    <p className="mt-1 text-xs text-white/35">
                      {a.ratings.join(" · ")}
                    </p>
                  ) : null}
                  {a.validUntil ? (
                    <p className="mt-0.5 text-xs text-white/25">
                      valid until {a.validUntil}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(open === a.id ? null : a.id)}
                  className="shrink-0 text-xs text-white/45 transition hover:text-white"
                >
                  {open === a.id ? "Cancel" : "Propose a change"}
                </button>
              </div>

              {open === a.id ? (
                <div className="mt-3 border-l-2 border-white/10 pl-4">
                  <ApprovalChangeForm
                    org={org}
                    approval={a}
                    authorities={authorities}
                    onDone={() => setOpen(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <AddToggle label="+ Propose a missing approval">
        <ApprovalChangeForm
          org={org}
          approval={null}
          authorities={authorities}
          onDone={() => {}}
        />
      </AddToggle>
    </div>
  );
}

function ApprovalChangeForm({
  org,
  approval,
  authorities,
  onDone,
}: {
  org: DashboardOrg;
  approval: DashboardApproval | null;
  authorities: AuthorityOption[];
  onDone: () => void;
}) {
  const [state, action] = useFormState(proposeChangeAction, EMPTY);
  const [mode, setMode] = useState<"update" | "remove">("update");
  const isNew = approval === null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="target" value="approval" />
      <input type="hidden" name="action" value={isNew ? "add" : mode} />
      {approval ? <input type="hidden" name="targetId" value={approval.id} /> : null}
      {/* Every approval on this map is a Part-145 approval — assign it by
          default rather than asking, so there's no type field to fill in. */}
      {isNew ? <input type="hidden" name="approvalType" value="Part-145" /> : null}

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      {!isNew ? (
        <div className="flex gap-2">
          <ModeButton active={mode === "update"} onClick={() => setMode("update")}>
            Correct it
          </ModeButton>
          <ModeButton active={mode === "remove"} onClick={() => setMode("remove")}>
            It shouldn&rsquo;t be here
          </ModeButton>
        </div>
      ) : null}

      {mode === "update" || isNew ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Authority" hint="from the authorities register">
            <select
              name="authorityCode"
              defaultValue={approval?.authorityCode ?? ""}
              required
              className="w-full rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 text-sm
                text-white/90 outline-none focus:border-accent"
            >
              <option value="">Select authority…</option>
              {authorities.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name ? `${a.code} — ${a.name}` : a.code}
                </option>
              ))}
              {/* Keep an existing code selectable even if it's not in the
                  register (e.g. an older scraped value). */}
              {approval?.authorityCode &&
              !authorities.some((a) => a.code === approval.authorityCode) ? (
                <option value={approval.authorityCode}>
                  {approval.authorityCode}
                </option>
              ) : null}
            </select>
          </Field>
          <Field label="Reference">
            <Input
              name="approvalReference"
              defaultValue={approval?.reference ?? ""}
              placeholder="DE.145.0123"
            />
          </Field>
          <Field label="Valid until" hint="YYYY-MM-DD">
            <Input name="validUntil" defaultValue={approval?.validUntil ?? ""} />
          </Field>
          <Field label="Ratings" hint="comma separated">
            <Input
              name="ratings"
              defaultValue={approval?.ratings.join(", ") ?? ""}
              placeholder="A1, C1, C2"
            />
          </Field>
          <Field label="Certificate URL">
            <Input
              name="sourceUrl"
              type="url"
              defaultValue={approval?.sourceUrl ?? ""}
            />
          </Field>
        </div>
      ) : null}

      <Field
        label="Note for the reviewer"
        hint={mode === "remove" ? "required" : "a link to the certificate helps"}
      >
        <Textarea name="note" rows={2} />
      </Field>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Sending…">Send for review</SubmitButton>
        {!isNew ? (
          <button
            type="button"
            onClick={onDone}
            className="rounded-[2px] px-3 py-2 text-sm text-white/35 transition hover:text-white/70"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

// -------------------------------------------------------------- stations ---

export function StationsPanel({ org }: { org: DashboardOrg }) {
  return (
    <div className="space-y-3 rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      {org.stations.length === 0 ? (
        <p className="text-sm text-white/35">
          You don&rsquo;t appear at any airport yet.
        </p>
      ) : (
        <ul className="divide-y divide-white/10">
          {org.stations.map((s) => (
            <li key={s.id} className="py-2.5">
              <p className="text-sm text-white/90">
                {s.iata || s.icao ? (
                  <span className="mr-2 font-mono text-xs text-accent">
                    {s.iata ?? s.icao}
                  </span>
                ) : null}
                {s.airportName ?? "Unknown airport"}
              </p>
              {s.address || s.phone || s.email ? (
                <p className="mt-0.5 truncate text-xs text-white/35">
                  {[s.address, s.phone, s.email].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <AddToggle label="+ Propose a station change">
        <StationChangeForm org={org} />
      </AddToggle>
    </div>
  );
}

function StationChangeForm({ org }: { org: DashboardOrg }) {
  const [state, action] = useFormState(proposeChangeAction, EMPTY);
  const [mode, setMode] = useState<"add" | "update" | "remove">("add");
  const [targetId, setTargetId] = useState("");

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="target" value="station" />
      <input type="hidden" name="action" value={mode} />
      {mode !== "add" ? (
        <input type="hidden" name="targetId" value={targetId} />
      ) : null}

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <ModeButton active={mode === "add"} onClick={() => setMode("add")}>
          New station
        </ModeButton>
        <ModeButton active={mode === "update"} onClick={() => setMode("update")}>
          Correct one
        </ModeButton>
        <ModeButton active={mode === "remove"} onClick={() => setMode("remove")}>
          Remove one
        </ModeButton>
      </div>

      {mode !== "add" ? (
        <Field label="Which station">
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            required
            className="w-full rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 text-sm
              text-white/90 outline-none focus:border-accent"
          >
            <option value="">Pick a station…</option>
            {org.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {[s.iata ?? s.icao, s.airportName].filter(Boolean).join(" — ")}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {mode !== "remove" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Airport code" hint="IATA or ICAO">
            <Input name="airportCode" placeholder="FRA / EDDF" />
          </Field>
          <Field label="Phone">
            <Input name="phone" />
          </Field>
          <Field label="E-mail">
            <Input name="email" type="email" />
          </Field>
          <Field label="Address">
            <Input name="address" />
          </Field>
        </div>
      ) : null}

      <Field
        label="Note for the reviewer"
        hint={mode === "remove" ? "required" : "optional"}
      >
        <Textarea name="note" rows={2} />
      </Field>

      <SubmitButton pendingLabel="Sending…">Send for review</SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- shared ---

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[2px] border px-3 py-1.5 text-xs transition ${
        active
          ? "border-accent bg-accent/10 text-accent-bright"
          : "border-white/10 text-white/45 hover:text-white/85"
      }`}
    >
      {children}
    </button>
  );
}

function AddToggle({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[2px] border border-dashed border-white/10 px-4 py-2 text-sm
          text-white/45 transition hover:border-white/25 hover:text-white"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide2 text-white/45">
          {label.replace(/^\+\s*/, "")}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-white/35 transition hover:text-white/70"
        >
          Close
        </button>
      </div>
      {children}
    </div>
  );
}
