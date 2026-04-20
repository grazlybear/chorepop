"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Kid = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  auth_email: string;
  household_name: string;
};

type Step =
  | { kind: "code" }
  | { kind: "pick"; kids: Kid[]; householdName: string }
  | { kind: "pin"; kid: Kid };

const REMEMBERED_CODE_KEY = "chorepop:invite-code";
const REMEMBERED_KID_KEY = "chorepop:kid-id";

export function KidLogin({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(() => {
    if (typeof window !== "undefined") {
      const remembered = window.localStorage.getItem(REMEMBERED_CODE_KEY);
      if (remembered) return { kind: "code" }; // prefilled below
    }
    return { kind: "code" };
  });
  const [code, setCode] = useState(() =>
    typeof window !== "undefined"
      ? window.localStorage.getItem(REMEMBERED_CODE_KEY) ?? ""
      : "",
  );
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookupCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("Invite code should be 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("household_kids_for_invite", {
        p_invite_code: trimmed,
      });
      if (error) throw error;
      const kids = (data ?? []) as Kid[];
      if (kids.length === 0) {
        setError("No kids found for that code. Double-check with your parent?");
        return;
      }
      window.localStorage.setItem(REMEMBERED_CODE_KEY, trimmed);
      setStep({ kind: "pick", kids, householdName: kids[0].household_name });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "pin") return;
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN should be 4 digits.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: step.kid.auth_email,
        password: `cp-${pin}`,
      });
      if (error) {
        if (error.message.toLowerCase().includes("invalid")) {
          setError("Wrong PIN. Try again!");
        } else {
          setError(error.message);
        }
        return;
      }
      window.localStorage.setItem(REMEMBERED_KID_KEY, step.kid.id);
      router.replace("/kid");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card rounded-lg shadow-pop-sm border border-border/50 p-7 sm:p-8">
      <button
        type="button"
        onClick={() => {
          if (step.kind === "code") onBack();
          else if (step.kind === "pick") setStep({ kind: "code" });
          else setStep({ kind: "pick", kids: [step.kid], householdName: step.kid.household_name });
          setError(null);
          setPin("");
        }}
        className="text-sm text-muted-foreground hover:text-foreground mb-4 font-semibold"
      >
        ← Back
      </button>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-md bg-negative/10 text-negative-foreground text-sm p-3 border border-negative/30"
        >
          {error}
        </div>
      ) : null}

      {step.kind === "code" ? (
        <form onSubmit={lookupCode}>
          <h1 className="font-display font-extrabold text-3xl mb-2">Household code</h1>
          <p className="text-muted-foreground mb-5">
            Ask your parent for your 6-letter code.
          </p>
          <label className="block">
            <span className="sr-only">Household code</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDEF"
              className="w-full h-16 px-4 rounded-lg border-2 border-border bg-background text-center font-display font-bold text-4xl tracking-[0.3em] uppercase focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
            />
          </label>
          <Button
            type="submit"
            size="xl"
            className="w-full mt-5"
            disabled={loading}
          >
            {loading ? "Checking…" : "Next"}
          </Button>
        </form>
      ) : null}

      {step.kind === "pick" ? (
        <div>
          <h1 className="font-display font-extrabold text-3xl mb-1">
            {step.householdName}
          </h1>
          <p className="text-muted-foreground mb-5">Who are you?</p>
          <div className="grid grid-cols-2 gap-3">
            {step.kids.map((kid) => (
              <button
                key={kid.id}
                type="button"
                onClick={() => {
                  setStep({ kind: "pin", kid });
                  setError(null);
                }}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-border bg-card shadow-pop-sm transition-all hover:-translate-y-0.5 hover:shadow-pop active:scale-95"
              >
                <span className="text-5xl" aria-hidden>
                  {kid.avatar_url ?? "🙂"}
                </span>
                <span className="font-display font-bold text-base">
                  {kid.display_name}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step.kind === "pin" ? (
        <form onSubmit={submitPin}>
          <div className="flex flex-col items-center mb-5">
            <span className="text-6xl mb-1" aria-hidden>
              {step.kid.avatar_url ?? "🙂"}
            </span>
            <h1 className="font-display font-extrabold text-3xl">
              Hi {step.kid.display_name}!
            </h1>
            <p className="text-muted-foreground">Enter your 4-digit PIN</p>
          </div>
          <label className="block">
            <span className="sr-only">PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              autoFocus
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="w-full h-16 px-4 rounded-lg border-2 border-border bg-background text-center font-display font-bold text-4xl tracking-[0.5em] focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
            />
          </label>
          <Button
            type="submit"
            size="xl"
            className="w-full mt-5"
            disabled={loading || pin.length !== 4}
          >
            {loading ? "Signing in…" : "Let's go! 🚀"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
