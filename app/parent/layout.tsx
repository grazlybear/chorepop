import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, role, household_id")
    .eq("id", data.claims.sub)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Could not load your profile: ${profileError.message}`);
  }
  if (!profile) redirect("/onboarding");
  if (profile.role === "child") redirect("/kid");

  let householdName: string | undefined;
  if (profile.household_id) {
    const { data: hh } = await supabase
      .from("households")
      .select("name")
      .eq("id", profile.household_id)
      .maybeSingle();
    householdName = hh?.name;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between gap-5">
          <Link href="/parent" className="flex items-center gap-2 font-display font-bold text-xl">
            <span className="text-2xl" aria-hidden>🍿</span>
            <span>ChorePop</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1 text-sm font-semibold">
            <NavLink href="/parent">Home</NavLink>
            <NavLink href="/parent/tasks">Tasks</NavLink>
            <NavLink href="/parent/kids">Kids</NavLink>
            <NavLink href="/parent/household">Household</NavLink>
            <NavLink href="/parent/summary">Summary</NavLink>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-sm text-muted-foreground">
              {householdName ? `${householdName} · ` : ""}{profile.display_name}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav className="sm:hidden max-w-5xl mx-auto px-5 pb-3 flex gap-1 text-sm font-semibold overflow-x-auto">
          <NavLink href="/parent">Home</NavLink>
          <NavLink href="/parent/tasks">Tasks</NavLink>
          <NavLink href="/parent/kids">Kids</NavLink>
          <NavLink href="/parent/household">Household</NavLink>
          <NavLink href="/parent/summary">Summary</NavLink>
        </nav>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-5 py-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md hover:bg-muted transition-colors"
    >
      {children}
    </Link>
  );
}
