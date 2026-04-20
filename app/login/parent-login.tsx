"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function ParentLogin({
  onBack,
  nextPath,
}: {
  onBack: () => void;
  nextPath?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (nextPath) redirectTo.searchParams.set("next", nextPath);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString() },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="bg-card rounded-lg shadow-pop-sm border border-border/50 p-7 sm:p-8">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground mb-4 font-semibold"
      >
        ← Back
      </button>
      <h1 className="font-display font-extrabold text-3xl mb-2">Parent sign-in</h1>
      <p className="text-muted-foreground mb-6">
        Use your Google account. If this is your first time, we&apos;ll set up a household for
        you in a moment.
      </p>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-md bg-negative/10 text-negative-foreground text-sm p-3 border border-negative/30"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button size="xl" onClick={handleGoogle} disabled={loading}>
          <GoogleMark />
          {loading ? "Opening Google…" : "Continue with Google"}
        </Button>
        <Button size="xl" variant="outline" disabled title="Coming soon">
          <span aria-hidden></span> Continue with Apple
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-1">
          Apple sign-in is coming soon.
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c6.9 0 9.5-4.8 9.5-7.3 0-.5 0-.8-.1-1.2H12Z"
      />
    </svg>
  );
}
