export { auth as proxy } from "@/lib/auth";

export const config = {
  // All of /api is excluded. Auth.js's callback routes must run without the
  // proxy interrupting the handshake, and our own handlers have to answer fetch
  // clients with status codes - a 307 to an HTML sign-in page arrives as
  // unparseable JSON. Each handler authenticates itself through the DAL.
  //
  // The file-extension branch covers public/ - those assets serve from the root,
  // so a signed-out request for /logo.svg would otherwise be redirected and
  // surface as a broken image rather than as an auth problem.
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
