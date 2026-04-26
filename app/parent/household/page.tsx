import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { HouseholdSettings } from "./household-settings";

export const metadata = {
  title: "Household — ChorePop",
};

export default async function HouseholdPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.household_id) redirect("/onboarding");

  const { data: household } = await supabase
    .from("households")
    .select("id, name, invite_code, is_paused, timezone, created_by")
    .eq("id", profile.household_id)
    .maybeSingle();

  if (!household) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Household not found.
        </CardContent>
      </Card>
    );
  }

  const { data: membersData } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role, created_at")
    .eq("household_id", profile.household_id)
    .in("role", ["owner", "parent"])
    .order("created_at");

  const members = (membersData ?? []) as Array<{
    id: string;
    display_name: string;
    avatar_url: string | null;
    role: "owner" | "parent";
    created_at: string;
  }>;

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">
          {household.name}
        </h1>
        <p className="text-muted-foreground mt-1">
          Invite code, vacation mode, and household members.
        </p>
      </header>

      <HouseholdSettings
        currentUserId={userId}
        currentUserRole={profile.role as "owner" | "parent"}
        household={{
          name: household.name,
          inviteCode: household.invite_code,
          isPaused: household.is_paused,
          timezone: household.timezone,
        }}
        members={members}
      />
    </div>
  );
}
