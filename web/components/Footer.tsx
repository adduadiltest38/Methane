import Link from "next/link";
import { DISCLAIMER } from "@/lib/attribution";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-[11px] leading-snug text-[var(--muted)]">
      <p>{DISCLAIMER}</p>
      <p>
        Data: NASA FIRMS (VIIRS 375 m). Relative thermal intensity is shown as MW FRP (fire
        radiative power) and is not converted to gas volumes or emissions.{" "}
        <Link href="/about" className="underline hover:text-[var(--text)]">
          Methodology &amp; attribution
        </Link>
      </p>
    </footer>
  );
}
