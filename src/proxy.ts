import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Edge-compatible auth guard (replaces next-auth/middleware re-export).
 * `getToken` reads the encrypted JWT cookie directly — no Node.js APIs needed,
 * so this works on the Edge Runtime. Requires NEXTAUTH_SECRET env var.
 */
export async function proxy(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the intended destination so login can redirect back.
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Protect everything except the public auth pages/endpoints and Next internals.
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - /login, /register (auth pages)
     *  - /api/auth/* (NextAuth), /api/register, /api/cron/* (secured by its own token)
     *  - _next static assets, favicon, images
     */
    "/((?!login|register|uploads|api/auth|api/register|api/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
