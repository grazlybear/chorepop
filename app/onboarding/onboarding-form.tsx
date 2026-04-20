"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function OnboardingForm({
  suggestedDisplayName,
}: {
  suggestedDisplayName: string;
}) {
  const router = useRouter();
  const [householdName, setHouseholdName] = useState("");
  const [displayName, setDisplayName] = useState(suggestedDisplayName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!householdName.trim() || !displayName.trim()) {
      setError("Please fill in both fields.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("bootstrap_owner_household", {
      p_household_name: householdName.trim(),
      p_display_name: displayName.trim(),
    });
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    router.replace("/parent");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? (
        <div
          role="alert"
          className="rounded-md bg-negative/10 text-negative-foreground text-sm p-3 border border-negative/30"
        >
          {error}
        </div>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="font-display font-semibold text-sm">Household name</span>
        <input
          type="text"
          value={householdName}
          onChange={(e) => setHouseholdName(e.target.value)}
          placeholder="The Smith Family"
          maxLength={60}
          required
          className="h-12 px-4 rounded-lg border-2 border-border bg-background focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-display font-semibold text-sm">Your name</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Mom"
          maxLength={40}
          required
          className="h-12 px-4 rounded-lg border-2 border-border bg-background focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
        />
      </label>

      <Button type="submit" size="xl" disabled={loading} className="mt-2">
        {loading ? "Setting up…" : "Create household"}
      </Button>
    </form>
  );
}
