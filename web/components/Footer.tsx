import Link from "next/link";
import { DISCLAIMER } from "@/lib/attribution";

export default function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line bg-ink-1 px-4 py-1.5 text-[11px] leading-snug text-faint">
      <p>{DISCLAIMER}</p>
      <p>
        NASA FIRMS VIIRS · values are relative thermal intensity (MW FRP), not emissions ·{" "}
        <Link href="/about" className="text-muted underline decoration-line underline-offset-2 hover:text-fg">
          Method &amp; attribution
        </Link>
      </p>
    </footer>
  );
}
