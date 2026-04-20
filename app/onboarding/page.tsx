import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const metadata = {
  title: "Set up your household — ChorePop",
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();

  if (existingProfile) {
    redirect(existingProfile.role === "child" ? "/kid" : "/parent");
  }

  const metadata = claims.user_metadata as { full_name?: string } | undefined;
  const suggestedName =
    metadata?.full_name ??
    (typeof claims.email === "string" ? claims.email.split("@")[0] : "");

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md bg-card rounded-lg shadow-pop-sm border border-border/50 p-7 sm:p-8">
        <div className="text-5xl mb-3" aria-hidden>🏡</div>
        <h1 className="font-display font-extrabold text-3xl mb-2">
          Set up your household
        </h1>
        <p className="text-muted-foreground mb-6">
          Give your household a name and tell us what to call you. We&apos;ll generate
          an invite code you can share with your kids.
        </p>
        <OnboardingForm suggestedDisplayName={suggestedName} />
      </div>
    </main>
  );
}
