import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Badges — ChorePop",
};

type CriteriaType = "streak_days" | "total_earned" | "tasks_completed" | "first_task";

type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria_type: CriteriaType;
  criteria_value: number;
};

export default async function KidAchievementsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const kidId = claimsData?.claims?.sub;
  if (!kidId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", kidId)
    .maybeSingle();
  if (!profile?.household_id) redirect("/login");

  const [achievementsRes, unlockedRes, completionsRes, streaksRes] =
    await Promise.all([
      supabase
        .from("achievements")
        .select("id, name, description, icon, criteria_type, criteria_value")
        .or(`household_id.is.null,household_id.eq.${profile.household_id}`)
        .order("criteria_value"),
      supabase
        .from("child_achievements")
        .select("achievement_id, unlocked_at")
        .eq("child_id", kidId),
      supabase
        .from("task_completions")
        .select("minutes_earned")
        .eq("child_id", kidId),
      supabase
        .from("streaks")
        .select("task_id, current_streak, longest_streak, last_completed_date, tasks ( name, icon )")
        .eq("child_id", kidId)
        .order("current_streak", { ascending: false }),
    ]);

  const achievements = (achievementsRes.data ?? []) as Achievement[];
  const unlockedById = new Map<string, string>(
    (unlockedRes.data ?? []).map((r) => [r.achievement_id, r.unlocked_at]),
  );

  const totalEarned = (completionsRes.data ?? []).reduce(
    (sum, r) => sum + (r.minutes_earned ?? 0),
    0,
  );
  const totalCompletions = (completionsRes.data ?? []).length;
  const bestCurrentStreak = Math.max(
    0,
    ...((streaksRes.data ?? []).map((s) => s.current_streak ?? 0)),
  );
  const bestLongestStreak = Math.max(
    0,
    ...((streaksRes.data ?? []).map((s) => s.longest_streak ?? 0)),
  );

  function progressFor(a: Achievement): { current: number; label: string } {
    switch (a.criteria_type) {
      case "first_task":
        return {
          current: totalCompletions > 0 ? 1 : 0,
          label: `${Math.min(1, totalCompletions)}/1`,
        };
      case "tasks_completed":
        return {
          current: totalCompletions,
          label: `${totalCompletions}/${a.criteria_value} chores`,
        };
      case "total_earned":
        return {
          current: totalEarned,
          label: `${totalEarned}/${a.criteria_value} min`,
        };
      case "streak_days":
        return {
          current: bestLongestStreak,
          label: `${bestLongestStreak}/${a.criteria_value} days`,
        };
    }
  }

  type StreakRow = {
    task_id: string;
    current_streak: number;
    longest_streak: number;
    last_completed_date: string | null;
    tasks: { name: string; icon: string } | null;
  };
  const streaks = ((streaksRes.data ?? []) as unknown as StreakRow[]).filter(
    (s) => s.current_streak > 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">
          Badges 🏆
        </h1>
        <p className="text-muted-foreground mt-1">
          Earn badges by completing chores and building streaks.
        </p>
      </header>

      <SummaryStats
        totalEarned={totalEarned}
        totalCompletions={totalCompletions}
        bestStreak={bestCurrentStreak}
      />

      {streaks.length > 0 ? <StreaksSection streaks={streaks} /> : null}

      <section>
        <h2 className="font-display font-bold text-xl mb-3">All badges</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {achievements.map((a) => {
            const unlockedAt = unlockedById.get(a.id);
            const progress = progressFor(a);
            const percent = Math.min(
              100,
              Math.round((progress.current / a.criteria_value) * 100),
            );
            return (
              <BadgeCard
                key={a.id}
                achievement={a}
                unlockedAt={unlockedAt}
                progressLabel={progress.label}
                percent={percent}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SummaryStats({
  totalEarned,
  totalCompletions,
  bestStreak,
}: {
  totalEarned: number;
  totalCompletions: number;
  bestStreak: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat icon="⏱️" label="Lifetime min" value={totalEarned} />
      <Stat icon="✅" label="Chores done" value={totalCompletions} />
      <Stat icon="🔥" label="Best streak" value={bestStreak} />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <div className="text-3xl mb-1" aria-hidden>
          {icon}
        </div>
        <div className="font-display font-extrabold text-2xl">{value}</div>
        <div className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wider">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}

function StreaksSection({
  streaks,
}: {
  streaks: Array<{
    task_id: string;
    current_streak: number;
    longest_streak: number;
    last_completed_date: string | null;
    tasks: { name: string; icon: string } | null;
  }>;
}) {
  return (
    <section>
      <h2 className="font-display font-bold text-xl mb-3">Active streaks 🔥</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {streaks.map((s) => (
          <Card key={s.task_id}>
            <CardContent className="p-4 flex items-center gap-3">
              <span className="text-3xl animate-flame-pulse" aria-hidden>
                🔥
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold leading-tight truncate">
                  {s.tasks?.icon ?? "✅"} {s.tasks?.name ?? "Task"}
                </div>
                <div className="font-display font-extrabold text-2xl">
                  {s.current_streak} {s.current_streak === 1 ? "day" : "days"}
                </div>
                {s.longest_streak > s.current_streak ? (
                  <div className="text-xs text-muted-foreground">
                    Best: {s.longest_streak}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function BadgeCard({
  achievement,
  unlockedAt,
  progressLabel,
  percent,
}: {
  achievement: Achievement;
  unlockedAt: string | undefined;
  progressLabel: string;
  percent: number;
}) {
  const unlocked = !!unlockedAt;
  return (
    <Card
      className={`overflow-hidden ${
        unlocked ? "border-accent/40 bg-accent/10" : "opacity-70"
      }`}
    >
      <CardContent className="p-4 text-center">
        <div
          className={`text-5xl mb-2 ${unlocked ? "" : "grayscale"}`}
          aria-hidden
        >
          {achievement.icon}
        </div>
        <div className="font-display font-bold text-sm leading-tight">
          {achievement.name}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {achievement.description}
        </div>
        {unlocked ? (
          <div className="mt-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-display font-bold bg-positive/20 text-positive uppercase tracking-wider">
            Unlocked
          </div>
        ) : (
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 font-display font-semibold">
              {progressLabel}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
