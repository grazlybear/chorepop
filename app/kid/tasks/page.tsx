import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { FALLBACK_TIMEZONE, localDateInTz, startOfWeekIso } from "@/lib/dates";
import { TaskBoard, type KidTaskCard } from "./task-board";

export const metadata = {
  title: "Chores — ChorePop",
};

export default async function KidTasksPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const kidId = claimsData?.claims?.sub;
  if (!kidId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", kidId)
    .maybeSingle();

  let timezone = FALLBACK_TIMEZONE;
  if (profile?.household_id) {
    const { data: household } = await supabase
      .from("households")
      .select("timezone")
      .eq("id", profile.household_id)
      .maybeSingle();
    timezone = household?.timezone ?? FALLBACK_TIMEZONE;
  }

  const todayIsoStr = localDateInTz(timezone);
  const weekStart = startOfWeekIso(todayIsoStr);

  // Pull all tasks assigned to this kid via the join table.
  const { data: assignments } = await supabase
    .from("task_assignments")
    .select(
      "task_id, tasks ( id, name, description, icon, reward_type, reward_amount, recurrence, is_shared, max_daily_minutes, is_active )",
    )
    .eq("child_id", kidId);

  type AssignmentRow = {
    task_id: string;
    tasks: {
      id: string;
      name: string;
      description: string | null;
      icon: string;
      reward_type: "fixed" | "per_minute";
      reward_amount: number | string;
      recurrence: "daily" | "weekly" | "anytime";
      is_shared: boolean;
      max_daily_minutes: number | null;
      is_active: boolean;
    } | null;
  };

  const taskRows = ((assignments ?? []) as unknown as AssignmentRow[])
    .map((a) => a.tasks)
    .filter((t): t is NonNullable<AssignmentRow["tasks"]> => t !== null && t.is_active);

  const taskIds = taskRows.map((t) => t.id);

  const [todayMine, weekMine, todaySiblings] = await Promise.all([
    taskIds.length
      ? supabase
          .from("task_completions")
          .select("task_id, minutes_earned")
          .eq("child_id", kidId)
          .eq("completed_date", todayIsoStr)
          .in("task_id", taskIds)
      : Promise.resolve({
          data: [] as { task_id: string; minutes_earned: number }[],
        }),
    taskIds.length
      ? supabase
          .from("task_completions")
          .select("task_id")
          .eq("child_id", kidId)
          .gte("completed_date", weekStart)
          .lte("completed_date", todayIsoStr)
          .in("task_id", taskIds)
      : Promise.resolve({ data: [] as { task_id: string }[] }),
    taskIds.length
      ? supabase
          .from("task_completions")
          .select("task_id, child_id")
          .neq("child_id", kidId)
          .eq("completed_date", todayIsoStr)
          .in("task_id", taskIds)
      : Promise.resolve({ data: [] as { task_id: string; child_id: string }[] }),
  ]);

  const myTodayCount = new Map<string, number>();
  const myTodayEarned = new Map<string, number>();
  for (const row of todayMine.data ?? []) {
    myTodayCount.set(row.task_id, (myTodayCount.get(row.task_id) ?? 0) + 1);
    myTodayEarned.set(
      row.task_id,
      (myTodayEarned.get(row.task_id) ?? 0) + (row.minutes_earned ?? 0),
    );
  }

  const myWeekTaskIds = new Set((weekMine.data ?? []).map((r) => r.task_id));

  const siblingDoneTaskIds = new Set(
    (todaySiblings.data ?? []).map((r) => r.task_id),
  );

  const cards: KidTaskCard[] = taskRows.map((t) => {
    const reward = Number(t.reward_amount);
    const todayCount = myTodayCount.get(t.id) ?? 0;
    const earnedToday = myTodayEarned.get(t.id) ?? 0;
    const remainingCap =
      t.reward_type === "per_minute" && t.max_daily_minutes != null
        ? Math.max(0, t.max_daily_minutes - earnedToday)
        : null;

    let lockedReason: string | null = null;
    if (t.recurrence === "daily" && todayCount > 0) {
      lockedReason = "Done for today!";
    } else if (t.recurrence === "weekly" && myWeekTaskIds.has(t.id)) {
      lockedReason = "Done for the week!";
    } else if (!t.is_shared && siblingDoneTaskIds.has(t.id)) {
      lockedReason = "Already claimed by a sibling today";
    } else if (
      t.reward_type === "per_minute" &&
      remainingCap != null &&
      remainingCap === 0
    ) {
      lockedReason = "Daily cap reached!";
    }

    return {
      id: t.id,
      name: t.name,
      description: t.description,
      icon: t.icon,
      reward_type: t.reward_type,
      reward_amount: reward,
      recurrence: t.recurrence,
      is_shared: t.is_shared,
      max_daily_minutes: t.max_daily_minutes,
      remaining_cap: remainingCap,
      earned_today: earnedToday,
      locked_reason: lockedReason,
    };
  });

  cards.sort((a, b) => {
    // Active first, then by name.
    if (!!a.locked_reason !== !!b.locked_reason) {
      return a.locked_reason ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">
          Chores 💪
        </h1>
        <p className="text-muted-foreground mt-1">
          Tap a chore to claim it and earn screen time.
        </p>
      </header>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <div className="text-5xl mb-3" aria-hidden>📭</div>
            No chores assigned to you yet. Ask a parent!
          </CardContent>
        </Card>
      ) : (
        <TaskBoard cards={cards} />
      )}
    </div>
  );
}
