export { default } from "next-auth/middleware";

// Protect everything except the public auth pages/endpoints and Next internals.
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - /login, /register (auth pages)
     *  - /api/auth/* (NextAuth), /api/register, /api/cron/* (secured by its own token)
     *  - _next static assets, favicon, images
     */
    "/((?!login|register|api/auth|api/register|api/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
