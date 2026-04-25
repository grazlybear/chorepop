"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  kidAuthEmail,
  kidPasswordFromPin,
} from "@/lib/supabase/admin";

export type CreateKidResult =
  | { ok: true; kidId: string }
  | { ok: false; error: string };

/**
 * Creates a new kid in the caller's household:
 *   1. Creates a Supabase auth user with a synthetic email and PIN-derived
 *      password (pre-confirmed so sign-in works immediately).
 *   2. Creates the matching profiles row with role='child'.
 * The caller must be authenticated as an owner or parent in a household.
 */
export async function createKid(input: {
  displayName: string;
  avatarUrl: string | null;
  pin: string;
}): Promise<CreateKidResult> {
  const displayName = input.displayName.trim();
  const pin = input.pin.trim();
  if (!displayName) return { ok: false, error: "Name is required" };
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: "PIN must be 4 digits" };

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const callerId = claimsData?.claims?.sub;
  if (!callerId) return { ok: false, error: "Not authenticated" };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("household_id, role")
    .eq("id", callerId)
    .maybeSingle();

  if (!callerProfile || !callerProfile.household_id) {
    return { ok: false, error: "Finish household setup first" };
  }
  if (callerProfile.role !== "owner" && callerProfile.role !== "parent") {
    return { ok: false, error: "Only parents can add kids" };
  }

  const admin = createAdminClient();
  const email = kidAuthEmail(randomUUID());

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: kidPasswordFromPin(pin),
    email_confirm: true,
    user_metadata: { display_name: displayName, kind: "child" },
  });

  if (createErr || !created.user) {
    return {
      ok: false,
      error: createErr?.message ?? "Could not create kid account",
    };
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    household_id: callerProfile.household_id,
    display_name: displayName,
    avatar_url: input.avatarUrl,
    role: "child",
  });

  if (profileErr) {
    // Roll back the orphaned auth user so we don't leak accounts.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: profileErr.message };
  }

  revalidatePath("/parent");
  revalidatePath("/parent/kids");
  return { ok: true, kidId: created.user.id };
}

/**
 * Resets a kid's PIN by updating their Supabase auth password.
 */
export async function resetKidPin(input: {
  kidId: string;
  pin: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d{4}$/.test(input.pin)) {
    return { ok: false, error: "PIN must be 4 digits" };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const callerId = claimsData?.claims?.sub;
  if (!callerId) return { ok: false, error: "Not authenticated" };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("household_id, role")
    .eq("id", callerId)
    .maybeSingle();

  if (!callerProfile || !callerProfile.household_id) {
    return { ok: false, error: "Household not found" };
  }
  if (callerProfile.role !== "owner" && callerProfile.role !== "parent") {
    return { ok: false, error: "Only parents can reset PINs" };
  }

  const { data: kidProfile } = await supabase
    .from("profiles")
    .select("household_id, role")
    .eq("id", input.kidId)
    .maybeSingle();

  if (!kidProfile || kidProfile.household_id !== callerProfile.household_id) {
    return { ok: false, error: "Kid not found in this household" };
  }
  if (kidProfile.role !== "child") {
    return { ok: false, error: "That profile is not a kid" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(input.kidId, {
    password: kidPasswordFromPin(input.pin),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Adds (or subtracts) minutes from a kid's balance. Inserts a row in
 * balance_adjustments with the parent recorded as adjusted_by.
 */
export async function adjustBalance(input: {
  kidId: string;
  minutes: number;
  reason: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(input.minutes) || input.minutes === 0) {
    return { ok: false, error: "Enter a non-zero whole number of minutes" };
  }
  if (Math.abs(input.minutes) > 10000) {
    return { ok: false, error: "Adjustment is too large" };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const callerId = claimsData?.claims?.sub;
  if (!callerId) return { ok: false, error: "Not authenticated" };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("household_id, role")
    .eq("id", callerId)
    .maybeSingle();

  if (!callerProfile || !callerProfile.household_id) {
    return { ok: false, error: "Household not found" };
  }
  if (callerProfile.role !== "owner" && callerProfile.role !== "parent") {
    return { ok: false, error: "Only parents can adjust balances" };
  }

  const { data: kidProfile } = await supabase
    .from("profiles")
    .select("household_id, role")
    .eq("id", input.kidId)
    .maybeSingle();

  if (!kidProfile || kidProfile.household_id !== callerProfile.household_id) {
    return { ok: false, error: "Kid not found in this household" };
  }
  if (kidProfile.role !== "child") {
    return { ok: false, error: "That profile is not a kid" };
  }

  const reason = input.reason?.trim() || null;
  const { error } = await supabase.from("balance_adjustments").insert({
    child_id: input.kidId,
    adjusted_by: callerId,
    minutes: input.minutes,
    reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent");
  revalidatePath("/parent/kids");
  return { ok: true };
}
