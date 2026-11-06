import type { ActivityChange } from "@/lib/types";

const LABEL: Record<ActivityChange["direction"], string> = {
  increase: "Activity increase detected",
  decrease: "Activity decrease detected",
  new_site: "New persistent heat source detected",
  inactive: "No recent detections",
};

const ICON: Record<ActivityChange["direction"], string> = {
  increase: "▲",
  decrease: "▼",
  new_site: "●",
  inactive: "○",
};

export default function ChangeItem({
  change,
  showSite = true,
  onClick,
}: {
  change: ActivityChange;
  showSite?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--accent)]" aria-hidden>
          {ICON[change.direction]}
        </span>
        <span className="font-medium">{LABEL[change.direction]}</span>
      </div>
      <div className="text-[var(--muted)]">
        {showSite && (
          <>
            {change.site_code}
            {change.country ? ` · ${change.country}` : ""} ·{" "}
          </>
        )}
        {change.detected_at.slice(0, 10)}
        {change.baseline !== null && change.recent !== null && (
          <>
            {" "}
            · {change.baseline.toFixed(1)} → {change.recent.toFixed(1)} MW/day
          </>
        )}
        {change.z_score !== null && <> · z {change.z_score.toFixed(1)}</>}
      </div>
    </>
  );
  return (
    <li className="text-xs">
      {onClick ? (
        <button
          onClick={onClick}
          className="w-full rounded px-2 py-1.5 text-left hover:bg-[var(--panel-2)]"
        >
          {body}
        </button>
      ) : (
        <div className="px-2 py-1">{body}</div>
      )}
    </li>
  );
}
