import Link from "next/link";
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
          <Link
            href="/kid"
            className="flex items-center gap-2 font-display font-bold text-xl"
          >
            <span className="text-2xl" aria-hidden>
              {profile.avatar_url ?? "🙂"}
            </span>
            <span>{profile.display_name}</span>
          </Link>
          <LogoutButton />
        </div>
        <nav className="max-w-3xl mx-auto px-5 pb-3 flex gap-1 text-sm font-semibold overflow-x-auto">
          <KidNavLink href="/kid">🏠 Home</KidNavLink>
          <KidNavLink href="/kid/tasks">✅ Chores</KidNavLink>
          <KidNavLink href="/kid/log">📱 Use time</KidNavLink>
          <KidNavLink href="/kid/achievements">🏆 Badges</KidNavLink>
          <KidNavLink href="/kid/summary">📊 My week</KidNavLink>
        </nav>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-5 py-6">{children}</main>
    </div>
  );
}

function KidNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md hover:bg-muted transition-colors whitespace-nowrap"
    >
      {children}
    </Link>
  );
}
