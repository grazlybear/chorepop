import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type Role = "owner" | "parent" | "child";

const KID_PREFIX = "/kid";
const PARENT_PREFIX = "/parent";
const ONBOARDING = "/onboarding";

const PUBLIC_PATHS = new Set(["/", "/login"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/auth/")) return true;
  return false;
}

/**
 * NextResponse.redirect() drops cookies that Supabase may have refreshed
 * during this request. Carry them over so the new tokens reach the browser.
 */
function redirectWithCookies(
  request: NextRequest,
  source: NextResponse,
  pathname: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the session so it refreshes — do not add code between client creation
  // and this call, per Supabase SSR guidance.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const pathname = request.nextUrl.pathname;

  const isParentRoute = pathname === PARENT_PREFIX || pathname.startsWith(`${PARENT_PREFIX}/`);
  const isKidRoute = pathname === KID_PREFIX || pathname.startsWith(`${KID_PREFIX}/`);
  const isOnboarding = pathname === ONBOARDING;
  const needsAuth = isParentRoute || isKidRoute || isOnboarding;

  if (!userId) {
    if (needsAuth) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      const redirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
    return supabaseResponse;
  }

  // Authenticated: fetch role. Fine to do once per request; small select.
  if (!needsAuth && !isPublic(pathname)) {
    return supabaseResponse;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    // Don't trap the user in a redirect loop on transient DB / RLS errors.
    // Let the request through; page-level guards will redirect properly
    // once the situation resolves.
    console.error(
      `[proxy] profile lookup failed for ${userId} on ${pathname}:`,
      profileError.message,
    );
    return supabaseResponse;
  }

  const role = profile?.role as Role | undefined;

  if (!role) {
    // Authenticated but no profile yet — only onboarding is allowed.
    if (isOnboarding) return supabaseResponse;
    console.log(
      `[proxy] no profile for user ${userId} (path ${pathname}) — redirecting to /onboarding`,
    );
    return redirectWithCookies(request, supabaseResponse, ONBOARDING);
  }

  if (role === "child") {
    if (isParentRoute || isOnboarding) {
      return redirectWithCookies(request, supabaseResponse, KID_PREFIX);
    }
  } else {
    // owner or parent
    if (isKidRoute) {
      return redirectWithCookies(request, supabaseResponse, PARENT_PREFIX);
    }
    if (isOnboarding) {
      return redirectWithCookies(request, supabaseResponse, PARENT_PREFIX);
    }
  }

  return supabaseResponse;
}
