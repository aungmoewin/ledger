export { auth as proxy } from "@/lib/auth";

export const config = {
  // api/auth must be excluded: Auth.js's own callback routes have to run
  // without the proxy redirecting them mid-handshake.
  //
  // The file-extension branch covers public/ - those assets serve from the root,
  // so a signed-out request for /logo.svg would otherwise be redirected and
  // surface as a broken image rather than as an auth problem.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
