"use client";

import type { ActivityChange } from "@/lib/types";
import ChangeItem from "./ChangeItem";

export default function ChangesFeed({
  changes,
  onPick,
}: {
  changes: ActivityChange[] | null;
  onPick: (c: ActivityChange) => void;
}) {
  if (changes === null) return <p className="text-xs text-[var(--muted)]">Loading…</p>;
  if (changes.length === 0)
    return <p className="text-xs text-[var(--muted)]">No activity changes in the last 30 days.</p>;
  return (
    <ul className="-mx-2 space-y-0.5">
      {changes.map((c) => (
        <ChangeItem key={c.id} change={c} onClick={() => onPick(c)} />
      ))}
    </ul>
  );
}
