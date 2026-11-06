import { CLASSES, CLASS_LABEL, rgb } from "@/lib/classes";

export default function Legend() {
  return (
    <div className="w-max max-w-[16rem] rounded-md border border-[var(--border)] bg-[var(--panel)]/90 p-2 text-xs backdrop-blur">
      <ul className="space-y-1">
        {CLASSES.map((c) => (
          <li key={c} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: rgb(c) }} />
            {CLASS_LABEL[c]}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px] text-[var(--muted)]">
        Circle size: relative thermal intensity (MW FRP, last 30 days)
      </p>
    </div>
  );
}
