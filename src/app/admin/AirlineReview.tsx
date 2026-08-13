"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import {
  approveAirlineRegistrationAction,
  rejectAirlineRegistrationAction,
  type AdminState,
} from "./actions";
import type { AirlineRegistrationRow } from "@/lib/airlines";
import { Alert, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: AdminState = {};

export function AirlineReview({
  registration,
  currentAdminId,
}: {
  registration: AirlineRegistrationRow;
  currentAdminId: string;
}) {
  const [approveState, approve] = useFormState(approveAirlineRegistrationAction, EMPTY);
  const [rejectState, reject] = useFormState(rejectAirlineRegistrationAction, EMPTY);
  const [note, setNote] = useState("");

  const isNew = !registration.airlineId;
  const isOwn = registration.userId === currentAdminId;

  return (
    <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">
            {registration.airlineName ?? registration.proposedName ?? "Unnamed"}
            {isNew ? (
              <span className="ml-2 rounded-[2px] border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide2 text-amber-300/90">
                new airline
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-white/45">
            requested by {registration.userEmail ?? registration.userId}
          </p>
        </div>
        <span className="text-xs text-white/25">
          {formatDate(registration.createdAt)}
        </span>
      </div>

      {isNew ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <Row label="Website" value={registration.proposedWebsite} />
          <Row label="Country" value={registration.proposedCountryCode} />
        </dl>
      ) : null}

      {registration.contactNote ? (
        <p className="mt-3 rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 text-xs leading-relaxed text-white/70">
          {registration.contactNote}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-white/35">
        The e-mail domain didn&rsquo;t match this airline&rsquo;s website, so
        nothing was granted automatically. Check the person works there before
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
          {isOwn ? (
            <p className="rounded-[2px] border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-300/90">
              This is your own registration — another administrator has to approve
              it. You can still reject it to withdraw.
            </p>
          ) : (
            <form action={approve}>
              <input type="hidden" name="registrationId" value={registration.id} />
              <input type="hidden" name="reviewNote" value={note} />
              <SubmitButton pendingLabel="Approving…">
                {isNew ? "Create and grant access" : "Approve"}
              </SubmitButton>
            </form>
          )}
          <form action={reject}>
            <input type="hidden" name="registrationId" value={registration.id} />
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
      <dt className="shrink-0 text-white/35">{label}</dt>
      <dd className="min-w-0 truncate text-white/70">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
