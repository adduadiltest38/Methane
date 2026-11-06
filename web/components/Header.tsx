import Link from "next/link";
import PassClock from "./PassClock";

function Mark() {
  // a flare stack: a thin stem with a three-step thermal flame
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden>
      <rect x="8" y="10" width="2" height="12" fill="var(--color-muted)" />
      <path d="M9 0 C13 4 14 7 9 11 C4 7 5 4 9 0Z" fill="var(--color-heat-3)" />
      <path d="M9 3 C11.5 5.5 12 7.5 9 10 C6 7.5 6.5 5.5 9 3Z" fill="var(--color-heat-2)" />
      <path d="M9 5.5 C10.3 7 10.5 8 9 9.4 C7.5 8 7.7 7 9 5.5Z" fill="var(--color-heat-1)" />
    </svg>
  );
}

export default function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-ink-1 px-4 py-2">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="FlareWatch home">
          <Mark />
          <span className="font-display text-[19px] font-bold uppercase tracking-[0.18em] text-fg">
            Flare<span className="heat-text">Watch</span>
          </span>
        </Link>
        <span className="hidden font-display text-[12px] uppercase tracking-[0.16em] text-faint lg:inline">
          VIIRS 375 m · Middle East · 34–63°E 12–38°N
        </span>
        <nav className="flex gap-4 font-display text-[13px] font-semibold uppercase tracking-[0.14em]">
          <Link href="/" className="text-muted hover:text-fg">
            Map
          </Link>
          <Link href="/about" className="text-muted hover:text-fg">
            Method
          </Link>
        </nav>
      </div>
      <PassClock />
    </header>
  );
}
