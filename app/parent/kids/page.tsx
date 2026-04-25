import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { KidsManager, type KidRow } from "./kids-manager";

export const metadata = {
  title: "Kids — ChorePop",
};

export default async function ParentKidsPage() {
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

  const { data: kidsData } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_active, created_at")
    .eq("household_id", profile.household_id)
    .eq("role", "child")
    .order("display_name");

  const kids = (kidsData ?? []) as Array<
    Omit<KidRow, "balance"> & { is_active: boolean }
  >;

  const balanceEntries = await Promise.all(
    kids.map((k) =>
      supabase
        .rpc("child_current_balance", { p_child_id: k.id })
        .then((res) => [k.id, (res.data as number | null) ?? 0] as const),
    ),
  );
  const balanceById = new Map(balanceEntries);

  const enrichedKids: KidRow[] = kids.map((k) => ({
    id: k.id,
    display_name: k.display_name,
    avatar_url: k.avatar_url,
    balance: balanceById.get(k.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">
          Kids
        </h1>
        <p className="text-muted-foreground mt-1">
          Add kids, manage PINs, and adjust balances.
        </p>
      </header>

      <KidsManager kids={enrichedKids} />

      {enrichedKids.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No kids yet. Use the form above to add your first one.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
