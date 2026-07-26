// Shown when SUPABASE_URL / SUPABASE_KEY are not configured. Keeps the deploy
// from crashing and tells whoever set it up exactly what to add.
export default function SetupNotice() {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-black px-6">
      <div className="max-w-lg">
        <p className="mb-3 text-xs uppercase tracking-brand text-accent-bright">
          MRO Finder
        </p>
        <h1 className="mb-4 text-2xl font-light tracking-wide2 text-white">
          Almost ready
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-white/60">
          The site is deployed but not yet connected to the database. Add these
          environment variables in the Vercel project settings and redeploy:
        </p>
        <div className="rounded-md border border-white/10 bg-base-800 p-4 font-mono text-xs text-white/80">
          <div>
            <span className="text-accent-bright">SUPABASE_URL</span>
            <span className="text-white/40"> = https://xxxx.supabase.co</span>
          </div>
          <div className="mt-2">
            <span className="text-accent-bright">SUPABASE_KEY</span>
            <span className="text-white/40"> = your anon or service_role key</span>
          </div>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-white/40">
          The key is used only server-side and is never exposed to the browser.
        </p>
      </div>
    </main>
  );
}
