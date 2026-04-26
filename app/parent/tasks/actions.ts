"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; taskId?: string } | { ok: false; error: string };

type RewardType = "fixed" | "per_minute";
type Recurrence = "daily" | "weekly" | "anytime";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type CallerCtx =
  | {
      ok: true;
      supabase: SupabaseClient;
      callerId: string;
      householdId: string;
    }
  | { ok: false; error: string };

async function requireParent(): Promise<CallerCtx> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const callerId = claimsData?.claims?.sub;
  if (!callerId) return { ok: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id, role")
    .eq("id", callerId)
    .maybeSingle();

  if (!profile?.household_id) {
    return { ok: false, error: "Household not found" };
  }
  if (profile.role !== "owner" && profile.role !== "parent") {
    return { ok: false, error: "Only parents can manage tasks" };
  }

  return { ok: true, supabase, callerId, householdId: profile.household_id };
}

function validateInput(input: {
  name: string;
  icon: string;
  rewardType: RewardType;
  rewardAmount: number;
  recurrence: Recurrence;
  isShared: boolean;
  maxDailyMinutes: number | null;
}): string | null {
  if (!input.name.trim()) return "Name is required";
  if (input.name.trim().length > 80) return "Name is too long";
  if (!input.icon.trim()) return "Pick an icon";
  if (input.rewardType !== "fixed" && input.rewardType !== "per_minute") {
    return "Invalid reward type";
  }
  if (
    input.recurrence !== "daily" &&
    input.recurrence !== "weekly" &&
    input.recurrence !== "anytime"
  ) {
    return "Invalid recurrence";
  }
  if (Number.isNaN(input.rewardAmount) || input.rewardAmount < 0) {
    return "Reward must be zero or positive";
  }
  if (input.rewardAmount > 999) return "Reward is too large";
  if (input.maxDailyMinutes != null) {
    if (
      !Number.isFinite(input.maxDailyMinutes) ||
      input.maxDailyMinutes < 0 ||
      input.maxDailyMinutes > 24 * 60
    ) {
      return "Daily cap must be between 0 and 1440 minutes";
    }
  }
  return null;
}

async function syncAssignments(
  supabase: SupabaseClient,
  taskId: string,
  householdId: string,
  kidIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (kidIds.length > 0) {
    const { data: validKids } = await supabase
      .from("profiles")
      .select("id")
      .eq("household_id", householdId)
      .eq("role", "child")
      .in("id", kidIds);
    const validSet = new Set((validKids ?? []).map((k) => k.id));
    const filtered = kidIds.filter((id) => validSet.has(id));
    if (filtered.length !== kidIds.length) {
      return { ok: false, error: "One or more kids aren't in this household" };
    }
  }

  const { error: delErr } = await supabase
    .from("task_assignments")
    .delete()
    .eq("task_id", taskId);
  if (delErr) return { ok: false, error: delErr.message };

  if (kidIds.length > 0) {
    const rows = kidIds.map((child_id) => ({ task_id: taskId, child_id }));
    const { error: insErr } = await supabase.from("task_assignments").insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

export type TaskInput = {
  name: string;
  description?: string | null;
  icon: string;
  rewardType: RewardType;
  rewardAmount: number;
  recurrence: Recurrence;
  isShared: boolean;
  maxDailyMinutes: number | null;
  assignedKidIds: string[];
};

export async function createTask(input: TaskInput): Promise<Result> {
  const ctx = await requireParent();
  if (!ctx.ok) return ctx;

  const validationError = validateInput(input);
  if (validationError) return { ok: false, error: validationError };

  const { supabase, callerId, householdId } = ctx;

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      household_id: householdId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon: input.icon,
      reward_type: input.rewardType,
      reward_amount: input.rewardAmount,
      recurrence: input.recurrence,
      is_shared: input.isShared,
      max_daily_minutes:
        input.rewardType === "per_minute" ? input.maxDailyMinutes : null,
      created_by: callerId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Could not create task" };
  }

  const sync = await syncAssignments(
    supabase,
    inserted.id,
    householdId,
    input.assignedKidIds,
  );
  if (!sync.ok) return sync;

  revalidatePath("/parent/tasks");
  revalidatePath("/parent");
  return { ok: true, taskId: inserted.id };
}

export async function updateTask(
  taskId: string,
  input: TaskInput,
): Promise<Result> {
  const ctx = await requireParent();
  if (!ctx.ok) return ctx;

  const validationError = validateInput(input);
  if (validationError) return { ok: false, error: validationError };

  const { supabase, householdId } = ctx;

  const { data: existing } = await supabase
    .from("tasks")
    .select("id, household_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!existing || existing.household_id !== householdId) {
    return { ok: false, error: "Task not found in this household" };
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon: input.icon,
      reward_type: input.rewardType,
      reward_amount: input.rewardAmount,
      recurrence: input.recurrence,
      is_shared: input.isShared,
      max_daily_minutes:
        input.rewardType === "per_minute" ? input.maxDailyMinutes : null,
    })
    .eq("id", taskId);

  if (error) return { ok: false, error: error.message };

  const sync = await syncAssignments(
    supabase,
    taskId,
    householdId,
    input.assignedKidIds,
  );
  if (!sync.ok) return sync;

  revalidatePath("/parent/tasks");
  revalidatePath("/parent");
  return { ok: true, taskId };
}

