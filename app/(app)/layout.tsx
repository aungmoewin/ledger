import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/dal";
import Link from "next/link";
import { signOutAction } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Convenience and UX, NOT the control. A layout does not render for a Server
  // Action POST, so this protects pages while doing nothing for mutations -
  // that is why every action calls getSession() itself.
  const session = await requireSession();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between border-b pb-4">
        <Link href="/expenses" className="text-lg font-semibold">
          Ledger
        </Link>
        <nav className="text-muted-foreground flex items-center gap-4 text-sm">
          <Link href="/expenses" className="hover:text-foreground">
            Expenses
          </Link>

          <span>{session.name ?? session.email}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </nav>
      </header>
      <main className="flex flex-1 flex-col gap-6">{children}</main>
    </div>
  );
}
