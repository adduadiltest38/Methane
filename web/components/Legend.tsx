import { CLASSES, CLASS_SHORT, rgb } from "@/lib/classes";

export default function Legend() {
  return (
    <div className="bezel flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2">
      {CLASSES.map((c) => (
        <span key={c} className="flex items-center gap-1.5 font-display text-[12px] uppercase tracking-[0.1em] text-muted">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: rgb(c), boxShadow: `0 0 8px ${rgb(c, 0.8)}` }}
          />
          {CLASS_SHORT[c]}
        </span>
      ))}
      <span className="flex items-center gap-1.5 border-l border-line pl-3 font-display text-[11px] uppercase tracking-[0.1em] text-faint">
        <svg width="34" height="12" aria-hidden>
          <circle cx="4" cy="6" r="2" fill="none" stroke="var(--color-muted)" />
          <circle cx="13" cy="6" r="3.5" fill="none" stroke="var(--color-muted)" />
          <circle cx="26" cy="6" r="5.5" fill="none" stroke="var(--color-muted)" />
        </svg>
        Size = MW FRP, 30 d
      </span>
    </div>
  );
}
