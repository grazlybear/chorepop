import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Kid = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_active: boolean;
};

export const metadata = {
  title: "Parent dashboard — ChorePop",
};

export default async function ParentDashboardPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    console.log("[parent/page] no claims — redirect /login");
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, household_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[parent/page] profile fetch error:", profileError.message);
    throw new Error(`Could not load your profile: ${profileError.message}`);
  }
  if (!profile?.household_id) {
    console.log(
      `[parent/page] profile=${JSON.stringify(profile)} — redirect /onboarding`,
    );
    redirect("/onboarding");
  }

  const { data: kidsData } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_active")
    .eq("household_id", profile.household_id)
    .eq("role", "child")
    .eq("is_active", true)
    .order("display_name");

  const kids = (kidsData ?? []) as Kid[];
  const kidIds = kids.map((k) => k.id);

  const today = new Date().toISOString().slice(0, 10);

  const [balances, completions, streaks] = await Promise.all([
    Promise.all(
      kids.map((k) =>
        supabase
          .rpc("child_current_balance", { p_child_id: k.id })
          .then((res) => ({ id: k.id, balance: (res.data as number | null) ?? 0 })),
      ),
    ),
    kidIds.length
      ? supabase
          .from("task_completions")
          .select("child_id")
          .in("child_id", kidIds)
          .eq("completed_date", today)
      : Promise.resolve({ data: [] as { child_id: string }[] }),
    kidIds.length
      ? supabase
          .from("streaks")
          .select("child_id, current_streak")
          .in("child_id", kidIds)
      : Promise.resolve({ data: [] as { child_id: string; current_streak: number }[] }),
  ]);

  const balanceById = new Map(balances.map((b) => [b.id, b.balance]));
  const completionsByKid = new Map<string, number>();
  for (const row of completions.data ?? []) {
    completionsByKid.set(row.child_id, (completionsByKid.get(row.child_id) ?? 0) + 1);
  }
  const bestStreakByKid = new Map<string, number>();
  for (const row of streaks.data ?? []) {
    const prev = bestStreakByKid.get(row.child_id) ?? 0;
    if (row.current_streak > prev) bestStreakByKid.set(row.child_id, row.current_streak);
  }

  const negativeKids = kids.filter((k) => (balanceById.get(k.id) ?? 0) < 0);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">
          Hey {profile.display_name}! 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s how your crew is doing today.
        </p>
      </header>

      {negativeKids.length > 0 ? (
        <div
          role="alert"
          className="rounded-lg bg-negative/10 border border-negative/30 px-5 py-4 flex items-start gap-3"
        >
          <span className="text-2xl" aria-hidden>⚠️</span>
          <div className="flex-1">
            <p className="font-display font-bold text-base">Heads up</p>
            <p className="text-sm text-muted-foreground">
              {negativeKids.map((k) => k.display_name).join(", ")}{" "}
              {negativeKids.length === 1 ? "is" : "are"} in the negative this week. Time to earn some chores!
            </p>
          </div>
        </div>
      ) : null}

      {kids.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <div className="text-6xl mb-3" aria-hidden>👶</div>
            <h2 className="font-display font-bold text-xl mb-1">No kids yet</h2>
            <p className="text-muted-foreground mb-5">
              Add your first kid to start tracking chores and screen time.
            </p>
            <Button asChild size="lg">
              <Link href="/parent/kids">Add a kid</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display font-bold text-xl">Your kids</h2>
            <Link
              href="/parent/kids"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Manage kids →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {kids.map((kid) => {
              const balance = balanceById.get(kid.id) ?? 0;
              const completed = completionsByKid.get(kid.id) ?? 0;
              const streak = bestStreakByKid.get(kid.id) ?? 0;
              return (
                <KidOverviewCard
                  key={kid.id}
                  kid={kid}
                  balance={balance}
                  completedToday={completed}
                  bestStreak={streak}
                />
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <QuickLink
          href="/parent/tasks"
          icon="📋"
          title="Tasks"
          subtitle="Add or edit chores"
        />
        <QuickLink
          href="/parent/kids"
          icon="🧒"
          title="Kids"
          subtitle="Balances & PINs"
        />
        <QuickLink
          href="/parent/household"
          icon="🏡"
          title="Household"
          subtitle="Invite code & members"
        />
      </section>
    </div>
  );
}

function KidOverviewCard({
  kid,
  balance,
  completedToday,
  bestStreak,
}: {
  kid: Kid;
  balance: number;
  completedToday: number;
  bestStreak: number;
}) {
  const tone =
    balance < 0
      ? "text-negative"
      : balance < 30
        ? "text-accent-foreground"
        : "text-positive";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="text-5xl shrink-0" aria-hidden>
          {kid.avatar_url ?? "🙂"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-lg leading-tight truncate">
            {kid.display_name}
          </div>
          <div className={`font-display font-extrabold text-2xl ${tone}`}>
            {balance >= 0 ? "+" : ""}
            {balance} min
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
            <span>
              <span aria-hidden>✅</span> {completedToday} today
            </span>
            {bestStreak > 0 ? (
              <span>
                <span aria-hidden>🔥</span> {bestStreak}-day streak
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLink({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border/60 bg-card shadow-pop-sm p-4 transition-all hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className="text-3xl mb-1" aria-hidden>
        {icon}
      </div>
      <div className="font-display font-bold">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </Link>
  );
}
