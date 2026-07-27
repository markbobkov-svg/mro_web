"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";

import {
  claimExistingOrgAction,
  requestNewOrgAction,
  type ActionState,
} from "../actions";
import { Alert, Field, Input, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: ActionState = {};

interface OrgResult {
  id: string;
  name: string;
  legalName: string | null;
  countryCode: string | null;
  website: string | null;
  claimed: boolean;
  domains: string[];
}

export function ClaimPanel({ userEmail }: { userEmail: string }) {
  const [tab, setTab] = useState<"existing" | "new">("existing");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-[2px] border border-white/10 bg-[#141414]/60 p-1">
        <TabButton active={tab === "existing"} onClick={() => setTab("existing")}>
          It&rsquo;s already listed
        </TabButton>
        <TabButton active={tab === "new"} onClick={() => setTab("new")}>
          Not on the map yet
        </TabButton>
      </div>

      {tab === "existing" ? (
        <ExistingOrgClaim userEmail={userEmail} />
      ) : (
        <NewOrgRequest />
      )}
    </div>
  );
}

function TabButton({
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
      className={`flex-1 rounded-[2px] px-3 py-2 text-sm transition ${
        active
          ? "bg-white/10 text-white"
          : "text-white/45 hover:text-white/85"
      }`}
    >
      {children}
    </button>
  );
}

function ExistingOrgClaim({ userEmail }: { userEmail: string }) {
  const [state, action] = useFormState(claimExistingOrgAction, EMPTY);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrgResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<OrgResult | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/dashboard/org-search?q=${encodeURIComponent(q)}`,
        );
        const body = await res.json();
        // Ignore a slow response that a newer keystroke has superseded.
        if (id === requestId.current) setResults(body.results ?? []);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const emailHost = userEmail.split("@")[1]?.toLowerCase() ?? "";
  const willAutoApprove =
    selected?.domains.some(
      (d) => d === emailHost || emailHost.endsWith(`.${d}`) || d.endsWith(`.${emailHost}`),
    ) ?? false;

  return (
    <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}

      <Field label="Find your organisation" hint="name or legal name">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Lufthansa Technik, Magnetic MRO…"
          autoComplete="off"
        />
      </Field>

      {query.trim().length >= 2 && !selected ? (
        <ul className="mt-3 max-h-72 divide-y divide-white/10 overflow-y-auto scroll-thin rounded-[2px] border border-white/10">
          {searching && results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-white/35">Searching…</li>
          ) : null}
          {!searching && results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-white/35">
              Nothing matched. If it really isn&rsquo;t listed, use
              &ldquo;Not on the map yet&rdquo;.
            </li>
          ) : null}
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={r.claimed}
                onClick={() => setSelected(r)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left
                  transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white/90">
                    {r.name}
                  </span>
                  <span className="block truncate text-xs text-white/35">
                    {[r.countryCode, r.website].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {r.claimed ? (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide2 text-white/35">
                    claimed
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <form action={action} className="mt-4 space-y-4">
          <input type="hidden" name="organisationId" value={selected.id} />

          <div className="rounded-[2px] border border-white/10 bg-black/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {selected.name}
                </p>
                <p className="truncate text-xs text-white/35">
                  {[selected.countryCode, selected.website]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 text-xs text-white/35 transition hover:text-white/70"
              >
                change
              </button>
            </div>
          </div>

          {willAutoApprove ? (
            <Alert kind="notice">
              Your address is on <strong>{emailHost}</strong>, which matches this
              organisation — access is granted immediately.
            </Alert>
          ) : (
            <Alert kind="info">
              <strong>{emailHost || "your address"}</strong> doesn&rsquo;t match
              this organisation&rsquo;s known domains
              {selected.domains.length > 0 ? (
                <> ({selected.domains.join(", ")})</>
              ) : null}
              , so a person will review the request. Add anything that helps
              below.
            </Alert>
          )}

          <Field
            label="Note for the reviewer"
            hint={willAutoApprove ? "optional" : "recommended"}
          >
            <Textarea
              name="note"
              rows={3}
              placeholder="Your role, a link to a page listing you as staff, the approval reference…"
            />
          </Field>

          <SubmitButton className="w-full" pendingLabel="Submitting…">
            {willAutoApprove ? "Claim and start editing" : "Submit for review"}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function NewOrgRequest() {
  const [state, action] = useFormState(requestNewOrgAction, EMPTY);

  return (
    <form action={action} className="space-y-4 rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}

      <Alert kind="info">
        Organisations that aren&rsquo;t in the database yet are always checked by
        a person before they appear on the map.
      </Alert>

      <Field label="Organisation name">
        <Input name="name" required placeholder="Example Aviation Services" />
      </Field>
      <Field label="Legal name" hint="optional">
        <Input name="legalName" placeholder="Example Aviation Services GmbH" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country" hint="ISO code">
          <Input name="countryCode" maxLength={2} placeholder="DE" />
        </Field>
        <Field label="Website">
          <Input name="website" type="url" placeholder="https://example.com" />
        </Field>
      </div>

      <Field label="Part-145 approval reference" hint="e.g. DE.145.0123">
        <Input name="approvalRef" placeholder="DE.145.0123" />
      </Field>

      <Field label="Address" hint="optional">
        <Textarea name="address" rows={2} />
      </Field>

      <Field label="Anything else the reviewer should know">
        <Textarea
          name="note"
          rows={3}
          placeholder="A link to your approval certificate speeds this up a lot."
        />
      </Field>

      <SubmitButton className="w-full" pendingLabel="Submitting…">
        Submit for review
      </SubmitButton>
    </form>
  );
}
