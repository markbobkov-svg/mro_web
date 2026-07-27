"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import { approveChangeAction, rejectChangeAction, type AdminState } from "./actions";
import type { ChangeRequest } from "@/lib/dashboard";
import { Alert, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: AdminState = {};

export function ChangeReview({ request }: { request: ChangeRequest }) {
  const [approveState, approve] = useFormState(approveChangeAction, EMPTY);
  const [rejectState, reject] = useFormState(rejectChangeAction, EMPTY);
  const [note, setNote] = useState("");

  const entries = Object.entries(request.payload ?? {});

  return (
    <div className="rounded-xl border border-base-600 bg-base-800 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">
            {describe(request)}
            <span className="ml-2 text-xs font-normal text-neutral-500">
              {request.organisationName ?? request.organisationId}
            </span>
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            from {request.userEmail ?? request.userId}
          </p>
        </div>
        <span className="text-xs text-neutral-600">
          {formatDate(request.createdAt)}
        </span>
      </div>

      {entries.length > 0 ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="shrink-0 text-neutral-500">{humanise(k)}</dt>
              <dd className="min-w-0 break-words text-neutral-300">{String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {request.note ? (
        <p className="mt-3 rounded-md border border-base-500 bg-base-900 px-3 py-2 text-xs leading-relaxed text-neutral-300">
          {request.note}
        </p>
      ) : null}

      {request.action === "remove" && request.target === "scope" && !request.targetId ? (
        <p className="mt-3 text-xs text-amber-300/80">
          This asks for a removal without naming a row — delete it by hand first,
          then approve to close the request.
        </p>
      ) : null}

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
          placeholder="Note — shown to the organisation. Required when rejecting."
        />
        <div className="flex flex-wrap gap-2">
          <form action={approve}>
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="reviewNote" value={note} />
            <SubmitButton pendingLabel="Applying…">Apply and publish</SubmitButton>
          </form>
          <form action={reject}>
            <input type="hidden" name="requestId" value={request.id} />
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

function describe(r: ChangeRequest): string {
  const verb = { add: "Add", update: "Correct", remove: "Remove" }[r.action];
  const noun = { approval: "approval", scope: "scope line", station: "station" }[
    r.target
  ];
  return `${verb} ${noun}`;
}

function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
