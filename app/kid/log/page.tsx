import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogScreenTimeForm } from "./log-form";

export const metadata = {
  title: "Use time — ChorePop",
};

export default async function KidLogPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const kidId = claimsData?.claims?.sub;
  if (!kidId) redirect("/login");

  const balanceRes = await supabase.rpc("child_current_balance", {
    p_child_id: kidId,
  });
  const balance = (balanceRes.data as number | null) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">
          Use screen time 📱
        </h1>
        <p className="text-muted-foreground mt-1">
          Log how many minutes you used so your balance stays accurate.
        </p>
      </header>

      <LogScreenTimeForm balance={balance} />
    </div>
  );
}
