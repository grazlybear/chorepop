import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

export default async function KidLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, avatar_url")
    .eq("id", data.claims.sub)
    .maybeSingle();

  if (!profile) redirect("/onboarding");
  if (profile.role !== "child") redirect("/parent");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-display font-bold text-xl">
            <span className="text-2xl" aria-hidden>
              {profile.avatar_url ?? "🙂"}
            </span>
            <span>{profile.display_name}</span>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-5 py-6">{children}</main>
    </div>
  );
}
