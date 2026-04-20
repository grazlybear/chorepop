import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client authenticated with the service role key.
 * Bypasses RLS. Use for admin operations like creating kid auth users,
 * resetting PINs, or any cross-household read needed during auth flows.
 *
 * NEVER import this from a client component.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const KIDS_EMAIL_DOMAIN = "chorepop.kids";

export function kidAuthEmail(profileId: string): string {
  return `kid_${profileId}@${KIDS_EMAIL_DOMAIN}`;
}

/**
 * Supabase requires passwords >= 6 chars. PINs are 4 digits, so we derive
 * a deterministic password with a fixed prefix. The PIN is still the
 * only secret a kid needs to know.
 */
export function kidPasswordFromPin(pin: string): string {
  return `cp-${pin}`;
}
