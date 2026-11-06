import type { ActivityChange } from "@/lib/types";

const META: Record<ActivityChange["direction"], { label: string; glyph: string; color: string }> = {
  increase: { label: "Activity increase", glyph: "▲", color: "var(--color-heat-2)" },
  decrease: { label: "Activity decrease", glyph: "▼", color: "var(--color-ice)" },
  new_site: { label: "New persistent source", glyph: "◆", color: "var(--color-heat-1)" },
  inactive: { label: "No recent detections", glyph: "○", color: "var(--color-slate)" },
};

export default function ChangeItem({
  change,
  showSite = true,
  onClick,
  active = false,
}: {
  change: ActivityChange;
  showSite?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const m = META[change.direction];
  const body = (
    <div className="relative pl-5">
      <span
        className="absolute left-0 top-[3px] grid h-3 w-3 place-items-center text-[9px]"
        style={{ color: m.color }}
        aria-hidden
      >
        {m.glyph}
      </span>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-fg">{m.label}</span>
        <span className="readout shrink-0 text-[10px] text-faint">{change.detected_at.slice(5, 10)}</span>
      </div>
      <div className="readout mt-0.5 text-[11px] text-muted">
        {showSite && (
          <span className="text-fg/80">
            {change.site_code}
            {change.country ? ` · ${change.country}` : ""}
          </span>
        )}
        {change.baseline !== null && change.recent !== null && (
          <span className="block">
            {change.baseline.toFixed(1)} → <span style={{ color: m.color }}>{change.recent.toFixed(1)}</span> MW/day
            {change.z_score !== null && <span className="text-faint"> · z {change.z_score.toFixed(1)}</span>}
          </span>
        )}
      </div>
    </div>
  );
  return (
    <li>
      {onClick ? (
        <button
          onClick={onClick}
          className={`w-full border-l-2 px-3 py-2 text-left transition hover:bg-ink-2 ${
            active ? "border-heat-2 bg-ink-2" : "border-transparent"
          }`}
        >
          {body}
        </button>
      ) : (
        <div className="px-1 py-1.5">{body}</div>
      )}
    </li>
  );
}
