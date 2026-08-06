import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between border-b pb-4">
        <Link href="/expenses" className="text-lg font-semibold">
          Ledger
        </Link>
        <nav className="text-muted-foreground flex gap-4 text-sm">
          <Link href="/expenses" className="hover:text-foreground">
            Expenses
          </Link>
        </nav>
      </header>
      <main className="flex flex-1 flex-col gap-6">{children}</main>
    </div>
  );
}
