"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import { proposeChangeAction, type ActionState } from "../actions";
import type {
  DashboardApproval,
  DashboardOrg,
  DashboardScopeRow,
  DashboardStation,
} from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: ActionState = {};

/**
 * Approvals, scope and stations — read-only, with a "propose a change" form
 * attached to each row. Nothing here writes to the scraped tables; every
 * submission becomes a change request for an admin to apply.
 */
export function RegulatorySections({ org }: { org: DashboardOrg }) {
  return (
    <>
      <section id="approvals" className="scroll-mt-20">
        <Heading
          title="Approvals"
          note="From the authorities' registers. Propose a correction and we will check it against the certificate."
        />
        <ApprovalsPanel org={org} />
      </section>

      <section id="scope" className="scroll-mt-20">
        <Heading
          title="Certified scope"
          note="Grouped by authority and class rating, exactly as it appears on your card."
        />
        <ScopePanel org={org} />
      </section>

      <section id="stations" className="scroll-mt-20">
        <Heading
          title="Stations"
          note="The airports where you appear on the map."
        />
        <StationsPanel org={org} />
      </section>
    </>
  );
}

function Heading({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-medium text-white">{title}</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-white/35">{note}</p>
    </div>
  );
}

// ------------------------------------------------------------- approvals ---

function ApprovalsPanel({ org }: { org: DashboardOrg }) {
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
                    onDone={() => setOpen(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <AddToggle label="+ Propose a missing approval">
        <ApprovalChangeForm org={org} approval={null} onDone={() => {}} />
      </AddToggle>
    </div>
  );
}

function ApprovalChangeForm({
  org,
  approval,
  onDone,
}: {
  org: DashboardOrg;
  approval: DashboardApproval | null;
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
          <Field label="Authority" hint="EASA, FAA, UK-CAA…">
            <Input
              name="authorityCode"
              defaultValue={approval?.authorityCode ?? ""}
              placeholder="EASA"
            />
          </Field>
          <Field label="Approval type">
            <Input
              name="approvalType"
              defaultValue={approval?.approvalType ?? "Part-145"}
            />
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

// ----------------------------------------------------------------- scope ---

function ScopePanel({ org }: { org: DashboardOrg }) {
  const byAuthority = new Map<string, Map<string, DashboardScopeRow[]>>();
  for (const row of org.scope) {
    const cls = row.ratingClass?.trim() || "Other";
    let classes = byAuthority.get(row.authorityCode);
    if (!classes) {
      classes = new Map();
      byAuthority.set(row.authorityCode, classes);
    }
    const list = classes.get(cls) ?? [];
    list.push(row);
    classes.set(cls, list);
  }

  return (
    <div className="space-y-4 rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      {org.scope.length === 0 ? (
        <p className="text-sm text-white/35">No scope on file yet.</p>
      ) : (
        [...byAuthority.entries()].map(([authority, classes]) => (
          <div key={authority}>
            <p className="mb-2 text-[10px] uppercase tracking-wide2 text-white/45">
              {authority}
            </p>
            <div className="space-y-2">
              {[...classes.entries()].map(([cls, rows]) => (
                <details
                  key={cls}
                  className="rounded-[2px] border border-white/10 bg-black/40 px-3 py-2"
                >
                  <summary className="cursor-pointer text-sm text-white/85">
                    {cls}
                    <span className="ml-2 text-xs text-white/35">
                      {rows.length} line{rows.length === 1 ? "" : "s"}
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {rows.slice(0, 40).map((r) => (
                      <li key={r.id} className="text-xs leading-relaxed text-white/45">
                        {r.scopeText ?? r.ratingText}
                        {r.locationScope ? (
                          <span className="ml-2 text-white/25">
                            [{r.locationScope}]
                          </span>
                        ) : null}
                      </li>
                    ))}
                    {rows.length > 40 ? (
                      <li className="text-xs text-white/25">
                        …and {rows.length - 40} more
                      </li>
                    ) : null}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        ))
      )}

      <AddToggle label="+ Propose a scope change">
        <ScopeChangeForm org={org} />
      </AddToggle>
    </div>
  );
}

function ScopeChangeForm({ org }: { org: DashboardOrg }) {
  const [state, action] = useFormState(proposeChangeAction, EMPTY);
  const [mode, setMode] = useState<"add" | "remove">("add");

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="target" value="scope" />
      <input type="hidden" name="action" value={mode} />

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      <div className="flex gap-2">
        <ModeButton active={mode === "add"} onClick={() => setMode("add")}>
          Something is missing
        </ModeButton>
        <ModeButton active={mode === "remove"} onClick={() => setMode("remove")}>
          Something is wrong
        </ModeButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Authority">
          <Input name="authorityCode" placeholder="EASA" />
        </Field>
        <Field label="Class rating">
          <Input name="ratingClass" placeholder="A1 / C6 / Components" />
        </Field>
      </div>

      <Field label="Scope line" hint="as it should read on the certificate">
        <Textarea
          name="scopeText"
          rows={2}
          placeholder="Boeing 737-600/700/800/900 (CFM56)"
        />
      </Field>

      <Field label="Line or base" hint="line, base, or both">
        <Input name="locationScope" placeholder="both" />
      </Field>

      <Field
        label="Note for the reviewer"
        hint={mode === "remove" ? "required" : "link to the certificate page"}
      >
        <Textarea name="note" rows={2} />
      </Field>

      <SubmitButton pendingLabel="Sending…">Send for review</SubmitButton>
    </form>
  );
}

// -------------------------------------------------------------- stations ---

function StationsPanel({ org }: { org: DashboardOrg }) {
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
