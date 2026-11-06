import Link from "next/link";
import LastUpdated from "./LastUpdated";

export default function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2">
      <div className="flex items-center gap-4">
        <Link href="/" className="font-semibold tracking-tight">
          <span className="text-[var(--accent)]">Flare</span>Watch
        </Link>
        <nav className="flex gap-3 text-sm text-[var(--muted)]">
          <Link href="/" className="hover:text-[var(--text)]">
            Map
          </Link>
          <Link href="/about" className="hover:text-[var(--text)]">
            About
          </Link>
        </nav>
      </div>
      <LastUpdated />
    </header>
  );
}
