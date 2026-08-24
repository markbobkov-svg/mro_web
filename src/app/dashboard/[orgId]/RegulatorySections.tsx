"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import { proposeChangeAction, type ActionState } from "../actions";
import type {
  AuthorityOption,
  DashboardApproval,
  DashboardOrg,
} from "@/lib/dashboard";
import { Alert, Field, Input, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: ActionState = {};

/**
 * Approvals — the one thing an organisation cannot publish itself.
 *
 * They are regulatory facts from the authorities' registers, so a change here
 * becomes a change request for an admin to apply. Everything else the dashboard
 * edits (profile, stations, contacts and both levels of scope) writes straight
 * to the real tables.
 */

// ------------------------------------------------------------- approvals ---

export function ApprovalsPanel({
  org,
  authorities,
}: {
  org: DashboardOrg;
  authorities: AuthorityOption[];
}) {
  // Which approval's inline form is open, and whether it's an edit or a removal.
  const [open, setOpen] = useState<{
    id: string;
    mode: "update" | "remove";
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-3">
      {org.approvals.length === 0 ? (
        <p className="text-sm text-white/35">
          No approvals on file. If you hold one, add it below.
        </p>
      ) : (
        <ul className="space-y-2">
          {org.approvals.map((a) => {
            const editing = open?.id === a.id && open.mode === "update";
            const removing = open?.id === a.id && open.mode === "remove";

            if (editing || removing) {
              return (
                <li
                  key={a.id}
                  className="rounded-[2px] border border-white/10 bg-black/30 p-4"
                >
                  <ApprovalForm
                    org={org}
                    mode={open!.mode}
                    approval={a}
                    authorities={authorities}
                    onDone={() => setOpen(null)}
                  />
                </li>
              );
            }

            return (
              <li
                key={a.id}
                className="flex items-start justify-between gap-4 rounded-[2px]
                  border border-white/10 bg-black/30 p-4"
              >
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
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen({ id: a.id, mode: "update" })}
                    className="text-xs text-white/45 transition hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen({ id: a.id, mode: "remove" })}
                    className="text-xs text-white/45 transition hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add approval — its own card below the list. */}
      {addOpen ? (
        <div className="rounded-[2px] border border-white/10 bg-black/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide2 text-white/45">
              Add an approval
            </span>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="text-xs text-white/35 transition hover:text-white/70"
            >
              Close
            </button>
          </div>
          <ApprovalForm
            org={org}
            mode="add"
            approval={null}
            authorities={authorities}
            onDone={() => setAddOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-[2px] border border-dashed border-white/10 px-4 py-2 text-sm
            text-white/45 transition hover:border-white/25 hover:text-white"
        >
          + Add an approval
        </button>
      )}
    </div>
  );
}

function ApprovalForm({
  org,
  mode,
  approval,
  authorities,
  onDone,
}: {
  org: DashboardOrg;
  mode: "add" | "update" | "remove";
  approval: DashboardApproval | null;
  authorities: AuthorityOption[];
  onDone: () => void;
}) {
  const [state, action] = useFormState(proposeChangeAction, EMPTY);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organisationId" value={org.id} />
      <input type="hidden" name="target" value="approval" />
      <input type="hidden" name="action" value={mode} />
      {approval ? <input type="hidden" name="targetId" value={approval.id} /> : null}
      {/* Every approval on this map is a Part-145 approval — assign it by
          default rather than asking, so there's no type field to fill in. */}
      {mode === "add" ? <input type="hidden" name="approvalType" value="Part-145" /> : null}

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      {mode === "remove" ? (
        <p className="text-sm text-white/60">
          Remove{" "}
          <span className="text-white/90">
            {[approval?.authorityCode, approval?.approvalType]
              .filter(Boolean)
              .join(" ") || "this approval"}
          </span>{" "}
          from your listing? Tell the reviewer why below.
        </p>
      ) : (
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
      )}

      <Field
        label="Note for the reviewer"
        hint={mode === "remove" ? "required" : "a link to the certificate helps"}
      >
        <Textarea name="note" rows={2} />
      </Field>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Sending…">Send for review</SubmitButton>
        <button
          type="button"
          onClick={onDone}
          className="rounded-[2px] px-3 py-2 text-sm text-white/35 transition hover:text-white/70"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
