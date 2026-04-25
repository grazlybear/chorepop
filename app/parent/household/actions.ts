"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type CallerContext =
  | {
      ok: true;
      supabase: SupabaseClient;
      callerId: string;
      profile: { household_id: string; role: "owner" | "parent" | "child" };
    }
  | { ok: false; error: string };

async function getCallerContext(): Promise<CallerContext> {
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

  return {
    ok: true,
    supabase,
    callerId,
    profile: profile as {
      household_id: string;
      role: "owner" | "parent" | "child";
    },
  };
}

/**
 * Generates a fresh invite code for the caller's household. Owner-only
 * (RLS enforces this on the UPDATE).
 */
export async function regenerateInviteCode(): Promise<
  { ok: true; code: string } | { ok: false; error: string }
> {
  const ctx = await getCallerContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (ctx.profile.role !== "owner") {
    return { ok: false, error: "Only the owner can regenerate the invite code" };
  }

  const { supabase, profile } = ctx;
  const { data: codeData, error: codeErr } = await supabase.rpc("generate_invite_code");
  if (codeErr || typeof codeData !== "string") {
    return { ok: false, error: codeErr?.message ?? "Could not generate code" };
  }

  const { error: updateErr } = await supabase
    .from("households")
    .update({ invite_code: codeData })
    .eq("id", profile.household_id);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/parent/household");
  return { ok: true, code: codeData };
}

/**
 * Toggles vacation/pause mode on the caller's household. Owner-only.
 */
export async function setHouseholdPaused(isPaused: boolean): Promise<Result> {
  const ctx = await getCallerContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (ctx.profile.role !== "owner") {
    return { ok: false, error: "Only the owner can change vacation mode" };
  }

  const { supabase, profile } = ctx;
  const { error } = await supabase
    .from("households")
    .update({ is_paused: isPaused })
    .eq("id", profile.household_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent/household");
  revalidatePath("/parent");
  return { ok: true };
}

/**
 * Promote/demote a member between owner and parent. Only the owner can
 * change roles, and the owner cannot demote themselves through this path
 * (transferring ownership requires promoting another parent first).
 */
export async function changeMemberRole(input: {
  memberId: string;
  role: "owner" | "parent";
}): Promise<Result> {
  if (input.role !== "owner" && input.role !== "parent") {
    return { ok: false, error: "Invalid role" };
  }

  const ctx = await getCallerContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (ctx.profile.role !== "owner") {
    return { ok: false, error: "Only the owner can change roles" };
  }

  const { supabase, callerId, profile } = ctx;

  if (input.memberId === callerId) {
    return {
      ok: false,
      error: "Promote another parent to owner first, then they can change your role.",
    };
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("household_id, role")
    .eq("id", input.memberId)
    .maybeSingle();

  if (!target || target.household_id !== profile.household_id) {
    return { ok: false, error: "Member not found in this household" };
  }
  if (target.role === "child") {
    return { ok: false, error: "Kids' roles can't be changed here" };
  }

  if (input.role === "owner") {
    // Demote the current owner to parent in the same transaction-ish flow.
    const { error: demoteErr } = await supabase
      .from("profiles")
      .update({ role: "parent" })
      .eq("id", callerId);
    if (demoteErr) return { ok: false, error: demoteErr.message };

    const { error: promoteErr } = await supabase
      .from("profiles")
      .update({ role: "owner" })
      .eq("id", input.memberId);
    if (promoteErr) {
      // Best-effort rollback
      await supabase.from("profiles").update({ role: "owner" }).eq("id", callerId);
      return { ok: false, error: promoteErr.message };
    }

    const { error: ownerErr } = await supabase
      .from("households")
      .update({ created_by: input.memberId })
      .eq("id", profile.household_id);
    if (ownerErr) return { ok: false, error: ownerErr.message };
  } else {
    const { error } = await supabase
      .from("profiles")
      .update({ role: input.role })
      .eq("id", input.memberId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/parent/household");
  return { ok: true };
}

/**
 * Removes a parent or co-owner from the household. Owner-only. Cannot
 * remove yourself or kids (kids are managed via /parent/kids).
 */
export async function removeMember(memberId: string): Promise<Result> {
  const ctx = await getCallerContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (ctx.profile.role !== "owner") {
    return { ok: false, error: "Only the owner can remove members" };
  }

  const { supabase, callerId, profile } = ctx;

  if (memberId === callerId) {
    return { ok: false, error: "You can't remove yourself" };
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("household_id, role")
    .eq("id", memberId)
    .maybeSingle();

  if (!target || target.household_id !== profile.household_id) {
    return { ok: false, error: "Member not found in this household" };
  }
  if (target.role === "child") {
    return { ok: false, error: "Use the kids page to remove a kid" };
  }

  const { error } = await supabase.from("profiles").delete().eq("id", memberId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent/household");
  return { ok: true };
}
