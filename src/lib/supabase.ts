import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client. The key never reaches the browser: every query
// runs in a Server Component or Route Handler. Either the anon (publishable)
// key or the service_role key works here — reads only.
//
// Required env vars (set locally in .env.local and in the Vercel project):
//   SUPABASE_URL
//   SUPABASE_KEY   (anon/publishable key, or service_role — server-side only)

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_KEY " +
        "(see .env.example).",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** True when both env vars are present — lets the UI show a friendly notice. */
export function hasSupabaseCredentials(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
}
