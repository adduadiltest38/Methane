"use client";

import type { ActivityChange } from "@/lib/types";
import ChangeItem from "./ChangeItem";

export default function ChangesFeed({
  changes,
  selectedSite,
  onPick,
}: {
  changes: ActivityChange[] | null;
  selectedSite: number | null;
  onPick: (c: ActivityChange) => void;
}) {
  if (changes === null) return <p className="px-3 text-[12px] text-faint">Loading…</p>;
  if (changes.length === 0)
    return <p className="px-3 text-[12px] text-faint">No activity changes in the last 30 days.</p>;
  return (
    <ul className="divide-y divide-line-soft">
      {changes.map((c) => (
        <ChangeItem key={c.id} change={c} onClick={() => onPick(c)} active={c.site_id === selectedSite} />
      ))}
    </ul>
  );
}
