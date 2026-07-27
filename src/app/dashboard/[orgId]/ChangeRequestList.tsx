"use client";

import { useFormState } from "react-dom";

import { withdrawChangeAction, type ActionState } from "../actions";
import type { ChangeRequest, DashboardOrg } from "@/lib/dashboard";

const EMPTY: ActionState = {};

export function ChangeRequestList({ org }: { org: DashboardOrg }) {
  if (org.changeRequests.length === 0) {
    return (
      <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
        <p className="text-sm text-white/35">
          Nothing submitted yet. Proposals you send from the sections above show
          up here with their status.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {org.changeRequests.map((r) => (
        <li
          key={r.id}
          className="rounded-[2px] border border-white/10 bg-[#141414]/60 px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-white/90">
                <StatusDot status={r.status} />
                {describe(r)}
              </p>
              {summarise(r) ? (
                <p className="mt-1 text-xs text-white/35">{summarise(r)}</p>
              ) : null}
              {r.note ? (
                <p className="mt-1 text-xs italic text-white/25">“{r.note}”</p>
              ) : null}
              {r.reviewNote ? (
                <p className="mt-1 text-xs text-white/45">
                  Reviewer: {r.reviewNote}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-white/25">
                {formatDate(r.createdAt)}
              </span>
              {r.status === "pending" ? (
                <WithdrawButton orgId={org.id} requestId={r.id} />
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusDot({ status }: { status: ChangeRequest["status"] }) {
  const color = {
    pending: "bg-amber-400",
    approved: "bg-emerald-400",
    rejected: "bg-red-400",
  }[status];
  return (
    <span
      className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${color}`}
      title={status}
    />
  );
}

function describe(r: ChangeRequest): string {
  const verb = { add: "Add", update: "Correct", remove: "Remove" }[r.action];
  const noun = { approval: "approval", scope: "scope line", station: "station" }[
    r.target
  ];
  return `${verb} ${noun}`;
}

function summarise(r: ChangeRequest): string {
  const p = r.payload ?? {};
  const parts = [
    p.authorityCode,
    p.approvalType,
    p.approvalReference,
    p.ratingClass,
    p.scopeText,
    p.airportCode,
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => (v.length > 80 ? `${v.slice(0, 80)}…` : v));
  return parts.join(" · ");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function WithdrawButton({
  orgId,
  requestId,
}: {
  orgId: string;
  requestId: string;
}) {
  const [state, action] = useFormState(withdrawChangeAction, EMPTY);

  return (
    <form action={action}>
      <input type="hidden" name="organisationId" value={orgId} />
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        className="text-xs text-white/35 transition hover:text-red-300"
        title={state.error ?? "Withdraw this request"}
      >
        Withdraw
      </button>
    </form>
  );
}
