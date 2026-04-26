"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  FALLBACK_TIMEZONE,
  localDateInTz,
  startOfWeekIso,
} from "@/lib/dates";

type ClaimResult =
  | { ok: true; minutesEarned: number; clamped: boolean }
  | { ok: false; error: string };

type SimpleResult = { ok: true } | { ok: false; error: string };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type KidCtx =
  | {
      ok: true;
      supabase: SupabaseClient;
      kidId: string;
      timezone: string;
    }
  | { ok: false; error: string };

async function requireKid(): Promise<KidCtx> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const kidId = claimsData?.claims?.sub;
  if (!kidId) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, household_id")
    .eq("id", kidId)
    .maybeSingle();

  if (!profile) return { ok: false, error: "Profile not found" };
  if (profile.role !== "child") {
    return { ok: false, error: "Only kids can claim tasks" };
  }

  let timezone = FALLBACK_TIMEZONE;
  if (profile.household_id) {
    const { data: hh } = await supabase
      .from("households")
      .select("timezone")
      .eq("id", profile.household_id)
      .maybeSingle();
    timezone = hh?.timezone ?? FALLBACK_TIMEZONE;
  }

  return { ok: true, supabase, kidId, timezone };
}

/**
 * Records a task completion for the signed-in kid. Handles both fixed
 * and per-minute tasks. For per-minute, applies the daily cap by
 * clamping `minutes_earned` to the remaining cap window.
 */
export async function claimTask(input: {
  taskId: string;
  /** Required for per_minute tasks; ignored for fixed. */
  durationMinutes?: number;
}): Promise<ClaimResult> {
  const ctx = await requireKid();
  if (!ctx.ok) return ctx;
  const { supabase, kidId, timezone } = ctx;

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select(
      "id, reward_type, reward_amount, recurrence, is_shared, max_daily_minutes, is_active, household_id",
    )
    .eq("id", input.taskId)
    .maybeSingle();

  if (taskErr || !task) {
    return { ok: false, error: "Task not found" };
  }
  if (!task.is_active) {
    return { ok: false, error: "This task is paused right now" };
  }

  // Confirm assignment (RLS would enforce, but the explicit check gives a
  // friendlier error than a row-not-found surprise).
  const { data: assignment } = await supabase
    .from("task_assignments")
    .select("task_id")
    .eq("task_id", input.taskId)
    .eq("child_id", kidId)
    .maybeSingle();

  if (!assignment) {
    return { ok: false, error: "This chore isn't assigned to you" };
  }

  const today = localDateInTz(timezone);
  const weekStart = startOfWeekIso(today);
  const rewardAmount = Number(task.reward_amount);

  // Per-kid recurrence guard (sibling-side handled by DB trigger).
  if (task.recurrence === "daily") {
    const { data: existing } = await supabase
      .from("task_completions")
      .select("id")
      .eq("task_id", input.taskId)
      .eq("child_id", kidId)
      .eq("completed_date", today)
      .limit(1);
    if (existing && existing.length > 0) {
      return { ok: false, error: "You already did this one today!" };
    }
  } else if (task.recurrence === "weekly") {
    const { data: existing } = await supabase
      .from("task_completions")
      .select("id")
      .eq("task_id", input.taskId)
      .eq("child_id", kidId)
      .gte("completed_date", weekStart)
      .lte("completed_date", today)
      .limit(1);
    if (existing && existing.length > 0) {
      return { ok: false, error: "You already did this one this week!" };
    }
  }

  let minutesEarned = 0;
  let durationMinutes: number | null = null;
  let clamped = false;

  if (task.reward_type === "fixed") {
    minutesEarned = Math.floor(rewardAmount);
  } else {
    const requested = Math.floor(input.durationMinutes ?? 0);
    if (!Number.isFinite(requested) || requested <= 0) {
      return { ok: false, error: "How many minutes did you spend?" };
    }
    if (requested > 24 * 60) {
      return { ok: false, error: "That's more minutes than fit in a day!" };
    }
    durationMinutes = requested;
    let earned = Math.floor(requested * rewardAmount);

    if (task.max_daily_minutes != null) {
      const { data: rows } = await supabase
        .from("task_completions")
        .select("minutes_earned")
        .eq("task_id", input.taskId)
        .eq("child_id", kidId)
        .eq("completed_date", today);
      const alreadyEarned = (rows ?? []).reduce(
        (sum, r) => sum + (r.minutes_earned ?? 0),
        0,
      );
      const remaining = Math.max(0, task.max_daily_minutes - alreadyEarned);
      if (remaining <= 0) {
        return {
          ok: false,
          error: "You've already maxed out this chore for today!",
        };
      }
      if (earned > remaining) {
        earned = remaining;
        clamped = true;
      }
    }

    minutesEarned = earned;
  }

  const { error: insertErr } = await supabase.from("task_completions").insert({
    task_id: input.taskId,
    child_id: kidId,
    completed_date: today,
    duration_minutes: durationMinutes,
    minutes_earned: minutesEarned,
  });

  if (insertErr) {
    // The non-shared-task trigger raises a friendly message; surface it.
    return { ok: false, error: insertErr.message };
  }

  revalidatePath("/kid");
  revalidatePath("/kid/tasks");
  return { ok: true, minutesEarned, clamped };
}

/**
 * Records screen-time usage for the signed-in kid.
 */
export async function logScreenTime(input: {
  minutes: number;
  note: string | null;
}): Promise<SimpleResult> {
  const ctx = await requireKid();
  if (!ctx.ok) return ctx;
  const { supabase, kidId, timezone } = ctx;

  const minutes = Math.floor(input.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ok: false, error: "Enter how many minutes you used" };
  }
  if (minutes > 24 * 60) {
    return { ok: false, error: "That's more time than a whole day!" };
  }

  const note = input.note?.trim() || null;

  const { error } = await supabase.from("screen_time_usage").insert({
    child_id: kidId,
    usage_date: localDateInTz(timezone),
    minutes_used: minutes,
    note,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/kid");
  revalidatePath("/kid/log");
  return { ok: true };
}
