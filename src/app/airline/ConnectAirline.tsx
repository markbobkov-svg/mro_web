"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";

import { submitAirlineRequestAction, type AirlineFormState } from "./actions";
import { Alert, Field, Input, SubmitButton, Textarea } from "@/components/ui/Form";

const EMPTY: AirlineFormState = {};

interface AirlineResult {
  id: string;
  name: string;
  countryCode: string | null;
  website: string | null;
  domain: string | null;
}

/**
 * In-dashboard airline picker for a signed-in account that is not a member yet
 * (a rejected request being retried, or an account that arrived without one).
 * The public sign-up form owns the first-time flow; this reuses the same
 * search + auto-verify against the account's own e-mail.
 */
export function ConnectAirline({ userEmail }: { userEmail: string }) {
  const [state, action] = useFormState(submitAirlineRequestAction, EMPTY);

  const [notListed, setNotListed] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AirlineResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AirlineResult | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (notListed) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/airline/search?q=${encodeURIComponent(q)}`);
        const body = await res.json();
        if (id === requestId.current) setResults(body.results ?? []);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query, notListed]);

  const emailHost =
    userEmail.split("@")[1]?.trim().toLowerCase().replace(/^www\./, "") ?? "";
  const willAutoApprove =
    !!selected?.domain && !!emailHost && emailHost === selected.domain;

  return (
    <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.notice ? <Alert kind="notice">{state.notice}</Alert> : null}

      {!notListed ? (
        <>
          <Field label="Your airline" hint="search our list">
            <Input
              value={selected ? "" : query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Ryanair, Lufthansa, Wizz Air…"
              autoComplete="off"
              disabled={!!selected}
            />
          </Field>

          {query.trim().length >= 2 && !selected ? (
            <ul className="mt-3 max-h-64 divide-y divide-white/10 overflow-y-auto scroll-thin rounded-[2px] border border-white/10">
              {searching && results.length === 0 ? (
                <li className="px-3 py-3 text-sm text-white/35">Searching…</li>
              ) : null}
              {!searching && results.length === 0 ? (
                <li className="px-3 py-3 text-sm text-white/35">
                  Nothing matched.{" "}
                  <button
                    type="button"
                    onClick={() => setNotListed(true)}
                    className="text-accent transition hover:text-accent-bright"
                  >
                    Add it manually
                  </button>
                  .
                </li>
              ) : null}
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white/90">
                        {r.name}
                      </span>
                      <span className="block truncate text-xs text-white/35">
                        {[r.countryCode, r.domain].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selected ? (
            <form action={action} className="mt-3 space-y-4">
              <input type="hidden" name="airlineId" value={selected.id} />
              <div className="rounded-[2px] border border-white/10 bg-black/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {selected.name}
                    </p>
                    <p className="truncate text-xs text-white/35">
                      {[selected.countryCode, selected.domain]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setQuery("");
                    }}
                    className="shrink-0 text-xs text-white/35 transition hover:text-white/70"
                  >
                    change
                  </button>
                </div>
              </div>

              {willAutoApprove ? (
                <Alert kind="notice">
                  <strong>{emailHost}</strong> matches this airline&rsquo;s website
                  — access is granted immediately.
                </Alert>
              ) : (
                <Alert kind="info">
                  {emailHost ? (
                    <>
                      <strong>{emailHost}</strong> isn&rsquo;t this airline&rsquo;s
                      website domain
                      {selected.domain ? <> ({selected.domain})</> : null}, so a
                      person will review the request.
                    </>
                  ) : (
                    <>A person will review the request.</>
                  )}
                </Alert>
              )}

              <Field
                label="Note for the reviewer"
                hint={willAutoApprove ? "optional" : "recommended"}
              >
                <Textarea
                  name="note"
                  rows={2}
                  placeholder="Your role, or a page that lists you as staff."
                />
              </Field>

              <SubmitButton className="w-full" pendingLabel="Submitting…">
                {willAutoApprove ? "Connect and open dashboard" : "Submit for review"}
              </SubmitButton>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNotListed(true)}
              className="mt-3 text-xs text-white/45 transition hover:text-white/80"
            >
              My airline isn&rsquo;t listed →
            </button>
          )}
        </>
      ) : (
        <form action={action} className="space-y-4">
          <Alert kind="info">
            Airlines that aren&rsquo;t in our records yet are always checked by a
            person first.
          </Alert>
          <Field label="Airline name">
            <Input name="proposedName" required placeholder="Example Air" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website" hint="optional">
              <Input
                name="proposedWebsite"
                type="url"
                placeholder="https://example-air.com"
              />
            </Field>
            <Field label="Country" hint="ISO code">
              <Input name="proposedCountry" maxLength={2} placeholder="DE" />
            </Field>
          </div>
          <Field label="Note for the reviewer" hint="optional">
            <Textarea name="note" rows={2} />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setNotListed(false)}
              className="text-xs text-white/45 transition hover:text-white/80"
            >
              ← Search the list instead
            </button>
            <SubmitButton pendingLabel="Submitting…">Submit for review</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
