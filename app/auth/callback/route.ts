import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth return URL. Exchanges the code for a session, then routes the user
 * based on whether they already have a profile:
 *   - no profile yet       → /onboarding (household + owner bootstrap)
 *   - parent/owner profile → /parent (or the `next` param, if safe)
 *   - child profile        → /kid (kids shouldn't be here, but be graceful)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const errorMessage = searchParams.get("error_description") ?? searchParams.get("error");

  if (errorMessage) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorMessage)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=Missing+code`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return NextResponse.redirect(`${origin}/login?error=Session+not+found`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  if (profile.role === "child") {
    return NextResponse.redirect(`${origin}/kid`);
  }

  const safeNext = next && next.startsWith("/") ? next : "/parent";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
