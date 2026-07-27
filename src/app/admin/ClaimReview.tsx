"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import { approveClaimAction, rejectClaimAction, type AdminState } from "./actions";
import type { ClaimRow } from "@/lib/dashboard";
import { Alert, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: AdminState = {};

export function ClaimReview({
  claim,
  currentAdminId,
}: {
  claim: ClaimRow;
  currentAdminId: string;
}) {
  const [approveState, approve] = useFormState(approveClaimAction, EMPTY);
  const [rejectState, reject] = useFormState(rejectClaimAction, EMPTY);
  const [note, setNote] = useState("");

  const isNew = claim.kind === "new";
  // The server refuses this too — hiding the button just saves a pointless click.
  const isOwnClaim = claim.userId === currentAdminId;

  return (
    <div className="rounded-xl border border-base-600 bg-base-800 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">
            {claim.organisationName ?? claim.proposedName ?? "Unnamed"}
            {isNew ? (
              <span className="ml-2 rounded border border-amber-500/50 bg-amber-950/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 text-amber-300">
                new organisation
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            requested by {claim.userEmail ?? claim.userId}
          </p>
        </div>
        <span className="text-xs text-neutral-600">
          {formatDate(claim.createdAt)}
        </span>
      </div>

      {isNew ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <Row label="Legal name" value={claim.proposedLegalName} />
          <Row label="Country" value={claim.proposedCountryCode} />
          <Row label="Website" value={claim.proposedWebsite} />
          <Row label="Approval ref" value={claim.proposedApprovalRef} />
          <Row label="Address" value={claim.proposedAddress} />
        </dl>
      ) : null}

      {claim.contactNote ? (
        <p className="mt-3 rounded-md border border-base-500 bg-base-900 px-3 py-2 text-xs leading-relaxed text-neutral-300">
          {claim.contactNote}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-neutral-500">
        The e-mail domain did not match this organisation, so nothing was
        granted automatically. Check that the person actually works there before
        approving.
      </p>

      {approveState.error ? (
        <div className="mt-3">
          <Alert kind="error">{approveState.error}</Alert>
        </div>
      ) : null}
      {rejectState.error ? (
        <div className="mt-3">
          <Alert kind="error">{rejectState.error}</Alert>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note — shown to the applicant. Required when rejecting."
        />
        <div className="flex flex-wrap gap-2">
          {isOwnClaim ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
              This is your own claim — another administrator has to approve it.
              You can still reject it to withdraw.
            </p>
          ) : (
            <form action={approve}>
              <input type="hidden" name="claimId" value={claim.id} />
              <input type="hidden" name="reviewNote" value={note} />
              <SubmitButton pendingLabel="Approving…">
                {isNew ? "Create and grant access" : "Approve"}
              </SubmitButton>
            </form>
          )}
          <form action={reject}>
            <input type="hidden" name="claimId" value={claim.id} />
            <input type="hidden" name="reviewNote" value={note} />
            <SubmitButton variant="danger" pendingLabel="Rejecting…">
              Reject
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 truncate text-neutral-300">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
