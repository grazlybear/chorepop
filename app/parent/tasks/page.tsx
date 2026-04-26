import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  TasksManager,
  type KidLite,
  type SuggestedTask,
  type TaskRow,
} from "./tasks-manager";

export const metadata = {
  title: "Tasks — ChorePop",
};

export default async function ParentTasksPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Could not load your profile: ${profileError.message}`);
  }
  if (!profile?.household_id) redirect("/onboarding");

  const [tasksResult, kidsResult, suggestedResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, name, description, icon, reward_type, reward_amount, recurrence, is_shared, max_daily_minutes, is_active, task_assignments ( child_id )",
      )
      .eq("household_id", profile.household_id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("household_id", profile.household_id)
      .eq("role", "child")
      .eq("is_active", true)
      .order("display_name"),
    supabase
      .from("suggested_tasks")
      .select("id, name, icon, reward_type, reward_amount, recurrence, is_shared")
      .order("sort_order"),
  ]);

  type RawTask = {
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
    task_assignments: { child_id: string }[];
  };

  const rawTasks = (tasksResult.data ?? []) as RawTask[];
  const tasks: TaskRow[] = rawTasks.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    reward_type: t.reward_type,
    reward_amount: Number(t.reward_amount),
    recurrence: t.recurrence,
    is_shared: t.is_shared,
    max_daily_minutes: t.max_daily_minutes,
    is_active: t.is_active,
    assigned_kid_ids: (t.task_assignments ?? []).map((a) => a.child_id),
  }));

  const kids = (kidsResult.data ?? []) as KidLite[];

  const rawSuggested = (suggestedResult.data ?? []) as Array<{
    id: string;
    name: string;
    icon: string;
    reward_type: "fixed" | "per_minute";
    reward_amount: number | string;
    recurrence: "daily" | "weekly" | "anytime";
    is_shared: boolean;
  }>;
  const adoptedNames = new Set(tasks.map((t) => t.name.toLowerCase()));
  const suggested: SuggestedTask[] = rawSuggested
    .filter((s) => !adoptedNames.has(s.name.toLowerCase()))
    .map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      reward_type: s.reward_type,
      reward_amount: Number(s.reward_amount),
      recurrence: s.recurrence,
      is_shared: s.is_shared,
    }));

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">Tasks</h1>
        <p className="text-muted-foreground mt-1">
          Add chores, set rewards, and assign them to your kids.
        </p>
      </header>

      <TasksManager tasks={tasks} kids={kids} suggested={suggested} />
    </div>
  );
}