export async function setTaskActive(
  taskId: string,
  isActive: boolean,
): Promise<Result> {
  const ctx = await requireParent();
  if (!ctx.ok) return ctx;

  const { supabase, householdId } = ctx;

  const { error } = await supabase
    .from("tasks")
    .update({ is_active: isActive })
    .eq("id", taskId)
    .eq("household_id", householdId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent/tasks");
  revalidatePath("/parent");
  return { ok: true, taskId };
}

export async function deleteTask(taskId: string): Promise<Result> {
  const ctx = await requireParent();
  if (!ctx.ok) return ctx;

  const { supabase, householdId } = ctx;

  const { data: existing } = await supabase
    .from("tasks")
    .select("id, household_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!existing || existing.household_id !== householdId) {
    return { ok: false, error: "Task not found in this household" };
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent/tasks");
  revalidatePath("/parent");
  return { ok: true, taskId };
}

/**
 * Adopts a row from suggested_tasks into the caller's household. Auto-assigns
 * to all active kids in the household. Used by the "Quick add" picker on the
 * tasks page empty state.
 */
export async function adoptSuggestedTask(
  suggestedTaskId: string,
): Promise<Result> {
  const ctx = await requireParent();
  if (!ctx.ok) return ctx;

  const { supabase, callerId, householdId } = ctx;

  const { data: suggested, error: fetchErr } = await supabase
    .from("suggested_tasks")
    .select("name, icon, reward_type, reward_amount, recurrence, is_shared")
    .eq("id", suggestedTaskId)
    .maybeSingle();

  if (fetchErr || !suggested) {
    return { ok: false, error: "Suggested task not found" };
  }

  const { data: kids } = await supabase
    .from("profiles")
    .select("id")
    .eq("household_id", householdId)
    .eq("role", "child")
    .eq("is_active", true);

  const { data: inserted, error: insErr } = await supabase
    .from("tasks")
    .insert({
      household_id: householdId,
      name: suggested.name,
      icon: suggested.icon,
      reward_type: suggested.reward_type,
      reward_amount: suggested.reward_amount,
      recurrence: suggested.recurrence,
      is_shared: suggested.is_shared,
      created_by: callerId,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message ?? "Could not add task" };
  }

  if (kids && kids.length > 0) {
    const rows = kids.map((k) => ({ task_id: inserted.id, child_id: k.id }));
    const { error: assignErr } = await supabase
      .from("task_assignments")
      .insert(rows);
    if (assignErr) {
      // Task created without assignments — surface the issue but don't roll back.
      return { ok: false, error: assignErr.message };
    }
  }

  revalidatePath("/parent/tasks");
  revalidatePath("/parent");
  return { ok: true, taskId: inserted.id };
}
